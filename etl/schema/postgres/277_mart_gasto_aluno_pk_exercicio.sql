-- 277_mart_gasto_aluno_pk_exercicio.sql
-- Mart agora armazena uma linha por (cod_municipio, an_exercicio).
-- Permite filtrar por exercício na UI (2025/2026) e manter histórico ano-a-ano.
-- Também remove colunas MDE-TCE obsoletas — métrica de MDE puro exige tratamento
-- separado e fica fora deste cruzamento.

ALTER TABLE mart.gasto_aluno_municipio
  DROP CONSTRAINT IF EXISTS gasto_aluno_municipio_pkey;

ALTER TABLE mart.gasto_aluno_municipio
  ALTER COLUMN an_exercicio SET NOT NULL;

ALTER TABLE mart.gasto_aluno_municipio
  ADD CONSTRAINT gasto_aluno_municipio_pkey PRIMARY KEY (cod_municipio, an_exercicio);

ALTER TABLE mart.gasto_aluno_municipio
  DROP COLUMN IF EXISTS total_mde_tce,
  DROP COLUMN IF EXISTS receita_base_mde_tce,
  DROP COLUMN IF EXISTS pct_aplicado_mde_tce,
  DROP COLUMN IF EXISTS gasto_aluno_mde_tce,
  DROP COLUMN IF EXISTS divergencia_mde_pct;
