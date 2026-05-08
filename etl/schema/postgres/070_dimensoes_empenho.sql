-- 070_dimensoes_empenho.sql
-- Tabelas para o ETL de dimensoes de empenho (SQL Server -> PostgreSQL)

CREATE TABLE IF NOT EXISTS public.dim_aplicacao (
  id_aplicacao  integer     PRIMARY KEY,
  codigo        text        NOT NULL,
  descricao     text        NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- dim_credor já existe em 010_public_compat.sql
-- Apenas garantir índices adicionais se necessário
CREATE INDEX IF NOT EXISTS idx_dim_credor_nome ON public.dim_credor (nome);
