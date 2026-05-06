-- =============================================================
-- Supabase - Materialized Views de Performance do Painel de Despesa
-- Executar no SQL Editor do Supabase ANTES de usar o painel.
--
-- Cadeia de join correta:
--   fato_empenho.id_entidade → dim_entidade.id_entidade → dim_ente.id_ente
--
-- Após cada carga ETL, execute para atualizar:
--   REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_despesa_resumo;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_despesa_evolucao_mensal;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_despesa_ranking_entes;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_despesa_ranking_credores;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_despesa_composicao;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_alertas_despesa;
-- =============================================================

-- Remove tudo antes de recriar
DROP MATERIALIZED VIEW IF EXISTS public.mv_alertas_despesa          CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.mv_despesa_composicao       CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.mv_despesa_ranking_credores  CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.mv_despesa_ranking_entes    CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.mv_despesa_evolucao_mensal  CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.mv_despesa_resumo           CASCADE;

-- =============================================================
-- 1. Resumo agregado por ano / entidade
--    Inclui id_ente para permitir filtro cascata ente → entidade
-- =============================================================
CREATE MATERIALIZED VIEW public.mv_despesa_resumo AS
SELECT
  fe.ano_remessa,
  fe.id_entidade,
  dte.id_ente,
  de.nome                                                           AS nome_ente,
  dte.nome                                                          AS nome_entidade,
  SUM(fe.valor_empenhado_liquido)                                   AS valor_empenhado_liquido,
  SUM(fe.valor_liquidado)                                           AS valor_liquidado,
  SUM(fe.valor_pago)                                                AS valor_pago,
  SUM(fe.valor_a_liquidar)                                          AS valor_a_liquidar,
  SUM(fe.valor_a_pagar)                                             AS valor_a_pagar,
  COUNT(*)                                                          AS qtd_empenhos,
  COUNT(DISTINCT fe.cpf_cnpj_credor)                                AS qtd_credores,
  CASE
    WHEN SUM(fe.valor_liquidado) > 0
    THEN ROUND(SUM(fe.valor_pago) / SUM(fe.valor_liquidado) * 100, 2)
    ELSE 0
  END                                                               AS percentual_pago
FROM public.fato_empenho fe
LEFT JOIN public.dim_entidade dte ON dte.id_entidade = fe.id_entidade
LEFT JOIN public.dim_ente de      ON de.id_ente      = dte.id_ente
GROUP BY fe.ano_remessa, fe.id_entidade, dte.id_ente, de.nome, dte.nome;

CREATE UNIQUE INDEX idx_mv_despesa_resumo_pk
  ON public.mv_despesa_resumo (ano_remessa, id_entidade);
CREATE INDEX idx_mv_despesa_resumo_id_ente
  ON public.mv_despesa_resumo (ano_remessa, id_ente);

GRANT SELECT ON public.mv_despesa_resumo TO anon, authenticated;

-- =============================================================
-- 2. Evolução mensal — inclui id_ente para filtro cascata
-- =============================================================
CREATE MATERIALIZED VIEW public.mv_despesa_evolucao_mensal AS
SELECT
  fe.ano_remessa,
  date_trunc('month', fe.data_empenho)::date   AS mes_empenho,
  fe.id_entidade,
  dte.id_ente,
  SUM(fe.valor_empenhado_liquido)              AS valor_empenhado_liquido,
  SUM(fe.valor_liquidado)                      AS valor_liquidado,
  SUM(fe.valor_pago)                           AS valor_pago
FROM public.fato_empenho fe
LEFT JOIN public.dim_entidade dte ON dte.id_entidade = fe.id_entidade
WHERE fe.data_empenho IS NOT NULL
GROUP BY fe.ano_remessa, date_trunc('month', fe.data_empenho), fe.id_entidade, dte.id_ente;

CREATE UNIQUE INDEX idx_mv_despesa_evolucao_pk
  ON public.mv_despesa_evolucao_mensal (ano_remessa, mes_empenho, id_entidade);
CREATE INDEX idx_mv_despesa_evolucao_ano
  ON public.mv_despesa_evolucao_mensal (ano_remessa);
CREATE INDEX idx_mv_despesa_evolucao_id_ente
  ON public.mv_despesa_evolucao_mensal (ano_remessa, id_ente);

GRANT SELECT ON public.mv_despesa_evolucao_mensal TO anon, authenticated;

-- =============================================================
-- 3. Ranking de entes — agrupa ao nível do ENTE com nome correto
-- =============================================================
CREATE MATERIALIZED VIEW public.mv_despesa_ranking_entes AS
SELECT
  fe.ano_remessa,
  dte.id_ente,
  COALESCE(de.nome, 'Ente ' || dte.id_ente::text)  AS nome_ente,
  SUM(fe.valor_empenhado_liquido)                   AS valor_empenhado_liquido,
  SUM(fe.valor_liquidado)                           AS valor_liquidado,
  SUM(fe.valor_pago)                                AS valor_pago,
  SUM(fe.valor_a_pagar)                             AS valor_a_pagar,
  COUNT(*)                                          AS qtd_empenhos
FROM public.fato_empenho fe
LEFT JOIN public.dim_entidade dte ON dte.id_entidade = fe.id_entidade
LEFT JOIN public.dim_ente de      ON de.id_ente      = dte.id_ente
GROUP BY fe.ano_remessa, dte.id_ente, de.nome;

CREATE UNIQUE INDEX idx_mv_despesa_ranking_entes_pk
  ON public.mv_despesa_ranking_entes (ano_remessa, id_ente);
CREATE INDEX idx_mv_despesa_ranking_entes_ano
  ON public.mv_despesa_ranking_entes (ano_remessa);

GRANT SELECT ON public.mv_despesa_ranking_entes TO anon, authenticated;

-- =============================================================
-- 4. Ranking de credores — inclui id_ente para filtro cascata
-- =============================================================
CREATE MATERIALIZED VIEW public.mv_despesa_ranking_credores AS
SELECT
  fe.ano_remessa,
  dte.id_ente,
  fe.cpf_cnpj_credor,
  COALESCE(dc.nome, fe.cpf_cnpj_credor)  AS nome_credor,
  SUM(fe.valor_empenhado_liquido)        AS valor_empenhado_liquido,
  SUM(fe.valor_pago)                     AS valor_pago,
  COUNT(*)                               AS qtd_empenhos
FROM public.fato_empenho fe
LEFT JOIN public.dim_entidade dte ON dte.id_entidade = fe.id_entidade
LEFT JOIN public.dim_credor dc    ON dc.cnpj_cpf     = fe.cpf_cnpj_credor
WHERE fe.cpf_cnpj_credor IS NOT NULL
GROUP BY fe.ano_remessa, dte.id_ente, fe.cpf_cnpj_credor, dc.nome;

CREATE UNIQUE INDEX idx_mv_despesa_ranking_credores_pk
  ON public.mv_despesa_ranking_credores (ano_remessa, id_ente, cpf_cnpj_credor);
CREATE INDEX idx_mv_despesa_ranking_credores_ano
  ON public.mv_despesa_ranking_credores (ano_remessa);
CREATE INDEX idx_mv_despesa_ranking_credores_id_ente
  ON public.mv_despesa_ranking_credores (ano_remessa, id_ente);

GRANT SELECT ON public.mv_despesa_ranking_credores TO anon, authenticated;

-- =============================================================
-- 5. Composição da despesa — inclui id_ente para filtro cascata
-- =============================================================
CREATE MATERIALIZED VIEW public.mv_despesa_composicao AS

-- Categoria Econômica — descrições definidas pela Portaria Interministerial SOF/STN
SELECT
  fe.ano_remessa,
  fe.id_entidade,
  dte.id_ente,
  'categoria_economica'                          AS tipo_composicao,
  fe.numero_categoria_economica::text            AS codigo,
  CASE fe.numero_categoria_economica
    WHEN 1 THEN '1 – Despesas Correntes'
    WHEN 2 THEN '2 – Despesas de Capital'
    WHEN 9 THEN '9 – Reserva de Contingência'
    ELSE        fe.numero_categoria_economica::text || ' – Não classificado'
  END                                            AS rotulo,
  SUM(fe.valor_empenhado_liquido)                AS valor_empenhado_liquido,
  SUM(fe.valor_pago)                             AS valor_pago
FROM public.fato_empenho fe
LEFT JOIN public.dim_entidade dte ON dte.id_entidade = fe.id_entidade
WHERE fe.numero_categoria_economica IS NOT NULL
GROUP BY fe.ano_remessa, fe.id_entidade, dte.id_ente, fe.numero_categoria_economica

UNION ALL

-- Grupo de Natureza da Despesa
SELECT
  fe.ano_remessa, fe.id_entidade, dte.id_ente,
  'grupo_natureza',
  fe.numero_grupo_natureza_despesa::text,
  CASE fe.numero_grupo_natureza_despesa
    WHEN 1 THEN '1 – Pessoal e Encargos Sociais'
    WHEN 2 THEN '2 – Juros e Encargos da Dívida'
    WHEN 3 THEN '3 – Outras Despesas Correntes'
    WHEN 4 THEN '4 – Investimentos'
    WHEN 5 THEN '5 – Inversões Financeiras'
    WHEN 6 THEN '6 – Amortização da Dívida'
    WHEN 9 THEN '9 – Reserva de Contingência'
    ELSE        fe.numero_grupo_natureza_despesa::text || ' – Não classificado'
  END,
  SUM(fe.valor_empenhado_liquido), SUM(fe.valor_pago)
FROM public.fato_empenho fe
LEFT JOIN public.dim_entidade dte ON dte.id_entidade = fe.id_entidade
WHERE fe.numero_grupo_natureza_despesa IS NOT NULL
GROUP BY fe.ano_remessa, fe.id_entidade, dte.id_ente, fe.numero_grupo_natureza_despesa

UNION ALL

-- Elemento de Despesa — descrição via aux_dim_elemento_despesa (Portaria Interministerial SOF/STN)
SELECT
  fe.ano_remessa, fe.id_entidade, dte.id_ente,
  'elemento_despesa',
  fe.numero_elemento_despesa::text,
  COALESCE(ed.descricao, 'Elemento ' || fe.numero_elemento_despesa::text),
  SUM(fe.valor_empenhado_liquido), SUM(fe.valor_pago)
FROM public.fato_empenho fe
LEFT JOIN public.dim_entidade dte              ON dte.id_entidade = fe.id_entidade
LEFT JOIN public.aux_dim_elemento_despesa ed   ON ed.codigo       = fe.numero_elemento_despesa
WHERE fe.numero_elemento_despesa IS NOT NULL
GROUP BY fe.ano_remessa, fe.id_entidade, dte.id_ente, fe.numero_elemento_despesa, ed.descricao

UNION ALL

-- Função — descrições da Portaria MOG nº 42/1999
SELECT
  fe.ano_remessa, fe.id_entidade, dte.id_ente,
  'funcao',
  fe.numero_funcao::text,
  CASE fe.numero_funcao
    WHEN  1 THEN '01 – Legislativa'
    WHEN  2 THEN '02 – Judiciária'
    WHEN  3 THEN '03 – Essencial à Justiça'
    WHEN  4 THEN '04 – Administração'
    WHEN  5 THEN '05 – Defesa Nacional'
    WHEN  6 THEN '06 – Segurança Pública'
    WHEN  7 THEN '07 – Relações Exteriores'
    WHEN  8 THEN '08 – Assistência Social'
    WHEN  9 THEN '09 – Previdência Social'
    WHEN 10 THEN '10 – Saúde'
    WHEN 11 THEN '11 – Trabalho'
    WHEN 12 THEN '12 – Educação'
    WHEN 13 THEN '13 – Cultura'
    WHEN 14 THEN '14 – Direitos da Cidadania'
    WHEN 15 THEN '15 – Urbanismo'
    WHEN 16 THEN '16 – Habitação'
    WHEN 17 THEN '17 – Saneamento'
    WHEN 18 THEN '18 – Gestão Ambiental'
    WHEN 19 THEN '19 – Ciência e Tecnologia'
    WHEN 20 THEN '20 – Agricultura'
    WHEN 21 THEN '21 – Organização Agrária'
    WHEN 22 THEN '22 – Indústria'
    WHEN 23 THEN '23 – Comércio e Serviços'
    WHEN 24 THEN '24 – Comunicações'
    WHEN 25 THEN '25 – Energia'
    WHEN 26 THEN '26 – Transporte'
    WHEN 27 THEN '27 – Desporto e Lazer'
    WHEN 28 THEN '28 – Encargos Especiais'
    ELSE        fe.numero_funcao::text || ' – Não classificado'
  END,
  SUM(fe.valor_empenhado_liquido), SUM(fe.valor_pago)
FROM public.fato_empenho fe
LEFT JOIN public.dim_entidade dte ON dte.id_entidade = fe.id_entidade
WHERE fe.numero_funcao IS NOT NULL
GROUP BY fe.ano_remessa, fe.id_entidade, dte.id_ente, fe.numero_funcao

UNION ALL

SELECT
  fe.ano_remessa, fe.id_entidade, dte.id_ente,
  'subfuncao',
  fe.numero_subfuncao::text,
  COALESCE(sf.descricao, 'Subfunção ' || fe.numero_subfuncao::text),
  SUM(fe.valor_empenhado_liquido), SUM(fe.valor_pago)
FROM public.fato_empenho fe
LEFT JOIN public.dim_entidade dte          ON dte.id_entidade = fe.id_entidade
LEFT JOIN public.aux_dim_subfuncao sf      ON sf.codigo       = fe.numero_subfuncao
WHERE fe.numero_subfuncao IS NOT NULL
GROUP BY fe.ano_remessa, fe.id_entidade, dte.id_ente, fe.numero_subfuncao, sf.descricao;

CREATE INDEX idx_mv_despesa_composicao_ano
  ON public.mv_despesa_composicao (ano_remessa, tipo_composicao);
CREATE INDEX idx_mv_despesa_composicao_id_ente
  ON public.mv_despesa_composicao (ano_remessa, id_ente, tipo_composicao);

GRANT SELECT ON public.mv_despesa_composicao TO anon, authenticated;

-- =============================================================
-- 6. Alertas da despesa — inclui id_ente para filtro cascata
-- =============================================================
CREATE MATERIALIZED VIEW public.mv_alertas_despesa AS

SELECT
  fe.ano_remessa,
  dte.id_ente,
  fe.id_entidade,
  'ente_maior_a_pagar'                                         AS tipo_alerta,
  COALESCE(de.nome, 'Ente ' || dte.id_ente::text)             AS descricao,
  NULL::varchar(18)                                            AS cpf_cnpj_credor,
  SUM(fe.valor_a_pagar)                                        AS valor_principal
FROM public.fato_empenho fe
LEFT JOIN public.dim_entidade dte ON dte.id_entidade = fe.id_entidade
LEFT JOIN public.dim_ente de      ON de.id_ente      = dte.id_ente
GROUP BY fe.ano_remessa, dte.id_ente, fe.id_entidade, de.nome
HAVING SUM(fe.valor_a_pagar) > 0

UNION ALL

SELECT
  fe.ano_remessa, dte.id_ente, fe.id_entidade,
  'credor_concentrado',
  COALESCE(dc.nome, fe.cpf_cnpj_credor),
  fe.cpf_cnpj_credor,
  SUM(fe.valor_pago)
FROM public.fato_empenho fe
LEFT JOIN public.dim_entidade dte ON dte.id_entidade = fe.id_entidade
LEFT JOIN public.dim_credor dc    ON dc.cnpj_cpf     = fe.cpf_cnpj_credor
WHERE fe.cpf_cnpj_credor IS NOT NULL
GROUP BY fe.ano_remessa, dte.id_ente, fe.id_entidade, fe.cpf_cnpj_credor, dc.nome
HAVING SUM(fe.valor_pago) > 0

UNION ALL

SELECT
  fe.ano_remessa, dte.id_ente, fe.id_entidade,
  'alto_a_liquidar',
  COALESCE(de.nome, 'Ente ' || dte.id_ente::text),
  NULL::varchar(18),
  SUM(fe.valor_a_liquidar)
FROM public.fato_empenho fe
LEFT JOIN public.dim_entidade dte ON dte.id_entidade = fe.id_entidade
LEFT JOIN public.dim_ente de      ON de.id_ente      = dte.id_ente
GROUP BY fe.ano_remessa, dte.id_ente, fe.id_entidade, de.nome
HAVING SUM(fe.valor_a_liquidar) > 0

UNION ALL

SELECT
  fe.ano_remessa, dte.id_ente, fe.id_entidade,
  'liquidado_nao_pago',
  COALESCE(de.nome, 'Ente ' || dte.id_ente::text),
  NULL::varchar(18),
  SUM(fe.valor_liquidado - fe.valor_pago)
FROM public.fato_empenho fe
LEFT JOIN public.dim_entidade dte ON dte.id_entidade = fe.id_entidade
LEFT JOIN public.dim_ente de      ON de.id_ente      = dte.id_ente
GROUP BY fe.ano_remessa, dte.id_ente, fe.id_entidade, de.nome
HAVING SUM(fe.valor_liquidado - fe.valor_pago) > 0;

CREATE INDEX idx_mv_alertas_despesa_tipo
  ON public.mv_alertas_despesa (ano_remessa, tipo_alerta);
CREATE INDEX idx_mv_alertas_despesa_id_ente
  ON public.mv_alertas_despesa (ano_remessa, id_ente, tipo_alerta);

GRANT SELECT ON public.mv_alertas_despesa TO anon, authenticated;
