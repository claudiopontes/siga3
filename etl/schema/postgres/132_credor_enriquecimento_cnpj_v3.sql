-- Migration: novos campos de enriquecimento CNPJ (v3)
ALTER TABLE dw.dim_credor_enriquecido
  ADD COLUMN IF NOT EXISTS nome_fantasia          text          NULL,
  ADD COLUMN IF NOT EXISTS complemento            text          NULL,
  ADD COLUMN IF NOT EXISTS telefone_2             text          NULL,
  ADD COLUMN IF NOT EXISTS opcao_simples          boolean       NULL,
  ADD COLUMN IF NOT EXISTS opcao_mei              boolean       NULL,
  ADD COLUMN IF NOT EXISTS data_opcao_simples     date          NULL,
  ADD COLUMN IF NOT EXISTS data_exclusao_simples  date          NULL,
  ADD COLUMN IF NOT EXISTS motivo_situacao        text          NULL,
  ADD COLUMN IF NOT EXISTS situacao_especial      text          NULL,
  ADD COLUMN IF NOT EXISTS data_situacao_especial date          NULL;
