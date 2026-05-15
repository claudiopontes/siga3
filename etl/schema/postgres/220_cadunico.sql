-- 220_cadunico.sql
-- Módulo: Cadastro Único e Vulnerabilidade Social
-- Tabelas, índices e views analíticas para monitoramento municipal do CadÚnico no Acre.
-- Dados exclusivamente agregados por município — sem dados individualizados ou pessoais.

-- -------------------------------------------------------
-- Schema social
-- -------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS social;

-- -------------------------------------------------------
-- social.cadunico_municipio_mensal
-- Fato mensal: indicadores agregados por município/competência.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS social.cadunico_municipio_mensal (
  id                                bigserial     PRIMARY KEY,
  ano                               integer       NOT NULL,
  mes                               integer       NOT NULL,
  ano_mes                           text          NOT NULL,
  sigla_uf                          text          NOT NULL,
  codigo_ibge_municipio             text          NOT NULL,
  nome_municipio                    text          NOT NULL,

  -- Cadastro Único — famílias e pessoas
  familias_cadastradas              numeric,
  pessoas_cadastradas               numeric,
  familias_pobreza                  numeric,
  familias_baixa_renda              numeric,
  familias_atualizadas              numeric,
  familias_desatualizadas           numeric,
  taxa_atualizacao_cadastral        numeric,      -- percentual 0-100
  familias_unipessoais              numeric,
  percentual_familias_unipessoais   numeric,      -- percentual 0-100

  -- Bolsa Família
  familias_bolsa_familia            numeric,
  valor_total_bolsa_familia         numeric,
  valor_medio_bolsa_familia         numeric,

  -- Benefícios complementares
  beneficiarios_bpc                 numeric,
  beneficiarios_auxilio_gas         numeric,

  -- Gestão municipal
  igdm                              numeric,      -- Índice de Gestão Descentralizada Municipal (0-1)

  -- Controle
  fonte                             text,
  data_referencia                   date,
  data_carga                        timestamptz   NOT NULL DEFAULT now(),
  hash_registro                     text,
  criado_em                         timestamptz   NOT NULL DEFAULT now(),
  atualizado_em                     timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT uq_cadunico_municipio_mensal UNIQUE (ano_mes, codigo_ibge_municipio)
);

CREATE INDEX IF NOT EXISTS idx_cadunico_municipio_mensal_ano_mes
  ON social.cadunico_municipio_mensal (ano_mes);

CREATE INDEX IF NOT EXISTS idx_cadunico_municipio_mensal_municipio
  ON social.cadunico_municipio_mensal (codigo_ibge_municipio);

CREATE INDEX IF NOT EXISTS idx_cadunico_municipio_mensal_uf
  ON social.cadunico_municipio_mensal (sigla_uf);

-- -------------------------------------------------------
-- social.cadunico_controle_carga
-- Registro de cada execução do ETL incremental.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS social.cadunico_controle_carga (
  id                  bigserial     PRIMARY KEY,
  fonte               text          NOT NULL,
  ano_mes             text          NOT NULL,
  status              text          NOT NULL,   -- SUCESSO | ERRO | IGNORADO
  registros_lidos     integer       NOT NULL DEFAULT 0,
  registros_inseridos integer       NOT NULL DEFAULT 0,
  registros_atualizados integer     NOT NULL DEFAULT 0,
  mensagem            text,
  iniciado_em         timestamptz   NOT NULL DEFAULT now(),
  finalizado_em       timestamptz
);

CREATE INDEX IF NOT EXISTS idx_cadunico_controle_carga_status
  ON social.cadunico_controle_carga (status);

CREATE INDEX IF NOT EXISTS idx_cadunico_controle_carga_ano_mes
  ON social.cadunico_controle_carga (ano_mes);

-- -------------------------------------------------------
-- VIEW: social.vw_cadunico_resumo_atual
-- Competência mais recente por município.
-- -------------------------------------------------------
CREATE OR REPLACE VIEW social.vw_cadunico_resumo_atual AS
WITH ultima_competencia AS (
  SELECT
    codigo_ibge_municipio,
    MAX(ano_mes) AS ultimo_ano_mes
  FROM social.cadunico_municipio_mensal
  GROUP BY codigo_ibge_municipio
)
SELECT
  m.ano_mes,
  m.codigo_ibge_municipio,
  m.nome_municipio,
  m.sigla_uf,
  m.familias_cadastradas,
  m.pessoas_cadastradas,
  m.familias_pobreza,
  m.familias_baixa_renda,
  m.familias_atualizadas,
  m.familias_desatualizadas,
  m.taxa_atualizacao_cadastral,
  m.familias_unipessoais,
  m.percentual_familias_unipessoais,
  m.familias_bolsa_familia,
  m.valor_total_bolsa_familia,
  m.igdm,
  m.fonte,
  m.data_carga
FROM social.cadunico_municipio_mensal m
INNER JOIN ultima_competencia u
  ON u.codigo_ibge_municipio = m.codigo_ibge_municipio
  AND u.ultimo_ano_mes = m.ano_mes;

-- -------------------------------------------------------
-- VIEW: social.vw_cadunico_variacao_12m
-- Variação entre competência mais recente e ~12 meses antes.
-- -------------------------------------------------------
CREATE OR REPLACE VIEW social.vw_cadunico_variacao_12m AS
WITH atual AS (
  SELECT * FROM social.vw_cadunico_resumo_atual
),
anterior AS (
  -- 12 meses antes: busca a competência mais próxima entre 10 e 14 meses atrás
  SELECT DISTINCT ON (m.codigo_ibge_municipio)
    m.codigo_ibge_municipio,
    m.ano_mes                       AS ano_mes_anterior,
    m.familias_cadastradas          AS familias_cadastradas_ant,
    m.familias_pobreza              AS familias_pobreza_ant,
    m.familias_unipessoais          AS familias_unipessoais_ant,
    m.taxa_atualizacao_cadastral    AS taxa_atualizacao_ant,
    m.familias_bolsa_familia        AS familias_bolsa_familia_ant
  FROM social.cadunico_municipio_mensal m
  INNER JOIN atual a ON a.codigo_ibge_municipio = m.codigo_ibge_municipio
  WHERE m.ano_mes < a.ano_mes
    AND to_date(m.ano_mes, 'YYYY-MM') >= (to_date(a.ano_mes, 'YYYY-MM') - INTERVAL '14 months')
    AND to_date(m.ano_mes, 'YYYY-MM') <= (to_date(a.ano_mes, 'YYYY-MM') - INTERVAL '10 months')
  ORDER BY m.codigo_ibge_municipio, m.ano_mes DESC
)
SELECT
  a.ano_mes,
  a.codigo_ibge_municipio,
  a.nome_municipio,
  a.sigla_uf,
  ant.ano_mes_anterior,

  -- Variações absolutas
  (a.familias_cadastradas - ant.familias_cadastradas_ant)       AS variacao_familias_cadastradas,
  (a.familias_pobreza     - ant.familias_pobreza_ant)           AS variacao_familias_pobreza,
  (a.familias_unipessoais - ant.familias_unipessoais_ant)       AS variacao_familias_unipessoais,
  (a.familias_bolsa_familia - ant.familias_bolsa_familia_ant)   AS variacao_bolsa_familia,

  -- Variações em percentual
  CASE WHEN ant.familias_cadastradas_ant > 0
    THEN ROUND(((a.familias_cadastradas - ant.familias_cadastradas_ant)
                / ant.familias_cadastradas_ant * 100)::numeric, 2)
    ELSE NULL
  END AS pct_variacao_familias_cadastradas,

  CASE WHEN ant.familias_unipessoais_ant > 0
    THEN ROUND(((a.familias_unipessoais - ant.familias_unipessoais_ant)
                / ant.familias_unipessoais_ant * 100)::numeric, 2)
    ELSE NULL
  END AS pct_variacao_familias_unipessoais,

  CASE WHEN ant.familias_pobreza_ant > 0
    THEN ROUND(((a.familias_pobreza - ant.familias_pobreza_ant)
                / ant.familias_pobreza_ant * 100)::numeric, 2)
    ELSE NULL
  END AS pct_variacao_familias_pobreza,

  -- Variação em pontos percentuais da taxa de atualização
  (a.taxa_atualizacao_cadastral - ant.taxa_atualizacao_ant)     AS variacao_taxa_atualizacao,

  -- Campos de controle herdados da competência atual (necessários para vw_cadunico_alertas_municipio)
  a.fonte,
  a.data_carga

FROM atual a
LEFT JOIN anterior ant ON ant.codigo_ibge_municipio = a.codigo_ibge_municipio;

-- -------------------------------------------------------
-- VIEW: social.vw_cadunico_alertas_municipio
-- Alertas de controle externo por município e tipo de risco.
-- Linguagem cautelosa — indica pontos de atenção, não irregularidades.
-- -------------------------------------------------------
CREATE OR REPLACE VIEW social.vw_cadunico_alertas_municipio AS

-- 1. Baixa atualização cadastral
SELECT
  r.ano_mes,
  r.codigo_ibge_municipio,
  r.nome_municipio,
  r.sigla_uf,
  'baixa_atualizacao_cadastral'                                 AS tipo_alerta,
  CASE
    WHEN r.taxa_atualizacao_cadastral < 70 THEN 'CRITICO'
    WHEN r.taxa_atualizacao_cadastral < 80 THEN 'ALTO'
    ELSE 'MEDIO'
  END                                                           AS nivel_alerta,
  'taxa_atualizacao_cadastral'                                  AS indicador_base,
  r.taxa_atualizacao_cadastral                                  AS valor_indicador,
  'Possível fragilidade na atualização do Cadastro Único'       AS descricao_alerta,
  'Taxa de atualização cadastral abaixo do mínimo recomendado. Este ponto de atenção não indica irregularidade por si só — requer análise pelo gabinete considerando a relevância do CadÚnico para acesso a políticas sociais.' AS justificativa_controle_externo,
  r.fonte,
  r.data_carga
FROM social.vw_cadunico_resumo_atual r
WHERE r.taxa_atualizacao_cadastral IS NOT NULL
  AND r.taxa_atualizacao_cadastral < 80

UNION ALL

-- 2. Alta vulnerabilidade social — top 5 por percentual de pobreza
-- Subquery necessária: ORDER BY + LIMIT não são permitidos em membros intermediários de UNION ALL no PostgreSQL.
SELECT
  ano_mes, codigo_ibge_municipio, nome_municipio, sigla_uf,
  tipo_alerta, nivel_alerta, indicador_base, valor_indicador,
  descricao_alerta, justificativa_controle_externo, fonte, data_carga
FROM (
  SELECT
    r.ano_mes,
    r.codigo_ibge_municipio,
    r.nome_municipio,
    r.sigla_uf,
    'alta_vulnerabilidade_social'                                   AS tipo_alerta,
    'ALTO'                                                          AS nivel_alerta,
    'percentual_familias_pobreza'                                   AS indicador_base,
    ROUND((r.familias_pobreza / r.familias_cadastradas * 100)::numeric, 2) AS valor_indicador,
    'Indício de alta concentração de famílias em situação de pobreza' AS descricao_alerta,
    'Município entre os 5 com maior percentual de famílias em situação de pobreza na competência mais recente. Recomenda-se análise da efetividade dos programas de proteção social e da qualidade da gestão municipal do Cadastro Único.' AS justificativa_controle_externo,
    r.fonte,
    r.data_carga
  FROM social.vw_cadunico_resumo_atual r
  WHERE r.familias_pobreza IS NOT NULL
    AND r.familias_cadastradas > 0
  ORDER BY (r.familias_pobreza / r.familias_cadastradas) DESC
  LIMIT 5
) sub_vulnerabilidade

UNION ALL

-- 3. Crescimento de famílias unipessoais em 12 meses
SELECT
  v.ano_mes,
  v.codigo_ibge_municipio,
  v.nome_municipio,
  v.sigla_uf,
  'crescimento_familias_unipessoais'                            AS tipo_alerta,
  CASE
    WHEN v.pct_variacao_familias_unipessoais > 30 THEN 'CRITICO'
    ELSE 'ALTO'
  END                                                           AS nivel_alerta,
  'pct_variacao_familias_unipessoais'                          AS indicador_base,
  v.pct_variacao_familias_unipessoais                          AS valor_indicador,
  'Crescimento expressivo de famílias unipessoais nos últimos 12 meses' AS descricao_alerta,
  'Aumento relevante no número de famílias unipessoais pode indicar fragmentação familiar, desagregação de unidades familiares ou movimento migratório. Necessidade de análise pelo gabinete.' AS justificativa_controle_externo,
  v.fonte,
  v.data_carga
FROM social.vw_cadunico_variacao_12m v
WHERE v.pct_variacao_familias_unipessoais IS NOT NULL
  AND v.pct_variacao_familias_unipessoais > 20

UNION ALL

-- 4. Queda brusca de famílias cadastradas em 12 meses
SELECT
  v.ano_mes,
  v.codigo_ibge_municipio,
  v.nome_municipio,
  v.sigla_uf,
  'queda_brusca_familias_cadastradas'                           AS tipo_alerta,
  CASE
    WHEN v.pct_variacao_familias_cadastradas < -20 THEN 'CRITICO'
    ELSE 'ALTO'
  END                                                           AS nivel_alerta,
  'pct_variacao_familias_cadastradas'                          AS indicador_base,
  v.pct_variacao_familias_cadastradas                          AS valor_indicador,
  'Queda expressiva no total de famílias cadastradas em 12 meses' AS descricao_alerta,
  'Redução significativa no cadastro pode indicar cancelamentos em massa, depuração cadastral irregular ou subnotificação. Este ponto de atenção requer análise da gestão municipal do CadÚnico.' AS justificativa_controle_externo,
  v.fonte,
  v.data_carga
FROM social.vw_cadunico_variacao_12m v
WHERE v.pct_variacao_familias_cadastradas IS NOT NULL
  AND v.pct_variacao_familias_cadastradas < -10

UNION ALL

-- 5. Baixo IGD-M
SELECT
  r.ano_mes,
  r.codigo_ibge_municipio,
  r.nome_municipio,
  r.sigla_uf,
  'baixo_igdm'                                                  AS tipo_alerta,
  CASE
    WHEN r.igdm < 0.4 THEN 'CRITICO'
    ELSE 'ALTO'
  END                                                           AS nivel_alerta,
  'igdm'                                                        AS indicador_base,
  r.igdm                                                        AS valor_indicador,
  'Índice de Gestão Descentralizada Municipal abaixo do referencial mínimo' AS descricao_alerta,
  'IGD-M baixo indica possível fragilidade na gestão local do Cadastro Único e do Programa Bolsa Família. Recomenda-se verificação da capacidade técnica e operacional do CRAS municipal.' AS justificativa_controle_externo,
  r.fonte,
  r.data_carga
FROM social.vw_cadunico_resumo_atual r
WHERE r.igdm IS NOT NULL
  AND r.igdm < 0.6;
