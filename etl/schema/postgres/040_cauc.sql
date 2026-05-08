-- 040_cauc.sql
-- Tabelas para o ETL CAUC (Cadastro Único de Convênios — Tesouro Transparente)

CREATE TABLE IF NOT EXISTS public.cauc_carga (
  id              bigserial   PRIMARY KEY,
  fonte           text        NOT NULL,
  tipo_ente       text        NOT NULL,
  url_origem      text        NULL,
  data_referencia date        NOT NULL,
  status          text        NOT NULL DEFAULT 'iniciada',
  registros       integer     NOT NULL DEFAULT 0,
  mensagem        text        NULL,
  iniciado_em     timestamptz NOT NULL DEFAULT now(),
  finalizado_em   timestamptz NULL
);

CREATE TABLE IF NOT EXISTS public.cauc_situacao_raw (
  id                    bigserial   PRIMARY KEY,
  carga_id              bigint      NOT NULL REFERENCES public.cauc_carga (id),
  tipo_ente             text        NOT NULL,
  uf                    text        NULL,
  codigo_ibge           text        NULL,
  cnpj                  text        NULL,
  nome_ente             text        NULL,
  item_codigo           text        NULL,
  item_descricao        text        NULL,
  grupo                 text        NULL,
  situacao              text        NULL,
  situacao_normalizada  text        NOT NULL,
  dados                 jsonb       NULL,
  hash_registro         text        NOT NULL,
  inserido_em           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cauc_situacao_carga_id      ON public.cauc_situacao_raw (carga_id);
CREATE INDEX IF NOT EXISTS idx_cauc_situacao_uf            ON public.cauc_situacao_raw (uf);
CREATE INDEX IF NOT EXISTS idx_cauc_situacao_codigo_ibge   ON public.cauc_situacao_raw (codigo_ibge);
CREATE INDEX IF NOT EXISTS idx_cauc_situacao_hash          ON public.cauc_situacao_raw (hash_registro);
