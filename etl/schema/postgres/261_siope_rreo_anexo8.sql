-- 261_siope_rreo_anexo8.sql
-- Fase 16C — Camada persistida do RREO Anexo 8 (Educação / MDE) via SICONFI.
-- Fonte: API DataLake Tesouro (https://apidatalake.tesouro.gov.br/ords/siconfi/tt)
-- Anexo alvo: "RREO-Anexo 08" (Demonstrativo das Receitas e Despesas com MDE).
-- Escopo inicial: Governo do Acre (id_ente=12) + 22 municípios acreanos.
--
-- Esta migration cria:
--   - raw.siope_rreo_anexo8_raw           (payload bruto + classificação determinística)
--   - dw.fato_siope_rreo_anexo8           (fato normalizado para os painéis de Educação)
--   - mart.siope_risco_educacao_basico    (consolidação mínima ente × exercício)

-- ---------------------------------------------------------------------------
-- raw.siope_rreo_anexo8_raw
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS raw.siope_rreo_anexo8_raw (
  id                       bigserial    PRIMARY KEY,
  fonte                    text         NOT NULL DEFAULT 'SICONFI_RREO_ANEXO8',
  an_exercicio             integer      NOT NULL,
  nr_periodo               integer      NOT NULL,
  co_tipo_demonstrativo    text         NULL,   -- "RREO"
  no_anexo                 text         NULL,   -- "RREO-Anexo 08"
  co_esfera                text         NULL,   -- "E" | "M"
  id_ente                  text         NOT NULL,
  no_ente                  text         NULL,
  uf                       text         NULL,
  periodicidade            text         NULL,
  conta                    text         NULL,
  descricao_conta          text         NULL,
  coluna                   text         NULL,
  valor                    numeric      NULL,
  payload                  jsonb        NOT NULL,
  hash_registro            text         NOT NULL,
  coletado_em              timestamptz  NOT NULL DEFAULT now(),
  atualizado_em            timestamptz  NOT NULL DEFAULT now()
);

-- Unique composto inclui hash_registro: mesmo conteúdo → upsert; conteúdo
-- diferente (ex.: retificação SICONFI) gera nova linha auditável.
CREATE UNIQUE INDEX IF NOT EXISTS uq_siope_rreo_anexo8_raw_chave
  ON raw.siope_rreo_anexo8_raw
     (an_exercicio, nr_periodo, id_ente, no_anexo, conta, coluna, hash_registro);

CREATE INDEX IF NOT EXISTS idx_siope_rreo_anexo8_raw_ente
  ON raw.siope_rreo_anexo8_raw (id_ente, an_exercicio, nr_periodo);

CREATE INDEX IF NOT EXISTS idx_siope_rreo_anexo8_raw_coletado_em
  ON raw.siope_rreo_anexo8_raw (coletado_em);

-- ---------------------------------------------------------------------------
-- dw.fato_siope_rreo_anexo8
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dw.fato_siope_rreo_anexo8 (
  id                                bigserial    PRIMARY KEY,
  fonte                             text         NOT NULL DEFAULT 'SICONFI_RREO_ANEXO8',
  an_exercicio                      integer      NOT NULL,
  nr_periodo                        integer      NOT NULL,
  id_ente                           text         NOT NULL,
  no_ente                           text         NULL,
  uf                                text         NULL,
  esfera                            text         NULL,
  periodicidade                     text         NULL,
  anexo                             text         NULL,
  conta_codigo                      text         NULL,
  conta_nome                        text         NULL,
  coluna                            text         NULL,
  valor                             numeric      NULL,
  categoria_gabinete                text         NULL,
  eh_mde                            boolean      NOT NULL DEFAULT false,
  eh_fundeb                         boolean      NOT NULL DEFAULT false,
  eh_remuneracao_profissionais      boolean      NOT NULL DEFAULT false,
  eh_receita_impostos               boolean      NOT NULL DEFAULT false,
  eh_transferencia_constitucional   boolean      NOT NULL DEFAULT false,
  eh_despesa_educacao               boolean      NOT NULL DEFAULT false,
  eh_resto_pagar                    boolean      NOT NULL DEFAULT false,
  raw_id                            bigint       NULL REFERENCES raw.siope_rreo_anexo8_raw(id) ON DELETE SET NULL,
  criado_em                         timestamptz  NOT NULL DEFAULT now(),
  atualizado_em                     timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fato_siope_rreo_anexo8_chave
  ON dw.fato_siope_rreo_anexo8 (an_exercicio, nr_periodo, id_ente);

CREATE INDEX IF NOT EXISTS idx_fato_siope_rreo_anexo8_categoria
  ON dw.fato_siope_rreo_anexo8 (categoria_gabinete);

CREATE INDEX IF NOT EXISTS idx_fato_siope_rreo_anexo8_mde
  ON dw.fato_siope_rreo_anexo8 (eh_mde) WHERE eh_mde;

CREATE INDEX IF NOT EXISTS idx_fato_siope_rreo_anexo8_fundeb
  ON dw.fato_siope_rreo_anexo8 (eh_fundeb) WHERE eh_fundeb;

-- ---------------------------------------------------------------------------
-- mart.siope_risco_educacao_basico
-- Uma linha por ente × exercício × período: visão rápida para painéis iniciais.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.siope_risco_educacao_basico (
  an_exercicio                  integer     NOT NULL,
  nr_periodo                    integer     NOT NULL,
  id_ente                       text        NOT NULL,
  no_ente                       text        NULL,
  uf                            text        NULL,
  esfera                        text        NULL,
  total_registros               integer     NOT NULL DEFAULT 0,
  total_mde                     numeric     NULL,
  total_fundeb                  numeric     NULL,
  total_remuneracao_profissionais numeric   NULL,
  total_receita_impostos        numeric     NULL,
  total_transferencias          numeric     NULL,
  total_despesa_educacao        numeric     NULL,
  total_restos_pagar            numeric     NULL,
  atualizado_em                 timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (an_exercicio, nr_periodo, id_ente)
);

CREATE INDEX IF NOT EXISTS idx_mart_siope_risco_educacao_ente
  ON mart.siope_risco_educacao_basico (id_ente);
