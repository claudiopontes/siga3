-- 284_siconfi_rgf_etl_config.sql
-- Registra a cadeia SICONFI/RGF no painel /seguranca/etl:
--   siconfi_rgf_full   (coleta API → dw.fato_siconfi_extrato_entregas)
--   mart_siconfi_rgf   (refresh dos marts RGF a partir do DW)

INSERT INTO audit.etl_monitoramento_config (
  modulo, nome_exibicao, periodicidade, tolerancia_dias,
  ativo_painel, descricao, ordem_exibicao
)
VALUES
  ('siconfi_rgf_full',
   'SICONFI RGF — Coleta API',
   'diaria', 1, true,
   'Coleta full dos relatórios RGF via API pública do SICONFI (extrato_entregas). Pré-requisito de mart_siconfi_rgf.',
   12),
  ('mart_siconfi_rgf',
   'RGF (SICONFI)',
   'diaria', 1, true,
   'Marts derivadas de dw.fato_siconfi_extrato_entregas para os relatórios RGF.',
   13)
ON CONFLICT (modulo) DO UPDATE
SET
  nome_exibicao   = EXCLUDED.nome_exibicao,
  periodicidade   = EXCLUDED.periodicidade,
  tolerancia_dias = EXCLUDED.tolerancia_dias,
  ativo_painel    = EXCLUDED.ativo_painel,
  descricao       = EXCLUDED.descricao,
  ordem_exibicao  = EXCLUDED.ordem_exibicao,
  atualizado_em   = now();
