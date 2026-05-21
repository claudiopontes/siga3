-- =====================================================================
-- 290_folha_sicap_remessa_sync.sql
-- Fase 17B.1 — Audit de sincronização incremental da Folha SICAP
--
-- Objetivo:
--   Suportar carga incremental do ETL folha-sicap-carga-base detectando
--   diff por (entidade × ano × mês) entre o SICAP (SQL Server) e o
--   Postgres analítico. Cada par (entidade, ano, mes) tem exatamente
--   1 remessa no SICAP — se a remessa for retificada, ela é apagada e
--   recriada com novo id_remessa_sicap. O hash de assinatura captura
--   essa mudança e dispara reprocesso da chave.
--
-- Granularidade:
--   1 linha por (id_entidade_cjur, ano, mes). PK garante UPSERT natural
--   em caso de retificação (substitui id_remessa_sicap e hash).
--
-- Uso pelo job:
--   - Listar audit na janela rolante.
--   - Comparar com Remessa.id + dataEnvio + dataConfirmacao + tempoAtraso
--     na origem.
--   - Reprocessar chaves novas / com hash diferente.
--   - Limpar chaves que sumiram da origem (retificação que removeu mês).
-- =====================================================================

CREATE TABLE IF NOT EXISTS audit.folha_sicap_remessa_sync (
  id_entidade_cjur     integer       NOT NULL,
  ano                  integer       NOT NULL,
  mes                  integer       NOT NULL CHECK (mes BETWEEN 1 AND 12),
  id_remessa_sicap     bigint        NOT NULL,
  hash_assinatura      char(64)      NOT NULL,
  qtd_contracheques    integer       NOT NULL DEFAULT 0,
  qtd_verbas           integer       NOT NULL DEFAULT 0,
  sincronizado_em      timestamptz   NOT NULL DEFAULT now(),
  id_carga_etl         bigint,
  PRIMARY KEY (id_entidade_cjur, ano, mes)
);

CREATE INDEX IF NOT EXISTS idx_folha_remessa_sync_ano_mes
  ON audit.folha_sicap_remessa_sync (ano, mes);

CREATE INDEX IF NOT EXISTS idx_folha_remessa_sync_id_remessa
  ON audit.folha_sicap_remessa_sync (id_remessa_sicap);

COMMENT ON TABLE audit.folha_sicap_remessa_sync IS
  'Audit de sincronização incremental da Folha SICAP. 1 linha por (entidade, ano, mes). '
  'O hash captura id_remessa + dataEnvio + dataConfirmacao + tempoAtraso para detectar '
  'retificações (que no SICAP apagam a remessa antiga e criam nova).';

COMMENT ON COLUMN audit.folha_sicap_remessa_sync.hash_assinatura IS
  'SHA-256 hex de (id_remessa_sicap||dataEnvio||dataConfirmacao||tempoAtraso). '
  'Se mudar, a chave deve ser reprocessada.';
