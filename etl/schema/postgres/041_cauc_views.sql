-- Views do painel CAUC — dependem de 040_cauc.sql (tabelas base)
-- Todas filtram pelo último carga_id (snapshot mais recente)

-- View 1: Alertas por município (Acre) — consumida por /api/cauc/alertas
CREATE OR REPLACE VIEW public.vw_alertas_cauc_ac AS
SELECT
  r.codigo_ibge,
  MAX(r.nome_ente)                                                        AS nome_ente,
  COUNT(*)                                                                AS total_itens,
  SUM(CASE WHEN r.situacao_normalizada = 'nao_atendido' THEN 1 ELSE 0 END) AS total_pendencias,
  SUM(CASE WHEN r.situacao_normalizada = 'atendido'     THEN 1 ELSE 0 END) AS total_regulares,
  CASE
    WHEN SUM(CASE WHEN r.situacao_normalizada = 'nao_atendido' THEN 1 ELSE 0 END) > 5  THEN 'alto'
    WHEN SUM(CASE WHEN r.situacao_normalizada = 'nao_atendido' THEN 1 ELSE 0 END) > 0  THEN 'medio'
    ELSE 'baixo'
  END                                                                     AS nivel_alerta,
  c.data_referencia,
  MAX(r.inserido_em)                                                      AS atualizado_em
FROM public.cauc_situacao_raw r
JOIN public.cauc_carga c ON c.id = r.carga_id
WHERE r.carga_id = (SELECT MAX(id) FROM public.cauc_carga WHERE status = 'sucesso')
  AND r.uf = 'AC'
GROUP BY r.codigo_ibge, c.data_referencia;

-- View 2: Situação detalhada por município — consumida por /api/cauc/situacao
CREATE OR REPLACE VIEW public.vw_cauc_ac_ultima_situacao AS
SELECT
  r.id,
  r.codigo_ibge,
  r.nome_ente,
  r.item_codigo,
  r.item_descricao,
  r.grupo,
  r.situacao,
  r.situacao_normalizada
FROM public.cauc_situacao_raw r
WHERE r.carga_id = (SELECT MAX(id) FROM public.cauc_carga WHERE status = 'sucesso')
  AND r.uf = 'AC';

-- View 3: Metadados da última carga — consumida por /api/cauc/alertas
CREATE OR REPLACE VIEW public.vw_cauc_ultima_carga AS
SELECT
  id       AS carga_id,
  data_referencia,
  status,
  registros,
  finalizado_em
FROM public.cauc_carga
WHERE status = 'sucesso'
ORDER BY id DESC
LIMIT 1;
