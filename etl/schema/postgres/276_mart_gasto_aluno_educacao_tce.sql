-- 276_mart_gasto_aluno_educacao_tce.sql
-- Refinamento da Fase 16C.2: simplifica a comparação SICONFI × TCE para o
-- "Custo Total com Educação" (função 12 inteira), mantendo a compatibilidade
-- de exercício entre as duas fontes. A métrica de MDE puro (recursos próprios)
-- exige tratamento separado e por isso fica de fora deste cruzamento.

ALTER TABLE mart.gasto_aluno_municipio
  ADD COLUMN IF NOT EXISTS gasto_aluno_educacao_tce numeric NULL,
  ADD COLUMN IF NOT EXISTS divergencia_educacao_pct numeric NULL;
