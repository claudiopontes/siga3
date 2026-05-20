-- 274_mart_gasto_aluno_etl_config.sql
-- Registra o mart de Gasto MDE por Aluno no painel admin /seguranca/etl.

INSERT INTO audit.etl_monitoramento_config (
  modulo, nome_exibicao, periodicidade, tolerancia_dias, ativo_painel, descricao, ordem_exibicao
) VALUES
  ('mart_gasto_aluno',
   'Gasto MDE por Aluno — Mart',
   'variavel',
   36500,
   true,
   'Mart derivado. Cruza SIOPE/RREO Anexo 8 (gasto MDE/Educação) com Censo Escolar (matrículas) para calcular gasto por aluno por município. Reconstruir após carga SICONFI ou Censo.',
   200)
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
  ('mart_gasto_aluno',
   'full', 'full_truncate_insert', 'tudo', NULL,
   NULL, false, false,
   true, true, false,
   'Atualizar Gasto/Aluno',
   'Reconstrói o mart cruzando SICONFI (MDE) com Censo (matrículas). Deseja continuar?',
   NULL,
   'TRUNCATE + INSERT. Usa a última fotografia SICONFI e Censo disponíveis. Para municípios sem dado em alguma das fontes, gasto/aluno fica NULL.')
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
