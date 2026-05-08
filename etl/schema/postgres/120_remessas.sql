-- 120_remessas.sql
-- Tabelas para remessas obrigatórias de prestação de contas

-- Stage (sem constraints rígidas para bulk insert)
CREATE TABLE IF NOT EXISTS stage.remessa_contabil_stg (
  id_remessa                  numeric(19,0),
  id_entidade_cjur            integer,
  ano                         integer,
  arquivo                     text,
  data_confirmacao            timestamp,
  data_envio                  timestamp,
  data_final                  timestamp,
  data_inicial                timestamp,
  hash_arquivo                text,
  numero                      integer,
  prazo_envio                 timestamp,
  protocolo_envio             text,
  situacao                    text,
  status                      smallint,
  tipo_liberacao              text,
  id_entidade                 numeric(19,0),
  status_publicacao           text,
  nome_usuario_enviou         text,
  data_processamento          timestamp,
  tempo_de_processamento      numeric(19,0),
  email_enviado               boolean,
  nome_entidade_confirmacao   text,
  alerta_publicado            boolean,
  observacao                  text
);

CREATE INDEX IF NOT EXISTS idx_stg_remessa_id ON stage.remessa_contabil_stg (id_remessa);

-- DW principal
CREATE TABLE IF NOT EXISTS dw.fato_remessa_contabil (
  id_remessa                  bigint        PRIMARY KEY,
  id_entidade                 numeric(19,0) NOT NULL,
  id_entidade_cjur            integer,
  ano                         integer       NOT NULL,
  numero                      integer       NOT NULL,
  arquivo                     text,
  data_confirmacao            timestamp,
  data_envio                  timestamp,
  data_final                  timestamp     NOT NULL,
  data_inicial                timestamp     NOT NULL,
  hash_arquivo                text,
  prazo_envio                 timestamp     NOT NULL,
  protocolo_envio             text,
  situacao                    text          NOT NULL,
  status                      smallint      NOT NULL,
  tipo_liberacao              text          NOT NULL,
  status_publicacao           text,
  nome_usuario_enviou         text,
  data_processamento          timestamp,
  tempo_de_processamento      numeric(19,0),
  email_enviado               boolean       NOT NULL DEFAULT false,
  nome_entidade_confirmacao   text,
  alerta_publicado            boolean,
  observacao                  text,
  etl_carregado_em            timestamptz   NOT NULL DEFAULT now(),
  etl_atualizado_em           timestamptz
);

CREATE INDEX IF NOT EXISTS idx_frc_ano_numero_ent  ON dw.fato_remessa_contabil (ano, numero, id_entidade);
CREATE INDEX IF NOT EXISTS idx_frc_prazo_envio      ON dw.fato_remessa_contabil (prazo_envio);
CREATE INDEX IF NOT EXISTS idx_frc_data_envio       ON dw.fato_remessa_contabil (data_envio);
CREATE INDEX IF NOT EXISTS idx_frc_situacao         ON dw.fato_remessa_contabil (situacao);
CREATE INDEX IF NOT EXISTS idx_frc_id_entidade_cjur ON dw.fato_remessa_contabil (id_entidade_cjur);

-- Dimensões auxiliares de remessa (opcionais — preenchidas se fonte for identificada)
CREATE TABLE IF NOT EXISTS dw.dim_remessa_entidade (
  id_entidade      numeric(19,0) PRIMARY KEY,
  id_entidade_cjur integer,
  nome_entidade    text,
  nome_ente        text,
  cnpj             text,
  tipo_entidade    text,
  situacao         text,
  origem           text          NOT NULL DEFAULT 'APC',
  etl_carregado_em  timestamptz NOT NULL DEFAULT now(),
  etl_atualizado_em timestamptz
);

CREATE TABLE IF NOT EXISTS dw.dim_remessa_ente (
  id_ente          numeric(19,0) PRIMARY KEY,
  nome_ente        text,
  cnpj             text,
  codigo           text,
  tipo_ente        text,
  situacao         text,
  origem           text          NOT NULL DEFAULT 'APC',
  etl_carregado_em  timestamptz NOT NULL DEFAULT now(),
  etl_atualizado_em timestamptz
);

-- Mart alertas
CREATE TABLE IF NOT EXISTS mart.remessa_alertas (
  id_alerta               bigserial     PRIMARY KEY,
  origem                  text          NOT NULL DEFAULT 'CONTABIL',
  id_remessa              bigint,
  id_entidade             numeric(19,0) NOT NULL,
  id_entidade_cjur        integer,
  nome_entidade           text,
  nome_ente               text,
  ano                     integer       NOT NULL,
  numero                  integer       NOT NULL,
  tipo_alerta             text          NOT NULL,
  nivel                   text          NOT NULL,
  descricao               text          NOT NULL,
  prazo_envio             timestamp,
  data_envio              timestamp,
  data_confirmacao        timestamp,
  data_processamento      timestamp,
  dias_atraso             integer,
  situacao                text,
  status_publicacao       text,
  detalhe_json            jsonb,
  atualizado_em           timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mra_ano_nivel     ON mart.remessa_alertas (ano, nivel);
CREATE INDEX IF NOT EXISTS idx_mra_id_entidade   ON mart.remessa_alertas (id_entidade);
CREATE INDEX IF NOT EXISTS idx_mra_id_ent_cjur   ON mart.remessa_alertas (id_entidade_cjur);
CREATE INDEX IF NOT EXISTS idx_mra_tipo_alerta   ON mart.remessa_alertas (tipo_alerta);

-- Mart resumo
CREATE TABLE IF NOT EXISTS mart.remessa_resumo (
  origem                        text    NOT NULL DEFAULT 'CONTABIL',
  ano                           integer NOT NULL,
  total_remessas                integer NOT NULL DEFAULT 0,
  total_entidades               integer NOT NULL DEFAULT 0,
  total_nao_enviadas_prazo      integer NOT NULL DEFAULT 0,
  total_enviadas_atraso         integer NOT NULL DEFAULT 0,
  total_sem_confirmacao         integer NOT NULL DEFAULT 0,
  total_sem_processamento       integer NOT NULL DEFAULT 0,
  total_criticas                integer NOT NULL DEFAULT 0,
  total_altas                   integer NOT NULL DEFAULT 0,
  total_medias                  integer NOT NULL DEFAULT 0,
  atualizado_em                 timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (origem, ano)
);

CREATE INDEX IF NOT EXISTS idx_mrr_ano ON mart.remessa_resumo (ano);
