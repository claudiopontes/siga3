-- 265_inep_escolas_etl_config.sql
-- Fase 17D — Registra os jobs INEP-Escolas e Censo-Geo nas tabelas de controle
-- do painel /seguranca/etl. Mesmo padrão da 263_inep_etl_config.sql.

INSERT INTO audit.etl_monitoramento_config (
  modulo, nome_exibicao, periodicidade, tolerancia_dias, ativo_painel, descricao, ordem_exibicao
) VALUES
  ('inep_ideb_escolas',
   'IDEB por Escola (INEP)',
   'variavel',
   36500,
   true,
   'Sob demanda. Mesma cadência bienal do IDEB municipal, mas granularidade de escola individual. Arquivos baixados manualmente em etl/data/inep/ideb-escolas/.',
   103),
  ('inep_censo_geo',
   'Censo Escolar — Geo das Escolas (INEP)',
   'variavel',
   36500,
   true,
   'Sob demanda. Extrai apenas coordenadas (lat/lng) e metadados das escolas do microdado anual do Censo Escolar. Arquivo único em etl/data/inep/censo/ (~600MB).',
   104)
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
  ('inep_ideb_escolas',
   'full', 'full_upsert_hash', 'tudo', NULL,
   NULL, true, false,
   true, true, false,
   'Reprocessar IDEB Escolas',
   'Reprocessa todos os ZIPs IDEB-escolas em etl/data/inep/ideb-escolas/. Operação idempotente. Deseja continuar?',
   NULL,
   'Lê todos os ZIPs em etl/data/inep/ideb-escolas/. Filtro padrão UF=AC (~500-800 escolas). Hash SHA-256 garante idempotência.'),
  ('inep_censo_geo',
   'full', 'full_upsert', 'tudo', NULL,
   NULL, true, false,
   true, true, false,
   'Atualizar Geo Escolas',
   'Reprocessa o microdado do Censo Escolar mais recente em etl/data/inep/censo/. Extração ~30s; ingestão ~10s. Deseja continuar?',
   NULL,
   'Extrai apenas o CSV de escolas do microdado, filtra UF=AC e popula public.dim_escola_inep. Microdado bruto NÃO é persistido — só os campos essenciais para localizar e filtrar escolas no painel.')
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
