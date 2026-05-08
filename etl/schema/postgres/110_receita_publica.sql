-- 110_receita_publica.sql
-- Tabela para o ETL Painel Receita Publica

CREATE TABLE IF NOT EXISTS public.receita_publica_categoria_mensal (
  id                                bigserial     PRIMARY KEY,
  id_remessa                        integer       NOT NULL,
  id_entidade_cjur                  integer       NULL,
  id_entidade                       integer       NOT NULL,
  ano                               integer       NOT NULL,
  mes                               integer       NOT NULL,
  id_natureza_receita_orcamentaria  integer       NULL,
  id_catreceita                     integer       NULL,
  codigo                            text          NOT NULL,
  natureza_codigo                   text          NULL,
  natureza_nome                     text          NULL,
  natureza_descricao                text          NULL,
  natureza_nivel                    integer       NULL,
  natureza_tipo                     text          NULL,
  natureza_ano_inicio               integer       NULL,
  natureza_ano_fim                  integer       NULL,
  numero_fonte_recurso              integer       NULL,
  fonte_classificacao               text          NULL,
  fonte_nome                        text          NULL,
  codigo_conta_contabil             text          NOT NULL,
  tipo_receita                      text          NOT NULL,
  previsao_inicial                  numeric(19,2) NOT NULL DEFAULT 0,
  previsao_atualizada               numeric(19,2) NOT NULL DEFAULT 0,
  receita_realizada                 numeric(19,2) NOT NULL DEFAULT 0,
  registros_origem                  integer       NOT NULL DEFAULT 0,
  atualizado_em                     timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receita_ano_mes          ON public.receita_publica_categoria_mensal (ano, mes);
CREATE INDEX IF NOT EXISTS idx_receita_id_entidade      ON public.receita_publica_categoria_mensal (id_entidade, ano, mes);
CREATE INDEX IF NOT EXISTS idx_receita_id_remessa       ON public.receita_publica_categoria_mensal (id_remessa);
CREATE INDEX IF NOT EXISTS idx_receita_natureza         ON public.receita_publica_categoria_mensal (id_natureza_receita_orcamentaria);
