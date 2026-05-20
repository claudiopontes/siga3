-- 273_mart_gasto_aluno_municipio.sql
-- Fase 16C.2 revisitada (Gasto MDE por Aluno).
-- Cruza:
--   mart.siope_risco_educacao_basico (MDE — Receita/Despesa Educação)
--   public.dim_escola_inep (somatório de matrículas por município)
--
-- Resultado: gasto MDE por aluno e gasto educação total por aluno.

CREATE TABLE IF NOT EXISTS mart.gasto_aluno_municipio (
  cod_municipio          integer     PRIMARY KEY,
  no_municipio           text        NULL,
  sg_uf                  text        NULL,
  an_exercicio           integer     NULL,
  nr_periodo             integer     NULL,
  total_mde              numeric     NULL,    -- MDE 25% constitucional
  total_despesa_educacao numeric     NULL,    -- Despesa total função 12
  ano_censo              integer     NULL,
  total_matriculas_bas   integer     NULL,
  gasto_aluno_mde        numeric     NULL,    -- MDE / matrículas
  gasto_aluno_educacao   numeric     NULL,    -- Despesa Total / matrículas
  atualizado_em          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mart_gasto_aluno_uf
  ON mart.gasto_aluno_municipio (sg_uf);
