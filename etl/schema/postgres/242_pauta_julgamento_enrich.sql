-- 242_pauta_julgamento_enrich.sql
-- Adiciona colunas enriquecidas às tabelas de pauta de julgamento.
-- Sessão: usa dbo.vw_Sessao (orgao_julgador, dt_encerramento, contadores).
-- Item: cross-db join com EPROCESS.processo.vwProc_Eletronico (número formatado, objeto, classe, parte).

-- pauta_julgamento_sessao
ALTER TABLE public.pauta_julgamento_sessao
  ADD COLUMN IF NOT EXISTS orgao_julgador   text        NULL,
  ADD COLUMN IF NOT EXISTS dt_encerramento  timestamptz NULL,
  ADD COLUMN IF NOT EXISTS qtd_julgado      integer     NULL,
  ADD COLUMN IF NOT EXISTS qtd_vistas       integer     NULL,
  ADD COLUMN IF NOT EXISTS qtd_julgamento   integer     NULL;

-- pauta_julgamento_item
ALTER TABLE public.pauta_julgamento_item
  ADD COLUMN IF NOT EXISTS numero_processo_fmt  text NULL,   -- Num_proc_ano (ex: TC-001/2024)
  ADD COLUMN IF NOT EXISTS objeto               text NULL,   -- DS_OBJE
  ADD COLUMN IF NOT EXISTS nome_classe          text NULL,   -- assunto + classe
  ADD COLUMN IF NOT EXISTS assunto              text NULL,   -- NM_ASSUN
  ADD COLUMN IF NOT EXISTS nome_1_parte         text NULL,   -- primeira parte do processo
  ADD COLUMN IF NOT EXISTS situacao_funcional   text NULL,   -- Ativo / Arquivado / Apensado
  ADD COLUMN IF NOT EXISTS advogado             text NULL;   -- campo advogado da pauta
