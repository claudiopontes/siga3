-- 270_inep_escolas_indigena_quilombola.sql
-- Fase educacional especial: flags de modalidades indígena e quilombola
-- em public.dim_escola_inep. Vem do Censo Escolar (IN_EDUCACAO_INDIGENA
-- e IN_EDUCACAO_QUILOMBOLA). Relevante demograficamente para o Acre.

ALTER TABLE public.dim_escola_inep
  ADD COLUMN IF NOT EXISTS ed_indigena   boolean NULL,
  ADD COLUMN IF NOT EXISTS ed_quilombola boolean NULL;

CREATE INDEX IF NOT EXISTS idx_dim_escola_inep_modalidade
  ON public.dim_escola_inep (ed_indigena, ed_quilombola)
  WHERE ed_indigena IS TRUE OR ed_quilombola IS TRUE;
