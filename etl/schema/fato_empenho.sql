-- =============================================================
-- Supabase schema - Fato Empenho
-- Fonte: audit.vw_fato_empenho_polanco (SQL Server - APC)
-- Executar no SQL Editor do Supabase antes da primeira carga ETL
-- =============================================================

CREATE TABLE IF NOT EXISTS public.fato_empenho (
  id_despesa                    BIGINT        PRIMARY KEY,
  id_remessa                    BIGINT        NOT NULL,
  ano_remessa                   SMALLINT      NOT NULL,
  numero_remessa                INTEGER       NOT NULL,
  id_entidade                   INTEGER       NOT NULL,
  id_acao                       INTEGER       NULL,
  id_programa                   INTEGER       NULL,
  id_unidade_orcamentaria       INTEGER       NULL,
  id_fonte_destinacao_recurso   INTEGER       NULL,
  id_aplicacao                  INTEGER       NULL,
  numero_funcao                 SMALLINT      NULL,
  numero_subfuncao              SMALLINT      NULL,
  numero_categoria_economica    SMALLINT      NULL,
  numero_grupo_natureza_despesa SMALLINT      NULL,
  numero_modalidade_aplicacao   SMALLINT      NULL,
  numero_elemento_despesa       SMALLINT      NULL,
  cpf_cnpj_credor               VARCHAR(18)   NULL,
  tipo_credor                   SMALLINT      NULL,
  numero_empenho                INTEGER       NULL,
  ano_empenho                   SMALLINT      NULL,
  data_empenho                  DATE          NULL,
  tipo_empenho                  CHAR(1)       NULL,
  numero_empenho_ref            INTEGER       NULL,
  tipo_lancamento               VARCHAR(10)   NULL,
  historico_empenho             TEXT          NULL,
  valor_empenho                 NUMERIC(19,2) NOT NULL DEFAULT 0,
  valor_anulado                 NUMERIC(19,2) NOT NULL DEFAULT 0,
  valor_liquidado               NUMERIC(19,2) NOT NULL DEFAULT 0,
  valor_pago                    NUMERIC(19,2) NOT NULL DEFAULT 0,
  valor_retido                  NUMERIC(19,2) NOT NULL DEFAULT 0,
  valor_empenhado_liquido       NUMERIC(19,2) NOT NULL DEFAULT 0,
  valor_a_liquidar              NUMERIC(19,2) NOT NULL DEFAULT 0,
  valor_a_pagar                 NUMERIC(19,2) NOT NULL DEFAULT 0,
  etl_carregado_em              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  etl_atualizado_em             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Índices para as queries mais comuns do painel
CREATE INDEX IF NOT EXISTS idx_fato_empenho_ano_empenho
  ON public.fato_empenho (ano_empenho);

CREATE INDEX IF NOT EXISTS idx_fato_empenho_id_entidade
  ON public.fato_empenho (id_entidade);

CREATE INDEX IF NOT EXISTS idx_fato_empenho_ano_entidade
  ON public.fato_empenho (ano_empenho, id_entidade);

CREATE INDEX IF NOT EXISTS idx_fato_empenho_credor
  ON public.fato_empenho (cpf_cnpj_credor);

CREATE INDEX IF NOT EXISTS idx_fato_empenho_data
  ON public.fato_empenho (data_empenho);

CREATE INDEX IF NOT EXISTS idx_fato_empenho_remessa
  ON public.fato_empenho (ano_remessa, numero_remessa);

-- Row Level Security
ALTER TABLE public.fato_empenho ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_fato_empenho_anon" ON public.fato_empenho;
CREATE POLICY "read_fato_empenho_anon"
ON public.fato_empenho
FOR SELECT
TO anon, authenticated
USING (true);

-- =============================================================
-- Tabela de dimensão dim_credor (populada pelo ETL dimensoes-empenho)
-- =============================================================

CREATE TABLE IF NOT EXISTS public.dim_credor (
  cnpj_cpf             VARCHAR(18)   PRIMARY KEY,
  inscricao_estadual   VARCHAR(30)   NULL,
  inscricao_municipal  VARCHAR(30)   NULL,
  nome                 TEXT          NULL,
  endereco             TEXT          NULL,
  bairro               VARCHAR(100)  NULL,
  cidade               VARCHAR(100)  NULL,
  uf                   CHAR(2)       NULL,
  cep                  VARCHAR(10)   NULL,
  fone                 VARCHAR(20)   NULL,
  atualizado_em        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dim_credor_nome
  ON public.dim_credor (nome);

ALTER TABLE public.dim_credor ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_dim_credor_anon" ON public.dim_credor;
CREATE POLICY "read_dim_credor_anon"
ON public.dim_credor
FOR SELECT
TO anon, authenticated
USING (true);

-- =============================================================
-- Tabela de dimensão dim_aplicacao (populada pelo ETL dimensoes-empenho)
-- =============================================================

CREATE TABLE IF NOT EXISTS public.dim_aplicacao (
  id_aplicacao  BIGINT        PRIMARY KEY,
  codigo        VARCHAR(20)   NOT NULL,
  descricao     TEXT          NOT NULL,
  atualizado_em TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

ALTER TABLE public.dim_aplicacao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_dim_aplicacao_anon" ON public.dim_aplicacao;
CREATE POLICY "read_dim_aplicacao_anon"
ON public.dim_aplicacao
FOR SELECT
TO anon, authenticated
USING (true);
