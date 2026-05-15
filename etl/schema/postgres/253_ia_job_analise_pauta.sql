-- Migration 253: tabelas de controle de job para geração em lote de análises de pauta IA
-- Criação de ia_job_analise_pauta e ia_job_analise_pauta_item com índice único parcial
-- que impede dois jobs ativos para a mesma sessão.

CREATE TABLE IF NOT EXISTS public.ia_job_analise_pauta (
  id                 bigserial PRIMARY KEY,
  sessao_id          integer NOT NULL,
  status             text    NOT NULL DEFAULT 'pendente',
  total_processos    integer NOT NULL DEFAULT 0,
  total_pendentes    integer NOT NULL DEFAULT 0,
  total_processados  integer NOT NULL DEFAULT 0,
  total_analisados   integer NOT NULL DEFAULT 0,
  total_ja_analisados integer NOT NULL DEFAULT 0,
  total_erros        integer NOT NULL DEFAULT 0,
  iniciado_por       text    NULL,
  criado_em          timestamp without time zone NOT NULL DEFAULT now(),
  iniciado_em        timestamp without time zone NULL,
  finalizado_em      timestamp without time zone NULL,
  mensagem           text    NULL,
  erro               text    NULL,
  cancelado          boolean NOT NULL DEFAULT false
);

COMMENT ON TABLE  public.ia_job_analise_pauta IS 'Controle de jobs de geração em lote de análises IA da pauta de julgamento';
COMMENT ON COLUMN public.ia_job_analise_pauta.status IS 'pendente | executando | concluido | concluido_com_erros | erro | cancelado';

CREATE INDEX IF NOT EXISTS idx_ia_job_analise_pauta_sessao
  ON public.ia_job_analise_pauta (sessao_id);

CREATE INDEX IF NOT EXISTS idx_ia_job_analise_pauta_status
  ON public.ia_job_analise_pauta (status);

-- Garante no máximo um job ativo (pendente ou executando) por sessão
CREATE UNIQUE INDEX IF NOT EXISTS ux_ia_job_analise_pauta_ativo
  ON public.ia_job_analise_pauta (sessao_id)
  WHERE status IN ('pendente', 'executando');

-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ia_job_analise_pauta_item (
  id            bigserial PRIMARY KEY,
  job_id        bigint  NOT NULL REFERENCES public.ia_job_analise_pauta (id) ON DELETE CASCADE,
  processo_id   integer NOT NULL,
  numero_processo text  NULL,
  sequencia     integer NULL,
  status        text    NOT NULL DEFAULT 'pendente',
  mensagem      text    NULL,
  erro          text    NULL,
  iniciado_em   timestamp without time zone NULL,
  finalizado_em timestamp without time zone NULL
);

COMMENT ON TABLE  public.ia_job_analise_pauta_item IS 'Itens individuais de um job de análise da pauta (um por processo)';
COMMENT ON COLUMN public.ia_job_analise_pauta_item.status IS 'pendente | ja_analisado | analisando | analisado | erro | ignorado';

CREATE INDEX IF NOT EXISTS idx_ia_job_analise_pauta_item_job
  ON public.ia_job_analise_pauta_item (job_id);

CREATE INDEX IF NOT EXISTS idx_ia_job_analise_pauta_item_status
  ON public.ia_job_analise_pauta_item (status);
