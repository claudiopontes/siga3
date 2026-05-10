-- =============================================================================
-- 190_sisagua.sql
--
-- Esquema para integração SISAGUA — Sistema de Informação de Vigilância
-- da Qualidade da Água para Consumo Humano (DATASUS/MS)
--
-- Camadas:
--   raw   — payload bruto JSON da API
--   stage — normalização defensiva (campos padronizados)
--   dw    — fatos analíticos normalizados
--   mart  — resumos e alertas para o painel
--
-- Para destruir e recriar do zero (use com cuidado):
-- DROP TABLE IF EXISTS mart.sisagua_resumo_home CASCADE;
-- DROP TABLE IF EXISTS mart.sisagua_alertas_home CASCADE;
-- DROP TABLE IF EXISTS mart.sisagua_alertas CASCADE;
-- DROP TABLE IF EXISTS mart.sisagua_resumo_municipio CASCADE;
-- DROP TABLE IF EXISTS dw.fato_sisagua_populacao CASCADE;
-- DROP TABLE IF EXISTS dw.fato_sisagua_parametro CASCADE;
-- DROP TABLE IF EXISTS stage.sisagua_populacao_stg CASCADE;
-- DROP TABLE IF EXISTS stage.sisagua_parametros_stg CASCADE;
-- DROP TABLE IF EXISTS raw.sisagua_raw CASCADE;
-- =============================================================================

-- ---------------------------------------------------------------------------
-- raw.sisagua_raw
-- Armazena o payload bruto de cada registro retornado pela API SISAGUA.
-- endpoint: identificador do endpoint (controle_mensal, vigilancia, etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS raw.sisagua_raw (
  id              bigserial     PRIMARY KEY,
  endpoint        text          NOT NULL,
  uf              text          NOT NULL DEFAULT 'AC',
  ano             integer       NOT NULL,
  mes             integer,
  payload         jsonb         NOT NULL,
  carregado_em    timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sisagua_raw_endpoint  ON raw.sisagua_raw (endpoint);
CREATE INDEX IF NOT EXISTS idx_sisagua_raw_ano_mes   ON raw.sisagua_raw (ano, mes);
CREATE INDEX IF NOT EXISTS idx_sisagua_raw_endpoint_ano ON raw.sisagua_raw (endpoint, ano);

-- ---------------------------------------------------------------------------
-- stage.sisagua_parametros_stg
-- Normalização dos registros de parâmetros de qualidade (controle_mensal
-- e vigilância). Mapeamento defensivo — campos podem variar conforme versão
-- da API.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stage.sisagua_parametros_stg (
  id                      bigserial   PRIMARY KEY,
  raw_id                  bigint      REFERENCES raw.sisagua_raw(id) ON DELETE SET NULL,
  endpoint                text        NOT NULL,   -- controle_mensal | vigilancia
  uf                      text,
  codigo_municipio_ibge   text,
  nome_municipio          text,
  ano                     integer,
  mes                     integer,
  competencia             text,                   -- AAAAMM ou similar
  parametro               text,
  resultado               text,
  valor                   numeric,
  unidade                 text,
  fora_padrao             boolean,
  data_coleta             date,
  forma_abastecimento     text,
  sistema_abastecimento   text,
  ponto_coleta            text,
  carregado_em            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sisagua_parametros_municipio
  ON stage.sisagua_parametros_stg (codigo_municipio_ibge);
CREATE INDEX IF NOT EXISTS idx_sisagua_parametros_ano_mes
  ON stage.sisagua_parametros_stg (ano, mes);
CREATE INDEX IF NOT EXISTS idx_sisagua_parametros_fora_padrao
  ON stage.sisagua_parametros_stg (fora_padrao);

-- ---------------------------------------------------------------------------
-- stage.sisagua_populacao_stg
-- Normalização dos registros de população abastecida.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stage.sisagua_populacao_stg (
  id                      bigserial   PRIMARY KEY,
  raw_id                  bigint      REFERENCES raw.sisagua_raw(id) ON DELETE SET NULL,
  uf                      text,
  codigo_municipio_ibge   text,
  nome_municipio          text,
  ano                     integer,
  mes                     integer,
  competencia             text,
  populacao_abastecida    integer,
  forma_abastecimento     text,
  sistema_abastecimento   text,
  carregado_em            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sisagua_populacao_municipio
  ON stage.sisagua_populacao_stg (codigo_municipio_ibge);
CREATE INDEX IF NOT EXISTS idx_sisagua_populacao_ano
  ON stage.sisagua_populacao_stg (ano);

-- ---------------------------------------------------------------------------
-- dw.fato_sisagua_parametro
-- Fato analítico de parâmetros de qualidade da água.
-- Chave de negócio: municipio + endpoint + competencia + parametro + ponto_coleta
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dw.fato_sisagua_parametro (
  id                      bigserial   PRIMARY KEY,
  endpoint                text        NOT NULL,
  uf                      text,
  codigo_municipio_ibge   text,
  nome_municipio          text,
  ano                     integer,
  mes                     integer,
  competencia             text,
  parametro               text,
  resultado               text,
  valor                   numeric,
  unidade                 text,
  fora_padrao             boolean,
  data_coleta             date,
  forma_abastecimento     text,
  sistema_abastecimento   text,
  ponto_coleta            text,
  atualizado_em           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fato_sisagua_param_municipio
  ON dw.fato_sisagua_parametro (codigo_municipio_ibge);
CREATE INDEX IF NOT EXISTS idx_fato_sisagua_param_ano_mes
  ON dw.fato_sisagua_parametro (ano, mes);
CREATE INDEX IF NOT EXISTS idx_fato_sisagua_param_fora_padrao
  ON dw.fato_sisagua_parametro (fora_padrao);
CREATE INDEX IF NOT EXISTS idx_fato_sisagua_param_parametro
  ON dw.fato_sisagua_parametro (parametro);
CREATE INDEX IF NOT EXISTS idx_fato_sisagua_param_competencia
  ON dw.fato_sisagua_parametro (competencia);

-- ---------------------------------------------------------------------------
-- dw.fato_sisagua_populacao
-- Fato analítico de população abastecida por sistema.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dw.fato_sisagua_populacao (
  id                      bigserial   PRIMARY KEY,
  uf                      text,
  codigo_municipio_ibge   text,
  nome_municipio          text,
  ano                     integer,
  mes                     integer,
  competencia             text,
  populacao_abastecida    integer,
  forma_abastecimento     text,
  sistema_abastecimento   text,
  atualizado_em           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fato_sisagua_pop_municipio
  ON dw.fato_sisagua_populacao (codigo_municipio_ibge);
CREATE INDEX IF NOT EXISTS idx_fato_sisagua_pop_ano
  ON dw.fato_sisagua_populacao (ano);

-- ---------------------------------------------------------------------------
-- mart.sisagua_resumo_municipio
-- Uma linha por município com totais de amostras e alertas SISAGUA.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.sisagua_resumo_municipio (
  codigo_municipio_ibge       text        PRIMARY KEY,
  nome_municipio              text,
  uf                          text,
  total_amostras              integer     NOT NULL DEFAULT 0,
  total_fora_padrao           integer     NOT NULL DEFAULT 0,
  total_ecoli                 integer     NOT NULL DEFAULT 0,
  total_coliformes            integer     NOT NULL DEFAULT 0,
  total_cloro_baixo           integer     NOT NULL DEFAULT 0,
  total_turbidez_fora_padrao  integer     NOT NULL DEFAULT 0,
  percentual_fora_padrao      numeric,
  data_ultima_coleta          date,
  total_alertas               integer     NOT NULL DEFAULT 0,
  total_criticos              integer     NOT NULL DEFAULT 0,
  total_altos                 integer     NOT NULL DEFAULT 0,
  total_medios                integer     NOT NULL DEFAULT 0,
  score_risco                 integer     NOT NULL DEFAULT 0,
  nivel_risco                 text        NOT NULL DEFAULT 'BAIXO',
  atualizado_em               timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- mart.sisagua_alertas
-- Todos os alertas SISAGUA gerados para o painel.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.sisagua_alertas (
  id_alerta               bigserial   PRIMARY KEY,
  fonte                   text        NOT NULL DEFAULT 'SISAGUA',
  codigo_municipio_ibge   text,
  nome_municipio          text,
  tipo_alerta             text        NOT NULL,
  nivel                   text        NOT NULL,   -- CRITICO | ALTO | MEDIO
  descricao               text,
  valor_observado         numeric,
  valor_referencia        numeric,
  prioridade              integer,
  detalhe_json            jsonb,
  atualizado_em           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sisagua_alertas_municipio
  ON mart.sisagua_alertas (codigo_municipio_ibge);
CREATE INDEX IF NOT EXISTS idx_sisagua_alertas_nivel
  ON mart.sisagua_alertas (nivel);

-- ---------------------------------------------------------------------------
-- mart.sisagua_alertas_home
-- Alertas CRITICO/ALTO para o card da home (máx 30).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.sisagua_alertas_home (
  id                      bigserial   PRIMARY KEY,
  id_alerta               bigint,
  fonte                   text        NOT NULL DEFAULT 'SISAGUA',
  codigo_municipio_ibge   text,
  nome_municipio          text,
  tipo_alerta             text        NOT NULL,
  nivel                   text        NOT NULL,
  descricao               text,
  valor_observado         numeric,
  valor_referencia        numeric,
  prioridade              integer,
  detalhe_json            jsonb,
  atualizado_em           timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- mart.sisagua_resumo_home
-- Uma linha com os totais para o card da home do painel SISAGUA.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.sisagua_resumo_home (
  id                          bigserial   PRIMARY KEY,
  total_alertas               integer     NOT NULL DEFAULT 0,
  total_criticos              integer     NOT NULL DEFAULT 0,
  total_altos                 integer     NOT NULL DEFAULT 0,
  total_medios                integer     NOT NULL DEFAULT 0,
  total_municipios_afetados   integer     NOT NULL DEFAULT 0,
  municipios_risco_critico    integer     NOT NULL DEFAULT 0,
  municipios_risco_alto       integer     NOT NULL DEFAULT 0,
  municipios_risco_medio      integer     NOT NULL DEFAULT 0,
  total_amostras              integer     NOT NULL DEFAULT 0,
  total_fora_padrao           integer     NOT NULL DEFAULT 0,
  atualizado_em               timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Adiciona colunas SISAGUA em mart.saude_resumo_municipio (consolidado)
-- Executar apenas após criar a tabela principal (schema 180)
-- ---------------------------------------------------------------------------
ALTER TABLE mart.saude_resumo_municipio
  ADD COLUMN IF NOT EXISTS sisagua_total_amostras      integer     not null default 0,
  ADD COLUMN IF NOT EXISTS sisagua_total_fora_padrao   integer     not null default 0,
  ADD COLUMN IF NOT EXISTS sisagua_total_ecoli         integer     not null default 0,
  ADD COLUMN IF NOT EXISTS sisagua_total_coliformes    integer     not null default 0,
  ADD COLUMN IF NOT EXISTS sisagua_percentual_fora_padrao numeric  null,
  ADD COLUMN IF NOT EXISTS sisagua_data_ultima_coleta  date        null;
