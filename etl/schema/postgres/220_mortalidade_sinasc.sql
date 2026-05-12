-- 220_mortalidade_sinasc.sql
-- SIM/SINASC — Mortalidade e Nascidos Vivos
-- Fluxo: raw → stage → dw → mart
-- Recreate raw/stage/dw tables (dev env — dados recarregados via ETL)

DROP TABLE IF EXISTS stage.sim_obitos_stg CASCADE;
DROP TABLE IF EXISTS raw.sim_obitos_raw   CASCADE;
DROP TABLE IF EXISTS dw.fato_sim_obito    CASCADE;

-- ── raw ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS raw.sim_obitos_raw (
  id                     bigserial    PRIMARY KEY,
  ano_fonte              integer      NULL,
  api_endpoint           text         NULL,
  carregado_via          text         NOT NULL DEFAULT 'API_DADOS_ABERTOS_SAUDE_V1',
  payload_json           jsonb        NULL,
  criado_em              timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE raw.sim_obitos_raw
  ADD COLUMN IF NOT EXISTS ano_fonte    integer NULL,
  ADD COLUMN IF NOT EXISTS api_endpoint text    NULL,
  ADD COLUMN IF NOT EXISTS carregado_via text   NOT NULL DEFAULT 'API_DADOS_ABERTOS_SAUDE_V1',
  ADD COLUMN IF NOT EXISTS payload_json jsonb   NULL;

CREATE INDEX IF NOT EXISTS idx_sim_raw_ano ON raw.sim_obitos_raw (ano_fonte);

-- ── stage ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stage.sim_obitos_stg (
  id                              bigserial    PRIMARY KEY,
  raw_id                          bigint       NULL,
  ano_obito                       integer      NULL,
  data_obito                      date         NULL,
  tipo_obito                      text         NULL,   -- fetal | nao_fetal
  codigo_municipio_residencia     text         NULL,
  uf_residencia                   text         NULL,
  codigo_municipio_ocorrencia     text         NULL,
  nome_municipio_ocorrencia       text         NULL,
  uf_ocorrencia                   text         NULL,
  local_ocorrencia                text         NULL,
  cnes_ocorrencia                 text         NULL,
  idade_original                  text         NULL,
  idade_dias                      integer      NULL,
  idade_anos                      integer      NULL,
  faixa_etaria                    text         NULL,
  is_idade_ignorada               boolean      NULL,
  is_obito_infantil               boolean      NULL,
  is_obito_neonatal               boolean      NULL,
  is_obito_pos_neonatal           boolean      NULL,
  sexo                            text         NULL,
  raca_cor                        text         NULL,
  idade_mae                       integer      NULL,
  semanas_gestacao                integer      NULL,
  tipo_gravidez                   text         NULL,
  tipo_parto                      text         NULL,
  obito_parto                     text         NULL,
  peso_gramas                     integer      NULL,
  tpmorteoco                      text         NULL,   -- relação com gravidez/parto (código original)
  morte_relacao_gravidez_parto    text         NULL,   -- humanizado
  is_obito_materno                boolean      NULL,
  is_obito_materno_tardio         boolean      NULL,
  assistencia_medica              text         NULL,
  necropsia                       text         NULL,
  causa_basica                    text         NULL,
  cid                             text         NULL,
  fonte_dado                      text         NOT NULL DEFAULT 'SIM_API_V1',
  ano_fonte                       integer      NULL,
  api_endpoint                    text         NULL,
  carregado_via                   text         NOT NULL DEFAULT 'API_DADOS_ABERTOS_SAUDE_V1',
  criado_em                       timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE stage.sim_obitos_stg
  ADD COLUMN IF NOT EXISTS tipo_obito                   text    NULL,
  ADD COLUMN IF NOT EXISTS local_ocorrencia             text    NULL,
  ADD COLUMN IF NOT EXISTS cnes_ocorrencia              text    NULL,
  ADD COLUMN IF NOT EXISTS codigo_municipio_ocorrencia  text    NULL,
  ADD COLUMN IF NOT EXISTS nome_municipio_ocorrencia    text    NULL,
  ADD COLUMN IF NOT EXISTS uf_ocorrencia                text    NULL,
  ADD COLUMN IF NOT EXISTS idade_mae                    integer NULL,
  ADD COLUMN IF NOT EXISTS semanas_gestacao             integer NULL,
  ADD COLUMN IF NOT EXISTS tipo_gravidez                text    NULL,
  ADD COLUMN IF NOT EXISTS tipo_parto                   text    NULL,
  ADD COLUMN IF NOT EXISTS obito_parto                  text    NULL,
  ADD COLUMN IF NOT EXISTS peso_gramas                  integer NULL,
  ADD COLUMN IF NOT EXISTS tpmorteoco                   text    NULL,
  ADD COLUMN IF NOT EXISTS morte_relacao_gravidez_parto text    NULL,
  ADD COLUMN IF NOT EXISTS is_obito_materno             boolean NULL,
  ADD COLUMN IF NOT EXISTS is_obito_materno_tardio      boolean NULL,
  ADD COLUMN IF NOT EXISTS is_obito_neonatal            boolean NULL,
  ADD COLUMN IF NOT EXISTS is_obito_pos_neonatal        boolean NULL,
  ADD COLUMN IF NOT EXISTS faixa_etaria                 text    NULL,
  ADD COLUMN IF NOT EXISTS is_idade_ignorada            boolean NULL,
  ADD COLUMN IF NOT EXISTS assistencia_medica           text    NULL,
  ADD COLUMN IF NOT EXISTS necropsia                    text    NULL,
  ADD COLUMN IF NOT EXISTS causa_basica                 text    NULL,
  ADD COLUMN IF NOT EXISTS cid                          text    NULL,
  ADD COLUMN IF NOT EXISTS ano_fonte                    integer NULL,
  ADD COLUMN IF NOT EXISTS api_endpoint                 text    NULL,
  ADD COLUMN IF NOT EXISTS carregado_via                text    NOT NULL DEFAULT 'API_DADOS_ABERTOS_SAUDE_V1';

CREATE INDEX IF NOT EXISTS idx_sim_stg_ano         ON stage.sim_obitos_stg (ano_obito);
CREATE INDEX IF NOT EXISTS idx_sim_stg_municipio   ON stage.sim_obitos_stg (codigo_municipio_residencia);
CREATE INDEX IF NOT EXISTS idx_sim_stg_infantil    ON stage.sim_obitos_stg (is_obito_infantil);
CREATE INDEX IF NOT EXISTS idx_sim_stg_materno     ON stage.sim_obitos_stg (is_obito_materno);

-- ── dw ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dw.fato_sim_obito (
  id                              bigserial    PRIMARY KEY,
  ano_obito                       integer      NULL,
  data_obito                      date         NULL,
  tipo_obito                      text         NULL,
  codigo_municipio_residencia     text         NULL,
  uf_residencia                   text         NULL,
  codigo_municipio_ocorrencia     text         NULL,
  uf_ocorrencia                   text         NULL,
  local_ocorrencia                text         NULL,
  cnes_ocorrencia                 text         NULL,
  idade_dias                      integer      NULL,
  idade_anos                      integer      NULL,
  faixa_etaria                    text         NULL,
  is_obito_infantil               boolean      NULL,
  is_obito_neonatal               boolean      NULL,
  is_obito_pos_neonatal           boolean      NULL,
  sexo                            text         NULL,
  raca_cor                        text         NULL,
  idade_mae                       integer      NULL,
  semanas_gestacao                integer      NULL,
  tipo_gravidez                   text         NULL,
  tipo_parto                      text         NULL,
  peso_gramas                     integer      NULL,
  is_baixo_peso                   boolean      NULL,
  is_obito_materno                boolean      NULL,
  is_obito_materno_tardio         boolean      NULL,
  morte_relacao_gravidez_parto    text         NULL,
  tpmorteoco                      text         NULL,
  assistencia_medica              text         NULL,
  necropsia                       text         NULL,
  causa_basica                    text         NULL,
  cid                             text         NULL,
  fonte_dado                      text         NOT NULL DEFAULT 'SIM_API_V1',
  ano_fonte                       integer      NULL,
  api_endpoint                    text         NULL,
  carregado_via                   text         NOT NULL DEFAULT 'API_DADOS_ABERTOS_SAUDE_V1',
  criado_em                       timestamptz  NOT NULL DEFAULT now(),
  atualizado_em                   timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE dw.fato_sim_obito
  ADD COLUMN IF NOT EXISTS tipo_obito                   text    NULL,
  ADD COLUMN IF NOT EXISTS local_ocorrencia             text    NULL,
  ADD COLUMN IF NOT EXISTS cnes_ocorrencia              text    NULL,
  ADD COLUMN IF NOT EXISTS codigo_municipio_ocorrencia  text    NULL,
  ADD COLUMN IF NOT EXISTS uf_ocorrencia                text    NULL,
  ADD COLUMN IF NOT EXISTS faixa_etaria                 text    NULL,
  ADD COLUMN IF NOT EXISTS is_obito_neonatal            boolean NULL,
  ADD COLUMN IF NOT EXISTS is_obito_pos_neonatal        boolean NULL,
  ADD COLUMN IF NOT EXISTS raca_cor                     text    NULL,
  ADD COLUMN IF NOT EXISTS idade_mae                    integer NULL,
  ADD COLUMN IF NOT EXISTS semanas_gestacao             integer NULL,
  ADD COLUMN IF NOT EXISTS tipo_gravidez                text    NULL,
  ADD COLUMN IF NOT EXISTS tipo_parto                   text    NULL,
  ADD COLUMN IF NOT EXISTS peso_gramas                  integer NULL,
  ADD COLUMN IF NOT EXISTS is_baixo_peso                boolean NULL,
  ADD COLUMN IF NOT EXISTS is_obito_materno             boolean NULL,
  ADD COLUMN IF NOT EXISTS is_obito_materno_tardio      boolean NULL,
  ADD COLUMN IF NOT EXISTS morte_relacao_gravidez_parto text    NULL,
  ADD COLUMN IF NOT EXISTS tpmorteoco                   text    NULL,
  ADD COLUMN IF NOT EXISTS assistencia_medica           text    NULL,
  ADD COLUMN IF NOT EXISTS necropsia                    text    NULL,
  ADD COLUMN IF NOT EXISTS causa_basica                 text    NULL,
  ADD COLUMN IF NOT EXISTS cid                          text    NULL,
  ADD COLUMN IF NOT EXISTS fonte_dado                   text    NOT NULL DEFAULT 'SIM_API_V1',
  ADD COLUMN IF NOT EXISTS ano_fonte                    integer NULL,
  ADD COLUMN IF NOT EXISTS api_endpoint                 text    NULL,
  ADD COLUMN IF NOT EXISTS carregado_via                text    NOT NULL DEFAULT 'API_DADOS_ABERTOS_SAUDE_V1',
  ADD COLUMN IF NOT EXISTS atualizado_em               timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_fato_sim_ano       ON dw.fato_sim_obito (ano_obito);
CREATE INDEX IF NOT EXISTS idx_fato_sim_municipio ON dw.fato_sim_obito (codigo_municipio_residencia);
CREATE INDEX IF NOT EXISTS idx_fato_sim_infantil  ON dw.fato_sim_obito (is_obito_infantil);
CREATE INDEX IF NOT EXISTS idx_fato_sim_materno   ON dw.fato_sim_obito (is_obito_materno);
CREATE INDEX IF NOT EXISTS idx_fato_sim_fonte     ON dw.fato_sim_obito (fonte_dado);

-- ── mart ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mart.mortalidade_resumo_municipio (
  id                                bigserial    PRIMARY KEY,
  codigo_municipio_ibge             text         NULL,
  nome_municipio                    text         NOT NULL,
  ano                               integer      NOT NULL,
  nascidos_vivos                    integer      NOT NULL DEFAULT 0,
  obitos_infantis                   integer      NOT NULL DEFAULT 0,
  obitos_neonatais                  integer      NOT NULL DEFAULT 0,
  obitos_pos_neonatais              integer      NOT NULL DEFAULT 0,
  obitos_maternos                   integer      NOT NULL DEFAULT 0,
  obitos_fetais                     integer      NOT NULL DEFAULT 0,
  total_obitos                      integer      NOT NULL DEFAULT 0,
  taxa_mortalidade_infantil         numeric      NULL,
  taxa_mortalidade_neonatal         numeric      NULL,
  taxa_mortalidade_pos_neonatal     numeric      NULL,
  percentual_baixo_peso             numeric      NULL,
  percentual_prenatal_insuficiente  numeric      NULL,
  percentual_cesareo                numeric      NULL,
  obitos_sem_assistencia_medica     integer      NOT NULL DEFAULT 0,
  obitos_infantis_sem_denominador   boolean      NOT NULL DEFAULT false,
  ano_mais_recente_sim              integer      NULL,
  ano_mais_recente_sinasc           integer      NULL,
  indicador_taxa_disponivel         boolean      NOT NULL DEFAULT false,
  fonte_dado                        text         NULL,
  atualizado_em                     timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (nome_municipio, ano)
);

CREATE INDEX IF NOT EXISTS idx_mort_resumo_ano  ON mart.mortalidade_resumo_municipio (ano DESC);
CREATE INDEX IF NOT EXISTS idx_mort_resumo_mun  ON mart.mortalidade_resumo_municipio (codigo_municipio_ibge);

-- ── mart alertas ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mart.mortalidade_alertas (
  id_alerta              bigserial    PRIMARY KEY,
  fonte                  text         NOT NULL DEFAULT 'SIM_SINASC',
  codigo_municipio_ibge  text         NULL,
  nome_municipio         text         NULL,
  ano                    integer      NULL,
  tipo_alerta            text         NOT NULL,
  nivel                  text         NOT NULL,
  descricao              text         NOT NULL,
  valor_observado        numeric      NULL,
  valor_referencia       numeric      NULL,
  detalhe_json           jsonb        NULL,
  atualizado_em          timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mort_alertas_nivel ON mart.mortalidade_alertas (nivel);
CREATE INDEX IF NOT EXISTS idx_mort_alertas_mun   ON mart.mortalidade_alertas (codigo_municipio_ibge);

CREATE TABLE IF NOT EXISTS mart.mortalidade_alertas_home (
  id_alerta              bigserial    PRIMARY KEY,
  fonte                  text         NOT NULL DEFAULT 'SIM_SINASC',
  codigo_municipio_ibge  text         NULL,
  nome_municipio         text         NULL,
  tipo_alerta            text         NOT NULL,
  nivel                  text         NOT NULL,
  descricao              text         NOT NULL,
  valor_observado        numeric      NULL,
  valor_referencia       numeric      NULL,
  prioridade             integer      NULL,
  detalhe_json           jsonb        NULL,
  atualizado_em          timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mart.mortalidade_resumo_home (
  id                          bigserial    PRIMARY KEY,
  ano                         integer      NOT NULL,
  nascidos_vivos_total        integer      NOT NULL DEFAULT 0,
  obitos_infantis_total       integer      NOT NULL DEFAULT 0,
  obitos_maternos_total       integer      NOT NULL DEFAULT 0,
  obitos_fetais_total         integer      NOT NULL DEFAULT 0,
  taxa_mortalidade_infantil   numeric      NULL,
  total_criticos              integer      NOT NULL DEFAULT 0,
  total_altos                 integer      NOT NULL DEFAULT 0,
  atualizado_em               timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE mart.mortalidade_resumo_home
  ADD COLUMN IF NOT EXISTS nascidos_vivos_total      integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS obitos_infantis_total     integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS obitos_maternos_total     integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS obitos_fetais_total       integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxa_mortalidade_infantil numeric     NULL,
  ADD COLUMN IF NOT EXISTS total_criticos            integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_altos               integer     NOT NULL DEFAULT 0;

ALTER TABLE mart.mortalidade_resumo_municipio
  ADD COLUMN IF NOT EXISTS obitos_neonatais                   integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS obitos_pos_neonatais               integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS obitos_fetais                      integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_obitos                       integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxa_mortalidade_neonatal          numeric     NULL,
  ADD COLUMN IF NOT EXISTS taxa_mortalidade_pos_neonatal      numeric     NULL,
  ADD COLUMN IF NOT EXISTS percentual_cesareo                 numeric     NULL,
  ADD COLUMN IF NOT EXISTS obitos_sem_assistencia_medica      integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS obitos_infantis_sem_denominador    boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ano_mais_recente_sim               integer     NULL,
  ADD COLUMN IF NOT EXISTS ano_mais_recente_sinasc            integer     NULL,
  ADD COLUMN IF NOT EXISTS indicador_taxa_disponivel          boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fonte_dado                         text        NULL;

ALTER TABLE mart.mortalidade_alertas
  ADD COLUMN IF NOT EXISTS ano integer NULL;

ALTER TABLE mart.mortalidade_alertas_home
  ADD COLUMN IF NOT EXISTS prioridade integer NULL,
  ADD COLUMN IF NOT EXISTS ano        integer NULL;

-- saude_resumo_municipio: mortalidade, sisagua, vigilancia, pni (idempotente)
ALTER TABLE mart.saude_resumo_municipio
  ADD COLUMN IF NOT EXISTS mortalidade_taxa_infantil                    numeric  NULL,
  ADD COLUMN IF NOT EXISTS mortalidade_obitos_infantis                  integer  NULL,
  ADD COLUMN IF NOT EXISTS mortalidade_obitos_maternos                  integer  NULL,
  ADD COLUMN IF NOT EXISTS mortalidade_nascidos_vivos                   integer  NULL,
  ADD COLUMN IF NOT EXISTS mortalidade_percentual_baixo_peso            numeric  NULL,
  ADD COLUMN IF NOT EXISTS mortalidade_percentual_prenatal_insuficiente numeric  NULL,
  ADD COLUMN IF NOT EXISTS mortalidade_ano_mais_recente_sim             integer  NULL,
  ADD COLUMN IF NOT EXISTS mortalidade_ano_mais_recente_sinasc          integer  NULL,
  ADD COLUMN IF NOT EXISTS mortalidade_obitos_infantis_sem_denominador  boolean  NULL,
  ADD COLUMN IF NOT EXISTS sisagua_total_amostras                       integer  NULL,
  ADD COLUMN IF NOT EXISTS sisagua_total_fora_padrao                    integer  NULL,
  ADD COLUMN IF NOT EXISTS sisagua_total_ecoli                          integer  NULL,
  ADD COLUMN IF NOT EXISTS sisagua_total_coliformes                     integer  NULL,
  ADD COLUMN IF NOT EXISTS sisagua_percentual_fora_padrao               numeric  NULL,
  ADD COLUMN IF NOT EXISTS sisagua_data_ultima_coleta                   text     NULL,
  ADD COLUMN IF NOT EXISTS vigilancia_total_alertas                     integer  NULL,
  ADD COLUMN IF NOT EXISTS vigilancia_alertas_criticos                  integer  NULL,
  ADD COLUMN IF NOT EXISTS vigilancia_alertas_altos                     integer  NULL,
  ADD COLUMN IF NOT EXISTS vigilancia_dengue_nivel                      integer  NULL,
  ADD COLUMN IF NOT EXISTS vigilancia_chikungunya_nivel                 integer  NULL,
  ADD COLUMN IF NOT EXISTS vigilancia_zika_nivel                        integer  NULL,
  ADD COLUMN IF NOT EXISTS vigilancia_semana_epidemiologica             integer  NULL,
  ADD COLUMN IF NOT EXISTS vigilancia_ano_epidemiologico                integer  NULL,
  ADD COLUMN IF NOT EXISTS pni_total_doses                              integer  NULL,
  ADD COLUMN IF NOT EXISTS pni_doses_ultimo_mes                         integer  NULL,
  ADD COLUMN IF NOT EXISTS pni_mes_referencia                           integer  NULL,
  ADD COLUMN IF NOT EXISTS pni_total_alertas                            integer  NULL,
  ADD COLUMN IF NOT EXISTS pni_alertas_criticos                         integer  NULL,
  ADD COLUMN IF NOT EXISTS pni_alertas_altos                            integer  NULL,
  ADD COLUMN IF NOT EXISTS pni_cobertura_media                          numeric  NULL,
  ADD COLUMN IF NOT EXISTS pni_cobertura_total_abaixo_meta              integer  NULL,
  ADD COLUMN IF NOT EXISTS pni_cobertura_menor                          numeric  NULL,
  ADD COLUMN IF NOT EXISTS pni_cobertura_imunobiologico_menor           text     NULL,
  ADD COLUMN IF NOT EXISTS pni_cobertura_tipo_periodo                   text     NULL,
  ADD COLUMN IF NOT EXISTS pni_cobertura_data_referencia                text     NULL;

-- audit
CREATE TABLE IF NOT EXISTS audit.etl_log (
  id          bigserial    PRIMARY KEY,
  modulo      text         NOT NULL,
  status      text         NOT NULL DEFAULT 'OK',
  mensagem    text         NULL,
  registros   integer      NULL,
  duracao_ms  integer      NULL,
  criado_em   timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit.etl_carga (
  id          bigserial    PRIMARY KEY,
  modulo      text         NOT NULL,
  entidade    text         NULL,
  ano         integer      NULL,
  registros   integer      NULL,
  iniciado_em timestamptz  NOT NULL DEFAULT now(),
  concluido_em timestamptz NULL
);
