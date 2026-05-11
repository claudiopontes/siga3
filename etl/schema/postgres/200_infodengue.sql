-- =============================================================================
-- 200_infodengue.sql
--
-- Esquema para integração InfoDengue / AlertaDengue
-- Fonte: https://info.dengue.mat.br/api/alertcity (Fiocruz / PROCC)
-- Doenças: dengue, chikungunya, zika
--
-- Camadas:
--   raw   — payload bruto JSON da API por município/doença/período
--   stage — normalização defensiva (campos padronizados, tipos corretos)
--   dw    — fatos analíticos por semana epidemiológica
--   mart  — resumos e alertas para o Painel da Saúde / Vigilância
--
-- Para destruir e recriar do zero (use com cuidado):
-- DROP TABLE IF EXISTS mart.vigilancia_arboviroses_resumo_home CASCADE;
-- DROP TABLE IF EXISTS mart.vigilancia_arboviroses_alertas_home CASCADE;
-- DROP TABLE IF EXISTS mart.vigilancia_arboviroses_alertas CASCADE;
-- DROP TABLE IF EXISTS mart.vigilancia_arboviroses_resumo_municipio CASCADE;
-- DROP TABLE IF EXISTS dw.fato_infodengue_semana CASCADE;
-- DROP TABLE IF EXISTS stage.infodengue_stg CASCADE;
-- DROP TABLE IF EXISTS raw.infodengue_raw CASCADE;
-- =============================================================================

-- ---------------------------------------------------------------------------
-- raw.infodengue_raw
-- Payload bruto JSON da API InfoDengue por geocode/doença/período.
-- Preservado para auditoria e reprocessamento.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS raw.infodengue_raw (
  id                    bigserial     PRIMARY KEY,
  codigo_municipio_ibge text          NOT NULL,
  nome_municipio        text          NULL,
  uf                    text          NULL,
  doenca                text          NOT NULL,  -- dengue | chikungunya | zika
  ano_inicio            integer       NOT NULL,
  ano_fim               integer       NOT NULL,
  semana_inicio         integer       NOT NULL,
  semana_fim            integer       NOT NULL,
  endpoint              text          NOT NULL,
  payload               jsonb         NOT NULL,
  coletado_em           timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_infodengue_raw_municipio_doenca
  ON raw.infodengue_raw (codigo_municipio_ibge, doenca);

CREATE INDEX IF NOT EXISTS idx_infodengue_raw_coletado
  ON raw.infodengue_raw (coletado_em DESC);

-- ---------------------------------------------------------------------------
-- stage.infodengue_stg
-- Dados normalizados extraídos do raw.
-- Uma linha por município/doença/semana epidemiológica.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stage.infodengue_stg (
  codigo_municipio_ibge  text          NOT NULL,
  nome_municipio         text          NULL,
  uf                     text          NULL,
  doenca                 text          NOT NULL,
  data_inicio_semana     date          NULL,
  semana_epidemiologica  integer       NULL,
  ano_epidemiologico     integer       NULL,
  casos                  numeric       NULL,
  casos_est              numeric       NULL,
  casos_est_min          numeric       NULL,
  casos_est_max          numeric       NULL,
  p_rt1                  numeric       NULL,
  p_inc100k              numeric       NULL,
  nivel                  integer       NULL,   -- 1=verde, 2=amarelo, 3=laranja, 4=vermelho
  rt                     numeric       NULL,
  populacao              numeric       NULL,
  receptivo              integer       NULL,
  transmissao            integer       NULL,
  nivel_inc              integer       NULL,
  notif_accum_year       numeric       NULL,
  payload                jsonb         NULL,
  coletado_em            timestamptz   NOT NULL DEFAULT now(),

  UNIQUE (codigo_municipio_ibge, doenca, ano_epidemiologico, semana_epidemiologica)
);

CREATE INDEX IF NOT EXISTS idx_infodengue_stg_municipio_doenca
  ON stage.infodengue_stg (codigo_municipio_ibge, doenca, ano_epidemiologico, semana_epidemiologica);

CREATE INDEX IF NOT EXISTS idx_infodengue_stg_nivel
  ON stage.infodengue_stg (nivel);

-- ---------------------------------------------------------------------------
-- dw.fato_infodengue_semana
-- Fatos analíticos por semana epidemiológica.
-- Idempotente via ON CONFLICT (codigo_municipio_ibge, doenca, ano_epidemiologico, semana_epidemiologica).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dw.fato_infodengue_semana (
  id                     bigserial     PRIMARY KEY,
  codigo_municipio_ibge  text          NOT NULL,
  nome_municipio         text          NULL,
  uf                     text          NULL,
  doenca                 text          NOT NULL,
  data_inicio_semana     date          NULL,
  semana_epidemiologica  integer       NULL,
  ano_epidemiologico     integer       NULL,
  casos                  numeric       NULL,
  casos_est              numeric       NULL,
  casos_est_min          numeric       NULL,
  casos_est_max          numeric       NULL,
  p_rt1                  numeric       NULL,
  p_inc100k              numeric       NULL,
  nivel                  integer       NULL,   -- 1=verde, 2=amarelo, 3=laranja, 4=vermelho
  rt                     numeric       NULL,
  populacao              numeric       NULL,
  receptivo              integer       NULL,
  transmissao            integer       NULL,
  nivel_inc              integer       NULL,
  notif_accum_year       numeric       NULL,
  payload                jsonb         NULL,
  coletado_em            timestamptz   NOT NULL DEFAULT now(),
  atualizado_em          timestamptz   NOT NULL DEFAULT now(),

  UNIQUE (codigo_municipio_ibge, doenca, ano_epidemiologico, semana_epidemiologica)
);

CREATE INDEX IF NOT EXISTS idx_fato_infodengue_municipio_doenca
  ON dw.fato_infodengue_semana (codigo_municipio_ibge, doenca, ano_epidemiologico, semana_epidemiologica);

CREATE INDEX IF NOT EXISTS idx_fato_infodengue_nivel
  ON dw.fato_infodengue_semana (nivel);

CREATE INDEX IF NOT EXISTS idx_fato_infodengue_p_inc100k
  ON dw.fato_infodengue_semana (p_inc100k);

CREATE INDEX IF NOT EXISTS idx_fato_infodengue_data
  ON dw.fato_infodengue_semana (data_inicio_semana DESC);

-- ---------------------------------------------------------------------------
-- mart.vigilancia_arboviroses_resumo_municipio
-- Semana mais recente por município/doença — linha por par (município × doença).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.vigilancia_arboviroses_resumo_municipio (
  codigo_municipio_ibge  text          NOT NULL,
  nome_municipio         text          NULL,
  uf                     text          NULL,
  doenca                 text          NOT NULL,
  ano_epidemiologico     integer       NULL,
  semana_epidemiologica  integer       NULL,
  data_inicio_semana     date          NULL,
  casos                  numeric       NULL,
  casos_est              numeric       NULL,
  p_inc100k              numeric       NULL,
  nivel                  integer       NULL,
  nivel_descricao        text          NULL,   -- Verde | Amarelo | Laranja | Vermelho
  rt                     numeric       NULL,
  p_rt1                  numeric       NULL,
  receptivo              integer       NULL,
  transmissao            integer       NULL,
  nivel_inc              integer       NULL,
  notif_accum_year       numeric       NULL,
  atualizado_em          timestamptz   NOT NULL DEFAULT now(),

  PRIMARY KEY (codigo_municipio_ibge, doenca)
);

CREATE INDEX IF NOT EXISTS idx_vigi_resumo_nivel
  ON mart.vigilancia_arboviroses_resumo_municipio (nivel);

CREATE INDEX IF NOT EXISTS idx_vigi_resumo_doenca
  ON mart.vigilancia_arboviroses_resumo_municipio (doenca);

-- ---------------------------------------------------------------------------
-- mart.vigilancia_arboviroses_alertas
-- Todos os alertas gerados por município/doença.
-- Recriado a cada refresh.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.vigilancia_arboviroses_alertas (
  id_alerta              bigserial     PRIMARY KEY,
  area                   text          NOT NULL DEFAULT 'SAUDE',
  fonte                  text          NOT NULL DEFAULT 'INFODENGUE',
  codigo_municipio_ibge  text          NULL,
  nome_municipio         text          NULL,
  doenca                 text          NOT NULL,
  ano_epidemiologico     integer       NULL,
  semana_epidemiologica  integer       NULL,
  tipo_alerta            text          NOT NULL,
  nivel                  text          NOT NULL,  -- CRITICO | ALTO | MEDIO
  descricao              text          NOT NULL,
  valor_observado        numeric       NULL,
  valor_referencia       numeric       NULL,
  detalhe_json           jsonb         NULL,
  atualizado_em          timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vigi_alertas_nivel
  ON mart.vigilancia_arboviroses_alertas (nivel);

CREATE INDEX IF NOT EXISTS idx_vigi_alertas_doenca
  ON mart.vigilancia_arboviroses_alertas (doenca);

CREATE INDEX IF NOT EXISTS idx_vigi_alertas_municipio
  ON mart.vigilancia_arboviroses_alertas (codigo_municipio_ibge);

-- ---------------------------------------------------------------------------
-- mart.vigilancia_arboviroses_alertas_home
-- Subconjunto para home: máx 30, apenas CRITICO/ALTO.
-- Recriado a cada refresh.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.vigilancia_arboviroses_alertas_home (
  id_alerta              bigint        NULL,
  area                   text          NOT NULL DEFAULT 'SAUDE',
  fonte                  text          NOT NULL DEFAULT 'INFODENGUE',
  codigo_municipio_ibge  text          NULL,
  nome_municipio         text          NULL,
  doenca                 text          NOT NULL,
  ano_epidemiologico     integer       NULL,
  semana_epidemiologica  integer       NULL,
  tipo_alerta            text          NOT NULL,
  nivel                  text          NOT NULL,
  descricao              text          NOT NULL,
  valor_observado        numeric       NULL,
  valor_referencia       numeric       NULL,
  prioridade             integer       NOT NULL,  -- 1=CRITICO, 2=ALTO
  detalhe_json           jsonb         NULL,
  atualizado_em          timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vigi_alertas_home_nivel
  ON mart.vigilancia_arboviroses_alertas_home (nivel);

CREATE INDEX IF NOT EXISTS idx_vigi_alertas_home_prioridade
  ON mart.vigilancia_arboviroses_alertas_home (prioridade);

-- ---------------------------------------------------------------------------
-- mart.vigilancia_arboviroses_resumo_home
-- Uma linha: totais consolidados para o card da home.
-- Recriado a cada refresh.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.vigilancia_arboviroses_resumo_home (
  area                        text         NOT NULL DEFAULT 'SAUDE',
  fonte                       text         NOT NULL DEFAULT 'INFODENGUE',
  total_alertas               integer      NOT NULL DEFAULT 0,
  total_criticos              integer      NOT NULL DEFAULT 0,
  total_altos                 integer      NOT NULL DEFAULT 0,
  total_medios                integer      NOT NULL DEFAULT 0,
  total_municipios_afetados   integer      NOT NULL DEFAULT 0,
  total_doencas_monitoradas   integer      NOT NULL DEFAULT 0,
  ano_epidemiologico          integer      NULL,
  semana_epidemiologica       integer      NULL,
  atualizado_em               timestamptz  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Migration incremental: colunas de vigilância em mart.saude_resumo_municipio
-- Executado com IF NOT EXISTS para ser seguro em banco já existente.
-- ---------------------------------------------------------------------------
ALTER TABLE mart.saude_resumo_municipio
  ADD COLUMN IF NOT EXISTS vigilancia_total_alertas      integer  NULL,
  ADD COLUMN IF NOT EXISTS vigilancia_alertas_criticos   integer  NULL,
  ADD COLUMN IF NOT EXISTS vigilancia_alertas_altos      integer  NULL,
  ADD COLUMN IF NOT EXISTS vigilancia_dengue_nivel       integer  NULL,
  ADD COLUMN IF NOT EXISTS vigilancia_chikungunya_nivel  integer  NULL,
  ADD COLUMN IF NOT EXISTS vigilancia_zika_nivel         integer  NULL,
  ADD COLUMN IF NOT EXISTS vigilancia_semana_epidemiologica integer NULL,
  ADD COLUMN IF NOT EXISTS vigilancia_ano_epidemiologico integer  NULL;

-- SISAGUA: colunas adicionadas em 190_sisagua.sql; garantir existência aqui também
ALTER TABLE mart.saude_resumo_municipio
  ADD COLUMN IF NOT EXISTS sisagua_total_amostras          integer  NULL,
  ADD COLUMN IF NOT EXISTS sisagua_total_fora_padrao       integer  NULL,
  ADD COLUMN IF NOT EXISTS sisagua_total_ecoli             integer  NULL,
  ADD COLUMN IF NOT EXISTS sisagua_total_coliformes        integer  NULL,
  ADD COLUMN IF NOT EXISTS sisagua_percentual_fora_padrao  numeric  NULL,
  ADD COLUMN IF NOT EXISTS sisagua_data_ultima_coleta      date     NULL;
