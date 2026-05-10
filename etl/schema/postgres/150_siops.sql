-- 150_siops.sql
-- SIOPS — Sistema de Informações sobre Orçamentos Públicos em Saúde
-- Tabelas para coleta, staging, DW e mart de indicadores de saúde/orçamento.

-- -------------------------------------------------------
-- raw.siops_indicadores_raw
-- Payload bruto por municipio/periodo — preservado para auditoria e reprocessamento.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS raw.siops_indicadores_raw (
  id                     bigserial    PRIMARY KEY,
  ano                    integer      NOT NULL,
  periodo                text         NULL,   -- ex: "1B" (1º bimestre), "2B", etc.
  uf                     text         NULL,
  codigo_municipio_ibge  text         NULL,
  nome_municipio         text         NULL,
  endpoint               text         NOT NULL,
  payload                jsonb        NOT NULL,
  coletado_em            timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_siops_raw_ano_municipio
  ON raw.siops_indicadores_raw (ano, codigo_municipio_ibge);

CREATE INDEX IF NOT EXISTS idx_siops_raw_periodo
  ON raw.siops_indicadores_raw (ano, periodo);

-- -------------------------------------------------------
-- stage.siops_indicadores_stg
-- Dados normalizados antes de promoção ao DW.
-- Truncate antes de cada carga.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS stage.siops_indicadores_stg (
  ano                    integer      NOT NULL,
  periodo                text         NULL,
  codigo_municipio_ibge  text         NULL,
  nome_municipio         text         NULL,
  indicador              text         NULL,
  valor                  numeric      NULL,
  percentual             numeric      NULL,
  unidade                text         NULL,
  fonte                  text         NOT NULL DEFAULT 'SIOPS',
  payload                jsonb        NULL,
  coletado_em            timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_siops_stg_ano_municipio
  ON stage.siops_indicadores_stg (ano, codigo_municipio_ibge);

-- -------------------------------------------------------
-- dw.fato_siops_indicador
-- Tabela de fatos: um registro por municipio/periodo/indicador.
-- Estratégia idempotente: DELETE + INSERT por ano/periodo/municipio.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS dw.fato_siops_indicador (
  id                     bigserial    PRIMARY KEY,
  ano                    integer      NOT NULL,
  periodo                text         NULL,
  codigo_municipio_ibge  text         NULL,
  nome_municipio         text         NULL,
  indicador              text         NOT NULL,
  valor                  numeric      NULL,
  percentual             numeric      NULL,
  unidade                text         NULL,
  fonte                  text         NOT NULL DEFAULT 'SIOPS',
  coletado_em            timestamptz  NOT NULL DEFAULT now(),
  atualizado_em          timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_siops_fato_ano_municipio
  ON dw.fato_siops_indicador (ano, codigo_municipio_ibge);

CREATE INDEX IF NOT EXISTS idx_siops_fato_indicador
  ON dw.fato_siops_indicador (indicador);

CREATE INDEX IF NOT EXISTS idx_siops_fato_periodo
  ON dw.fato_siops_indicador (ano, periodo);

-- -------------------------------------------------------
-- mart.siops_resumo_municipio
-- Resumo por municipio/periodo para consultas rápidas da UI.
-- Reconstruído pelo job refresh-mart-siops.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.siops_resumo_municipio (
  ano                      integer      NOT NULL,
  periodo                  text         NULL,
  codigo_municipio_ibge    text         NOT NULL,
  nome_municipio           text         NULL,
  percentual_aplicado_saude numeric     NULL,
  despesa_total_saude      numeric      NULL,
  receita_base_calculo     numeric      NULL,
  situacao_envio           text         NULL,   -- COM_DADO | SEM_DADO | INCOMPLETO
  total_indicadores        integer      NOT NULL DEFAULT 0,
  atualizado_em            timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (ano, codigo_municipio_ibge, periodo)
);

CREATE INDEX IF NOT EXISTS idx_siops_resumo_ano_periodo
  ON mart.siops_resumo_municipio (ano, periodo);

CREATE INDEX IF NOT EXISTS idx_siops_resumo_municipio
  ON mart.siops_resumo_municipio (codigo_municipio_ibge);

-- -------------------------------------------------------
-- mart.siops_alertas
-- Alertas gerados pelo job refresh-mart-siops.
-- Reconstruído completamente a cada refresh.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.siops_alertas (
  id_alerta              bigserial    PRIMARY KEY,
  area                   text         NOT NULL DEFAULT 'SAUDE',
  fonte                  text         NOT NULL DEFAULT 'SIOPS',
  ano                    integer      NOT NULL,
  periodo                text         NULL,
  codigo_municipio_ibge  text         NULL,
  nome_municipio         text         NULL,
  tipo_alerta            text         NOT NULL,
  nivel                  text         NOT NULL,  -- CRITICO | ALTO | MEDIO | BAIXO
  descricao              text         NOT NULL,
  valor_observado        numeric      NULL,
  valor_referencia       numeric      NULL,
  detalhe_json           jsonb        NULL,
  atualizado_em          timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_siops_alertas_ano_nivel
  ON mart.siops_alertas (ano, nivel);

CREATE INDEX IF NOT EXISTS idx_siops_alertas_tipo
  ON mart.siops_alertas (tipo_alerta);

CREATE INDEX IF NOT EXISTS idx_siops_alertas_municipio
  ON mart.siops_alertas (codigo_municipio_ibge);
