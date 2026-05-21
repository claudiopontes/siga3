-- =====================================================================
-- Diagnóstico de performance — Folha SICAP (SQL Server)
--
-- Objetivo: identificar onde o ETL folha:sicap:base gasta tempo no
-- SQL Server (SICAP). Hipótese: re-execução do JOIN grande
-- VerbasContraCheque x ContraCheque a cada batch de 10k linhas.
--
-- Como usar (SSMS):
--   1. Conectar no SICAP com login de leitura.
--   2. Rodar uma seção por vez (cada bloco está separado por GO).
--   3. Para seções 4 e 5, ter o ETL rodando em outra janela durante
--      a coleta (rodar duas/três vezes a seção 4 com 10–20s entre cada
--      execução para enxergar evolução).
--
-- Nada aqui escreve nada. Tudo é SELECT + DMV.
--
-- Parâmetros padrão: ano=2025, mes=10. Trocar nos blocos marcados
-- com -- :PARAM se quiser outra competência.
-- =====================================================================

USE SICAP;
GO

-- =====================================================================
-- SEÇÃO 1 — Volumetria das tabelas-chave
-- Confirma o tamanho real das tabelas (sem ler dados) usando
-- sys.dm_db_partition_stats (instantâneo, não trava nada).
-- =====================================================================
SELECT
  OBJECT_SCHEMA_NAME(p.object_id)          AS schema_nome,
  OBJECT_NAME(p.object_id)                 AS tabela,
  SUM(CASE WHEN p.index_id IN (0,1) THEN p.row_count ELSE 0 END) AS linhas,
  SUM(p.reserved_page_count) * 8 / 1024.0  AS reservado_mb,
  SUM(p.used_page_count)     * 8 / 1024.0  AS usado_mb
FROM sys.dm_db_partition_stats p
WHERE p.object_id IN (
  OBJECT_ID('dbo.ContraCheque'),
  OBJECT_ID('dbo.VerbasContraCheque'),
  OBJECT_ID('dbo.CadastroUnico'),
  OBJECT_ID('dbo.PessoaFisica'),
  OBJECT_ID('dbo.Beneficiario'),
  OBJECT_ID('dbo.Verba'),
  OBJECT_ID('remessa.Remessa')
)
GROUP BY p.object_id
ORDER BY linhas DESC;
GO

-- =====================================================================
-- SEÇÃO 2 — Índices existentes nas tabelas críticas
-- O ETL depende de:
--   ContraCheque(ano, mes)                    — filtro principal
--   ContraCheque(id)                          — PK / keyset
--   VerbasContraCheque(id)                    — PK / keyset
--   VerbasContraCheque(idContraCheque)        — JOIN driver
--   PessoaFisica(idCadastroUnico, id DESC)    — OUTER APPLY TOP 1
--   CadastroUnico(id), Beneficiario(id),
--   Verba(id)                                  — JOINs por PK
-- =====================================================================
SELECT
  OBJECT_SCHEMA_NAME(i.object_id) AS schema_nome,
  OBJECT_NAME(i.object_id)        AS tabela,
  i.name                          AS indice,
  i.type_desc                     AS tipo,
  i.is_unique,
  i.is_primary_key,
  STUFF((
    SELECT ', ' + c.name + CASE WHEN ic.is_descending_key = 1 THEN ' DESC' ELSE '' END
    FROM sys.index_columns ic
    INNER JOIN sys.columns c
      ON c.object_id = ic.object_id AND c.column_id = ic.column_id
    WHERE ic.object_id = i.object_id
      AND ic.index_id = i.index_id
      AND ic.is_included_column = 0
    ORDER BY ic.key_ordinal
    FOR XML PATH(''), TYPE
  ).value('.', 'nvarchar(max)'), 1, 2, '') AS colunas_chave,
  STUFF((
    SELECT ', ' + c.name
    FROM sys.index_columns ic
    INNER JOIN sys.columns c
      ON c.object_id = ic.object_id AND c.column_id = ic.column_id
    WHERE ic.object_id = i.object_id
      AND ic.index_id = i.index_id
      AND ic.is_included_column = 1
    ORDER BY ic.key_ordinal
    FOR XML PATH(''), TYPE
  ).value('.', 'nvarchar(max)'), 1, 2, '') AS colunas_included
FROM sys.indexes i
WHERE i.object_id IN (
  OBJECT_ID('dbo.ContraCheque'),
  OBJECT_ID('dbo.VerbasContraCheque'),
  OBJECT_ID('dbo.CadastroUnico'),
  OBJECT_ID('dbo.PessoaFisica'),
  OBJECT_ID('dbo.Beneficiario'),
  OBJECT_ID('dbo.Verba'),
  OBJECT_ID('remessa.Remessa')
)
AND i.type_desc <> 'HEAP'
ORDER BY tabela, i.index_id;
GO

-- =====================================================================
-- SEÇÃO 3 — Estatísticas de uso/desatualização dos índices
-- index_usage_stats: mostra se o índice está sendo usado de fato.
-- last_user_seek/scan: quando foi a última leitura.
-- modification_counter (em sys.dm_db_stats_properties) indica
-- quantas linhas mudaram desde a última atualização de estatística.
-- =====================================================================
SELECT
  OBJECT_NAME(s.object_id) AS tabela,
  i.name                   AS indice,
  s.user_seeks,
  s.user_scans,
  s.user_lookups,
  s.user_updates,
  s.last_user_seek,
  s.last_user_scan
FROM sys.dm_db_index_usage_stats s
INNER JOIN sys.indexes i
  ON i.object_id = s.object_id AND i.index_id = s.index_id
WHERE s.database_id = DB_ID()
  AND s.object_id IN (
    OBJECT_ID('dbo.ContraCheque'),
    OBJECT_ID('dbo.VerbasContraCheque'),
    OBJECT_ID('dbo.PessoaFisica')
  )
ORDER BY tabela, s.user_seeks DESC;
GO

SELECT
  OBJECT_NAME(s.object_id) AS tabela,
  i.name                   AS indice,
  sp.last_updated          AS estatistica_atualizada_em,
  sp.rows                  AS linhas_amostra,
  sp.rows_sampled,
  sp.modification_counter,
  CAST(100.0 * sp.modification_counter / NULLIF(sp.rows, 0) AS decimal(6,2)) AS pct_modificado
FROM sys.stats s
INNER JOIN sys.indexes i
  ON i.object_id = s.object_id AND i.name = s.name
CROSS APPLY sys.dm_db_stats_properties(s.object_id, s.stats_id) sp
WHERE s.object_id IN (
  OBJECT_ID('dbo.ContraCheque'),
  OBJECT_ID('dbo.VerbasContraCheque'),
  OBJECT_ID('dbo.PessoaFisica')
)
ORDER BY tabela, sp.modification_counter DESC;
GO

-- =====================================================================
-- SEÇÃO 4 — Atividade ao vivo (rodar DURANTE a execução do ETL)
-- Mostra qual query do ETL está em execução, quanto tempo, quais
-- waits estão dominando, e se há paralelismo / sort spill.
--
-- Rodar 2–3 vezes com intervalo de 10–20s para ver evolução.
-- =====================================================================
SELECT
  r.session_id,
  r.status,
  r.command,
  r.wait_type,
  r.wait_time                                          AS wait_ms_atual,
  r.last_wait_type,
  r.cpu_time,
  r.total_elapsed_time / 1000.0                        AS elapsed_s,
  r.reads,
  r.logical_reads,
  r.writes,
  r.row_count,
  r.percent_complete,
  s.host_name,
  s.program_name,
  s.login_name,
  DB_NAME(r.database_id)                               AS database_atual,
  SUBSTRING(
    t.text,
    (r.statement_start_offset / 2) + 1,
    ((CASE r.statement_end_offset WHEN -1 THEN DATALENGTH(t.text)
       ELSE r.statement_end_offset END - r.statement_start_offset) / 2) + 1
  )                                                    AS sql_em_execucao
FROM sys.dm_exec_requests r
INNER JOIN sys.dm_exec_sessions s ON s.session_id = r.session_id
CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) t
WHERE r.session_id <> @@SPID
  AND s.is_user_process = 1
  AND (
    s.program_name LIKE '%node%'
    OR s.program_name LIKE '%Node%'
    OR s.program_name LIKE '%mssql%'
    OR t.text LIKE '%VerbasContraCheque%'
    OR t.text LIKE '%ContraCheque%'
    OR t.text LIKE '%PessoaFisica%'
  )
ORDER BY r.total_elapsed_time DESC;
GO

-- Waits agregadas da sessão do ETL (substituir <SPID> pelo session_id
-- retornado pela query anterior). Mostra onde a sessão GASTA tempo
-- esperando — IO, paralelismo, lock etc.
-- :PARAM
DECLARE @spid int = 0; -- <<< trocar pelo session_id da sessão node

IF @spid > 0
SELECT
  ws.wait_type,
  ws.waiting_tasks_count,
  ws.wait_time_ms,
  ws.max_wait_time_ms,
  ws.signal_wait_time_ms
FROM sys.dm_exec_session_wait_stats ws
WHERE ws.session_id = @spid
ORDER BY ws.wait_time_ms DESC;
GO

-- =====================================================================
-- SEÇÃO 5 — Plano de execução das queries do ETL (após execução)
-- Lê o cache de planos do SQL Server e mostra a estatística agregada
-- das queries que tocam VerbasContraCheque/ContraCheque.
--
-- Foco: contagem de execuções (quantos batches), tempo médio,
-- linhas devolvidas, e plano XML (clicável no SSMS).
-- =====================================================================
SELECT TOP 50
  qs.execution_count,
  qs.total_worker_time / 1000.0 / qs.execution_count   AS cpu_medio_ms,
  qs.total_elapsed_time / 1000.0 / qs.execution_count  AS elapsed_medio_ms,
  qs.total_logical_reads / qs.execution_count          AS logical_reads_medio,
  qs.total_rows / qs.execution_count                   AS linhas_medio,
  qs.last_execution_time,
  SUBSTRING(
    t.text,
    (qs.statement_start_offset / 2) + 1,
    ((CASE qs.statement_end_offset WHEN -1 THEN DATALENGTH(t.text)
       ELSE qs.statement_end_offset END - qs.statement_start_offset) / 2) + 1
  ) AS sql_texto,
  qp.query_plan
FROM sys.dm_exec_query_stats qs
CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) t
CROSS APPLY sys.dm_exec_query_plan(qs.plan_handle) qp
WHERE t.text LIKE '%VerbasContraCheque%'
   OR t.text LIKE '%ContraCheque%'
   OR t.text LIKE '%OUTER APPLY%PessoaFisica%'
ORDER BY qs.total_elapsed_time DESC;
GO

-- =====================================================================
-- SEÇÃO 6 — Custo isolado da query principal (rodar só 1 batch)
-- Liga STATISTICS para uma única execução, simulando o que o ETL faz
-- num batch. Comparar logical_reads e cpu_time entre 1º e 10º batch
-- (mudar @lastId) — se sobe muito, confirma degradação keyset.
--
-- Trocar @ano, @mes, @lastId conforme necessário.
-- =====================================================================
-- :PARAM
DECLARE @ano int = 2025;
DECLARE @mes int = 10;
DECLARE @lastId bigint = 0;     -- trocar para 100000, 1000000 etc. para ver evolução
DECLARE @top int = 10000;

SET STATISTICS IO ON;
SET STATISTICS TIME ON;

-- Mesma query do job (fato_verba). Não persiste nada — apenas SELECT.
SELECT TOP (@top)
  vcc.id                            AS id_verba_contracheque_sicap,
  vcc.idContraCheque                AS id_contracheque_sicap,
  cc.ano                            AS ano,
  cc.mes                            AS mes,
  vcc.idEntidadeCjur                AS id_entidade_cjur,
  cc.idCadastroUnico                AS id_cadastro_unico_sicap,
  cc.idBeneficiario                 AS id_beneficiario_sicap,
  cu.cpf                            AS cpf,
  CAST(b.matricula AS VARCHAR(32))  AS matricula,
  vcc.idVerba                       AS id_verba_sicap,
  v.codigo                          AS verba_codigo,
  v.descricao                       AS verba_descricao,
  vcc.valor                         AS verba_valor
FROM dbo.VerbasContraCheque vcc
INNER JOIN dbo.ContraCheque cc ON cc.id = vcc.idContraCheque
LEFT  JOIN dbo.CadastroUnico cu ON cu.id = cc.idCadastroUnico
LEFT  JOIN dbo.Beneficiario  b  ON b.id  = cc.idBeneficiario
LEFT  JOIN dbo.Verba         v  ON v.id  = vcc.idVerba
WHERE cc.ano = @ano AND cc.mes = @mes
  AND vcc.id > @lastId
ORDER BY vcc.id
OPTION (MAXDOP 1);  -- desliga paralelismo para medir custo "puro"

SET STATISTICS TIME OFF;
SET STATISTICS IO OFF;
GO

-- Mesma técnica para fato_contracheque (com OUTER APPLY PessoaFisica).
-- :PARAM
DECLARE @ano2 int = 2025;
DECLARE @mes2 int = 10;
DECLARE @lastId2 bigint = 0;
DECLARE @top2 int = 10000;

SET STATISTICS IO ON;
SET STATISTICS TIME ON;

SELECT TOP (@top2)
  cc.id, cc.ano, cc.mes, cc.idEntidadeCjur, cc.idCadastroUnico,
  cc.idBeneficiario, cu.cpf, pf.nome AS nome_servidor,
  cc.totalVencimentos, cc.totalDescontos
FROM dbo.ContraCheque cc
LEFT JOIN dbo.CadastroUnico cu ON cu.id = cc.idCadastroUnico
OUTER APPLY (
  SELECT TOP 1 pf_x.nome
  FROM dbo.PessoaFisica pf_x
  WHERE pf_x.idCadastroUnico = cc.idCadastroUnico
  ORDER BY pf_x.id DESC
) pf
LEFT JOIN dbo.Beneficiario b ON b.id = cc.idBeneficiario
WHERE cc.ano = @ano2 AND cc.mes = @mes2
  AND cc.id > @lastId2
ORDER BY cc.id
OPTION (MAXDOP 1);

SET STATISTICS TIME OFF;
SET STATISTICS IO OFF;
GO

-- =====================================================================
-- SEÇÃO 7 — Sugestões automáticas de índice ausente
-- O SQL Server registra o que o otimizador queria ter usado. Útil para
-- decidir se vale criar índice em VerbasContraCheque(idContraCheque)
-- INCLUDE (idVerba, valor, ...) ou PessoaFisica(idCadastroUnico, id DESC).
-- =====================================================================
SELECT
  OBJECT_NAME(d.object_id, d.database_id) AS tabela,
  s.avg_total_user_cost                    AS custo_medio,
  s.avg_user_impact                        AS impacto_pct,
  s.user_seeks + s.user_scans              AS demandas,
  d.equality_columns,
  d.inequality_columns,
  d.included_columns,
  s.last_user_seek
FROM sys.dm_db_missing_index_groups g
INNER JOIN sys.dm_db_missing_index_group_stats s ON s.group_handle = g.index_group_handle
INNER JOIN sys.dm_db_missing_index_details   d   ON d.index_handle = g.index_handle
WHERE d.database_id = DB_ID()
  AND OBJECT_NAME(d.object_id, d.database_id) IN
      ('ContraCheque','VerbasContraCheque','PessoaFisica','CadastroUnico','Beneficiario','Verba')
ORDER BY s.avg_user_impact DESC, s.avg_total_user_cost DESC;
GO

-- =====================================================================
-- SEÇÃO 8 — Fragmentação física dos índices críticos
-- Fragmentação alta (> 30%) em índices grandes (>1M páginas) explica
-- IO desnecessário em scans. SAMPLED é barato; LIMITED é mais barato
-- ainda se a tabela for muito grande.
-- =====================================================================
SELECT
  OBJECT_NAME(ips.object_id)       AS tabela,
  i.name                           AS indice,
  ips.index_type_desc,
  ips.avg_fragmentation_in_percent AS fragmentacao_pct,
  ips.page_count                   AS paginas,
  ips.page_count * 8 / 1024.0      AS tamanho_mb
FROM sys.dm_db_index_physical_stats(
       DB_ID(),
       NULL, NULL, NULL,
       'SAMPLED'
) ips
INNER JOIN sys.indexes i
  ON i.object_id = ips.object_id AND i.index_id = ips.index_id
WHERE ips.object_id IN (
  OBJECT_ID('dbo.ContraCheque'),
  OBJECT_ID('dbo.VerbasContraCheque'),
  OBJECT_ID('dbo.PessoaFisica')
)
AND ips.page_count > 1000
ORDER BY ips.avg_fragmentation_in_percent DESC;
GO

-- =====================================================================
-- FIM — exporte o resultado de cada seção para um .xlsx ou .csv e
-- compartilhe. Com isso dá pra decidir:
--   - se basta criar índices,
--   - se precisa staging temporária,
--   - ou se troca o paginação keyset por cursor server-side.
-- =====================================================================
