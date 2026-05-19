-- 262_inep_educacao.sql
-- Fase 17B — Camada persistida do IDEB municipal e Taxas de Rendimento Escolar (INEP).
-- Fontes: arquivos XLSX manualmente baixados em etl/data/inep/{ideb,rendimento}/
--         (download.inep.gov.br é bloqueado pela rede do TCE-AC).
-- Escopo inicial: UF=AC (22 municípios + Estado), mas o esquema é nacional.

-- ---------------------------------------------------------------------------
-- IDEB — payload bruto por linha do XLSX
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS raw.inep_ideb_municipal_raw (
  id              bigserial   PRIMARY KEY,
  arquivo         text        NOT NULL,                -- nome do ZIP de origem
  edicao          integer     NOT NULL,                -- ano da edição (2023, 2021, ...)
  etapa           text        NOT NULL,                -- 'AI' | 'AF' | 'EM'
  sg_uf           text        NOT NULL,
  cod_municipio   integer     NOT NULL,
  no_municipio    text        NULL,
  rede            text        NOT NULL,                -- Estadual | Municipal | Federal | Pública | Privada
  payload         jsonb       NOT NULL,
  hash_registro   text        NOT NULL,
  coletado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inep_ideb_raw
  ON raw.inep_ideb_municipal_raw (edicao, etapa, cod_municipio, rede, hash_registro);

CREATE INDEX IF NOT EXISTS idx_inep_ideb_raw_uf
  ON raw.inep_ideb_municipal_raw (sg_uf, edicao);

-- ---------------------------------------------------------------------------
-- IDEB — fato normalizada: uma linha por (município × edição × etapa × rede × ano observado)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dw.fato_inep_ideb_municipal (
  id                bigserial   PRIMARY KEY,
  edicao            integer     NOT NULL,            -- ano da publicação (toda edição traz histórico completo)
  etapa             text        NOT NULL,            -- 'AI' | 'AF' | 'EM'
  cod_municipio     integer     NOT NULL,
  sg_uf             text        NULL,
  no_municipio      text        NULL,
  rede              text        NOT NULL,
  ano               integer     NOT NULL,            -- ano do indicador (2005, 2007, ..., 2023)
  ideb_observado    numeric     NULL,
  ideb_projetado    numeric     NULL,
  aprovacao         numeric     NULL,                -- taxa de aprovação consolidada da etapa
  indicador_rend_p  numeric     NULL,
  nota_mat_saeb     numeric     NULL,
  nota_lp_saeb      numeric     NULL,
  nota_media_saeb   numeric     NULL,
  raw_id            bigint      NULL REFERENCES raw.inep_ideb_municipal_raw(id) ON DELETE SET NULL,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fato_ideb_municipio
  ON dw.fato_inep_ideb_municipal (cod_municipio);

CREATE INDEX IF NOT EXISTS idx_fato_ideb_uf_ano
  ON dw.fato_inep_ideb_municipal (sg_uf, ano);

CREATE INDEX IF NOT EXISTS idx_fato_ideb_chave
  ON dw.fato_inep_ideb_municipal (cod_municipio, etapa, ano, rede);

-- ---------------------------------------------------------------------------
-- Taxas de Rendimento — payload bruto por linha do XLSX
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS raw.inep_rendimento_municipal_raw (
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

CREATE UNIQUE INDEX IF NOT EXISTS uq_inep_rendimento_raw
  ON raw.inep_rendimento_municipal_raw (ano, cod_municipio, localizacao, dependencia, hash_registro);

CREATE INDEX IF NOT EXISTS idx_inep_rendimento_raw_uf
  ON raw.inep_rendimento_municipal_raw (sg_uf, ano);

-- ---------------------------------------------------------------------------
-- Taxas de Rendimento — fato normalizada
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dw.fato_inep_rendimento_municipal (
  id                       bigserial   PRIMARY KEY,
  ano                      integer     NOT NULL,
  cod_municipio            integer     NOT NULL,
  sg_uf                    text        NULL,
  no_municipio             text        NULL,
  localizacao              text        NOT NULL,
  dependencia              text        NOT NULL,
  aprov_fund_total         numeric     NULL,
  aprov_fund_ai            numeric     NULL,
  aprov_fund_af            numeric     NULL,
  aprov_em_total           numeric     NULL,
  reprov_fund_total        numeric     NULL,
  reprov_fund_ai           numeric     NULL,
  reprov_fund_af           numeric     NULL,
  reprov_em_total          numeric     NULL,
  abandono_fund_total      numeric     NULL,
  abandono_fund_ai         numeric     NULL,
  abandono_fund_af         numeric     NULL,
  abandono_em_total        numeric     NULL,
  raw_id                   bigint      NULL REFERENCES raw.inep_rendimento_municipal_raw(id) ON DELETE SET NULL,
  criado_em                timestamptz NOT NULL DEFAULT now(),
  atualizado_em            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fato_rendimento_municipio
  ON dw.fato_inep_rendimento_municipal (cod_municipio);

CREATE INDEX IF NOT EXISTS idx_fato_rendimento_uf_ano
  ON dw.fato_inep_rendimento_municipal (sg_uf, ano);

CREATE INDEX IF NOT EXISTS idx_fato_rendimento_chave
  ON dw.fato_inep_rendimento_municipal (cod_municipio, ano, localizacao, dependencia);

-- ---------------------------------------------------------------------------
-- Mart consolidado — uma linha por município com IDEB mais recente + Rendimento mais recente
-- Alimenta o painel /gabinete-digital/mapa e o gráfico /home/GraficoIdeb.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.painel_educacao_municipio (
  cod_municipio          integer     PRIMARY KEY,
  no_municipio           text        NULL,
  sg_uf                  text        NULL,

  -- IDEB (rede 'Pública' — combinação Estadual/Municipal/Federal)
  edicao_ideb            integer     NULL,
  ideb_publico_ai        numeric     NULL,
  ideb_publico_af        numeric     NULL,
  ideb_publico_em        numeric     NULL,
  meta_publico_ai        numeric     NULL,
  meta_publico_af        numeric     NULL,
  meta_publico_em        numeric     NULL,

  -- Taxas de Rendimento (Localização=Total, Dependência=Total) — ano mais recente
  ano_rendimento         integer     NULL,
  aprovacao_fund_total   numeric     NULL,
  aprovacao_em_total     numeric     NULL,
  reprovacao_fund_total  numeric     NULL,
  reprovacao_em_total    numeric     NULL,
  abandono_fund_total    numeric     NULL,
  abandono_em_total      numeric     NULL,

  atualizado_em          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mart_painel_educacao_uf
  ON mart.painel_educacao_municipio (sg_uf);
