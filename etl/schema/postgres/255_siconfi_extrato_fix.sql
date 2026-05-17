-- 255_siconfi_extrato_fix.sql
-- Corrige dw.fato_siconfi_extrato_entregas e mart.siconfi_rreo_extrato_entregas
-- para os campos reais da API SICONFI (/extrato_entregas).
--
-- O schema original (170_siconfi_extrato_entregas.sql) foi construído com base
-- em documentação desatualizada. Os campos reais retornados pela API são:
--   exercicio, cod_ibge, populacao, instituicao, entregavel, periodo,
--   periodicidade, status_relatorio, data_status, forma_envio, tipo_relatorio
--
-- status_relatorio: HO = Homologado | RE = Retificado | null = não entregue
-- Retificações (RE) são possíveis mesmo após homologação — carga full é necessária.

-- ── DW ────────────────────────────────────────────────────────────────────────
-- Recria a tabela com os campos corretos.
-- Tabela estava vazia (nenhuma carga executada ainda).

DROP TABLE IF EXISTS dw.fato_siconfi_extrato_entregas CASCADE;

CREATE TABLE dw.fato_siconfi_extrato_entregas (
  id               bigserial    PRIMARY KEY,
  id_ente          integer      NOT NULL,     -- cod_ibge da API
  no_ente          text         NULL,          -- nome do município (lookup local)
  exercicio        integer      NOT NULL,     -- campo "exercicio" da API
  periodo          integer      NOT NULL,     -- campo "periodo" da API (número)
  periodicidade    text         NOT NULL,     -- B=Bimestral Q=Quadrimestral M=Mensal A=Anual
  instituicao      text         NULL,          -- "Prefeitura Municipal de ..." ou "Câmara de ..."
  entregavel       text         NOT NULL,     -- nome por extenso do relatório
  co_entregavel    text         NULL,          -- código derivado: RREO, RGF, DCA, MSC, etc.
  status_relatorio text         NULL,          -- HO, RE ou null (não entregue)
  data_status      timestamptz  NULL,          -- data/hora do status
  forma_envio      text         NULL,          -- M=Manual, CSV
  tipo_relatorio   text         NULL,          -- P=Primário ou null
  atualizado_em    timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_siconfi_extrato_dw_ente
  ON dw.fato_siconfi_extrato_entregas (id_ente, exercicio);

CREATE INDEX IF NOT EXISTS idx_siconfi_extrato_dw_entregavel
  ON dw.fato_siconfi_extrato_entregas (co_entregavel, exercicio, periodo);

-- ── MART ──────────────────────────────────────────────────────────────────────
-- Recria a mart mantendo os mesmos nomes de colunas voltados para o frontend,
-- mas mapeados para os valores reais da API:
--   situacao_entrega_oficial  ← status_relatorio (HO / RE / null)
--   no_situacao_oficial       ← "Homologado" / "Retificado" / "Não entregue"
--   data_entrega              ← data_status::date
--
-- situacao_consolidada:
--   ENTREGUE_COM_DADO         — HO ou RE + dado local presente
--   ENTREGUE_SEM_DADO_LOCAL   — HO ou RE + sem dado carregado no Varadouro
--   SEM_ENTREGA_COM_DADO_LOCAL — null + dado local presente
--   SEM_ENTREGA_SEM_DADO      — null + sem dado local

DROP TABLE IF EXISTS mart.siconfi_rreo_extrato_entregas;

CREATE TABLE mart.siconfi_rreo_extrato_entregas (
  id_municipio                integer      NOT NULL,
  no_municipio                text         NULL,
  an_exercicio                integer      NOT NULL,
  nr_periodo                  integer      NOT NULL,
  -- Extrato oficial
  situacao_entrega_oficial    text         NULL,   -- HO, RE ou null
  no_situacao_oficial         text         NULL,   -- "Homologado", "Retificado", "Não entregue"
  data_entrega                date         NULL,   -- data_status::date
  protocolo                   text         NULL,   -- reservado (API não fornece)
  forma_envio                 text         NULL,   -- M, CSV
  tipo_relatorio              text         NULL,   -- P ou null
  -- Dados locais
  possui_dado_rreo_carregado  boolean      NOT NULL DEFAULT false,
  situacao_dado_local         text         NULL,   -- COM_DADO | SEM_DADO
  -- Consolidado
  situacao_consolidada        text         NULL,
  atualizado_em               timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (id_municipio, an_exercicio, nr_periodo)
);

CREATE INDEX IF NOT EXISTS idx_siconfi_rreo_extrato_periodo
  ON mart.siconfi_rreo_extrato_entregas (an_exercicio, nr_periodo);

CREATE INDEX IF NOT EXISTS idx_siconfi_rreo_extrato_consolidada
  ON mart.siconfi_rreo_extrato_entregas (an_exercicio, nr_periodo, situacao_consolidada);
