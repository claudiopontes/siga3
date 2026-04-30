-- =============================================================
-- Seguranca/RLS - Paineis Combustivel e Combustivel Empenhos
-- Garante leitura para anon/authenticated nas tabelas usadas na UI
-- =============================================================

ALTER TABLE IF EXISTS public.combustivel_mensal ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.combustivel_emitente ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.aux_dim_municipio ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.aux_dim_entidade ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tb_despesa_combustivel_polanco ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_combustivel_mensal_anon" ON public.combustivel_mensal;
CREATE POLICY "read_combustivel_mensal_anon"
ON public.combustivel_mensal
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "read_combustivel_emitente_anon" ON public.combustivel_emitente;
CREATE POLICY "read_combustivel_emitente_anon"
ON public.combustivel_emitente
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "read_aux_dim_municipio_anon" ON public.aux_dim_municipio;
CREATE POLICY "read_aux_dim_municipio_anon"
ON public.aux_dim_municipio
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "read_aux_dim_entidade_anon" ON public.aux_dim_entidade;
CREATE POLICY "read_aux_dim_entidade_anon"
ON public.aux_dim_entidade
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "read_tb_despesa_combustivel_polanco_anon" ON public.tb_despesa_combustivel_polanco;
CREATE POLICY "read_tb_despesa_combustivel_polanco_anon"
ON public.tb_despesa_combustivel_polanco
FOR SELECT
TO anon, authenticated
USING (true);

ALTER TABLE IF EXISTS public.combustivel_empenho_mensal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_combustivel_empenho_mensal_anon" ON public.combustivel_empenho_mensal;
CREATE POLICY "read_combustivel_empenho_mensal_anon"
ON public.combustivel_empenho_mensal
FOR SELECT
TO anon, authenticated
USING (true);
