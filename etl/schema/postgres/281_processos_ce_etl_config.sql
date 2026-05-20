-- 281_processos_ce_etl_config.sql
-- Registra o módulo `processos_ce` (cadastro de processos CE — Id_Tipo_Proc=2 do
-- EPROCESS para public.processo) nas tabelas de controle do painel ETL.
-- Antes desta migration o job rodava diariamente mas não aparecia em
-- /seguranca/etl, e a dependência processos_ce → processos_eprocess
-- (arquivos/movimentações) ficava invisível para o gabinete.

INSERT INTO audit.etl_monitoramento_config (
  modulo,
  nome_exibicao,
  periodicidade,
  tolerancia_dias,
  ativo_painel,
  descricao,
  ordem_exibicao
)
VALUES (
  'processos_ce',
  'Processos CE (Cadastro)',
  'diaria',
  1,
  true,
  'Carrega todos os processos de Controle Externo (Id_Tipo_Proc = 2) do EPROCESS para public.processo. Pré-requisito para processos_eprocess (arquivos/movimentações).',
  3
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
  hint_botao,
  mensagem_confirmacao,
  parametros_obrigatorios,
  observacao_regra_negocio
)
VALUES (
  'processos_ce',
  'incremental',
  'upsert',
  'tudo',
  NULL,
  NULL,
  true,
  false,
  true,
  false,
  true,
  'Recarregar',
  'Sincroniza o cadastro de processos CE do eProcessos.',
  'Esta ação irá sincronizar o cadastro de processos CE do eProcessos. Deseja continuar?',
  NULL,
  'Carga incremental (upsert) com base em vwProc_Eletronico (Id_Tipo_Proc = 2). Pré-requisito do módulo processos_eprocess: se falhar, o cron pula a carga de arquivos/movimentações para não trabalhar em cima de cadastro desatualizado.'
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
  hint_botao                  = EXCLUDED.hint_botao,
  mensagem_confirmacao        = EXCLUDED.mensagem_confirmacao,
  parametros_obrigatorios     = EXCLUDED.parametros_obrigatorios,
  observacao_regra_negocio    = EXCLUDED.observacao_regra_negocio,
  atualizado_em               = now();
