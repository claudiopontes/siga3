-- 252_ia_analise_descartes.sql
-- Descarte lógico de análises individuais e criação da tabela de relatório consolidado da pauta.

-- ─── Parte 1: Descarte lógico em ia_analise_processo_pauta ────────────────────

ALTER TABLE public.ia_analise_processo_pauta
  ADD COLUMN IF NOT EXISTS descartado      boolean                     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS descartado_por  text                        NULL,
  ADD COLUMN IF NOT EXISTS descartado_em   timestamp without time zone NULL,
  ADD COLUMN IF NOT EXISTS motivo_descarte text                        NULL;

-- Índice parcial para acelerar buscas de análises válidas (não descartadas)
CREATE INDEX IF NOT EXISTS idx_ia_analise_descartado
  ON public.ia_analise_processo_pauta (processo_id)
  WHERE descartado = false;

-- ─── Parte 2: Tabela de relatório consolidado da pauta ────────────────────────

CREATE TABLE IF NOT EXISTS public.ia_relatorio_resumo_pauta (
  id               bigserial    PRIMARY KEY,
  sessao_id        integer      NOT NULL,
  hash_contexto    text         NOT NULL,
  versao_template  text         NOT NULL,
  html_relatorio   text         NOT NULL,
  resumo_json      jsonb        NOT NULL,
  total_processos  integer      NOT NULL DEFAULT 0,
  total_analisados integer      NOT NULL DEFAULT 0,
  total_pendentes  integer      NOT NULL DEFAULT 0,
  criado_em        timestamp without time zone DEFAULT now(),
  atualizado_em    timestamp without time zone DEFAULT now(),
  revisado         boolean      NOT NULL DEFAULT false,
  revisado_por     text         NULL,
  revisado_em      timestamp without time zone NULL,
  descartado       boolean      NOT NULL DEFAULT false,
  descartado_por   text         NULL,
  descartado_em    timestamp without time zone NULL,
  motivo_descarte  text         NULL,
  CONSTRAINT uq_relatorio_resumo_pauta UNIQUE (sessao_id, hash_contexto, versao_template)
);

CREATE INDEX IF NOT EXISTS idx_relatorio_resumo_sessao
  ON public.ia_relatorio_resumo_pauta (sessao_id);

CREATE INDEX IF NOT EXISTS idx_relatorio_resumo_descartado
  ON public.ia_relatorio_resumo_pauta (descartado);
