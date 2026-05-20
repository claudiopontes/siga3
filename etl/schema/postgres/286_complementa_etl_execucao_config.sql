-- 286_complementa_etl_execucao_config.sql
-- Completa audit.etl_execucao_config para os módulos registrados em
-- 283, 284 e 285 (siconfi_rreo_incremental, siconfi_rgf_full, mart_siconfi_rgf,
-- e a cadeia credor). Sem essa entrada o painel /seguranca/etl mostra os
-- cards mas o botão "Recarregar" responde: "Este módulo ainda não possui
-- configuração de execução."

INSERT INTO audit.etl_execucao_config (
  modulo, tipo_carga_padrao, modo_carga_padrao, escopo_carga,
  campo_referencia, janela_reprocessamento_dias,
  preserva_historico, requer_confirmacao_manual,
  permite_execucao_manual, permite_full_manual, permite_incremental_manual,
  label_botao, hint_botao, mensagem_confirmacao, observacao_regra_negocio
)
VALUES
  ('siconfi_rreo_incremental',
   'incremental', 'incremental_upsert', 'exercicio_corrente',
   'an_exercicio', NULL,
   true, true,
   true, false, true,
   'Recarregar',
   'Coleta incremental dos relatórios RREO via API pública do SICONFI/Tesouro Nacional.',
   'Esta ação irá coletar os relatórios RREO mais recentes via API pública do SICONFI/Tesouro Nacional. A carga pode levar vários minutos. Deseja continuar?',
   'Job que efetivamente popula dw.fato_siconfi_rreo. Ao final invoca o refresh do mart_siconfi_rreo internamente.'),

  ('siconfi_rgf_full',
   'full', 'full_delete_insert', 'exercicio_corrente',
   'an_exercicio', NULL,
   true, true,
   true, true, false,
   'Recarregar',
   'Coleta full dos relatórios RGF via API pública do SICONFI (extrato_entregas).',
   'Esta ação irá recarregar os dados RGF de todos os municípios do Acre a partir da API pública do SICONFI. A carga pode levar vários minutos. Deseja continuar?',
   'Pré-requisito de mart_siconfi_rgf. Carrega entregas RGF do extrato_entregas para dw.fato_siconfi_extrato_entregas.'),

  ('mart_siconfi_rgf',
   'full', 'full_delete_insert', 'tudo',
   NULL, NULL,
   true, true,
   true, true, false,
   'Recarregar mart',
   'Reconstrói os marts RGF a partir de dw.fato_siconfi_extrato_entregas (sem refetch da API).',
   'Esta ação reconstrói os marts RGF a partir dos dados já carregados no DW. Não recoleta da API. Deseja continuar?',
   'Refresh apenas das tabelas mart. Para recarregar do SICONFI use siconfi_rgf_full antes.'),

  ('credor_preparar',
   'incremental', 'incremental_upsert', 'tudo',
   NULL, NULL,
   false, true,
   true, false, true,
   'Recarregar',
   'Extrai documentos distintos de fato_empenho para dw.dim_credor_enriquecido.',
   'Esta ação irá extrair os documentos distintos da tabela fato_empenho. Deseja continuar?',
   'Primeira etapa da cadeia de enriquecimento de credores. Idempotente.'),

  ('credor_enriquecer_interno',
   'incremental', 'incremental_update', 'tudo',
   NULL, NULL,
   true, true,
   true, false, true,
   'Recarregar',
   'Busca nomes de credores em fontes internas (APC/SQL Server).',
   'Esta ação irá consultar fontes internas para enriquecer nomes de credores. Deseja continuar?',
   'Depende de credor_preparar. Requer as variáveis CREDOR_INTERNO_* no .env, caso contrário é pulada silenciosamente.'),

  ('credor_enriquecer_cnpj',
   'incremental', 'incremental_update', 'tudo',
   NULL, NULL,
   true, true,
   true, false, true,
   'Recarregar',
   'Consulta API CNPJ externa (BrasilAPI) para enriquecer credores pendentes.',
   'Esta ação irá consultar a API CNPJ externa para enriquecer credores ainda pendentes. Sujeita a rate limit. Deseja continuar?',
   'Depende de credor_enriquecer_interno. Requer CNPJ_ENRICH_PROVIDER configurado no .env.'),

  ('mart_credor_despesa',
   'full', 'full_truncate_insert', 'tudo',
   NULL, NULL,
   true, true,
   true, true, false,
   'Recarregar mart',
   'Reconstrói as marts de pesquisa e análise de credores.',
   'Esta ação reconstrói as marts de credores (resumo, evolução mensal, entidades, empenhos relevantes e pesquisa). Deseja continuar?',
   'Depende da cadeia de enriquecimento credor_*. Trabalha em cima de dw.dim_credor_enriquecido + fato_empenho.')
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
  observacao_regra_negocio    = EXCLUDED.observacao_regra_negocio,
  atualizado_em               = now();
