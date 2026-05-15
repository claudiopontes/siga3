-- 247_pauta_julgamento_arquivo_enrich.sql
-- Adiciona campos de validade e desentranhamento à tabela de arquivos.
-- Fonte: EPROCESS.processo.vwProcessoArquivo (substituindo vwArquivoProcesso)
--   ic_valido      → F_PROCESSO_ARQUIVO.IC_VALD
--   desentranhado  → calculado pela view via tabela F_DESENTRANHAMENTO

ALTER TABLE public.pauta_julgamento_arquivo
  ADD COLUMN IF NOT EXISTS ic_valido     boolean NULL,  -- false = arquivo invalidado no eProcess
  ADD COLUMN IF NOT EXISTS desentranhado boolean NULL;  -- true = páginas desentranhadas do processo
