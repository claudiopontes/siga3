-- 271_inep_distorcao_idade_serie.sql
-- Fase 18A — Distorção idade-série (INEP).
-- Mede o % de alunos com 2+ anos de atraso por município × etapa.
-- Anual; complementa o IDEB (bienal) e as Taxas de Rendimento.

CREATE TABLE IF NOT EXISTS raw.inep_distorcao_municipal_raw (
  id              bigserial   PRIMARY KEY,
  arquivo         text        NOT NULL,
  ano             integer     NOT NULL,
  sg_uf           text        NOT NULL,
  cod_municipio   integer     NOT NULL,
  no_municipio    text        NULL,
  localizacao     text        NOT NULL,    -- Total | Urbana | Rural
  dependencia     text        NOT NULL,    -- Total | Estadual | Federal | Municipal | Privada
  payload         jsonb       NOT NULL,
  hash_registro   text        NOT NULL,
  coletado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inep_distorcao_raw
  ON raw.inep_distorcao_municipal_raw (ano, cod_municipio, localizacao, dependencia, hash_registro);

CREATE INDEX IF NOT EXISTS idx_inep_distorcao_raw_uf
  ON raw.inep_distorcao_municipal_raw (sg_uf, ano);

CREATE TABLE IF NOT EXISTS dw.fato_inep_distorcao_municipal (
  id                       bigserial   PRIMARY KEY,
  ano                      integer     NOT NULL,
  cod_municipio            integer     NOT NULL,
  sg_uf                    text        NULL,
  no_municipio             text        NULL,
  localizacao              text        NOT NULL,
  dependencia              text        NOT NULL,
  -- Distorção por etapa (% de alunos atrasados em pelo menos 2 anos)
  dist_fund_total          numeric     NULL,
  dist_fund_ai             numeric     NULL,
  dist_fund_af             numeric     NULL,
  dist_em_total            numeric     NULL,
  raw_id                   bigint      NULL REFERENCES raw.inep_distorcao_municipal_raw(id) ON DELETE SET NULL,
  criado_em                timestamptz NOT NULL DEFAULT now(),
  atualizado_em            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fato_distorcao_municipio
  ON dw.fato_inep_distorcao_municipal (cod_municipio);

CREATE INDEX IF NOT EXISTS idx_fato_distorcao_uf_ano
  ON dw.fato_inep_distorcao_municipal (sg_uf, ano);

CREATE INDEX IF NOT EXISTS idx_fato_distorcao_chave
  ON dw.fato_inep_distorcao_municipal (cod_municipio, ano, localizacao, dependencia);
