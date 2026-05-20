-- 278_mart_gasto_aluno_esfera.sql
-- Adiciona a esfera (Municipal/Estadual) ao mart e amplia a PK.
-- A linha estadual usa cod_municipio = 12 (cod_ibge da UF AC) e esfera = 'E'.

ALTER TABLE mart.gasto_aluno_municipio
  DROP CONSTRAINT IF EXISTS gasto_aluno_municipio_pkey;

ALTER TABLE mart.gasto_aluno_municipio
  ADD COLUMN IF NOT EXISTS esfera char(1) NOT NULL DEFAULT 'M';

ALTER TABLE mart.gasto_aluno_municipio
  ADD CONSTRAINT gasto_aluno_municipio_pkey PRIMARY KEY (cod_municipio, an_exercicio, esfera);
