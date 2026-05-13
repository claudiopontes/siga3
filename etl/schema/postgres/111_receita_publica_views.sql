-- Views, materialized view e função RPC do painel receita pública.
-- Depende de: 110_receita_publica.sql (tabela base)

-- View: KPIs mensais agregados
CREATE OR REPLACE VIEW public.vw_receita_publica_kpis AS
SELECT
  ano,
  mes,
  SUM(previsao_inicial)    AS previsao_inicial,
  SUM(previsao_atualizada) AS previsao_atualizada,
  SUM(receita_realizada)   AS receita_realizada,
  CASE
    WHEN SUM(previsao_atualizada) <> 0
      THEN SUM(receita_realizada) / SUM(previsao_atualizada)
    ELSE 0
  END AS percentual_execucao,
  COUNT(DISTINCT id_entidade) AS total_entidades,
  MAX(atualizado_em)       AS atualizado_em
FROM public.receita_publica_categoria_mensal
GROUP BY ano, mes;

-- View: por entidade/mês (granularidade reduzida para o painel)
DROP VIEW IF EXISTS public.vw_receita_publica_entidade_mensal;

CREATE VIEW public.vw_receita_publica_entidade_mensal AS
SELECT
  id_entidade,
  ano,
  mes,
  codigo,
  tipo_receita,
  SUM(previsao_inicial)    AS previsao_inicial,
  SUM(previsao_atualizada) AS previsao_atualizada,
  SUM(receita_realizada)   AS receita_realizada,
  MAX(atualizado_em)       AS atualizado_em
FROM public.receita_publica_categoria_mensal
GROUP BY id_entidade, ano, mes, codigo, tipo_receita;

-- View: por categoria/natureza
DROP VIEW IF EXISTS public.vw_receita_publica_categoria;

CREATE VIEW public.vw_receita_publica_categoria AS
SELECT
  ano,
  mes,
  codigo,
  COALESCE(natureza_codigo, codigo) AS natureza_codigo,
  COALESCE(natureza_nome,   codigo) AS natureza_nome,
  MAX(natureza_descricao)           AS natureza_descricao,
  natureza_nivel,
  natureza_tipo,
  tipo_receita,
  SUM(previsao_inicial)    AS previsao_inicial,
  SUM(previsao_atualizada) AS previsao_atualizada,
  SUM(receita_realizada)   AS receita_realizada,
  MAX(atualizado_em)       AS atualizado_em
FROM public.receita_publica_categoria_mensal
GROUP BY
  ano, mes, codigo,
  COALESCE(natureza_codigo, codigo),
  COALESCE(natureza_nome,   codigo),
  natureza_nivel, natureza_tipo, tipo_receita;

-- Materialized view: base da função RPC (índice único obrigatório para REFRESH CONCURRENTLY)
DROP MATERIALIZED VIEW IF EXISTS public.mv_receita_publica_entidade_mensal;

CREATE MATERIALIZED VIEW public.mv_receita_publica_entidade_mensal AS
SELECT
  id_entidade,
  ano,
  mes,
  codigo,
  tipo_receita,
  SUM(previsao_inicial)    AS previsao_inicial,
  SUM(previsao_atualizada) AS previsao_atualizada,
  SUM(receita_realizada)   AS receita_realizada,
  MAX(atualizado_em)       AS atualizado_em
FROM public.receita_publica_categoria_mensal
GROUP BY id_entidade, ano, mes, codigo, tipo_receita;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_receita_publica_pk
  ON public.mv_receita_publica_entidade_mensal (id_entidade, ano, mes, codigo, tipo_receita);

CREATE INDEX IF NOT EXISTS idx_mv_receita_publica_periodo
  ON public.mv_receita_publica_entidade_mensal (ano, mes);

CREATE INDEX IF NOT EXISTS idx_mv_receita_publica_entidade_periodo
  ON public.mv_receita_publica_entidade_mensal (id_entidade, ano, mes);

-- Função RPC: dados filtrados por período/entidade/ente
CREATE OR REPLACE FUNCTION public.fn_receita_publica_entidade_mensal(
  p_ano_inicio  INTEGER,
  p_ano_fim     INTEGER,
  p_id_ente     BIGINT DEFAULT NULL,
  p_id_entidade BIGINT DEFAULT NULL
)
RETURNS TABLE (
  id_entidade         BIGINT,
  ano                 INTEGER,
  mes                 INTEGER,
  codigo              TEXT,
  tipo_receita        TEXT,
  previsao_inicial    NUMERIC(18,2),
  previsao_atualizada NUMERIC(18,2),
  receita_realizada   NUMERIC(18,2)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id_entidade,
    m.ano,
    m.mes,
    m.codigo,
    m.tipo_receita,
    m.previsao_inicial,
    m.previsao_atualizada,
    m.receita_realizada
  FROM public.mv_receita_publica_entidade_mensal m
  JOIN public.dim_entidade d ON d.id_entidade = m.id_entidade
  WHERE m.ano BETWEEN p_ano_inicio AND p_ano_fim
    AND (p_id_entidade IS NULL OR m.id_entidade = p_id_entidade)
    AND (p_id_ente     IS NULL OR d.id_ente     = p_id_ente)
  ORDER BY m.ano, m.mes, m.id_entidade, m.codigo;
$$;

-- Função auxiliar para refresh da MV (chamada pelo ETL após cada carga)
CREATE OR REPLACE FUNCTION public.fn_refresh_mv_receita_publica_entidade_mensal()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_receita_publica_entidade_mensal;
END;
$$;
