-- 180_saude_consolidado.sql
-- Painel da Saúde — camada consolidada SIOPS + CNES/UBS
-- Une indicadores de orçamento (SIOPS) com estrutura da rede (CNES/UBS)

-- -------------------------------------------------------
-- mart.saude_resumo_municipio
-- Uma linha por município — visão consolidada saúde.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.saude_resumo_municipio (
  codigo_municipio_ibge          text         PRIMARY KEY,
  nome_municipio                 text         NULL,
  uf                             text         NULL,

  -- SIOPS
  siops_ano                      integer      NULL,
  siops_periodo                  text         NULL,
  percentual_aplicado_saude      numeric      NULL,
  despesa_total_saude            numeric      NULL,
  receita_base_calculo           numeric      NULL,
  siops_total_indicadores        integer      NOT NULL DEFAULT 0,
  siops_situacao_envio           text         NULL,

  -- CNES/UBS
  total_estabelecimentos         integer      NOT NULL DEFAULT 0,
  total_estabelecimentos_sus     integer      NOT NULL DEFAULT 0,
  total_ubs                      integer      NOT NULL DEFAULT 0,
  total_ubs_ativas               integer      NOT NULL DEFAULT 0,
  total_inativos                 integer      NOT NULL DEFAULT 0,
  total_sem_atualizacao_recente  integer      NOT NULL DEFAULT 0,
  data_mais_recente_atualizacao  date         NULL,

  -- alertas consolidados
  total_alertas                  integer      NOT NULL DEFAULT 0,
  total_criticos                 integer      NOT NULL DEFAULT 0,
  total_altos                    integer      NOT NULL DEFAULT 0,
  total_medios                   integer      NOT NULL DEFAULT 0,

  -- score de risco
  score_risco                    integer      NOT NULL DEFAULT 0,
  nivel_risco                    text         NULL,  -- CRITICO | ALTO | MEDIO | BAIXO

  atualizado_em                  timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saude_resumo_nome
  ON mart.saude_resumo_municipio (nome_municipio);

CREATE INDEX IF NOT EXISTS idx_saude_resumo_nivel_risco
  ON mart.saude_resumo_municipio (nivel_risco);

CREATE INDEX IF NOT EXISTS idx_saude_resumo_score
  ON mart.saude_resumo_municipio (score_risco DESC);

-- -------------------------------------------------------
-- mart.saude_alertas
-- Todos os alertas consolidados de SIOPS e CNES/UBS.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.saude_alertas (
  id_alerta              bigserial    PRIMARY KEY,
  area                   text         NOT NULL DEFAULT 'SAUDE',
  fonte                  text         NOT NULL,  -- SIOPS | CNES_UBS
  codigo_municipio_ibge  text         NULL,
  nome_municipio         text         NULL,
  tipo_alerta            text         NOT NULL,
  nivel                  text         NOT NULL,
  descricao              text         NOT NULL,
  valor_observado        numeric      NULL,
  valor_referencia       numeric      NULL,
  detalhe_json           jsonb        NULL,
  atualizado_em          timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saude_alertas_municipio
  ON mart.saude_alertas (codigo_municipio_ibge);

CREATE INDEX IF NOT EXISTS idx_saude_alertas_nivel
  ON mart.saude_alertas (nivel);

CREATE INDEX IF NOT EXISTS idx_saude_alertas_fonte
  ON mart.saude_alertas (fonte);

CREATE INDEX IF NOT EXISTS idx_saude_alertas_tipo
  ON mart.saude_alertas (tipo_alerta);

-- -------------------------------------------------------
-- mart.saude_alertas_home
-- Subconjunto para home: max 30, CRITICO/ALTO.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.saude_alertas_home (
  id_alerta              bigint       NULL,
  area                   text         NOT NULL DEFAULT 'SAUDE',
  fonte                  text         NOT NULL,
  codigo_municipio_ibge  text         NULL,
  nome_municipio         text         NULL,
  tipo_alerta            text         NOT NULL,
  nivel                  text         NOT NULL,
  descricao              text         NOT NULL,
  valor_observado        numeric      NULL,
  valor_referencia       numeric      NULL,
  prioridade             integer      NOT NULL,
  detalhe_json           jsonb        NULL,
  atualizado_em          timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saude_alertas_home_nivel
  ON mart.saude_alertas_home (nivel);

CREATE INDEX IF NOT EXISTS idx_saude_alertas_home_prioridade
  ON mart.saude_alertas_home (prioridade);

CREATE INDEX IF NOT EXISTS idx_saude_alertas_home_municipio
  ON mart.saude_alertas_home (codigo_municipio_ibge);

-- -------------------------------------------------------
-- mart.saude_resumo_home
-- Uma linha: totais consolidados para o card da home.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.saude_resumo_home (
  area                       text         NOT NULL DEFAULT 'SAUDE',
  total_alertas              integer      NOT NULL DEFAULT 0,
  total_criticos             integer      NOT NULL DEFAULT 0,
  total_altos                integer      NOT NULL DEFAULT 0,
  total_medios               integer      NOT NULL DEFAULT 0,
  total_municipios_afetados  integer      NOT NULL DEFAULT 0,
  municipios_risco_critico   integer      NOT NULL DEFAULT 0,
  municipios_risco_alto      integer      NOT NULL DEFAULT 0,
  municipios_risco_medio     integer      NOT NULL DEFAULT 0,
  siops_ano                  integer      NULL,
  siops_periodo              text         NULL,
  atualizado_em              timestamptz  NOT NULL DEFAULT now()
);
