-- 180_siconfi_rgf.sql
-- SICONFI/RGF — Relatório de Gestão Fiscal
-- Fonte: API DataLake Tesouro Nacional
-- Base URL: https://apidatalake.tesouro.gov.br/ords/siconfi/tt
--
-- Endpoint: GET /rreo?co_tipo_demonstrativo=RGF (ou /rgf)
-- Periodicidade: Q (quadrimestral) — 3 períodos por ano (1, 2, 3)
--
-- Campos reais retornados pela API:
--   exercicio, demonstrativo, periodo, periodicidade, instituicao,
--   cod_ibge, uf, populacao, anexo, esfera, rotulo, coluna, cod_conta, conta, valor
--
-- Nota: não apagar nem referenciar nada do RREO (schema 160_siconfi_rreo.sql).

-- -------------------------------------------------------
-- A. raw.siconfi_rgf_raw
-- Payload bruto por ente/exercício/período — preservado para auditoria.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS raw.siconfi_rgf_raw (
  id                     bigserial    PRIMARY KEY,
  an_exercicio           integer      NOT NULL,
  nr_periodo             integer      NOT NULL,          -- 1, 2 ou 3 (quadrimestral)
  id_ente                integer      NOT NULL,          -- cod IBGE 7 dígitos
  no_ente                text         NULL,              -- nome do município
  co_tipo_demonstrativo  text         NOT NULL DEFAULT 'RGF',
  endpoint               text         NOT NULL,
  payload                jsonb        NOT NULL,
  coletado_em            timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_siconfi_rgf_raw_exercicio
  ON raw.siconfi_rgf_raw (an_exercicio, nr_periodo);

CREATE INDEX IF NOT EXISTS idx_siconfi_rgf_raw_ente
  ON raw.siconfi_rgf_raw (id_ente);

-- -------------------------------------------------------
-- B. dw.fato_siconfi_rgf
-- Fatos RGF normalizados: um registro por ente/período/anexo/conta/coluna.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS dw.fato_siconfi_rgf (
  id                     bigserial    PRIMARY KEY,
  an_exercicio           integer      NOT NULL,
  nr_periodo             integer      NOT NULL,          -- 1, 2 ou 3
  id_ente                integer      NOT NULL,          -- cod IBGE 7 dígitos
  no_ente                text         NULL,              -- ex: "Prefeitura Municipal de Rio Branco - AC"
  uf                     text         NULL,              -- ex: "AC"
  esfera                 text         NULL,              -- "M" = Municipal
  periodicidade          text         NULL,              -- "Q"
  populacao              bigint       NULL,
  co_tipo_demonstrativo  text         NOT NULL DEFAULT 'RGF',
  no_anexo               text         NULL,              -- ex: "RGF-Anexo 01"
  rotulo                 text         NULL,
  coluna                 text         NULL,
  cod_conta              text         NULL,
  conta                  text         NULL,
  valor                  numeric      NULL,
  fonte                  text         NOT NULL DEFAULT 'SICONFI_RGF',
  coletado_em            timestamptz  NOT NULL DEFAULT now(),
  atualizado_em          timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_siconfi_rgf_fato_exercicio
  ON dw.fato_siconfi_rgf (an_exercicio, nr_periodo);

CREATE INDEX IF NOT EXISTS idx_siconfi_rgf_fato_ente
  ON dw.fato_siconfi_rgf (id_ente);

CREATE INDEX IF NOT EXISTS idx_siconfi_rgf_fato_anexo
  ON dw.fato_siconfi_rgf (no_anexo);

-- -------------------------------------------------------
-- C. mart.siconfi_rgf_resumo_municipio
-- Resumo por município/período para consultas rápidas.
-- Fonte: dw.fato_siconfi_extrato_entregas WHERE co_entregavel='RGF'
-- (O endpoint /rgf do DataLake retorna 0 itens — dados de entrega
--  estão disponíveis apenas via /extrato_entregas)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.siconfi_rgf_resumo_municipio (
  an_exercicio           integer      NOT NULL,
  nr_periodo             integer      NOT NULL,
  id_municipio           integer      NOT NULL,
  no_municipio           text         NULL,
  total_contas           integer      NOT NULL DEFAULT 0, -- nº de entregas no extrato (prefeitura + câmara)
  situacao_envio         text         NULL,              -- COM_DADO | SEM_DADO
  status_relatorio       text         NULL,              -- HO | RE | null
  data_entrega           date         NULL,              -- data do status no SICONFI
  atualizado_em          timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (an_exercicio, nr_periodo, id_municipio)
);

CREATE INDEX IF NOT EXISTS idx_siconfi_rgf_resumo_exercicio
  ON mart.siconfi_rgf_resumo_municipio (an_exercicio, nr_periodo);

-- -------------------------------------------------------
-- D. mart.siconfi_rgf_alertas
-- Alertas gerados pelo job refresh-mart-siconfi-rgf.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.siconfi_rgf_alertas (
  id_alerta              bigserial    PRIMARY KEY,
  area                   text         NOT NULL DEFAULT 'FISCAL',
  fonte                  text         NOT NULL DEFAULT 'SICONFI_RGF',
  an_exercicio           integer      NOT NULL,
  nr_periodo             integer      NOT NULL,
  id_municipio           integer      NULL,
  no_municipio           text         NULL,
  tipo_alerta            text         NOT NULL,
  nivel                  text         NOT NULL,          -- CRITICO | ALTO | MEDIO | BAIXO
  descricao              text         NOT NULL,
  valor_observado        numeric      NULL,
  valor_referencia       numeric      NULL,
  detalhe_json           jsonb        NULL,
  atualizado_em          timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_siconfi_rgf_alertas_nivel
  ON mart.siconfi_rgf_alertas (an_exercicio, nivel);

CREATE INDEX IF NOT EXISTS idx_siconfi_rgf_alertas_municipio
  ON mart.siconfi_rgf_alertas (id_municipio);

-- -------------------------------------------------------
-- E. mart.siconfi_rgf_resumo_home
-- Uma linha: totais do período mais recente para card/hub.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.siconfi_rgf_resumo_home (
  id                     serial       PRIMARY KEY,
  an_exercicio           integer      NOT NULL,
  nr_periodo             integer      NOT NULL,
  municipios_com_dado    integer      NOT NULL DEFAULT 0,
  municipios_sem_dado    integer      NOT NULL DEFAULT 0,
  total_municipios       integer      NOT NULL DEFAULT 0,
  total_alertas          integer      NOT NULL DEFAULT 0,
  alertas_criticos       integer      NOT NULL DEFAULT 0,
  alertas_altos          integer      NOT NULL DEFAULT 0,
  atualizado_em          timestamptz  NOT NULL DEFAULT now()
);
