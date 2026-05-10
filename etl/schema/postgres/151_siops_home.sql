-- 151_siops_home.sql
-- Camada resumida de alertas SIOPS para uso na home "Alertas do Gabinete".
-- Complementa 150_siops.sql sem alterá-lo.

-- -------------------------------------------------------
-- mart.siops_alertas_home
-- Subconjunto filtrado de mart.siops_alertas:
--   - apenas período mais recente
--   - apenas níveis CRITICO e ALTO
--   - limite de 30 registros ordenados por prioridade
-- Reconstruído completamente pelo job refresh-mart-siops.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.siops_alertas_home (
  id_alerta              bigint       NULL,
  area                   text         NOT NULL DEFAULT 'SAUDE',
  fonte                  text         NOT NULL DEFAULT 'SIOPS',
  ano                    integer      NOT NULL,
  periodo                text         NULL,
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

CREATE INDEX IF NOT EXISTS idx_siops_alertas_home_ano_periodo
  ON mart.siops_alertas_home (ano, periodo);

CREATE INDEX IF NOT EXISTS idx_siops_alertas_home_nivel
  ON mart.siops_alertas_home (nivel);

CREATE INDEX IF NOT EXISTS idx_siops_alertas_home_prioridade
  ON mart.siops_alertas_home (prioridade);

CREATE INDEX IF NOT EXISTS idx_siops_alertas_home_municipio
  ON mart.siops_alertas_home (codigo_municipio_ibge);

-- -------------------------------------------------------
-- mart.siops_resumo_home
-- Contador agregado para exibição no card da home.
-- Reconstruído pelo job refresh-mart-siops.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS mart.siops_resumo_home (
  area                       text         NOT NULL DEFAULT 'SAUDE',
  fonte                      text         NOT NULL DEFAULT 'SIOPS',
  ano                        integer      NOT NULL,
  periodo                    text         NULL,
  total_alertas              integer      NOT NULL DEFAULT 0,
  total_criticos             integer      NOT NULL DEFAULT 0,
  total_altos                integer      NOT NULL DEFAULT 0,
  total_municipios_afetados  integer      NOT NULL DEFAULT 0,
  atualizado_em              timestamptz  NOT NULL DEFAULT now()
);
