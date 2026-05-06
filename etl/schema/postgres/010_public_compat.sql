-- 010_public_compat.sql
-- Tabelas públicas compatíveis com o modelo Supabase

CREATE TABLE IF NOT EXISTS public.dim_ente (
  id_ente         bigint      PRIMARY KEY,
  codigo          integer     NOT NULL,
  nome            text        NOT NULL,
  populacao       integer     NULL,
  cod_ibge        integer     NULL,
  regiao          text        NULL,
  cnpj_mascara    text        NULL,
  cod_municipio   text        NULL,
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_dim_ente_codigo UNIQUE (codigo)
);

CREATE TABLE IF NOT EXISTS public.dim_entidade (
  id_entidade   bigint      PRIMARY KEY,
  id_ente       bigint      NOT NULL REFERENCES public.dim_ente (id_ente),
  nome          text        NOT NULL,
  inativo       smallint    NOT NULL DEFAULT 0,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dim_entidade_id_ente ON public.dim_entidade (id_ente);

CREATE TABLE IF NOT EXISTS public.dim_credor (
  cnpj_cpf              varchar(14) PRIMARY KEY,
  inscricao_estadual    varchar(15) NULL,
  inscricao_municipal   varchar(15) NULL,
  nome                  varchar(250) NULL,
  endereco              varchar(30) NULL,
  bairro                varchar(15) NULL,
  cidade                varchar(15) NULL,
  uf                    varchar(2)  NULL,
  cep                   varchar(8)  NULL,
  fone                  varchar(15) NULL,
  atualizado_em         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fato_empenho (
  id_despesa                        bigint      PRIMARY KEY,
  id_remessa                        bigint      NOT NULL,
  ano_remessa                       smallint    NOT NULL,
  numero_remessa                    smallint    NOT NULL,
  id_entidade                       numeric     NOT NULL,
  id_acao                           integer     NULL,
  id_programa                       integer     NULL,
  id_unidade_orcamentaria           integer     NULL,
  id_fonte_destinacao_recurso       integer     NULL,
  id_aplicacao                      integer     NULL,
  numero_funcao                     smallint    NULL,
  numero_subfuncao                  smallint    NULL,
  numero_categoria_economica        smallint    NULL,
  numero_grupo_natureza_despesa     smallint    NULL,
  numero_modalidade_aplicacao       smallint    NULL,
  numero_elemento_despesa           smallint    NULL,
  cpf_cnpj_credor                   varchar(14) NULL,
  tipo_credor                       smallint    NULL,
  numero_empenho                    bigint      NULL,
  ano_empenho                       smallint    NULL,
  data_empenho                      date        NULL,
  tipo_empenho                      char(1)     NULL,
  numero_empenho_ref                bigint      NULL,
  tipo_lancamento                   varchar(10) NULL,
  historico_empenho                 text        NULL,
  valor_empenho                     numeric(19,2) NOT NULL DEFAULT 0,
  valor_anulado                     numeric(19,2) NOT NULL DEFAULT 0,
  valor_liquidado                   numeric(19,2) NOT NULL DEFAULT 0,
  valor_pago                        numeric(19,2) NOT NULL DEFAULT 0,
  valor_retido                      numeric(19,2) NOT NULL DEFAULT 0,
  valor_empenhado_liquido           numeric(19,2) NOT NULL DEFAULT 0,
  valor_a_liquidar                  numeric(19,2) NOT NULL DEFAULT 0,
  valor_a_pagar                     numeric(19,2) NOT NULL DEFAULT 0,
  etl_carregado_em                  timestamptz NOT NULL DEFAULT now(),
  etl_atualizado_em                 timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_fe_ano_remessa        ON public.fato_empenho (ano_remessa, numero_remessa);
CREATE INDEX IF NOT EXISTS idx_fe_id_entidade        ON public.fato_empenho (id_entidade, ano_remessa);
CREATE INDEX IF NOT EXISTS idx_fe_id_remessa         ON public.fato_empenho (id_remessa);
CREATE INDEX IF NOT EXISTS idx_fe_credor             ON public.fato_empenho (cpf_cnpj_credor) WHERE cpf_cnpj_credor IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fe_classificacao      ON public.fato_empenho (numero_categoria_economica, numero_grupo_natureza_despesa, numero_elemento_despesa);
CREATE INDEX IF NOT EXISTS idx_fe_ano_entidade_data  ON public.fato_empenho (ano_remessa, id_entidade, data_empenho);
CREATE INDEX IF NOT EXISTS idx_fe_ano_credor         ON public.fato_empenho (ano_remessa, cpf_cnpj_credor) WHERE cpf_cnpj_credor IS NOT NULL;
