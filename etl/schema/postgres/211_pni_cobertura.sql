-- 211_pni_cobertura.sql
-- PNI — Cobertura Vacinal por planilhas XLSX (DPNI/DATASUS)
-- Controle de versão por arquivo + hash SHA-256
-- Formato largo → longo por município × imunobiológico

-- -------------------------------------------------------
-- audit.pni_cobertura_arquivo
-- Controle de arquivos carregados: versão, hash, status.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit.pni_cobertura_arquivo (
  id                        bigserial    PRIMARY KEY,
  arquivo                   text         NOT NULL,
  caminho_arquivo           text         NULL,
  hash_arquivo              text         NOT NULL,
  ano                       integer      NOT NULL,
  data_referencia           date         NULL,
  tipo_periodo              text         NOT NULL,  -- FECHADO | PARCIAL
  status_arquivo            text         NOT NULL,  -- ATIVO | SUPERADO | RETIFICADO | ERRO
  total_linhas              integer      NULL,
  total_registros_stage     integer      NULL,
  total_registros_dw        integer      NULL,
  carregado_em              timestamptz  NOT NULL DEFAULT now(),
  atualizado_em             timestamptz  NOT NULL DEFAULT now(),
  observacao                text         NULL,
  CONSTRAINT uq_pni_cobertura_hash UNIQUE (hash_arquivo)
);

CREATE INDEX IF NOT EXISTS idx_pni_arq_ano_status
  ON audit.pni_cobertura_arquivo (ano, status_arquivo);
CREATE INDEX IF NOT EXISTS idx_pni_arq_hash
  ON audit.pni_cobertura_arquivo (hash_arquivo);
CREATE INDEX IF NOT EXISTS idx_pni_arq_data_ref
  ON audit.pni_cobertura_arquivo (data_referencia);

-- -------------------------------------------------------
-- raw.pni_cobertura_raw
-- Payload bruto linha a linha da planilha.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS raw.pni_cobertura_raw (
  id              bigserial    PRIMARY KEY,
  arquivo_id      bigint       NULL REFERENCES audit.pni_cobertura_arquivo (id),
  arquivo         text         NOT NULL,
  ano             integer      NOT NULL,
  data_referencia date         NULL,
  tipo_periodo    text         NOT NULL,
  status_arquivo  text         NOT NULL,
  linha           integer      NULL,
  payload         jsonb        NOT NULL,
  coletado_em     timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pni_raw_arq
  ON raw.pni_cobertura_raw (ano, arquivo_id);

-- -------------------------------------------------------
-- stage.pni_cobertura_stg
-- Dados normalizados: um registro por município × imunobiológico.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS stage.pni_cobertura_stg (
  id                   bigserial    PRIMARY KEY,
  arquivo_id           bigint       NULL REFERENCES audit.pni_cobertura_arquivo (id),
  arquivo              text         NOT NULL,
  ano                  integer      NOT NULL,
  data_referencia      date         NULL,
  tipo_periodo         text         NOT NULL,
  status_arquivo       text         NOT NULL,
  regiao_ocorrencia    text         NULL,
  uf_residencia        text         NULL,
  macrorregiao_saude   text         NULL,
  regiao_saude         text         NULL,
  municipio_residencia text         NULL,
  codigo_municipio_ibge text        NULL,
  imunobiologico       text         NOT NULL,
  cobertura_percentual numeric      NULL,
  numerador            integer      NULL,
  denominador          integer      NULL,
  payload              jsonb        NULL,
  coletado_em          timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pni_stg_ano_mun
  ON stage.pni_cobertura_stg (ano, municipio_residencia);
CREATE INDEX IF NOT EXISTS idx_pni_stg_imuno
  ON stage.pni_cobertura_stg (imunobiologico);
CREATE INDEX IF NOT EXISTS idx_pni_stg_arq
  ON stage.pni_cobertura_stg (arquivo_id);

-- -------------------------------------------------------
-- dw.fato_pni_cobertura
-- Fato analítico: município × imunobiológico × ano/referência.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS dw.fato_pni_cobertura (
  id                    bigserial    PRIMARY KEY,
  arquivo_id            bigint       NULL REFERENCES audit.pni_cobertura_arquivo (id),
  ano                   integer      NOT NULL,
  data_referencia       date         NULL,
  tipo_periodo          text         NOT NULL,
  status_arquivo        text         NOT NULL,
  codigo_municipio_ibge text         NULL,
  nome_municipio        text         NULL,
  uf                    text         NULL,
  macrorregiao_saude    text         NULL,
  regiao_saude          text         NULL,
  imunobiologico        text         NOT NULL,
  cobertura_percentual  numeric      NULL,
  numerador             integer      NULL,
  denominador           integer      NULL,
  meta_percentual       numeric      NOT NULL DEFAULT 95,
  abaixo_meta           boolean      NULL,
  distancia_meta        numeric      NULL,
  coletado_em           timestamptz  NOT NULL DEFAULT now(),
  atualizado_em         timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fato_cob_ano_mun
  ON dw.fato_pni_cobertura (ano, codigo_municipio_ibge);
CREATE INDEX IF NOT EXISTS idx_fato_cob_imuno
  ON dw.fato_pni_cobertura (imunobiologico);
CREATE INDEX IF NOT EXISTS idx_fato_cob_abaixo
  ON dw.fato_pni_cobertura (abaixo_meta);
CREATE INDEX IF NOT EXISTS idx_fato_cob_status
  ON dw.fato_pni_cobertura (status_arquivo);
CREATE INDEX IF NOT EXISTS idx_fato_cob_arq
  ON dw.fato_pni_cobertura (arquivo_id);

-- -------------------------------------------------------
-- mart.pni_cobertura_resumo_municipio
-- Resumo por município × ano — apenas arquivos ATIVO.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.pni_cobertura_resumo_municipio (
  codigo_municipio_ibge          text         NULL,
  nome_municipio                 text         NOT NULL,
  uf                             text         NULL,
  ano                            integer      NOT NULL,
  data_referencia                date         NULL,
  tipo_periodo                   text         NOT NULL,
  arquivo_id                     bigint       NULL,
  total_imunobiologicos          integer      NOT NULL DEFAULT 0,
  total_abaixo_meta              integer      NOT NULL DEFAULT 0,
  cobertura_media                numeric      NULL,
  menor_cobertura                numeric      NULL,
  maior_cobertura                numeric      NULL,
  imunobiologico_menor_cobertura text         NULL,
  atualizado_em                  timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (nome_municipio, ano)
);

CREATE INDEX IF NOT EXISTS idx_pni_cob_res_mun_ano
  ON mart.pni_cobertura_resumo_municipio (ano, nome_municipio);

-- -------------------------------------------------------
-- mart.pni_cobertura_resumo_imunobiologico
-- Resumo por imunobiológico × ano — apenas arquivos ATIVO.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.pni_cobertura_resumo_imunobiologico (
  imunobiologico                 text         NOT NULL,
  ano                            integer      NOT NULL,
  data_referencia                date         NULL,
  tipo_periodo                   text         NOT NULL,
  arquivo_id                     bigint       NULL,
  cobertura_media                numeric      NULL,
  total_municipios               integer      NOT NULL DEFAULT 0,
  total_municipios_abaixo_meta   integer      NOT NULL DEFAULT 0,
  numerador_total                integer      NULL,
  denominador_total              integer      NULL,
  atualizado_em                  timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (imunobiologico, ano)
);

CREATE INDEX IF NOT EXISTS idx_pni_cob_res_imuno_ano
  ON mart.pni_cobertura_resumo_imunobiologico (ano, imunobiologico);

-- -------------------------------------------------------
-- mart.pni_cobertura_evolucao
-- Série histórica — usa TODOS os arquivos (ATIVO + SUPERADO + RETIFICADO).
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.pni_cobertura_evolucao (
  codigo_municipio_ibge text         NULL,
  nome_municipio        text         NOT NULL,
  uf                    text         NULL,
  ano                   integer      NOT NULL,
  data_referencia       date         NULL,
  tipo_periodo          text         NOT NULL,
  status_arquivo        text         NOT NULL,
  arquivo_id            bigint       NULL,
  imunobiologico        text         NOT NULL,
  cobertura_percentual  numeric      NULL,
  numerador             integer      NULL,
  denominador           integer      NULL,
  meta_percentual       numeric      NOT NULL DEFAULT 95,
  abaixo_meta           boolean      NULL,
  atualizado_em         timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pni_cob_evo_ano_mun_imuno
  ON mart.pni_cobertura_evolucao (ano, codigo_municipio_ibge, imunobiologico);

-- -------------------------------------------------------
-- mart.pni_cobertura_alertas
-- Alertas de cobertura — apenas arquivos ATIVO.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.pni_cobertura_alertas (
  id_alerta              bigserial    PRIMARY KEY,
  area                   text         NOT NULL DEFAULT 'SAUDE',
  fonte                  text         NOT NULL DEFAULT 'PNI_COBERTURA',
  arquivo_id             bigint       NULL,
  codigo_municipio_ibge  text         NULL,
  nome_municipio         text         NULL,
  ano                    integer      NOT NULL,
  data_referencia        date         NULL,
  tipo_periodo           text         NOT NULL,
  imunobiologico         text         NULL,
  tipo_alerta            text         NOT NULL,
  nivel                  text         NOT NULL,
  descricao              text         NOT NULL,
  valor_observado        numeric      NULL,
  valor_referencia       numeric      NULL,
  detalhe_json           jsonb        NULL,
  atualizado_em          timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pni_cob_alerta_nivel
  ON mart.pni_cobertura_alertas (nivel);
CREATE INDEX IF NOT EXISTS idx_pni_cob_alerta_tipo
  ON mart.pni_cobertura_alertas (tipo_alerta);
CREATE INDEX IF NOT EXISTS idx_pni_cob_alerta_mun
  ON mart.pni_cobertura_alertas (codigo_municipio_ibge);

-- -------------------------------------------------------
-- mart.pni_cobertura_alertas_home
-- Subconjunto para home: prioriza FECHADO, max 30.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.pni_cobertura_alertas_home (
  id_alerta              bigint       NULL,
  area                   text         NOT NULL DEFAULT 'SAUDE',
  fonte                  text         NOT NULL DEFAULT 'PNI_COBERTURA',
  arquivo_id             bigint       NULL,
  codigo_municipio_ibge  text         NULL,
  nome_municipio         text         NULL,
  ano                    integer      NOT NULL,
  data_referencia        date         NULL,
  tipo_periodo           text         NOT NULL,
  imunobiologico         text         NULL,
  tipo_alerta            text         NOT NULL,
  nivel                  text         NOT NULL,
  descricao              text         NOT NULL,
  valor_observado        numeric      NULL,
  valor_referencia       numeric      NULL,
  prioridade             integer      NOT NULL,
  detalhe_json           jsonb        NULL,
  atualizado_em          timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pni_cob_home_nivel
  ON mart.pni_cobertura_alertas_home (nivel);
CREATE INDEX IF NOT EXISTS idx_pni_cob_home_prio
  ON mart.pni_cobertura_alertas_home (prioridade);

-- -------------------------------------------------------
-- mart.pni_cobertura_resumo_home
-- Uma linha: totais globais de cobertura para o card da home.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.pni_cobertura_resumo_home (
  area                         text         NOT NULL DEFAULT 'SAUDE',
  fonte                        text         NOT NULL DEFAULT 'PNI_COBERTURA',
  ano                          integer      NOT NULL,
  data_referencia              date         NULL,
  tipo_periodo                 text         NOT NULL,
  arquivo_id                   bigint       NULL,
  total_alertas                integer      NOT NULL DEFAULT 0,
  total_criticos               integer      NOT NULL DEFAULT 0,
  total_altos                  integer      NOT NULL DEFAULT 0,
  total_medios                 integer      NOT NULL DEFAULT 0,
  total_informativos           integer      NOT NULL DEFAULT 0,
  total_municipios_afetados    integer      NOT NULL DEFAULT 0,
  cobertura_media              numeric      NULL,
  total_municipios_abaixo_meta integer      NOT NULL DEFAULT 0,
  atualizado_em                timestamptz  NOT NULL DEFAULT now()
);

-- -------------------------------------------------------
-- Colunas PNI Cobertura em mart.saude_resumo_municipio
-- -------------------------------------------------------
ALTER TABLE mart.saude_resumo_municipio
  ADD COLUMN IF NOT EXISTS pni_cobertura_media              numeric NULL,
  ADD COLUMN IF NOT EXISTS pni_cobertura_total_abaixo_meta  integer NULL,
  ADD COLUMN IF NOT EXISTS pni_cobertura_menor              numeric NULL,
  ADD COLUMN IF NOT EXISTS pni_cobertura_imunobiologico_menor text  NULL,
  ADD COLUMN IF NOT EXISTS pni_cobertura_tipo_periodo        text   NULL,
  ADD COLUMN IF NOT EXISTS pni_cobertura_data_referencia     date   NULL;
