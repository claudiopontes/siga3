-- =============================================================
-- Supabase schema - tb_despesa_combustivel_polanco
-- Fonte de sincronizacao: APC.dbo.tb_despesa_combustivel_polanco
-- =============================================================

CREATE TABLE IF NOT EXISTS public.tb_despesa_combustivel_polanco (
  id_despesa BIGINT PRIMARY KEY,
  id_entidade INTEGER,
  entidade TEXT,
  ano_empenho INTEGER,
  data_empenho DATE,
  numero_empenho TEXT,
  historico_empenho TEXT,
  credor TEXT,
  nome_credor TEXT,
  numero_elemento_despesa TEXT,
  elemento_despesa TEXT,
  numero_funcao TEXT,
  funcao TEXT,
  numero_subfuncao TEXT,
  subfuncao TEXT,
  valor_empenho NUMERIC(18,2),
  valor_liquidado NUMERIC(18,2),
  eh_combustivel BOOLEAN NOT NULL DEFAULT TRUE,
  tipo_combustivel TEXT NOT NULL,
  forma_fornecimento TEXT NOT NULL,
  regra_match TEXT NOT NULL,
  dt_carga_etl TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tb_despesa_comb_polanco_data
  ON public.tb_despesa_combustivel_polanco (data_empenho);

CREATE INDEX IF NOT EXISTS idx_tb_despesa_comb_polanco_entidade_data
  ON public.tb_despesa_combustivel_polanco (id_entidade, data_empenho);

CREATE INDEX IF NOT EXISTS idx_tb_despesa_comb_polanco_tipo_data
  ON public.tb_despesa_combustivel_polanco (tipo_combustivel, data_empenho);

CREATE INDEX IF NOT EXISTS idx_tb_despesa_comb_polanco_nome_credor
  ON public.tb_despesa_combustivel_polanco (nome_credor);

ALTER TABLE public.tb_despesa_combustivel_polanco ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_tb_despesa_combustivel_polanco_anon" ON public.tb_despesa_combustivel_polanco;
CREATE POLICY "read_tb_despesa_combustivel_polanco_anon"
ON public.tb_despesa_combustivel_polanco
FOR SELECT
TO anon, authenticated
USING (true);
