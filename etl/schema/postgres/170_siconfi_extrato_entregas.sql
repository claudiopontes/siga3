-- 170_siconfi_extrato_entregas.sql
-- SICONFI/Extrato de Entregas — demonstrativos entregues ao Tesouro Nacional
-- Fonte: API DataLake Tesouro Nacional — /extrato_entregas
-- Incrementa 160_siconfi_rreo.sql.
--
-- Campos reais retornados pela API:
--   exercicio, cod_ibge, populacao, instituicao, entregavel, periodo,
--   periodicidade (B/Q/M/A), status_relatorio (HO/RE/null),
--   data_status, forma_envio, tipo_relatorio
--
-- status_relatorio: HO=Homologado | RE=Retificado | null=não entregue
-- Retificações (RE) são possíveis após HO — o dado pode mudar.
--
-- ATENÇÃO: Schema corrigido por 255_siconfi_extrato_fix.sql.

-- -------------------------------------------------------
-- raw.siconfi_extrato_entregas_raw
-- Payload bruto por ente/ano — uma linha por coleta.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS raw.siconfi_extrato_entregas_raw (
  id            bigserial    PRIMARY KEY,
  id_ente       integer      NOT NULL,
  an_referencia integer      NOT NULL,
  endpoint      text         NOT NULL,
  payload       jsonb        NOT NULL,
  coletado_em   timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_siconfi_extrato_raw_ente
  ON raw.siconfi_extrato_entregas_raw (id_ente, an_referencia);

-- -------------------------------------------------------
-- dw.fato_siconfi_extrato_entregas
-- Criada/corrigida por 255_siconfi_extrato_fix.sql
-- -------------------------------------------------------

-- -------------------------------------------------------
-- mart.siconfi_rreo_extrato_entregas
-- Criada/corrigida por 255_siconfi_extrato_fix.sql
-- -------------------------------------------------------
