-- 283_siconfi_rreo_incremental_etl_config.sql
-- Registra siconfi_rreo_incremental no painel /seguranca/etl. Este é o job
-- que efetivamente popula dw.fato_siconfi_rreo a partir da API SICONFI;
-- mart_siconfi_rreo é o seu filho (refresh dos marts a partir do DW).

INSERT INTO audit.etl_monitoramento_config (
  modulo, nome_exibicao, periodicidade, tolerancia_dias,
  ativo_painel, descricao, ordem_exibicao
)
VALUES (
  'siconfi_rreo_incremental',
  'SICONFI RREO — Coleta API',
  'diaria',
  1,
  true,
  'Coleta incremental dos relatórios RREO via API pública do SICONFI/Tesouro Nacional, populando dw.fato_siconfi_rreo. Pré-requisito de mart_siconfi_rreo.',
  11
)
ON CONFLICT (modulo) DO UPDATE
SET
  nome_exibicao   = EXCLUDED.nome_exibicao,
  periodicidade   = EXCLUDED.periodicidade,
  tolerancia_dias = EXCLUDED.tolerancia_dias,
  ativo_painel    = EXCLUDED.ativo_painel,
  descricao       = EXCLUDED.descricao,
  ordem_exibicao  = EXCLUDED.ordem_exibicao,
  atualizado_em   = now();
