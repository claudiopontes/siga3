-- 272_inep_distorcao_etl_config.sql
-- Registra o job inep_distorcao_municipios no painel admin /seguranca/etl.

INSERT INTO audit.etl_monitoramento_config (
  modulo, nome_exibicao, periodicidade, tolerancia_dias, ativo_painel, descricao, ordem_exibicao
) VALUES
  ('inep_distorcao_municipios',
   'Distorção Idade-Série (INEP)',
   'variavel',
   36500,
   true,
   'Sob demanda. Anual no INEP. Arquivos manualmente baixados em etl/data/inep/distorcao/. Indicador de fluxo escolar (% alunos com 2+ anos de atraso).',
   106)
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
  tipo_carga_padrao, modo_carga_padrao, escopo_carga, campo_referencia,
  janela_reprocessamento_dias, preserva_historico, requer_confirmacao_manual,
  permite_execucao_manual, permite_full_manual, permite_incremental_manual,
  label_botao, mensagem_confirmacao, parametros_obrigatorios, observacao_regra_negocio
) VALUES
  ('inep_distorcao_municipios',
   'full', 'full_upsert_hash', 'tudo', NULL,
   NULL, true, false,
   true, true, false,
   'Reprocessar Distorção',
   'Reprocessa todos os ZIPs de Taxa de Distorção Idade-Série em etl/data/inep/distorcao/. Deseja continuar?',
   NULL,
   'Lê todos os ZIPs em etl/data/inep/distorcao/. Filtro padrão UF=AC. Cada linha = município × localização × dependência.')
ON CONFLICT (modulo) DO UPDATE
SET
  tipo_carga_padrao           = EXCLUDED.tipo_carga_padrao,
  modo_carga_padrao           = EXCLUDED.modo_carga_padrao,
  escopo_carga                = EXCLUDED.escopo_carga,
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
