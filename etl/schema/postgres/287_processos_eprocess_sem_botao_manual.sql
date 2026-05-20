-- 287_processos_eprocess_sem_botao_manual.sql
-- Encadeamento processos_ce → processos_eprocess: o pai dispara a cadeia
-- inteira (`carga-processos:postgres`). O filho continua visível no painel
-- mas sem botão próprio (`permite_execucao_manual = false`), evitando dois
-- botões redundantes para a mesma operação lógica.

UPDATE audit.etl_execucao_config
SET
  permite_execucao_manual    = false,
  permite_full_manual        = false,
  permite_incremental_manual = false,
  observacao_regra_negocio   = 'Disparado automaticamente após processos_ce. Sem botão próprio no painel — use "Recarregar" em Processos CE para reprocessar toda a cadeia.',
  atualizado_em              = now()
WHERE modulo = 'processos_eprocess';
