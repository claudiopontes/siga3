-- 240_pauta_julgamento.sql
-- Tabelas para o ETL de pautas de julgamento (EJURIS -> PostgreSQL)

-- Controle de carga
CREATE TABLE IF NOT EXISTS public.pauta_julgamento_carga (
  id            bigserial   PRIMARY KEY,
  fonte         text        NOT NULL,
  status        text        NOT NULL DEFAULT 'iniciada',
  registros     integer     NOT NULL DEFAULT 0,
  mensagem      text        NULL,
  iniciado_em   timestamptz NOT NULL DEFAULT now(),
  finalizado_em timestamptz NULL
);

-- Sessões em situação PARA JULGAMENTO
CREATE TABLE IF NOT EXISTS public.pauta_julgamento_sessao (
  id                integer     PRIMARY KEY,
  carga_id          bigint      NOT NULL REFERENCES public.pauta_julgamento_carga (id),
  numero            text        NULL,
  dt_realizacao     timestamptz NULL,
  orgao_julgador_id integer     NULL,
  local_sessao      text        NULL,
  tipo              text        NULL,
  situacao          text        NULL,
  numero_publicacao text        NULL,
  data_publicacao   timestamptz NULL,
  tipo_publicacao   text        NULL,
  arquivo_sessao    text        NULL,
  coletado_em       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pjs_situacao     ON public.pauta_julgamento_sessao (situacao);
CREATE INDEX IF NOT EXISTS idx_pjs_dt_realizacao ON public.pauta_julgamento_sessao (dt_realizacao DESC);

-- Itens de pauta (processos por sessão)
CREATE TABLE IF NOT EXISTS public.pauta_julgamento_item (
  id                   integer     PRIMARY KEY,
  carga_id             bigint      NOT NULL REFERENCES public.pauta_julgamento_carga (id),
  sessao_id            integer     NULL REFERENCES public.pauta_julgamento_sessao (id),
  sessao_numero        text        NULL,
  processo_id          integer     NULL,
  numero_processo      text        NULL,
  situacao             text        NULL,
  sequencia            integer     NULL,
  relator_id           integer     NULL,
  nome_relator         text        NULL,
  cargo_relator        text        NULL,
  titulo_relator       text        NULL,
  relator_tratamento   text        NULL,
  revisor_id           integer     NULL,
  nome_revisor         text        NULL,
  cargo_revisor        text        NULL,
  titulo_revisor       text        NULL,
  eletronico           text        NULL,
  qtde_pron            integer     NULL,
  incluir_interessados text        NULL,
  julgado              text        NULL,
  coletado_em          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pji_sessao_id      ON public.pauta_julgamento_item (sessao_id);
CREATE INDEX IF NOT EXISTS idx_pji_processo_id    ON public.pauta_julgamento_item (processo_id);
CREATE INDEX IF NOT EXISTS idx_pji_sequencia      ON public.pauta_julgamento_item (sessao_id, sequencia);
