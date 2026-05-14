-- 243_pauta_julgamento_arquivo.sql
-- Tabela de arquivos PDF vinculados aos processos da pauta de julgamento.
-- Fonte: EPROCESS.processo.vwArquivoProcesso
-- Chave primária: ID_PROC_ARQV (identificador único do arquivo no EPROCESS)

CREATE TABLE IF NOT EXISTS public.pauta_julgamento_arquivo (
  id_proc_arqv          integer     PRIMARY KEY,   -- PK do arquivo no EPROCESS
  processo_id           integer     NOT NULL,       -- ID_PROC_INSTAN (liga ao item da pauta)
  carga_id              bigint      NOT NULL REFERENCES public.pauta_julgamento_carga (id),
  id_tipo_docm          integer     NULL,
  nm_tipo_docm          text        NULL,           -- ex: "Relatório", "Voto", "Acórdão"
  nm_proc_arqv          text        NULL,           -- nome do arquivo (ex: relatorio_123.pdf)
  en_dir                text        NULL,           -- caminho no repositório de arquivos
  ic_documento_assinado text        NULL,           -- indicador de assinatura
  dt_autuado            timestamptz NULL,
  dt_criac              timestamptz NULL,
  data_finalizado       timestamptz NULL,           -- DT_AUTUADO ?? DT_CRIAC
  nr_pagn               integer     NULL,           -- número de páginas
  nr_ordem              integer     NULL,           -- ordem do documento no processo
  id_fase_instan        integer     NULL,           -- fase do fluxo processual
  coletado_em           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pja_processo_id  ON public.pauta_julgamento_arquivo (processo_id);
CREATE INDEX IF NOT EXISTS idx_pja_tipo_docm    ON public.pauta_julgamento_arquivo (id_tipo_docm);
CREATE INDEX IF NOT EXISTS idx_pja_data_fin     ON public.pauta_julgamento_arquivo (data_finalizado DESC);
