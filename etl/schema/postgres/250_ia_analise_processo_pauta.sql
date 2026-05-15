-- 250_ia_analise_processo_pauta.sql
-- Tabelas de cache para análise IA de processos em pauta.
-- Cache por hash SHA-256: evita rechamadas desnecessárias ao Azure OpenAI.

-- Cache de resumo individual por documento (nível documento)
CREATE TABLE IF NOT EXISTS public.ia_resumo_documento_processo (
  id              bigserial    PRIMARY KEY,
  id_proc_arqv    integer      NOT NULL,                   -- FK para pauta_julgamento_arquivo
  processo_id     integer      NOT NULL,
  hash_conteudo   text         NOT NULL UNIQUE,            -- SHA-256 do texto extraído do PDF
  tipo_documento  text         NOT NULL,                   -- voto_relator, relatorio_tecnico, etc.
  nm_proc_arqv    text         NULL,
  resumo          text         NOT NULL,
  tokens_usados   integer      NULL,
  modelo_versao   text         NOT NULL DEFAULT '1.0.0',
  gerado_em       timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ia_resumo_doc_arquivo
  ON public.ia_resumo_documento_processo (id_proc_arqv);

CREATE INDEX IF NOT EXISTS idx_ia_resumo_doc_processo
  ON public.ia_resumo_documento_processo (processo_id);

-- Cache de análise final consolidada do processo (nível processo)
CREATE TABLE IF NOT EXISTS public.ia_analise_processo_pauta (
  id                bigserial    PRIMARY KEY,
  processo_id       integer      NOT NULL,
  hash_contexto     text         NOT NULL UNIQUE,          -- SHA-256 do contexto completo enviado à IA
  numero_fmt        text         NULL,
  resultado_json    jsonb        NOT NULL,                 -- JSON completo retornado pela IA
  gerado_em         timestamptz  NOT NULL DEFAULT now(),
  modelo_versao     text         NOT NULL DEFAULT '1.0.0'
);

CREATE INDEX IF NOT EXISTS idx_ia_analise_processo
  ON public.ia_analise_processo_pauta (processo_id);

CREATE INDEX IF NOT EXISTS idx_ia_analise_gerado_em
  ON public.ia_analise_processo_pauta (gerado_em DESC);
