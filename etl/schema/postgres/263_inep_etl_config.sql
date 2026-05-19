-- 263_inep_etl_config.sql
-- Fase 17B — Registra os 3 jobs INEP (IDEB, Rendimento, mart Painel Educação)
-- nas tabelas de controle do painel /seguranca/etl, para que apareçam na lista
-- e tenham botão de execução manual habilitado.
--
-- Sem este script o painel apenas lê audit.etl_monitoramento_config (DB) e
-- ignora a constante ETL_CONFIG do código.
--
-- Particularidade: periodicidade = 'variavel' porque a carga depende de
-- arquivos manualmente colocados em etl/data/inep/ (download.inep.gov.br é
-- bloqueado pela rede TCE). tolerancia_dias alto (36500 = 100 anos) garante
-- que o painel nunca marcará a carga como "desatualizada" por tempo.

-- ---------------------------------------------------------------------------
-- 1) audit.etl_monitoramento_config — entrada do módulo na lista do painel
-- ---------------------------------------------------------------------------
INSERT INTO audit.etl_monitoramento_config (
  modulo, nome_exibicao, periodicidade, tolerancia_dias, ativo_painel, descricao, ordem_exibicao
) VALUES
  ('inep_ideb_municipios',
   'IDEB Municipal (INEP)',
   'variavel',
   36500,
   true,
   'Sob demanda. INEP publica em bienais (IDEB) e o download.inep.gov.br é bloqueado pela rede do TCE. Os arquivos são baixados manualmente e colocados em etl/data/inep/ideb/ — a carga só recarrega quando há ZIPs novos no diretório.',
   100),
  ('inep_rendimento_municipios',
   'Taxas de Rendimento Escolar (INEP)',
   'variavel',
   36500,
   true,
   'Sob demanda. Anual no INEP, mas a rede do TCE bloqueia o download.inep.gov.br — os ZIPs vêm de download manual em etl/data/inep/rendimento/. Carga só recarrega quando há arquivos novos.',
   101),
  ('mart_painel_educacao',
   'Painel Educação — Consolidado',
   'variavel',
   36500,
   true,
   'Mart derivado. Reconstruído automaticamente após cargas de IDEB ou Rendimento; também pode ser disparado manualmente sem reprocessar as fontes.',
   102)
ON CONFLICT (modulo) DO UPDATE
SET
  nome_exibicao   = EXCLUDED.nome_exibicao,
  periodicidade   = EXCLUDED.periodicidade,
  tolerancia_dias = EXCLUDED.tolerancia_dias,
  ativo_painel    = EXCLUDED.ativo_painel,
  descricao       = EXCLUDED.descricao,
  ordem_exibicao  = EXCLUDED.ordem_exibicao,
  atualizado_em   = now();

-- ---------------------------------------------------------------------------
-- 2) audit.etl_execucao_config — configuração de execução manual
-- ---------------------------------------------------------------------------
INSERT INTO audit.etl_execucao_config (
  modulo,
  tipo_carga_padrao, modo_carga_padrao, escopo_carga, campo_referencia,
  janela_reprocessamento_dias, preserva_historico, requer_confirmacao_manual,
  permite_execucao_manual, permite_full_manual, permite_incremental_manual,
  label_botao, mensagem_confirmacao, parametros_obrigatorios, observacao_regra_negocio
) VALUES
  ('inep_ideb_municipios',
   'full', 'full_upsert_hash', 'tudo', NULL,
   NULL, true, false,
   true, true, false,
   'Reprocessar IDEB',
   'Reprocessa todos os ZIPs IDEB em etl/data/inep/ideb/. Operação idempotente — recarregar arquivos já processados não duplica dados. Deseja continuar?',
   NULL,
   'Lê todos os ZIPs em etl/data/inep/ideb/ (uma execução processa todas as edições presentes). Filtro padrão UF=AC. Hash SHA-256 garante idempotência: arquivos já processados sem alteração apenas tocam atualizado_em.'),
  ('inep_rendimento_municipios',
   'full', 'full_upsert_hash', 'tudo', NULL,
   NULL, true, false,
   true, true, false,
   'Reprocessar Rendimento',
   'Reprocessa todos os ZIPs de Taxas de Rendimento em etl/data/inep/rendimento/. Deseja continuar?',
   NULL,
   'Lê todos os ZIPs em etl/data/inep/rendimento/. Filtro padrão UF=AC. Cada linha = município × localização × dependência; aprovação/reprovação/abandono por etapa.'),
  ('mart_painel_educacao',
   'full', 'full_truncate_insert', 'tudo', NULL,
   NULL, false, false,
   true, true, false,
   'Atualizar Painel Educação',
   'Reconstrói o mart de Educação a partir do que já está em dw.fato_inep_ideb_municipal e dw.fato_inep_rendimento_municipal. Deseja continuar?',
   NULL,
   'Cruza última edição IDEB (rede Pública) com último ano de Rendimento (Total/Total) para alimentar /painel-educacao. Idempotente — TRUNCATE + INSERT a cada execução.')
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
