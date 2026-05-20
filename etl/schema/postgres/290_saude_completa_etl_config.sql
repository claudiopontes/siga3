-- 290_saude_completa_etl_config.sql
-- Registra saude_completa como um módulo "macro" no painel /seguranca/etl.
-- Não tem dados próprios — apenas dispara, em sequência, todos os 7
-- carga-*:postgres de saúde (SIOPS, CNES/UBS, SISAGUA, InfoDengue, PNI,
-- PNI cobertura, Mortalidade) + refresh do consolidado ao final.
-- Equivalente a `npm run carga-saude:postgres`.
--
-- Útil para:
--   - Botão único "atualizar tudo de saúde" pelo operador.
--   - Job semanal automático no scheduler.

INSERT INTO audit.etl_monitoramento_config (
  modulo, nome_exibicao, periodicidade, tolerancia_dias,
  ativo_painel, descricao, ordem_exibicao
)
VALUES (
  'saude_completa',
  'Saúde — Carga Completa',
  'semanal',
  7,
  true,
  'Macro: executa todos os 7 ETLs de saúde em sequência (SIOPS, CNES/UBS, SISAGUA, InfoDengue, PNI, PNI Cobertura, Mortalidade) e refresca o Consolidado ao final. Equivalente a "carga-saude:postgres".',
  21
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
  modulo, tipo_carga_padrao, modo_carga_padrao, escopo_carga,
  preserva_historico, requer_confirmacao_manual,
  permite_execucao_manual, permite_full_manual, permite_incremental_manual,
  label_botao, hint_botao, mensagem_confirmacao, observacao_regra_negocio
)
VALUES (
  'saude_completa',
  'full', 'full_truncate_insert', 'tudo',
  true, true,
  true, true, false,
  'Recarregar tudo (saúde)',
  'Roda todos os 7 ETLs de saúde + Consolidado. Pode levar 10–30 min.',
  'Esta ação roda em sequência todos os ETLs de saúde (SIOPS, CNES/UBS, SISAGUA, InfoDengue, PNI, PNI Cobertura, Mortalidade) e refresca o Consolidado. PNI Cobertura e Mortalidade dependem de arquivos manuais — se não estiverem depositados, essas etapas serão puladas com aviso. A carga pode levar 10 a 30 min. Deseja continuar?',
  'Macro que invoca "carga-saude:postgres". Cada etapa loga seu próprio status em audit.etl_log. Este módulo agrega como "iniciado/concluído" do conjunto.'
)
ON CONFLICT (modulo) DO UPDATE
SET
  tipo_carga_padrao           = EXCLUDED.tipo_carga_padrao,
  modo_carga_padrao           = EXCLUDED.modo_carga_padrao,
  escopo_carga                = EXCLUDED.escopo_carga,
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
