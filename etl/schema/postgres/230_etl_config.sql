-- 230_etl_config.sql
-- Configuração de monitoramento e execução de ETLs

CREATE TABLE IF NOT EXISTS audit.etl_monitoramento_config (
  modulo text PRIMARY KEY,
  nome_exibicao text NOT NULL,
  periodicidade text NOT NULL,
  tolerancia_dias integer NOT NULL,
  ativo_painel boolean NOT NULL DEFAULT true,
  descricao text,
  ordem_exibicao integer,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit.etl_execucao_config (
  modulo text PRIMARY KEY REFERENCES audit.etl_monitoramento_config(modulo),
  tipo_carga_padrao text NOT NULL,
  modo_carga_padrao text NOT NULL,
  escopo_carga text NOT NULL,
  campo_referencia text,
  janela_reprocessamento_dias integer,
  preserva_historico boolean NOT NULL DEFAULT false,
  requer_confirmacao_manual boolean NOT NULL DEFAULT true,
  permite_execucao_manual boolean NOT NULL DEFAULT false,
  permite_full_manual boolean NOT NULL DEFAULT false,
  permite_incremental_manual boolean NOT NULL DEFAULT false,
  label_botao text,
  mensagem_confirmacao text,
  parametros_obrigatorios text[],
  observacao_regra_negocio text,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_etl_monitoramento_config_ativo_painel
  ON audit.etl_monitoramento_config (ativo_painel);

CREATE INDEX IF NOT EXISTS idx_etl_execucao_config_permite_execucao_manual
  ON audit.etl_execucao_config (permite_execucao_manual);

INSERT INTO audit.etl_monitoramento_config (
  modulo,
  nome_exibicao,
  periodicidade,
  tolerancia_dias,
  ativo_painel,
  descricao,
  ordem_exibicao
)
VALUES
  ('despesa_full_postgres', 'Despesa (Empenhos)', 'diaria', 1, true, NULL, 1),
  ('mart_despesa', 'Mart Despesa', 'diaria', 1, true, NULL, 2),
  ('processos_gabinete', 'Processos Gabinete', 'diaria', 1, true, NULL, 3),
  ('mart_infodengue', 'Vigilância Epidemiológica (InfoDengue)', 'semanal', 7, true, NULL, 4),
  ('mart_saude_consolidado', 'Saúde — Consolidado', 'semanal', 7, true, NULL, 5),
  ('mart_pni', 'Vacinação PNI', 'mensal', 30, true, NULL, 6),
  ('mart_sisagua', 'Qualidade da Água (SISAGUA)', 'mensal', 30, true, NULL, 7),
  ('mart_saude_estrutura', 'Estrutura da Rede (CNES/UBS)', 'mensal', 30, true, NULL, 8),
  ('mart_remessas', 'Remessas Contábeis', 'mensal', 30, true, NULL, 9),
  ('remessas_full_postgres', 'Carga Remessas', 'mensal', 30, true, NULL, 10),
  ('mart_siops', 'Orçamento Saúde (SIOPS)', 'bimestral', 60, true, NULL, 11),
  ('mart_siconfi_rreo', 'RREO (SICONFI)', 'bimestral', 60, true, NULL, 12),
  ('mart_pni_cobertura', 'Cobertura Vacinal (PNI)', 'anual', 365, true, NULL, 13),
  ('mart_mortalidade', 'Mortalidade (SIM/SINASC)', 'anual', 365, true, NULL, 14)
ON CONFLICT (modulo) DO UPDATE
SET
  nome_exibicao = EXCLUDED.nome_exibicao,
  periodicidade = EXCLUDED.periodicidade,
  tolerancia_dias = EXCLUDED.tolerancia_dias,
  ativo_painel = EXCLUDED.ativo_painel,
  descricao = EXCLUDED.descricao,
  ordem_exibicao = EXCLUDED.ordem_exibicao,
  atualizado_em = now();

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
  'remessas_full_postgres',
  'full',
  'full_truncate_insert',
  'exercicio_corrente',
  'exercicio',
  NULL,
  false,
  true,
  true,
  true,
  false,
  'Forçar atualização',
  'Esta ação irá recarregar as remessas contábeis do exercício corrente. Deseja continuar?',
  NULL,
  'As remessas contábeis devem sempre refletir o exercício corrente. A carga é full porque não há necessidade de preservar a situação anterior.'
)
ON CONFLICT (modulo) DO UPDATE
SET
  tipo_carga_padrao = EXCLUDED.tipo_carga_padrao,
  modo_carga_padrao = EXCLUDED.modo_carga_padrao,
  escopo_carga = EXCLUDED.escopo_carga,
  campo_referencia = EXCLUDED.campo_referencia,
  janela_reprocessamento_dias = EXCLUDED.janela_reprocessamento_dias,
  preserva_historico = EXCLUDED.preserva_historico,
  requer_confirmacao_manual = EXCLUDED.requer_confirmacao_manual,
  permite_execucao_manual = EXCLUDED.permite_execucao_manual,
  permite_full_manual = EXCLUDED.permite_full_manual,
  permite_incremental_manual = EXCLUDED.permite_incremental_manual,
  label_botao = EXCLUDED.label_botao,
  mensagem_confirmacao = EXCLUDED.mensagem_confirmacao,
  parametros_obrigatorios = EXCLUDED.parametros_obrigatorios,
  observacao_regra_negocio = EXCLUDED.observacao_regra_negocio,
  atualizado_em = now();
