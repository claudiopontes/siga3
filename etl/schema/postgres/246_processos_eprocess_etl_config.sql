-- 246_processos_eprocess_etl_config.sql
-- Registra o módulo processos_eprocess nas tabelas de controle do painel ETL.
-- Também corrige o label_botao do pauta_julgamento para "Recarregar".

-- Corrige label do pauta_julgamento
UPDATE audit.etl_execucao_config
SET label_botao = 'Recarregar', atualizado_em = now()
WHERE modulo = 'pauta_julgamento'
  AND label_botao = 'Forçar atualização';

-- Registra o novo módulo de processos
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
  'processos_eprocess',
  'Processos — Arquivos e Movimentações',
  'diaria',
  1,
  true,
  'Carga incremental de arquivos e movimentações dos processos presentes nos itens de pauta. Deve ser executado após o ETL pauta_julgamento.',
  5
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
  mensagem_confirmacao,
  parametros_obrigatorios,
  observacao_regra_negocio
)
VALUES (
  'processos_eprocess',
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
  'Esta ação irá sincronizar arquivos e movimentações dos processos do eProcessos. Deseja continuar?',
  NULL,
  'Carga incremental de arquivos e movimentações dos processos presentes nos itens de pauta. Deve ser executado após o ETL pauta_julgamento.'
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
