-- 264_inep_escolas.sql
-- Fase 17D — Camada persistida do IDEB por ESCOLA (INEP) + dimensão Censo Escolar.
-- Fontes manuais (download.inep.gov.br bloqueado pela rede TCE):
--   etl/data/inep/ideb-escolas/  (3 ZIPs por etapa, por edição)
--   etl/data/inep/censo/         (microdado anual, ~600MB — extraímos só escolas.csv)

-- ---------------------------------------------------------------------------
-- raw.inep_ideb_escolas_raw — payload bruto por linha do XLSX (IDEB Escolas)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS raw.inep_ideb_escolas_raw (
  id              bigserial   PRIMARY KEY,
  arquivo         text        NOT NULL,
  edicao          integer     NOT NULL,
  etapa           text        NOT NULL,                -- 'AI' | 'AF' | 'EM'
  sg_uf           text        NOT NULL,
  cod_municipio   integer     NOT NULL,
  cod_escola      integer     NOT NULL,                -- código INEP (8 dígitos)
  no_escola       text        NULL,
  rede            text        NOT NULL,                -- Estadual | Municipal | Federal | Privada | Pública
  payload         jsonb       NOT NULL,
  hash_registro   text        NOT NULL,
  coletado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inep_ideb_escolas_raw_chave
  ON raw.inep_ideb_escolas_raw (edicao, etapa, cod_escola, rede, hash_registro);

CREATE INDEX IF NOT EXISTS idx_inep_ideb_escolas_raw_uf
  ON raw.inep_ideb_escolas_raw (sg_uf, edicao);

CREATE INDEX IF NOT EXISTS idx_inep_ideb_escolas_raw_municipio
  ON raw.inep_ideb_escolas_raw (cod_municipio);

-- ---------------------------------------------------------------------------
-- dw.fato_inep_ideb_escola — fato normalizada (uma linha por escola × edição × etapa × ano observado)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dw.fato_inep_ideb_escola (
  id                bigserial   PRIMARY KEY,
  edicao            integer     NOT NULL,
  etapa             text        NOT NULL,
  cod_escola        integer     NOT NULL,
  cod_municipio     integer     NULL,
  sg_uf             text        NULL,
  no_escola         text        NULL,
  rede              text        NOT NULL,
  ano               integer     NOT NULL,
  ideb_observado    numeric     NULL,
  ideb_projetado    numeric     NULL,
  aprovacao         numeric     NULL,
  indicador_rend_p  numeric     NULL,
  nota_mat_saeb     numeric     NULL,
  nota_lp_saeb      numeric     NULL,
  nota_media_saeb   numeric     NULL,
  raw_id            bigint      NULL REFERENCES raw.inep_ideb_escolas_raw(id) ON DELETE SET NULL,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fato_ideb_escola_escola
  ON dw.fato_inep_ideb_escola (cod_escola);

CREATE INDEX IF NOT EXISTS idx_fato_ideb_escola_municipio
  ON dw.fato_inep_ideb_escola (cod_municipio);

CREATE INDEX IF NOT EXISTS idx_fato_ideb_escola_uf_ano
  ON dw.fato_inep_ideb_escola (sg_uf, ano);

CREATE INDEX IF NOT EXISTS idx_fato_ideb_escola_chave
  ON dw.fato_inep_ideb_escola (cod_escola, etapa, ano, rede);

-- ---------------------------------------------------------------------------
-- public.dim_escola_inep — dimensão extraída do Censo Escolar (apenas para AC)
-- Mantém só o essencial para localizar e filtrar escolas no painel.
-- Microdado bruto não é persistido — somente os campos abaixo.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dim_escola_inep (
  cod_escola         integer     PRIMARY KEY,
  no_escola          text        NULL,
  cod_municipio     integer     NULL,
  no_municipio      text        NULL,
  sg_uf             text        NULL,
  dependencia       text        NULL,        -- Federal | Estadual | Municipal | Privada
  localizacao       text        NULL,        -- Urbana | Rural
  porte             text        NULL,        -- texto inferido das colunas TP_PORTE quando disponível
  etapas_atendidas  text        NULL,        -- "EI,EF,EM" concatenado a partir dos flags
  situacao          text        NULL,        -- "Em atividade" | "Paralisada" | "Extinta" | ...
  latitude          numeric     NULL,
  longitude         numeric     NULL,
  endereco          text        NULL,
  ano_censo         integer     NULL,
  payload           jsonb       NULL,
  atualizado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dim_escola_inep_uf
  ON public.dim_escola_inep (sg_uf);

CREATE INDEX IF NOT EXISTS idx_dim_escola_inep_municipio
  ON public.dim_escola_inep (cod_municipio);

CREATE INDEX IF NOT EXISTS idx_dim_escola_inep_dependencia
  ON public.dim_escola_inep (dependencia);

CREATE INDEX IF NOT EXISTS idx_dim_escola_inep_geo
  ON public.dim_escola_inep (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
