-- 020_mart_despesa.sql
-- Tabelas mart para leitura rápida do Painel de Despesa

CREATE TABLE IF NOT EXISTS mart.despesa_resumo (
  ano_remessa             smallint    NOT NULL,
  id_entidade             numeric     NOT NULL,
  valor_empenhado_liquido numeric(19,2) NOT NULL DEFAULT 0,
  valor_liquidado         numeric(19,2) NOT NULL DEFAULT 0,
  valor_pago              numeric(19,2) NOT NULL DEFAULT 0,
  valor_a_liquidar        numeric(19,2) NOT NULL DEFAULT 0,
  valor_a_pagar           numeric(19,2) NOT NULL DEFAULT 0,
  qtd_empenhos            integer     NOT NULL DEFAULT 0,
  qtd_credores            integer     NOT NULL DEFAULT 0,
  percentual_pago         numeric(8,2) NOT NULL DEFAULT 0,
  atualizado_em           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ano_remessa, id_entidade)
);

CREATE TABLE IF NOT EXISTS mart.despesa_evolucao_mensal (
  ano_remessa             smallint    NOT NULL,
  id_entidade             numeric     NOT NULL,
  mes_empenho             date        NOT NULL,
  valor_empenhado_liquido numeric(19,2) NOT NULL DEFAULT 0,
  valor_liquidado         numeric(19,2) NOT NULL DEFAULT 0,
  valor_pago              numeric(19,2) NOT NULL DEFAULT 0,
  atualizado_em           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ano_remessa, id_entidade, mes_empenho)
);

CREATE TABLE IF NOT EXISTS mart.despesa_ranking_entes (
  ano_remessa             smallint    NOT NULL,
  id_entidade             numeric     NOT NULL,
  nome_ente               text        NULL,
  valor_empenhado_liquido numeric(19,2) NOT NULL DEFAULT 0,
  valor_liquidado         numeric(19,2) NOT NULL DEFAULT 0,
  valor_pago              numeric(19,2) NOT NULL DEFAULT 0,
  valor_a_pagar           numeric(19,2) NOT NULL DEFAULT 0,
  qtd_empenhos            integer     NOT NULL DEFAULT 0,
  atualizado_em           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ano_remessa, id_entidade)
);

CREATE TABLE IF NOT EXISTS mart.despesa_ranking_credores (
  ano_remessa             smallint    NOT NULL,
  cpf_cnpj_credor         varchar(14) NOT NULL,
  nome_credor             text        NULL,
  valor_empenhado_liquido numeric(19,2) NOT NULL DEFAULT 0,
  valor_pago              numeric(19,2) NOT NULL DEFAULT 0,
  qtd_empenhos            integer     NOT NULL DEFAULT 0,
  atualizado_em           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ano_remessa, cpf_cnpj_credor)
);

CREATE TABLE IF NOT EXISTS mart.despesa_composicao (
  ano_remessa             smallint    NOT NULL,
  id_entidade             numeric     NOT NULL,
  tipo_composicao         text        NOT NULL,
  codigo                  text        NOT NULL,
  rotulo                  text        NOT NULL,
  valor_empenhado_liquido numeric(19,2) NOT NULL DEFAULT 0,
  valor_pago              numeric(19,2) NOT NULL DEFAULT 0,
  atualizado_em           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ano_remessa, id_entidade, tipo_composicao, codigo)
);

CREATE TABLE IF NOT EXISTS mart.despesa_alertas (
  ano_remessa       smallint    NOT NULL,
  id_entidade       numeric     NOT NULL,
  tipo_alerta       text        NOT NULL,
  nivel             text        NOT NULL DEFAULT 'info',
  descricao         text        NOT NULL,
  valor_referencia  numeric(19,2) NULL,
  detalhe_json      jsonb       NULL,
  atualizado_em     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ano_remessa, id_entidade, tipo_alerta)
);

CREATE INDEX IF NOT EXISTS idx_mart_resumo_ano           ON mart.despesa_resumo (ano_remessa);
CREATE INDEX IF NOT EXISTS idx_mart_evolucao_ano         ON mart.despesa_evolucao_mensal (ano_remessa);
CREATE INDEX IF NOT EXISTS idx_mart_ranking_entes_ano    ON mart.despesa_ranking_entes (ano_remessa);
CREATE INDEX IF NOT EXISTS idx_mart_credores_ano         ON mart.despesa_ranking_credores (ano_remessa);
CREATE INDEX IF NOT EXISTS idx_mart_credores_credor      ON mart.despesa_ranking_credores (cpf_cnpj_credor);
CREATE INDEX IF NOT EXISTS idx_mart_composicao_tipo      ON mart.despesa_composicao (ano_remessa, tipo_composicao);
CREATE INDEX IF NOT EXISTS idx_mart_alertas_tipo         ON mart.despesa_alertas (ano_remessa, tipo_alerta);
