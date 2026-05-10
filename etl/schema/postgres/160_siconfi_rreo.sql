-- 160_siconfi_rreo.sql
-- SICONFI/RREO — Relatório Resumido da Execução Orçamentária
-- Fonte: API DataLake Tesouro Nacional
-- Base URL: https://apidatalake.tesouro.gov.br/ords/siconfi/tt

-- -------------------------------------------------------
-- raw.siconfi_rreo_raw
-- Payload bruto por municipio/periodo — preservado para auditoria.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS raw.siconfi_rreo_raw (
  id                     bigserial    PRIMARY KEY,
  an_exercicio           integer      NOT NULL,
  nr_periodo             integer      NOT NULL,
  id_municipio           integer      NULL,   -- cod IBGE 7 dígitos
  co_tipo_demonstrativo  text         NULL,   -- ex: "RREO"
  no_anexo               text         NULL,   -- ex: "RREO-Anexo 12"
  endpoint               text         NOT NULL,
  payload                jsonb        NOT NULL,
  coletado_em            timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_siconfi_rreo_raw_exercicio
  ON raw.siconfi_rreo_raw (an_exercicio, nr_periodo);

CREATE INDEX IF NOT EXISTS idx_siconfi_rreo_raw_municipio
  ON raw.siconfi_rreo_raw (id_municipio);

-- -------------------------------------------------------
-- stage.siconfi_rreo_stg
-- Dados normalizados antes de promoção ao DW.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS stage.siconfi_rreo_stg (
  an_exercicio           integer      NOT NULL,
  nr_periodo             integer      NOT NULL,
  id_municipio           integer      NULL,
  no_municipio           text         NULL,
  co_tipo_demonstrativo  text         NULL,
  no_anexo               text         NULL,
  coluna                 text         NULL,
  conta                  text         NULL,
  valor                  numeric      NULL,
  fonte                  text         NOT NULL DEFAULT 'SICONFI_RREO',
  coletado_em            timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_siconfi_rreo_stg_exercicio
  ON stage.siconfi_rreo_stg (an_exercicio, nr_periodo, id_municipio);

-- -------------------------------------------------------
-- dw.fato_siconfi_rreo
-- Fatos RREO: um registro por municipio/periodo/anexo/conta/coluna.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS dw.fato_siconfi_rreo (
  id                     bigserial    PRIMARY KEY,
  an_exercicio           integer      NOT NULL,
  nr_periodo             integer      NOT NULL,
  id_municipio           integer      NULL,
  no_municipio           text         NULL,
  co_tipo_demonstrativo  text         NULL,
  no_anexo               text         NULL,
  coluna                 text         NULL,
  conta                  text         NULL,
  valor                  numeric      NULL,
  fonte                  text         NOT NULL DEFAULT 'SICONFI_RREO',
  coletado_em            timestamptz  NOT NULL DEFAULT now(),
  atualizado_em          timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_siconfi_rreo_fato_exercicio
  ON dw.fato_siconfi_rreo (an_exercicio, nr_periodo);

CREATE INDEX IF NOT EXISTS idx_siconfi_rreo_fato_municipio
  ON dw.fato_siconfi_rreo (id_municipio);

CREATE INDEX IF NOT EXISTS idx_siconfi_rreo_fato_anexo
  ON dw.fato_siconfi_rreo (no_anexo);

-- -------------------------------------------------------
-- mart.siconfi_rreo_resumo_municipio
-- Resumo por municipio/periodo para consultas rápidas.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.siconfi_rreo_resumo_municipio (
  an_exercicio           integer      NOT NULL,
  nr_periodo             integer      NOT NULL,
  id_municipio           integer      NOT NULL,
  no_municipio           text         NULL,
  total_receitas         numeric      NULL,
  total_despesas         numeric      NULL,
  resultado_orcamentario numeric      NULL,
  total_contas           integer      NOT NULL DEFAULT 0,
  situacao_envio         text         NULL,  -- COM_DADO | SEM_DADO
  atualizado_em          timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (an_exercicio, nr_periodo, id_municipio)
);

CREATE INDEX IF NOT EXISTS idx_siconfi_rreo_resumo_exercicio
  ON mart.siconfi_rreo_resumo_municipio (an_exercicio, nr_periodo);

-- -------------------------------------------------------
-- mart.siconfi_rreo_alertas
-- Alertas gerados pelo job refresh-mart-siconfi-rreo.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.siconfi_rreo_alertas (
  id_alerta              bigserial    PRIMARY KEY,
  area                   text         NOT NULL DEFAULT 'ORCAMENTO',
  fonte                  text         NOT NULL DEFAULT 'SICONFI_RREO',
  an_exercicio           integer      NOT NULL,
  nr_periodo             integer      NOT NULL,
  id_municipio           integer      NULL,
  no_municipio           text         NULL,
  tipo_alerta            text         NOT NULL,
  nivel                  text         NOT NULL,  -- CRITICO | ALTO | MEDIO | BAIXO
  descricao              text         NOT NULL,
  valor_observado        numeric      NULL,
  valor_referencia       numeric      NULL,
  detalhe_json           jsonb        NULL,
  atualizado_em          timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_siconfi_rreo_alertas_nivel
  ON mart.siconfi_rreo_alertas (an_exercicio, nivel);

CREATE INDEX IF NOT EXISTS idx_siconfi_rreo_alertas_municipio
  ON mart.siconfi_rreo_alertas (id_municipio);

-- -------------------------------------------------------
-- mart.siconfi_rreo_alertas_home
-- Subconjunto para a home: máx 30, CRITICO/ALTO, período mais recente.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.siconfi_rreo_alertas_home (
  id_alerta              bigint       NULL,
  area                   text         NOT NULL DEFAULT 'ORCAMENTO',
  fonte                  text         NOT NULL DEFAULT 'SICONFI_RREO',
  an_exercicio           integer      NOT NULL,
  nr_periodo             integer      NOT NULL,
  id_municipio           integer      NULL,
  no_municipio           text         NULL,
  tipo_alerta            text         NOT NULL,
  nivel                  text         NOT NULL,
  descricao              text         NOT NULL,
  valor_observado        numeric      NULL,
  valor_referencia       numeric      NULL,
  prioridade             integer      NOT NULL DEFAULT 2,
  atualizado_em          timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_siconfi_rreo_home_nivel
  ON mart.siconfi_rreo_alertas_home (nivel);

CREATE INDEX IF NOT EXISTS idx_siconfi_rreo_home_prioridade
  ON mart.siconfi_rreo_alertas_home (prioridade, tipo_alerta);

-- -------------------------------------------------------
-- mart.siconfi_rreo_resumo_home
-- Uma linha: totais do período mais recente para o card da home.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.siconfi_rreo_resumo_home (
  id                     serial       PRIMARY KEY,
  an_exercicio           integer      NOT NULL,
  nr_periodo             integer      NOT NULL,
  municipios_com_dado    integer      NOT NULL DEFAULT 0,
  municipios_sem_dado    integer      NOT NULL DEFAULT 0,
  total_municipios       integer      NOT NULL DEFAULT 0,
  total_alertas          integer      NOT NULL DEFAULT 0,
  alertas_criticos       integer      NOT NULL DEFAULT 0,
  alertas_altos          integer      NOT NULL DEFAULT 0,
  atualizado_em          timestamptz  NOT NULL DEFAULT now()
);
