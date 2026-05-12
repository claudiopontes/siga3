-- 210_pni_vacinacao.sql
-- PNI / Vacinação — doses aplicadas (RNDS / DPNI)
-- Camadas: raw → stage → dw → mart

-- -------------------------------------------------------
-- raw.pni_doses_raw
-- Registro bruto da API, sem transformação.
-- Sem co_paciente / co_documento para privacidade.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS raw.pni_doses_raw (
  id                         bigserial    PRIMARY KEY,
  ano                        integer      NOT NULL,
  co_dose_id                 text         NULL,  -- identificador único da dose (não é CPF)
  co_uf                      text         NULL,
  co_municipio_ibge          text         NULL,
  ds_municipio               text         NULL,
  dt_aplicacao               date         NULL,
  no_imunobiologico          text         NULL,
  ds_dose                    text         NULL,
  ds_grupo_atendimento       text         NULL,
  dt_nascimento_paciente     date         NULL,
  nu_cnes_estabelecimento    text         NULL,
  nu_lote                    text         NULL,
  ds_fabricante              text         NULL,
  no_raca_cor                text         NULL,
  sistema_origem             text         NULL,
  payload_json               jsonb        NULL,  -- payload completo (sem campos sensíveis)
  carregado_em               timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pni_raw_ano
  ON raw.pni_doses_raw (ano);
CREATE INDEX IF NOT EXISTS idx_pni_raw_municipio
  ON raw.pni_doses_raw (co_municipio_ibge);
CREATE INDEX IF NOT EXISTS idx_pni_raw_dt_aplicacao
  ON raw.pni_doses_raw (dt_aplicacao);

-- -------------------------------------------------------
-- stage.pni_doses_stg
-- Dados normalizados: IBGE 6 dígitos, datas tipadas,
-- campos nulos convertidos, pronto para dw.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS stage.pni_doses_stg (
  id                      bigserial    PRIMARY KEY,
  raw_id                  bigint       NOT NULL REFERENCES raw.pni_doses_raw (id),
  ano                     integer      NOT NULL,
  co_dose_id              text         NULL,
  co_uf                   text         NULL,
  co_municipio_ibge_6     text         NULL,  -- 6 dígitos
  ds_municipio            text         NULL,
  dt_aplicacao            date         NULL,
  no_imunobiologico       text         NULL,
  ds_dose                 text         NULL,
  ds_grupo_atendimento    text         NULL,
  idade_anos              integer      NULL,  -- derivado de dt_nascimento + dt_aplicacao
  nu_cnes_estabelecimento text         NULL,
  ds_fabricante           text         NULL,
  no_raca_cor             text         NULL,
  sistema_origem          text         NULL,
  processado_em           timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pni_stg_ano
  ON stage.pni_doses_stg (ano);
CREATE INDEX IF NOT EXISTS idx_pni_stg_municipio
  ON stage.pni_doses_stg (co_municipio_ibge_6);
CREATE INDEX IF NOT EXISTS idx_pni_stg_dt_aplicacao
  ON stage.pni_doses_stg (dt_aplicacao);
CREATE INDEX IF NOT EXISTS idx_pni_stg_imunobiologico
  ON stage.pni_doses_stg (no_imunobiologico);

-- -------------------------------------------------------
-- dw.fato_pni_dose
-- Fato consolidado por dose — grão: 1 linha por dose aplicada,
-- deduplicado por co_dose_id + ano.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS dw.fato_pni_dose (
  id                      bigserial    PRIMARY KEY,
  ano                     integer      NOT NULL,
  co_dose_id              text         NULL,
  co_uf                   text         NULL,
  co_municipio_ibge_6     text         NULL,
  ds_municipio            text         NULL,
  dt_aplicacao            date         NULL,
  no_imunobiologico       text         NULL,
  ds_dose                 text         NULL,
  ds_grupo_atendimento    text         NULL,
  idade_anos              integer      NULL,
  nu_cnes_estabelecimento text         NULL,
  ds_fabricante           text         NULL,
  no_raca_cor             text         NULL,
  sistema_origem          text         NULL,
  atualizado_em           timestamptz  NOT NULL DEFAULT now()
);

-- Constraint de unicidade para idempotência
CREATE UNIQUE INDEX IF NOT EXISTS uq_fato_pni_dose_id_ano
  ON dw.fato_pni_dose (co_dose_id, ano)
  WHERE co_dose_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fato_pni_ano
  ON dw.fato_pni_dose (ano);
CREATE INDEX IF NOT EXISTS idx_fato_pni_municipio
  ON dw.fato_pni_dose (co_municipio_ibge_6);
CREATE INDEX IF NOT EXISTS idx_fato_pni_dt_aplicacao
  ON dw.fato_pni_dose (dt_aplicacao);
CREATE INDEX IF NOT EXISTS idx_fato_pni_imunobiologico
  ON dw.fato_pni_dose (no_imunobiologico);
CREATE INDEX IF NOT EXISTS idx_fato_pni_grupo
  ON dw.fato_pni_dose (ds_grupo_atendimento);

-- -------------------------------------------------------
-- mart.pni_resumo_municipio
-- Totais por município (6 dígitos) × ano.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.pni_resumo_municipio (
  codigo_municipio_ibge  text         NOT NULL,
  nome_municipio         text         NULL,
  ano                    integer      NOT NULL,
  total_doses            integer      NOT NULL DEFAULT 0,
  total_imunobiologicos  integer      NOT NULL DEFAULT 0,  -- distintos
  doses_ultimo_mes       integer      NOT NULL DEFAULT 0,
  mes_referencia         integer      NULL,  -- mês do último dado
  atualizado_em          timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (codigo_municipio_ibge, ano)
);

CREATE INDEX IF NOT EXISTS idx_pni_resumo_mun_ano
  ON mart.pni_resumo_municipio (ano);

-- -------------------------------------------------------
-- mart.pni_resumo_vacina
-- Totais por imunobiológico × ano (todos os municípios).
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.pni_resumo_vacina (
  no_imunobiologico  text     NOT NULL,
  ano                integer  NOT NULL,
  total_doses        integer  NOT NULL DEFAULT 0,
  total_municipios   integer  NOT NULL DEFAULT 0,
  atualizado_em      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (no_imunobiologico, ano)
);

-- -------------------------------------------------------
-- mart.pni_serie_mensal
-- Série histórica mensal por município × imunobiológico.
-- Usada pelos gráficos de tendência.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.pni_serie_mensal (
  codigo_municipio_ibge  text     NOT NULL,
  no_imunobiologico      text     NOT NULL,
  ano                    integer  NOT NULL,
  mes                    integer  NOT NULL,
  total_doses            integer  NOT NULL DEFAULT 0,
  atualizado_em          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (codigo_municipio_ibge, no_imunobiologico, ano, mes)
);

CREATE INDEX IF NOT EXISTS idx_pni_serie_municipio
  ON mart.pni_serie_mensal (codigo_municipio_ibge);
CREATE INDEX IF NOT EXISTS idx_pni_serie_imunobiologico
  ON mart.pni_serie_mensal (no_imunobiologico);

-- -------------------------------------------------------
-- mart.pni_alertas
-- Alertas gerados pelo refresh-mart-pni.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.pni_alertas (
  id_alerta              bigserial    PRIMARY KEY,
  fonte                  text         NOT NULL DEFAULT 'PNI',
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

CREATE INDEX IF NOT EXISTS idx_pni_alertas_municipio
  ON mart.pni_alertas (codigo_municipio_ibge);
CREATE INDEX IF NOT EXISTS idx_pni_alertas_nivel
  ON mart.pni_alertas (nivel);
CREATE INDEX IF NOT EXISTS idx_pni_alertas_tipo
  ON mart.pni_alertas (tipo_alerta);

-- -------------------------------------------------------
-- mart.pni_alertas_home
-- Subconjunto para home: max 30, CRITICO/ALTO.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.pni_alertas_home (
  id_alerta              bigint       NULL,
  fonte                  text         NOT NULL DEFAULT 'PNI',
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

-- -------------------------------------------------------
-- mart.pni_resumo_home
-- Uma linha: totais globais PNI para o card da home.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.pni_resumo_home (
  total_doses_ano_atual      integer      NOT NULL DEFAULT 0,
  total_doses_mes_atual      integer      NOT NULL DEFAULT 0,
  total_municipios_com_dado  integer      NOT NULL DEFAULT 0,
  total_imunobiologicos      integer      NOT NULL DEFAULT 0,
  total_alertas              integer      NOT NULL DEFAULT 0,
  total_criticos             integer      NOT NULL DEFAULT 0,
  total_altos                integer      NOT NULL DEFAULT 0,
  total_medios               integer      NOT NULL DEFAULT 0,
  ano_referencia             integer      NULL,
  mes_referencia             integer      NULL,
  atualizado_em              timestamptz  NOT NULL DEFAULT now()
);

-- -------------------------------------------------------
-- Colunas PNI em mart.saude_resumo_municipio
-- Adicionadas via ALTER TABLE (idempotente com IF NOT EXISTS).
-- -------------------------------------------------------
ALTER TABLE mart.saude_resumo_municipio
  ADD COLUMN IF NOT EXISTS pni_total_doses        integer NULL,
  ADD COLUMN IF NOT EXISTS pni_doses_ultimo_mes   integer NULL,
  ADD COLUMN IF NOT EXISTS pni_mes_referencia     integer NULL,
  ADD COLUMN IF NOT EXISTS pni_total_alertas      integer NULL,
  ADD COLUMN IF NOT EXISTS pni_alertas_criticos   integer NULL,
  ADD COLUMN IF NOT EXISTS pni_alertas_altos      integer NULL;
