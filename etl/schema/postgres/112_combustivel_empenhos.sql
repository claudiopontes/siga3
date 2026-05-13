-- Tabelas e função para o painel Combustível (Empenhos) — APC Polanco.
-- Depende de: 050_combustivel.sql (demais tabelas de combustível)

-- Tabela de dados brutos sincronizados do SQL Server APC
CREATE TABLE IF NOT EXISTS public.tb_despesa_combustivel_polanco (
  id_despesa          bigint        PRIMARY KEY,
  id_entidade         integer,
  entidade            text,
  ano_empenho         integer,
  data_empenho        date,
  numero_empenho      text,
  historico_empenho   text,
  credor              text,
  nome_credor         text,
  numero_elemento_despesa text,
  elemento_despesa    text,
  numero_funcao       text,
  funcao              text,
  numero_subfuncao    text,
  subfuncao           text,
  valor_empenho       numeric(18,2),
  valor_liquidado     numeric(18,2),
  eh_combustivel      boolean       NOT NULL DEFAULT TRUE,
  tipo_combustivel    text          NOT NULL,
  forma_fornecimento  text          NOT NULL,
  regra_match         text          NOT NULL,
  dt_carga_etl        timestamptz   NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tb_despesa_comb_polanco_data
  ON public.tb_despesa_combustivel_polanco (data_empenho);

CREATE INDEX IF NOT EXISTS idx_tb_despesa_comb_polanco_entidade_data
  ON public.tb_despesa_combustivel_polanco (id_entidade, data_empenho);

CREATE INDEX IF NOT EXISTS idx_tb_despesa_comb_polanco_tipo_data
  ON public.tb_despesa_combustivel_polanco (tipo_combustivel, data_empenho);

CREATE INDEX IF NOT EXISTS idx_tb_despesa_comb_polanco_nome_credor
  ON public.tb_despesa_combustivel_polanco (nome_credor);

-- Tabela agregada por mês/entidade/tipo/forma/credor
CREATE TABLE IF NOT EXISTS public.combustivel_empenho_mensal (
  ano                smallint      NOT NULL,
  mes                smallint      NOT NULL,
  entidade           varchar(250)  NOT NULL DEFAULT '',
  tipo_combustivel   varchar(100)  NOT NULL DEFAULT '',
  forma_fornecimento varchar(100)  NOT NULL DEFAULT '',
  nome_credor        varchar(250)  NOT NULL DEFAULT '',
  valor_empenho      numeric(19,2) NOT NULL DEFAULT 0,
  valor_liquidado    numeric(19,2) NOT NULL DEFAULT 0,
  qtd_empenhos       integer       NOT NULL DEFAULT 0,
  atualizado_em      timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT pk_combustivel_empenho_mensal
    PRIMARY KEY (ano, mes, entidade, tipo_combustivel, forma_fornecimento, nome_credor)
);

CREATE INDEX IF NOT EXISTS idx_comb_emp_mensal_ano_mes
  ON public.combustivel_empenho_mensal (ano, mes);

CREATE INDEX IF NOT EXISTS idx_comb_emp_mensal_entidade
  ON public.combustivel_empenho_mensal (entidade);

-- Função que trunca e repopula combustivel_empenho_mensal a partir dos dados brutos
CREATE OR REPLACE FUNCTION public.fn_refresh_combustivel_empenho_mensal()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  TRUNCATE TABLE public.combustivel_empenho_mensal;

  INSERT INTO public.combustivel_empenho_mensal (
    ano, mes, entidade, tipo_combustivel, forma_fornecimento,
    nome_credor, valor_empenho, valor_liquidado, qtd_empenhos, atualizado_em
  )
  SELECT
    EXTRACT(YEAR  FROM data_empenho::date)::smallint          AS ano,
    EXTRACT(MONTH FROM data_empenho::date)::smallint          AS mes,
    COALESCE(NULLIF(TRIM(entidade),           ''), 'N/D')     AS entidade,
    COALESCE(NULLIF(TRIM(tipo_combustivel),   ''), 'N/D')     AS tipo_combustivel,
    COALESCE(NULLIF(TRIM(forma_fornecimento), ''), 'N/D')     AS forma_fornecimento,
    COALESCE(NULLIF(TRIM(nome_credor),        ''), 'N/D')     AS nome_credor,
    SUM(COALESCE(valor_empenho,   0))::numeric(19,2)          AS valor_empenho,
    SUM(COALESCE(valor_liquidado, 0))::numeric(19,2)          AS valor_liquidado,
    COUNT(*)::integer                                         AS qtd_empenhos,
    NOW()                                                     AS atualizado_em
  FROM public.tb_despesa_combustivel_polanco
  WHERE data_empenho IS NOT NULL
  GROUP BY 1, 2, 3, 4, 5, 6;
END;
$$;
