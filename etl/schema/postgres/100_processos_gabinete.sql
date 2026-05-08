-- 100_processos_gabinete.sql
-- Tabelas para o ETL de processos dos gabinetes dos conselheiros

CREATE TABLE IF NOT EXISTS public.processos_gabinete_carga (
  id              bigserial   PRIMARY KEY,
  fonte           text        NOT NULL,
  view_origem     text        NOT NULL,
  status          text        NOT NULL DEFAULT 'iniciada',
  registros       integer     NOT NULL DEFAULT 0,
  mensagem        text        NULL,
  iniciado_em     timestamptz NOT NULL DEFAULT now(),
  finalizado_em   timestamptz NULL
);

CREATE TABLE IF NOT EXISTS public.processos_gabinete_raw (
  id                              bigserial   PRIMARY KEY,
  carga_id                        bigint      NOT NULL REFERENCES public.processos_gabinete_carga (id),
  relator                         text        NULL,
  id_grupo                        integer     NULL,
  grupo_atual                     text        NULL,
  ic_gabinete_cons                integer     NOT NULL DEFAULT 0,
  setor                           text        NULL,
  usuario_atual                   text        NULL,
  processo                        integer     NULL,
  assunto                         text        NULL,
  classe                          text        NULL,
  orgao                           text        NULL,
  atividade_atual                 text        NULL,
  data_criacao                    timestamptz NULL,
  data_chegada_setor_atual        timestamptz NULL,
  duracao_setor_dias              integer     NULL,
  tempo_de_registro_dias          integer     NULL,
  prazo_regulamentado_dias        integer     NULL,
  dias_em_atraso                  integer     NULL,
  flag_mais_15_dias               integer     NOT NULL DEFAULT 0,
  flag_processo_sensivel          integer     NOT NULL DEFAULT 0,
  flag_prazo_regulamentar_vencido integer     NOT NULL DEFAULT 0,
  dados                           jsonb       NULL,
  hash_registro                   text        NOT NULL,
  coletado_em                     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pg_raw_carga_id    ON public.processos_gabinete_raw (carga_id);
CREATE INDEX IF NOT EXISTS idx_pg_raw_grupo_atual ON public.processos_gabinete_raw (grupo_atual);
CREATE INDEX IF NOT EXISTS idx_pg_raw_hash        ON public.processos_gabinete_raw (hash_registro);
CREATE INDEX IF NOT EXISTS idx_pg_raw_processo    ON public.processos_gabinete_raw (processo);
