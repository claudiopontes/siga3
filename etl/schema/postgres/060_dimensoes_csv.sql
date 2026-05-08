-- 060_dimensoes_csv.sql
-- Tabelas para o ETL de dimensoes auxiliares via CSV

CREATE TABLE IF NOT EXISTS public.aux_dim_uf (
  codigo        text        PRIMARY KEY,
  sigla         text        NULL,
  nome          text        NOT NULL,
  dados         jsonb       NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.aux_dim_municipio (
  codigo        text        PRIMARY KEY,
  nome          text        NOT NULL,
  uf_codigo     text        NULL REFERENCES public.aux_dim_uf (codigo),
  dados         jsonb       NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aux_dim_municipio_uf ON public.aux_dim_municipio (uf_codigo);

CREATE TABLE IF NOT EXISTS public.aux_dim_ente (
  codigo        text        PRIMARY KEY,
  nome          text        NOT NULL,
  dados         jsonb       NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.aux_dim_entidade (
  codigo            text        PRIMARY KEY,
  nome              text        NOT NULL,
  ente_codigo       text        NULL REFERENCES public.aux_dim_ente (codigo),
  municipio_codigo  text        NULL REFERENCES public.aux_dim_municipio (codigo),
  uf_codigo         text        NULL REFERENCES public.aux_dim_uf (codigo),
  dados             jsonb       NULL,
  atualizado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aux_dim_entidade_ente      ON public.aux_dim_entidade (ente_codigo);
CREATE INDEX IF NOT EXISTS idx_aux_dim_entidade_municipio ON public.aux_dim_entidade (municipio_codigo);
