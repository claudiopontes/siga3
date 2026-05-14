-- 241_pauta_julgamento_etl_config.sql
-- Registra o módulo pauta_julgamento nas tabelas de controle do painel ETL.
-- Após executar este script, o módulo aparece automaticamente na área de controle
-- de ETLs existente (/seguranca/etl) sem necessidade de alteração no código.
--
-- Variável de ambiente necessária no servidor ETL:
--   EJURIS_SQLSERVER_DATABASE=EJURIS

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
  'pauta_julgamento',
  'Pautas para Julgamento',
  'diaria',
  1,
  true,
  'Carga das sessões em situação PARA JULGAMENTO e dos respectivos processos pautados a partir do EJURIS.',
  4
)
ON CONFLICT (modulo) DO UPDATE
SET
  nome_exibicao    = EXCLUDED.nome_exibicao,
  periodicidade    = EXCLUDED.periodicidade,
  tolerancia_dias  = EXCLUDED.tolerancia_dias,
  ativo_painel     = EXCLUDED.ativo_painel,
  descricao        = EXCLUDED.descricao,
  ordem_exibicao   = EXCLUDED.ordem_exibicao,
  atualizado_em    = now();

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
  'pauta_julgamento',
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
  'Forçar atualização',
  'Esta ação irá sincronizar todas as sessões e itens de pauta do EJURIS. Deseja continuar?',
  NULL,
  'Carga incremental (upsert) de todas as sessões e itens de pauta. A situação da sessão é atualizada a cada execução, refletindo a progressão no EJURIS (PARA PAUTA → PARA JULGAMENTO → ENCERRADA etc.).'
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
