-- 289_mart_saude_consolidado_execucao.sql
-- Registra mart_saude_consolidado em audit.etl_execucao_config para permitir
-- execução manual pelo painel (era visível mas sem botão).
--
-- Conceitualmente o consolidado tem 7 pais (mart_siops, mart_sisagua, mart_pni,
-- mart_pni_cobertura, mart_infodengue, mart_saude_estrutura, mart_mortalidade).
-- Cada um dos 7 scripts "carga-*:postgres" agora encadeia um refresh do
-- consolidado ao final (ver etl/package.json), mas mantemos um botão próprio
-- para refresh isolado quando o usuário já sabe que os marts pais estão OK
-- e quer só reconstruir a visão consolidada (rápido).

INSERT INTO audit.etl_execucao_config (
  modulo, tipo_carga_padrao, modo_carga_padrao, escopo_carga,
  preserva_historico, requer_confirmacao_manual,
  permite_execucao_manual, permite_full_manual, permite_incremental_manual,
  label_botao, hint_botao, mensagem_confirmacao, observacao_regra_negocio
)
VALUES (
  'mart_saude_consolidado',
  'full', 'full_truncate_insert', 'tudo',
  true, true,
  true, true, false,
  'Recarregar consolidado',
  'Reconstrói a visão consolidada da saúde a partir dos marts existentes no DW.',
  'Esta ação reconstrói a visão consolidada da saúde a partir dos marts existentes no DW (não recoleta da fonte). Deseja continuar?',
  'Recompõe a visão consolidada da saúde a partir de todos os marts de saúde já carregados. Os scripts carga-*:postgres dos marts pais (SIOPS, SISAGUA, InfoDengue, PNI, CNES, Mortalidade) disparam este refresh automaticamente ao final.'
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
