-- 000_init_varadouro.sql
-- Schemas base e tabelas de auditoria do ETL

CREATE SCHEMA IF NOT EXISTS raw;
CREATE SCHEMA IF NOT EXISTS stage;
CREATE SCHEMA IF NOT EXISTS dw;
CREATE SCHEMA IF NOT EXISTS mart;
CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE IF NOT EXISTS audit.etl_log (
  id          bigserial PRIMARY KEY,
  modulo      text        NOT NULL,
  status      text        NOT NULL,
  mensagem    text        NULL,
  registros   integer     NOT NULL DEFAULT 0,
  duracao_ms  integer     NULL,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit.etl_carga (
  id_carga          bigserial   PRIMARY KEY,
  modulo            text        NOT NULL,
  origem            text        NULL,
  destino           text        NULL,
  modo_carga        text        NULL,
  status            text        NOT NULL,
  registros_lidos   integer     NOT NULL DEFAULT 0,
  registros_gravados integer    NOT NULL DEFAULT 0,
  iniciado_em       timestamptz NOT NULL DEFAULT now(),
  finalizado_em     timestamptz NULL,
  mensagem          text        NULL
);
