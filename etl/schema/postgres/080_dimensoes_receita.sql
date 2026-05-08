-- 080_dimensoes_receita.sql
-- Tabelas para o ETL de dimensoes de receita (SQL Server -> PostgreSQL)

CREATE TABLE IF NOT EXISTS public.aux_dim_natureza_receita_orcamentaria (
  id_natureza         integer     PRIMARY KEY,
  numero              integer     NOT NULL,
  data_criacao        text        NULL,
  codigo              text        NOT NULL,
  descricao           text        NOT NULL,
  nivel               integer     NOT NULL,
  nome                text        NOT NULL,
  tipo                text        NULL,
  ativo               boolean     NULL,
  especificacao       text        NULL,
  destinacao_legal    text        NULL,
  norma               text        NULL,
  amparo              text        NULL,
  ano_inicio          integer     NOT NULL,
  ano_fim             integer     NOT NULL,
  id_natureza_pai     integer     NULL,
  extensao            integer     NULL,
  rubrica             text        NULL,
  atualizado_em       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aux_natureza_codigo ON public.aux_dim_natureza_receita_orcamentaria (codigo);
CREATE INDEX IF NOT EXISTS idx_aux_natureza_numero ON public.aux_dim_natureza_receita_orcamentaria (numero);

CREATE TABLE IF NOT EXISTS public.aux_dim_grupo_fonte_recurso (
  numero        integer     PRIMARY KEY,
  data_criacao  text        NULL,
  codigo        text        NOT NULL,
  nome          text        NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.aux_dim_fonte_destinacao_recurso (
  id_fonte_destinacao_recurso   integer     PRIMARY KEY,
  classificacao                 text        NOT NULL,
  codigo                        text        NOT NULL,
  data_criacao                  text        NULL,
  descricao                     text        NOT NULL,
  nome                          text        NULL,
  numero                        integer     NOT NULL,
  numero_grupo_fonte_recurso    integer     NOT NULL,
  ativo                         boolean     NOT NULL DEFAULT true,
  ano_inicio                    integer     NULL,
  ano_fim                       integer     NULL,
  codigo_stn                    text        NULL,
  atualizado_em                 timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aux_fonte_dest_numero ON public.aux_dim_fonte_destinacao_recurso (numero);
