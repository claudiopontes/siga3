-- 280_folha_sicap_etl_config.sql
-- Registra o módulo `folha_sicap_base` nas tabelas de controle do painel ETL.
-- Após executar este script, o módulo aparece em /seguranca/etl com botão
-- de execução manual habilitado.
--
-- O job correspondente é etl/jobs/folha-sicap-carga-base.ts (Fase 17B —
-- Gasto de Pessoal / Folha SICAP). Periodicidade: diária.

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
  'folha_sicap_base',
  'Folha SICAP — Gasto de Pessoal',
  'diaria',
  1,
  true,
  'Carga analítica de contracheques e verbas (dbo.vw_folha_contracheque_base + dbo.vw_folha_verbas_detalhada) para o schema folha.* no PostgreSQL.',
  20
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
  'folha_sicap_base',
  'incremental',
  'delete_insert_por_competencia',
  'competencia',
  'competencia',
  30,
  true,
  true,
  true,
  false,
  true,
  'Recarregar folha',
  'Recarrega contracheques e verbas da competência informada (ou janela ano atual + ano anterior se nenhuma for definida).',
  'Esta ação irá recarregar a Folha SICAP da competência selecionada (ou de toda a janela ano atual + ano anterior se nada for informado). O volume pode ultrapassar dezenas de milhões de linhas em fato_verba_contracheque. Deseja continuar?',
  NULL,
  'Carga diária por competência. Estratégia DELETE + INSERT por (ano, mes) em folha.fato_contracheque e folha.fato_verba_contracheque, com upsert nas dimensões (folha.dim_*) referenciadas pela competência. CPF nunca é exposto: apenas hash SHA-256 e máscara ***.NNN.NNN-** nos fatos; o CPF integral permanece restrito a folha.dim_servidor para cruzamento interno. Guardrail FOLHA_MAX_ANOS_RETROATIVOS=1 impede cargas históricas acidentais (libere via FOLHA_PERMITIR_HISTORICO=1).'
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
