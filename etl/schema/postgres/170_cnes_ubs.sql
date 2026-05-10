-- 170_cnes_ubs.sql
-- CNES/UBS — Cadastro Nacional de Estabelecimentos de Saúde / Unidades Básicas de Saúde
-- Fonte: OpenDataSUS (CKAN) — https://opendatasus.saude.gov.br

-- -------------------------------------------------------
-- raw.cnes_estabelecimentos_raw
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS raw.cnes_estabelecimentos_raw (
  id                     bigserial    PRIMARY KEY,
  uf                     text         NULL,
  codigo_municipio_ibge  text         NULL,
  nome_municipio         text         NULL,
  cnes                   text         NULL,
  endpoint               text         NOT NULL,
  payload                jsonb        NOT NULL,
  coletado_em            timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cnes_raw_municipio
  ON raw.cnes_estabelecimentos_raw (codigo_municipio_ibge);

-- -------------------------------------------------------
-- raw.ubs_raw
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS raw.ubs_raw (
  id                     bigserial    PRIMARY KEY,
  uf                     text         NULL,
  codigo_municipio_ibge  text         NULL,
  nome_municipio         text         NULL,
  cnes                   text         NULL,
  endpoint               text         NOT NULL,
  payload                jsonb        NOT NULL,
  coletado_em            timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ubs_raw_municipio
  ON raw.ubs_raw (codigo_municipio_ibge);

-- -------------------------------------------------------
-- stage.cnes_estabelecimentos_stg
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS stage.cnes_estabelecimentos_stg (
  cnes                   text         NULL,
  nome_estabelecimento   text         NULL,
  codigo_municipio_ibge  text         NULL,
  nome_municipio         text         NULL,
  uf                     text         NULL,
  tipo_estabelecimento   text         NULL,
  natureza_juridica      text         NULL,
  gestao                 text         NULL,
  esfera_administrativa  text         NULL,
  atende_sus             boolean      NULL,
  situacao               text         NULL,
  data_atualizacao       date         NULL,
  latitude               numeric      NULL,
  longitude              numeric      NULL,
  endereco               text         NULL,
  bairro                 text         NULL,
  cep                    text         NULL,
  telefone               text         NULL,
  payload                jsonb        NULL,
  coletado_em            timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cnes_stg_cnes
  ON stage.cnes_estabelecimentos_stg (cnes);

CREATE INDEX IF NOT EXISTS idx_cnes_stg_municipio
  ON stage.cnes_estabelecimentos_stg (codigo_municipio_ibge);

-- -------------------------------------------------------
-- stage.ubs_stg
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS stage.ubs_stg (
  cnes                   text         NULL,
  nome_estabelecimento   text         NULL,
  codigo_municipio_ibge  text         NULL,
  nome_municipio         text         NULL,
  uf                     text         NULL,
  tipo_estabelecimento   text         NULL,
  situacao               text         NULL,
  data_atualizacao       date         NULL,
  latitude               numeric      NULL,
  longitude              numeric      NULL,
  endereco               text         NULL,
  bairro                 text         NULL,
  cep                    text         NULL,
  telefone               text         NULL,
  payload                jsonb        NULL,
  coletado_em            timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ubs_stg_cnes
  ON stage.ubs_stg (cnes);

CREATE INDEX IF NOT EXISTS idx_ubs_stg_municipio
  ON stage.ubs_stg (codigo_municipio_ibge);

-- -------------------------------------------------------
-- dw.dim_estabelecimento_saude
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS dw.dim_estabelecimento_saude (
  cnes                   text         PRIMARY KEY,
  nome_estabelecimento   text         NULL,
  codigo_municipio_ibge  text         NULL,
  nome_municipio         text         NULL,
  uf                     text         NULL,
  tipo_estabelecimento   text         NULL,
  natureza_juridica      text         NULL,
  gestao                 text         NULL,
  esfera_administrativa  text         NULL,
  atende_sus             boolean      NULL,
  situacao               text         NULL,
  data_atualizacao       date         NULL,
  latitude               numeric      NULL,
  longitude              numeric      NULL,
  endereco               text         NULL,
  bairro                 text         NULL,
  cep                    text         NULL,
  telefone               text         NULL,
  origem                 text         NOT NULL DEFAULT 'CNES',
  payload                jsonb        NULL,
  coletado_em            timestamptz  NOT NULL DEFAULT now(),
  atualizado_em          timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dim_estab_municipio
  ON dw.dim_estabelecimento_saude (codigo_municipio_ibge);

CREATE INDEX IF NOT EXISTS idx_dim_estab_situacao
  ON dw.dim_estabelecimento_saude (situacao);

CREATE INDEX IF NOT EXISTS idx_dim_estab_data_atualizacao
  ON dw.dim_estabelecimento_saude (data_atualizacao);

-- -------------------------------------------------------
-- dw.dim_ubs
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS dw.dim_ubs (
  cnes                   text         PRIMARY KEY,
  nome_estabelecimento   text         NULL,
  codigo_municipio_ibge  text         NULL,
  nome_municipio         text         NULL,
  uf                     text         NULL,
  tipo_estabelecimento   text         NULL,
  situacao               text         NULL,
  data_atualizacao       date         NULL,
  latitude               numeric      NULL,
  longitude              numeric      NULL,
  endereco               text         NULL,
  bairro                 text         NULL,
  cep                    text         NULL,
  telefone               text         NULL,
  origem                 text         NOT NULL DEFAULT 'UBS',
  payload                jsonb        NULL,
  coletado_em            timestamptz  NOT NULL DEFAULT now(),
  atualizado_em          timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dim_ubs_municipio
  ON dw.dim_ubs (codigo_municipio_ibge);

CREATE INDEX IF NOT EXISTS idx_dim_ubs_situacao
  ON dw.dim_ubs (situacao);

CREATE INDEX IF NOT EXISTS idx_dim_ubs_data_atualizacao
  ON dw.dim_ubs (data_atualizacao);

-- -------------------------------------------------------
-- mart.saude_estrutura_municipio
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.saude_estrutura_municipio (
  codigo_municipio_ibge          text         NOT NULL,
  nome_municipio                 text         NULL,
  uf                             text         NULL,
  total_estabelecimentos         integer      NOT NULL DEFAULT 0,
  total_estabelecimentos_sus     integer      NOT NULL DEFAULT 0,
  total_ubs                      integer      NOT NULL DEFAULT 0,
  total_ubs_ativas               integer      NOT NULL DEFAULT 0,
  total_inativos                 integer      NOT NULL DEFAULT 0,
  total_sem_atualizacao_recente  integer      NOT NULL DEFAULT 0,
  data_mais_recente_atualizacao  date         NULL,
  atualizado_em                  timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (codigo_municipio_ibge)
);

CREATE INDEX IF NOT EXISTS idx_saude_estrutura_municipio
  ON mart.saude_estrutura_municipio (codigo_municipio_ibge);

-- -------------------------------------------------------
-- mart.saude_estrutura_alertas
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.saude_estrutura_alertas (
  id_alerta              bigserial    PRIMARY KEY,
  area                   text         NOT NULL DEFAULT 'SAUDE',
  fonte                  text         NOT NULL DEFAULT 'CNES_UBS',
  codigo_municipio_ibge  text         NULL,
  nome_municipio         text         NULL,
  tipo_alerta            text         NOT NULL,
  nivel                  text         NOT NULL,
  descricao              text         NOT NULL,
  valor_observado        numeric      NULL,
  valor_referencia       numeric      NULL,
  detalhe_json           jsonb        NULL,
  atualizado_em          timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saude_alertas_nivel
  ON mart.saude_estrutura_alertas (nivel);

CREATE INDEX IF NOT EXISTS idx_saude_alertas_tipo
  ON mart.saude_estrutura_alertas (tipo_alerta);

CREATE INDEX IF NOT EXISTS idx_saude_alertas_municipio
  ON mart.saude_estrutura_alertas (codigo_municipio_ibge);

-- -------------------------------------------------------
-- mart.saude_estrutura_alertas_home
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.saude_estrutura_alertas_home (
  id_alerta              bigint       NULL,
  area                   text         NOT NULL DEFAULT 'SAUDE',
  fonte                  text         NOT NULL DEFAULT 'CNES_UBS',
  codigo_municipio_ibge  text         NULL,
  nome_municipio         text         NULL,
  tipo_alerta            text         NOT NULL,
  nivel                  text         NOT NULL,
  descricao              text         NOT NULL,
  valor_observado        numeric      NULL,
  valor_referencia       numeric      NULL,
  prioridade             integer      NOT NULL,
  detalhe_json           jsonb        NULL,
  atualizado_em          timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saude_alertas_home_nivel
  ON mart.saude_estrutura_alertas_home (nivel);

CREATE INDEX IF NOT EXISTS idx_saude_alertas_home_prioridade
  ON mart.saude_estrutura_alertas_home (prioridade);

-- -------------------------------------------------------
-- mart.saude_estrutura_resumo_home
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.saude_estrutura_resumo_home (
  area                       text         NOT NULL DEFAULT 'SAUDE',
  fonte                      text         NOT NULL DEFAULT 'CNES_UBS',
  total_alertas              integer      NOT NULL DEFAULT 0,
  total_criticos             integer      NOT NULL DEFAULT 0,
  total_altos                integer      NOT NULL DEFAULT 0,
  total_medios               integer      NOT NULL DEFAULT 0,
  total_municipios_afetados  integer      NOT NULL DEFAULT 0,
  atualizado_em              timestamptz  NOT NULL DEFAULT now()
);
