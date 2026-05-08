-- 050_combustivel.sql
-- Tabelas para o ETL Painel Combustível

CREATE TABLE IF NOT EXISTS public.combustivel_mensal (
  id              bigserial     PRIMARY KEY,
  ano             integer       NOT NULL,
  mes             integer       NOT NULL,
  entidade        text          NOT NULL,
  emitente        text          NOT NULL,
  tipo_combustivel text         NOT NULL,
  litros          numeric(18,3) NOT NULL DEFAULT 0,
  valor_total     numeric(18,2) NOT NULL DEFAULT 0,
  qtd_notas       integer       NOT NULL DEFAULT 0,
  atualizado_em   timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_combustivel_mensal_ano_mes ON public.combustivel_mensal (ano, mes);

CREATE TABLE IF NOT EXISTS public.combustivel_entidade (
  id              bigserial     PRIMARY KEY,
  entidade        text          NOT NULL,
  litros          numeric(18,3) NOT NULL DEFAULT 0,
  valor_total     numeric(18,2) NOT NULL DEFAULT 0,
  qtd_notas       integer       NOT NULL DEFAULT 0,
  atualizado_em   timestamptz   NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.combustivel_tipo (
  id              bigserial     PRIMARY KEY,
  tipo_combustivel text         NOT NULL,
  litros          numeric(18,3) NOT NULL DEFAULT 0,
  valor_total     numeric(18,2) NOT NULL DEFAULT 0,
  qtd_notas       integer       NOT NULL DEFAULT 0,
  atualizado_em   timestamptz   NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.combustivel_emitente (
  id              bigserial     PRIMARY KEY,
  emitente        text          NOT NULL,
  litros          numeric(18,3) NOT NULL DEFAULT 0,
  valor_total     numeric(18,2) NOT NULL DEFAULT 0,
  qtd_notas       integer       NOT NULL DEFAULT 0,
  atualizado_em   timestamptz   NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.combustivel_kpis (
  id              bigserial     PRIMARY KEY,
  valor_total     numeric(18,2) NOT NULL DEFAULT 0,
  litros_total    numeric(18,3) NOT NULL DEFAULT 0,
  preco_medio     numeric(18,4) NOT NULL DEFAULT 0,
  total_entidades integer       NOT NULL DEFAULT 0,
  total_notas     integer       NOT NULL DEFAULT 0,
  data_inicio     date          NULL,
  data_fim        date          NULL,
  atualizado_em   timestamptz   NOT NULL DEFAULT now()
);
