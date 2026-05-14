-- 244_pauta_julgamento_movimentacao.sql
-- Histórico de movimentações dos processos da pauta de julgamento.
-- Fonte: EPROCESS.processo.vwMovimentacoes
--
-- A view pode gerar múltiplas linhas por ID_ITEM_FLUXO_INSTAN quando há mais de
-- um documento vinculado à mesma fase. O índice único usa COALESCE para tratar
-- o caso em que id_processo_arquivo é NULL (fase sem documento associado).

CREATE TABLE IF NOT EXISTS public.pauta_julgamento_movimentacao (
  id                       bigserial   PRIMARY KEY,
  processo_id              integer     NOT NULL,       -- cod_processo (ID_PROC_INSTAN)
  carga_id                 bigint      NOT NULL REFERENCES public.pauta_julgamento_carga (id),
  id_item_fluxo_instan     integer     NOT NULL,       -- PK da instância de fluxo no EPROCESS
  dt_mov                   timestamptz NULL,           -- chegada ao setor
  dt_saida                 timestamptz NULL,           -- saída do setor
  grupo_id                 integer     NULL,
  grupo_desc               text        NULL,           -- nome do grupo/setor
  item_fluxo_id            integer     NULL,
  item_fluxo_desc          text        NULL,           -- descrição da fase
  id_atividade             integer     NULL,
  atividade                text        NULL,
  fase                     text        NULL,
  id_setor                 integer     NULL,
  usuario_login            text        NULL,
  nome_usuario             text        NULL,
  id_processo_arquivo      integer     NULL,           -- arquivo gerado nesta fase (pode ser NULL)
  tipo_documento           text        NULL,           -- tipo do documento desta fase
  ultimo_tipo_documento    text        NULL,           -- tipo do último documento do processo
  data_criacao_ultimo_doc  timestamptz NULL,
  coletado_em              timestamptz NOT NULL DEFAULT now()
);

-- Índice único funcional: uma linha por (fase, arquivo), tratando NULL como -1
CREATE UNIQUE INDEX IF NOT EXISTS idx_pjm_fluxo_arquivo
  ON public.pauta_julgamento_movimentacao (id_item_fluxo_instan, COALESCE(id_processo_arquivo, -1));

CREATE INDEX IF NOT EXISTS idx_pjm_processo_id ON public.pauta_julgamento_movimentacao (processo_id);
CREATE INDEX IF NOT EXISTS idx_pjm_dt_mov      ON public.pauta_julgamento_movimentacao (dt_mov DESC);
CREATE INDEX IF NOT EXISTS idx_pjm_grupo_id    ON public.pauta_julgamento_movimentacao (grupo_id);
