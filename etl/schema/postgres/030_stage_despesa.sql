-- 030_stage_despesa.sql
-- Tabela staging para carga full da despesa (sem PK para facilitar bulk insert)

CREATE TABLE IF NOT EXISTS stage.fato_empenho_full_stg (
  id_despesa                        bigint,
  id_remessa                        bigint,
  ano_remessa                       smallint,
  numero_remessa                    smallint,
  id_entidade                       numeric,
  id_acao                           integer,
  id_programa                       integer,
  id_unidade_orcamentaria           integer,
  id_fonte_destinacao_recurso       integer,
  id_aplicacao                      integer,
  numero_funcao                     smallint,
  numero_subfuncao                  smallint,
  numero_categoria_economica        smallint,
  numero_grupo_natureza_despesa     smallint,
  numero_modalidade_aplicacao       smallint,
  numero_elemento_despesa           smallint,
  cpf_cnpj_credor                   varchar(14),
  tipo_credor                       smallint,
  numero_empenho                    bigint,
  ano_empenho                       smallint,
  data_empenho                      date,
  tipo_empenho                      char(1),
  numero_empenho_ref                bigint,
  tipo_lancamento                   varchar(10),
  historico_empenho                 text,
  valor_empenho                     numeric(19,2) DEFAULT 0,
  valor_anulado                     numeric(19,2) DEFAULT 0,
  valor_liquidado                   numeric(19,2) DEFAULT 0,
  valor_pago                        numeric(19,2) DEFAULT 0,
  valor_retido                      numeric(19,2) DEFAULT 0,
  valor_empenhado_liquido           numeric(19,2) DEFAULT 0,
  valor_a_liquidar                  numeric(19,2) DEFAULT 0,
  valor_a_pagar                     numeric(19,2) DEFAULT 0,
  etl_carregado_em                  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stg_fe_id_despesa
  ON stage.fato_empenho_full_stg (id_despesa);
