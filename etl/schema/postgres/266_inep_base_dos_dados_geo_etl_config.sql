-- 266_inep_base_dos_dados_geo_etl_config.sql
-- Fase 17D — Registra o job inep_base_dos_dados_geo no painel admin.
-- Necessário porque o INEP removeu coordenadas do microdado em 2023; a Base
-- dos Dados (basedosdados.org) mantém o arquivo curado com lat/lng.

INSERT INTO audit.etl_monitoramento_config (
  modulo, nome_exibicao, periodicidade, tolerancia_dias, ativo_painel, descricao, ordem_exibicao
) VALUES
  ('inep_base_dos_dados_geo',
   'Geo das Escolas — Base dos Dados',
   'variavel',
   36500,
   true,
   'Sob demanda. Arquivo curado pela Base dos Dados (basedosdados.org) com coordenadas das escolas — necessário porque o INEP removeu lat/lng do microdado a partir de 2023.',
   105)
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
  ('inep_base_dos_dados_geo',
   'full', 'full_upsert', 'tudo', NULL,
   NULL, true, false,
   true, true, false,
   'Atualizar Geo (BD)',
   'Reprocessa o arquivo da Base dos Dados para atualizar coordenadas das escolas. Deseja continuar?',
   NULL,
   'Lê etl/data/inep/censo/br_bd_diretorios_brasil_escola.csv.gz, filtra UF=AC e atualiza apenas latitude/longitude em public.dim_escola_inep. Demais campos vêm do microdado INEP.')
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
