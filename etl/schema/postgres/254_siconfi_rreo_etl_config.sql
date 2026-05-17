-- 254_siconfi_rreo_etl_config.sql
-- Registra mart_siconfi_rreo nas tabelas de controle do painel ETL.
-- Após executar este script, o módulo aparece no painel /seguranca/etl
-- com botão de execução manual habilitado, sem necessidade de alterar código.
--
-- O módulo mart_siconfi_rreo já existe em audit.etl_monitoramento_config
-- (inserido em 230_etl_config.sql). Este script adiciona apenas a
-- configuração de execução em audit.etl_execucao_config.

INSERT INTO audit.etl_execucao_config (
  modulo,
  tipo_carga_padrao,
  modo_carga_padrao,
  escopo_carga,
  campo_referencia,
  janela_reprocessamento_dias,
  preserva_historico,
  requer_confirmacao_manual,
  permite_execucao_manual,
  permite_full_manual,
  permite_incremental_manual,
  label_botao,
  mensagem_confirmacao,
  parametros_obrigatorios,
  observacao_regra_negocio
)
VALUES (
  'mart_siconfi_rreo',
  'full',
  'full_delete_insert',
  'exercicio_corrente',
  'an_exercicio',
  NULL,
  true,
  true,
  true,
  true,
  false,
  'Recarregar',
  'Esta ação irá recarregar os dados RREO de todos os municípios do Acre a partir da API pública do SICONFI/Tesouro Nacional. A carga pode levar vários minutos. Deseja continuar?',
  NULL,
  'Carga bimestral dos dados RREO via API pública do SICONFI/Tesouro Nacional. Cobre o exercício corrente e o anterior (configurável via SICONFI_ANOS). Reconstrói automaticamente os marts siconfi_rreo_resumo_municipio e siconfi_rreo_alertas.'
)
ON CONFLICT (modulo) DO UPDATE
SET
  tipo_carga_padrao           = EXCLUDED.tipo_carga_padrao,
  modo_carga_padrao           = EXCLUDED.modo_carga_padrao,
  escopo_carga                = EXCLUDED.escopo_carga,
  campo_referencia            = EXCLUDED.campo_referencia,
  janela_reprocessamento_dias = EXCLUDED.janela_reprocessamento_dias,
  preserva_historico          = EXCLUDED.preserva_historico,
  requer_confirmacao_manual   = EXCLUDED.requer_confirmacao_manual,
  permite_execucao_manual     = EXCLUDED.permite_execucao_manual,
  permite_full_manual         = EXCLUDED.permite_full_manual,
  permite_incremental_manual  = EXCLUDED.permite_incremental_manual,
  label_botao                 = EXCLUDED.label_botao,
  mensagem_confirmacao        = EXCLUDED.mensagem_confirmacao,
  parametros_obrigatorios     = EXCLUDED.parametros_obrigatorios,
  observacao_regra_negocio    = EXCLUDED.observacao_regra_negocio,
  atualizado_em               = now();
