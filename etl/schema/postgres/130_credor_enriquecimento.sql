-- 130_credor_enriquecimento.sql
-- Tabela de enriquecimento cadastral de credores (CPF/CNPJ)
-- e log de auditoria das consultas de enriquecimento.

-- Extensão trigram para buscas por nome (falha silenciosa se não disponível)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- -------------------------------------------------------
-- dw.dim_credor_enriquecido
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS dw.dim_credor_enriquecido (
  cpf_cnpj             varchar(14)  PRIMARY KEY,
  tipo_documento       text         NOT NULL,             -- CPF | CNPJ | DESCONHECIDO
  nome_original        text         NULL,                 -- nome vindo de dim_credor
  nome_enriquecido     text         NULL,                 -- nome vindo de fonte externa/interna
  nome_exibicao        text         NULL,                 -- nome final a exibir nas telas
  fonte_enriquecimento text         NULL,                 -- BASE_INTERNA | BRASILAPI | RECEITAWS | ...
  situacao_cadastral   text         NULL,
  natureza_juridica    text         NULL,
  cnae_principal       text         NULL,
  municipio            text         NULL,
  uf                   text         NULL,
  endereco             text         NULL,
  bairro               text         NULL,
  cep                  text         NULL,
  telefone             text         NULL,
  email                text         NULL,
  data_nascimento      date         NULL,
  nome_mae             text         NULL,
  data_consulta        timestamptz  NULL,
  status_consulta      text         NULL,                 -- JA_IDENTIFICADO | PENDENTE_CNPJ | PENDENTE_CPF_INTERNO | DOCUMENTO_INVALIDO | ENRIQUECIDO | ERRO
  erro_consulta        text         NULL,
  atualizado_em        timestamptz  NOT NULL DEFAULT now()
);

-- Índices simples
CREATE INDEX IF NOT EXISTS idx_credor_enr_tipo_doc
  ON dw.dim_credor_enriquecido (tipo_documento);

CREATE INDEX IF NOT EXISTS idx_credor_enr_status
  ON dw.dim_credor_enriquecido (status_consulta);

CREATE INDEX IF NOT EXISTS idx_credor_enr_nome_exibicao
  ON dw.dim_credor_enriquecido (nome_exibicao);

CREATE INDEX IF NOT EXISTS idx_credor_enr_fonte
  ON dw.dim_credor_enriquecido (fonte_enriquecimento);

CREATE INDEX IF NOT EXISTS idx_credor_enr_nome_lower
  ON dw.dim_credor_enriquecido (lower(nome_exibicao));

-- Índice GIN trigram (depende de pg_trgm; falha silenciosa em DO block)
DO $$
BEGIN
  CREATE INDEX idx_credor_enr_nome_trgm
    ON dw.dim_credor_enriquecido USING gin (nome_exibicao gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Índice trigram em dim_credor_enriquecido não criado: %', SQLERRM;
END;
$$;

-- -------------------------------------------------------
-- audit.credor_enriquecimento_log
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit.credor_enriquecimento_log (
  id             bigserial    PRIMARY KEY,
  cpf_cnpj       varchar(14)  NOT NULL,
  tipo_documento text         NOT NULL,
  fonte          text         NULL,
  status         text         NOT NULL,
  mensagem       text         NULL,
  executado_em   timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_credor_log_doc
  ON audit.credor_enriquecimento_log (cpf_cnpj);

CREATE INDEX IF NOT EXISTS idx_audit_credor_log_status
  ON audit.credor_enriquecimento_log (status);

CREATE INDEX IF NOT EXISTS idx_audit_credor_log_exec
  ON audit.credor_enriquecimento_log (executado_em DESC);
