-- 245_pauta_julgamento_nome_orgao.sql
-- Adiciona coluna nome_orgao ao item da pauta.
-- Fonte: EPROCESS.processo.vwProc_Eletronico.Cod_Orgao

ALTER TABLE public.pauta_julgamento_item
  ADD COLUMN IF NOT EXISTS nome_orgao text NULL;
