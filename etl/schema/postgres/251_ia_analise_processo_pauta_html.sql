-- 251_ia_analise_processo_pauta_html.sql
-- Adiciona colunas de HTML pré-renderizado à tabela de cache de análise IA.
-- O HTML é gerado localmente a partir do JSON — nunca pela IA diretamente.

ALTER TABLE IF EXISTS public.ia_analise_processo_pauta
  ADD COLUMN IF NOT EXISTS html_linha_sucinta  text                        NULL,
  ADD COLUMN IF NOT EXISTS html_relatorio      text                        NULL,
  ADD COLUMN IF NOT EXISTS formato_html_versao text                        NULL,
  ADD COLUMN IF NOT EXISTS revisado            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS revisado_por        text                        NULL,
  ADD COLUMN IF NOT EXISTS revisado_em         timestamp without time zone NULL;
