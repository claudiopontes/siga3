-- 140_mart_credor_despesa.sql
-- Marts consolidadas de credores para pesquisa e detalhe.

-- -------------------------------------------------------
-- mart.credor_resumo
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.credor_resumo (
  cpf_cnpj_credor          varchar(14)   PRIMARY KEY,
  nome_credor              text          NULL,
  nome_exibicao            text          NULL,
  tipo_documento           text          NULL,
  fonte_enriquecimento     text          NULL,
  data_consulta            timestamptz   NULL,
  status_consulta          text          NULL,
  valor_empenhado_liquido  numeric(19,2) NOT NULL DEFAULT 0,
  valor_liquidado          numeric(19,2) NOT NULL DEFAULT 0,
  valor_pago               numeric(19,2) NOT NULL DEFAULT 0,
  valor_a_liquidar         numeric(19,2) NOT NULL DEFAULT 0,
  valor_a_pagar            numeric(19,2) NOT NULL DEFAULT 0,
  qtd_empenhos             integer       NOT NULL DEFAULT 0,
  qtd_entidades            integer       NOT NULL DEFAULT 0,
  primeiro_empenho         date          NULL,
  ultimo_empenho           date          NULL,
  atualizado_em            timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credor_resumo_nome
  ON mart.credor_resumo (nome_exibicao);

CREATE INDEX IF NOT EXISTS idx_credor_resumo_tipo
  ON mart.credor_resumo (tipo_documento);

-- -------------------------------------------------------
-- mart.credor_evolucao_mensal
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.credor_evolucao_mensal (
  cpf_cnpj_credor          varchar(14)   NOT NULL,
  ano_remessa              integer       NOT NULL,
  mes_empenho              date          NOT NULL,
  valor_empenhado_liquido  numeric(19,2) NOT NULL DEFAULT 0,
  valor_liquidado          numeric(19,2) NOT NULL DEFAULT 0,
  valor_pago               numeric(19,2) NOT NULL DEFAULT 0,
  atualizado_em            timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (cpf_cnpj_credor, mes_empenho)
);

CREATE INDEX IF NOT EXISTS idx_credor_evolucao_doc_mes
  ON mart.credor_evolucao_mensal (cpf_cnpj_credor, mes_empenho);

-- -------------------------------------------------------
-- mart.credor_entidades
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.credor_entidades (
  cpf_cnpj_credor          varchar(14)   NOT NULL,
  id_entidade              numeric       NOT NULL,
  nome_entidade            text          NULL,
  valor_empenhado_liquido  numeric(19,2) NOT NULL DEFAULT 0,
  valor_liquidado          numeric(19,2) NOT NULL DEFAULT 0,
  valor_pago               numeric(19,2) NOT NULL DEFAULT 0,
  valor_a_pagar            numeric(19,2) NOT NULL DEFAULT 0,
  qtd_empenhos             integer       NOT NULL DEFAULT 0,
  atualizado_em            timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (cpf_cnpj_credor, id_entidade)
);

CREATE INDEX IF NOT EXISTS idx_credor_entidades_doc_emp
  ON mart.credor_entidades (cpf_cnpj_credor, valor_empenhado_liquido DESC);

-- -------------------------------------------------------
-- mart.credor_empenhos_relevantes
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.credor_empenhos_relevantes (
  cpf_cnpj_credor          varchar(14)   NOT NULL,
  id_despesa               bigint        NOT NULL,
  id_entidade              numeric       NOT NULL,
  nome_entidade            text          NULL,
  ano_remessa              integer       NULL,
  numero_remessa           integer       NULL,
  ano_empenho              integer       NULL,
  numero_empenho           bigint        NULL,
  data_empenho             date          NULL,
  historico_empenho        text          NULL,
  valor_empenhado_liquido  numeric(19,2) NOT NULL DEFAULT 0,
  valor_liquidado          numeric(19,2) NOT NULL DEFAULT 0,
  valor_pago               numeric(19,2) NOT NULL DEFAULT 0,
  valor_a_pagar            numeric(19,2) NOT NULL DEFAULT 0,
  atualizado_em            timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (cpf_cnpj_credor, id_despesa)
);

CREATE INDEX IF NOT EXISTS idx_credor_emp_rel_doc_valor
  ON mart.credor_empenhos_relevantes (cpf_cnpj_credor, valor_empenhado_liquido DESC);

CREATE INDEX IF NOT EXISTS idx_credor_emp_rel_doc_data
  ON mart.credor_empenhos_relevantes (cpf_cnpj_credor, data_empenho DESC);

-- -------------------------------------------------------
-- mart.credor_pesquisa
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.credor_pesquisa (
  cpf_cnpj_credor          varchar(14)   PRIMARY KEY,
  nome_exibicao            text          NULL,
  nome_original            text          NULL,
  nome_enriquecido         text          NULL,
  tipo_documento           text          NULL,
  fonte_enriquecimento     text          NULL,
  status_consulta          text          NULL,
  municipio                text          NULL,
  uf                       text          NULL,
  valor_empenhado_liquido  numeric(19,2) NOT NULL DEFAULT 0,
  valor_liquidado          numeric(19,2) NOT NULL DEFAULT 0,
  valor_pago               numeric(19,2) NOT NULL DEFAULT 0,
  valor_a_pagar            numeric(19,2) NOT NULL DEFAULT 0,
  qtd_empenhos             integer       NOT NULL DEFAULT 0,
  qtd_entidades            integer       NOT NULL DEFAULT 0,
  primeiro_empenho         date          NULL,
  ultimo_empenho           date          NULL,
  termo_pesquisa           text          NULL,
  atualizado_em            timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credor_pesquisa_doc
  ON mart.credor_pesquisa (cpf_cnpj_credor);

CREATE INDEX IF NOT EXISTS idx_credor_pesquisa_nome
  ON mart.credor_pesquisa (nome_exibicao);

CREATE INDEX IF NOT EXISTS idx_credor_pesquisa_tipo
  ON mart.credor_pesquisa (tipo_documento);

-- Índices GIN trigram (dependem de pg_trgm; falha silenciosa)
DO $$
BEGIN
  CREATE INDEX idx_credor_pesquisa_termo_trgm
    ON mart.credor_pesquisa USING gin (termo_pesquisa gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Índice trigram em credor_pesquisa.termo_pesquisa não criado: %', SQLERRM;
END;
$$;

DO $$
BEGIN
  CREATE INDEX idx_credor_pesquisa_nome_trgm
    ON mart.credor_pesquisa USING gin (nome_exibicao gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Índice trigram em credor_pesquisa.nome_exibicao não criado: %', SQLERRM;
END;
$$;
