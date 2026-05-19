-- Migration 260: tabela de auditoria/métricas de uso do Assistente Aquiry.
-- Persistência OPCIONAL — ativada pela env AQUIRY_AUDIT_PERSIST=true.
-- NÃO armazena conteúdo da pergunta nem da resposta — somente metadados.

CREATE TABLE IF NOT EXISTS public.aquiry_evento_uso (
  id                            bigserial PRIMARY KEY,
  timestamp                     timestamptz NOT NULL,
  tipo                          text        NOT NULL,
  rota                          text        NULL,
  tipo_pagina                   text        NULL,
  estrategia                    text        NULL,
  bases                         jsonb       NULL,
  usou_contexto_tela            boolean     NULL,
  usou_analise_contextual       boolean     NULL,
  usou_base_documental          boolean     NULL,
  usou_pesquisa_externa         boolean     NULL,
  pesquisa_externa_suficiente   boolean     NULL,
  exige_fonte_estruturada       boolean     NULL,
  fonte_estruturada_encontrada  boolean     NULL,
  fontes_oficiais_encontradas   boolean     NULL,
  tamanho_pergunta              integer     NULL,
  tamanho_resposta              integer     NULL,
  tempo_resposta_ms             integer     NULL,
  erro_codigo                   text        NULL,
  created_at                    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.aquiry_evento_uso IS 'Eventos de auditoria do Assistente Aquiry — apenas metadados, sem conteúdo de pergunta/resposta. Ativada por AQUIRY_AUDIT_PERSIST=true.';
COMMENT ON COLUMN public.aquiry_evento_uso.tipo IS 'pergunta | resposta | erro';
COMMENT ON COLUMN public.aquiry_evento_uso.estrategia IS 'varadouro | conhecimento_geral | busca_externa';
COMMENT ON COLUMN public.aquiry_evento_uso.bases IS 'Array textual das bases declaradas em origem.bases — usado apenas para análise agregada.';

CREATE INDEX IF NOT EXISTS idx_aquiry_evento_uso_timestamp
  ON public.aquiry_evento_uso (timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_aquiry_evento_uso_tipo_estrategia
  ON public.aquiry_evento_uso (tipo, estrategia);

CREATE INDEX IF NOT EXISTS idx_aquiry_evento_uso_rota
  ON public.aquiry_evento_uso (rota);
