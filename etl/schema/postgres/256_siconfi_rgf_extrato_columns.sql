-- 256_siconfi_rgf_extrato_columns.sql
-- Adiciona campos de entrega oficial à mart.siconfi_rgf_resumo_municipio.
-- Necessário porque a fonte de dados mudou de /rgf (sem dados) para /extrato_entregas.

ALTER TABLE mart.siconfi_rgf_resumo_municipio
  ADD COLUMN IF NOT EXISTS status_relatorio text NULL,  -- HO | RE | null
  ADD COLUMN IF NOT EXISTS data_entrega     date NULL;  -- data do status no SICONFI
