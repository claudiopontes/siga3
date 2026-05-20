-- 288_consolidar_botoes_cadeias.sql
-- UX: cada cadeia deve ter apenas UM botão de recarga no painel /seguranca/etl,
-- no nó pai. O pai dispara a cadeia inteira (script "carga-XXX:postgres" que
-- encadeia os demais via npm &&). Os filhos continuam visíveis no painel mas
-- sem botão próprio. Reduz redundância e evita confusão sobre qual etapa
-- reprocessar.
--
-- Cadeias afetadas:
--   despesa_full_postgres → mart_despesa
--   remessas_full_postgres → mart_remessas
--   siconfi_rreo_incremental → mart_siconfi_rreo
--   siconfi_rgf_full → mart_siconfi_rgf
--   credor_preparar → credor_enriquecer_interno → credor_enriquecer_cnpj → mart_credor_despesa

-- Filhos: remove permissão de execução manual e ajusta observação
UPDATE audit.etl_execucao_config
SET
  permite_execucao_manual    = false,
  permite_full_manual        = false,
  permite_incremental_manual = false,
  observacao_regra_negocio   = 'Disparado automaticamente pelo pai na cadeia. Sem botão próprio no painel — use a opção do módulo pai.',
  atualizado_em              = now()
WHERE modulo IN (
  'mart_despesa',
  'mart_remessas',
  'mart_siconfi_rreo',
  'mart_siconfi_rgf',
  'credor_enriquecer_interno',
  'credor_enriquecer_cnpj',
  'mart_credor_despesa'
);
