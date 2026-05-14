-- 131_credor_enriquecimento_cnpj_v2.sql
-- Adiciona campos de enriquecimento CNPJ: capital social, porte, data de abertura,
-- CNAEs secundários e QSA (quadro de sócios e administradores).

ALTER TABLE dw.dim_credor_enriquecido
  ADD COLUMN IF NOT EXISTS capital_social     numeric(18,2) NULL,
  ADD COLUMN IF NOT EXISTS porte              text          NULL,  -- ME | EPP | DEMAIS | NULL
  ADD COLUMN IF NOT EXISTS data_abertura      date          NULL,
  ADD COLUMN IF NOT EXISTS cnaes_secundarios  jsonb         NULL,  -- [{codigo, descricao}]
  ADD COLUMN IF NOT EXISTS qsa               jsonb         NULL;  -- [{nome, qualificacao, cpf_representante}]
