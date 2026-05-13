-- 221_mis_bolsa_familia_bpc.sql
-- Dados mensais de Bolsa Família, BPC e população por município (fonte: MIS/MDS)
-- Chave: (ano_mes, codigo_ibge_municipio)

CREATE TABLE IF NOT EXISTS social.mis_bolsa_familia_bpc (
  id                        bigserial    PRIMARY KEY,
  ano                       integer      NOT NULL,
  mes                       integer      NOT NULL,
  ano_mes                   text         NOT NULL,   -- formato YYYY-MM
  codigo_ibge_municipio     text         NOT NULL,
  nome_municipio            text,                    -- extraído do nome do arquivo

  -- Bolsa Família
  bf_quantidade_familias    numeric,
  bf_valor_repassado        numeric,

  -- BPC — Benefício de Prestação Continuada
  bpc_quantidade_total      numeric,
  bpc_quantidade_deficiencia numeric,
  bpc_quantidade_idoso      numeric,
  bpc_valor_deficiencia     numeric,
  bpc_valor_idoso           numeric,
  bpc_valor_total           numeric,

  -- População
  populacao_estimada        numeric,

  -- Controle
  fonte                     text,
  hash_registro             text,
  data_carga                timestamptz  NOT NULL DEFAULT now(),
  criado_em                 timestamptz  NOT NULL DEFAULT now(),
  atualizado_em             timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT uq_mis_bolsa_familia_bpc UNIQUE (ano_mes, codigo_ibge_municipio)
);

CREATE INDEX IF NOT EXISTS idx_mis_bolsa_familia_bpc_ano_mes
  ON social.mis_bolsa_familia_bpc (ano_mes);

CREATE INDEX IF NOT EXISTS idx_mis_bolsa_familia_bpc_ibge
  ON social.mis_bolsa_familia_bpc (codigo_ibge_municipio);
