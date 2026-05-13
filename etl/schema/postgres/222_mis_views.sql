-- 222_mis_views.sql
-- Views analíticas para dados MIS: Bolsa Família, BPC e Transferência de Renda
-- Depende de: 221_mis_bolsa_familia_bpc.sql

-- ---------------------------------------------------------------------------
-- View base: apenas registros de competências totalmente consolidadas.
-- Exclui competências onde o BPC está zerado em TODOS os municípios,
-- pois isso indica mês ainda não publicado/consolidado pela fonte (MIS/MDS).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW social.vw_mis_dados_validos AS
WITH competencias_validas AS (
  SELECT ano_mes
  FROM social.mis_bolsa_familia_bpc
  WHERE ano_mes <= to_char(now(), 'YYYY-MM')
  GROUP BY ano_mes
  HAVING SUM(COALESCE(bpc_quantidade_total, 0)) > 0
     AND (SUM(COALESCE(bf_quantidade_familias, 0)) > 0 OR SUM(COALESCE(bf_valor_repassado, 0)) > 0)
)
SELECT
  m.id,
  m.ano,
  m.mes,
  m.ano_mes,
  m.codigo_ibge_municipio,
  m.nome_municipio,
  m.bf_quantidade_familias,
  m.bf_valor_repassado,
  m.bpc_quantidade_total,
  m.bpc_quantidade_deficiencia,
  m.bpc_quantidade_idoso,
  m.bpc_valor_deficiencia,
  m.bpc_valor_idoso,
  m.bpc_valor_total,
  m.populacao_estimada,
  m.fonte,
  m.data_carga,

  CASE WHEN COALESCE(m.bf_quantidade_familias, 0) > 0
    THEN ROUND(m.bf_valor_repassado / m.bf_quantidade_familias, 2)
    ELSE NULL
  END AS bf_valor_medio_familia,

  CASE WHEN COALESCE(m.bpc_quantidade_total, 0) > 0
    THEN ROUND(m.bpc_valor_total / m.bpc_quantidade_total, 2)
    ELSE NULL
  END AS bpc_valor_medio_beneficiario,

  CASE WHEN COALESCE(m.bpc_quantidade_total, 0) > 0
    THEN ROUND(m.bpc_quantidade_deficiencia::numeric / m.bpc_quantidade_total * 100, 1)
    ELSE NULL
  END AS pct_bpc_deficiencia,

  CASE WHEN COALESCE(m.bpc_quantidade_total, 0) > 0
    THEN ROUND(m.bpc_quantidade_idoso::numeric / m.bpc_quantidade_total * 100, 1)
    ELSE NULL
  END AS pct_bpc_idoso,

  CASE WHEN COALESCE(m.populacao_estimada, 0) > 0
    THEN ROUND(m.bf_quantidade_familias / m.populacao_estimada * 1000, 2)
    ELSE NULL
  END AS bf_por_1000_hab,

  CASE WHEN COALESCE(m.populacao_estimada, 0) > 0
    THEN ROUND(m.bpc_quantidade_total / m.populacao_estimada * 1000, 2)
    ELSE NULL
  END AS bpc_por_1000_hab

FROM social.mis_bolsa_familia_bpc m
INNER JOIN competencias_validas cv ON cv.ano_mes = m.ano_mes;

-- ---------------------------------------------------------------------------
-- View: variação mensal e anual por município
-- Usa self-join para evitar problemas com lacunas na série
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW social.vw_mis_variacao AS
SELECT
  v.*,

  -- Mês anterior (última competência anterior para este município)
  prev_m.bf_quantidade_familias  AS bf_qty_mes_anterior,
  prev_m.bf_valor_repassado      AS bf_valor_mes_anterior,
  prev_m.bpc_quantidade_total    AS bpc_qty_mes_anterior,

  -- Variações mensais absolutas
  v.bf_quantidade_familias  - prev_m.bf_quantidade_familias  AS var_mensal_bf_qty,
  v.bf_valor_repassado      - prev_m.bf_valor_repassado      AS var_mensal_bf_valor,
  v.bpc_quantidade_total    - prev_m.bpc_quantidade_total    AS var_mensal_bpc_qty,

  -- Variações mensais percentuais
  CASE WHEN COALESCE(prev_m.bf_quantidade_familias, 0) > 0
    THEN ROUND((v.bf_quantidade_familias - prev_m.bf_quantidade_familias)
              / prev_m.bf_quantidade_familias * 100, 1)
    ELSE NULL
  END AS var_mensal_bf_qty_pct,

  CASE WHEN COALESCE(prev_m.bpc_quantidade_total, 0) > 0
    THEN ROUND((v.bpc_quantidade_total - prev_m.bpc_quantidade_total)
              / prev_m.bpc_quantidade_total * 100, 1)
    ELSE NULL
  END AS var_mensal_bpc_qty_pct,

  -- Mesmo mês do ano anterior (ano_mes - 1 ano = YYYY-1-MM)
  prev_a.bf_quantidade_familias  AS bf_qty_ano_anterior,
  prev_a.bf_valor_repassado      AS bf_valor_ano_anterior,
  prev_a.bpc_quantidade_total    AS bpc_qty_ano_anterior,

  -- Variações anuais absolutas
  v.bf_quantidade_familias  - prev_a.bf_quantidade_familias  AS var_anual_bf_qty,
  v.bf_valor_repassado      - prev_a.bf_valor_repassado      AS var_anual_bf_valor,
  v.bpc_quantidade_total    - prev_a.bpc_quantidade_total    AS var_anual_bpc_qty,

  -- Variações anuais percentuais
  CASE WHEN COALESCE(prev_a.bf_quantidade_familias, 0) > 0
    THEN ROUND((v.bf_quantidade_familias - prev_a.bf_quantidade_familias)
              / prev_a.bf_quantidade_familias * 100, 1)
    ELSE NULL
  END AS var_anual_bf_qty_pct,

  CASE WHEN COALESCE(prev_a.bf_valor_repassado, 0) > 0
    THEN ROUND((v.bf_valor_repassado - prev_a.bf_valor_repassado)
              / prev_a.bf_valor_repassado * 100, 1)
    ELSE NULL
  END AS var_anual_bf_valor_pct,

  CASE WHEN COALESCE(prev_a.bpc_quantidade_total, 0) > 0
    THEN ROUND((v.bpc_quantidade_total - prev_a.bpc_quantidade_total)
              / prev_a.bpc_quantidade_total * 100, 1)
    ELSE NULL
  END AS var_anual_bpc_qty_pct

FROM social.vw_mis_dados_validos v

-- Mês imediatamente anterior para o mesmo município
LEFT JOIN LATERAL (
  SELECT bf_quantidade_familias, bf_valor_repassado, bpc_quantidade_total
  FROM social.vw_mis_dados_validos
  WHERE codigo_ibge_municipio = v.codigo_ibge_municipio
    AND ano_mes < v.ano_mes
  ORDER BY ano_mes DESC
  LIMIT 1
) prev_m ON true

-- Mesmo mês do ano anterior
LEFT JOIN social.vw_mis_dados_validos prev_a
  ON prev_a.codigo_ibge_municipio = v.codigo_ibge_municipio
  AND prev_a.ano_mes = to_char(
        (to_date(v.ano_mes, 'YYYY-MM') - INTERVAL '1 year'),
        'YYYY-MM'
      );

-- ---------------------------------------------------------------------------
-- View: alertas para o gabinete (competência mais recente por município)
-- Usa ROW_NUMBER para evitar LIMIT/ORDER BY em UNION ALL
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW social.vw_mis_alertas_gabinete AS
WITH ultima_competencia AS (
  SELECT MAX(ano_mes) AS ano_mes
  FROM social.vw_mis_dados_validos
),
municipios_recentes AS (
  SELECT v.*
  FROM social.vw_mis_variacao v
  INNER JOIN ultima_competencia uc ON v.ano_mes = uc.ano_mes
),
media_geral AS (
  SELECT
    AVG(bf_quantidade_familias) AS media_bf_qty,
    AVG(bf_por_1000_hab)        AS media_bf_1000,
    AVG(bpc_por_1000_hab)       AS media_bpc_1000
  FROM municipios_recentes
),

-- Alerta 1: Maior materialidade BF (top 3)
a1 AS (
  SELECT
    mr.ano_mes, mr.codigo_ibge_municipio, mr.nome_municipio,
    'maior_materialidade_bf'   AS tipo_alerta,
    'ALTO'::text               AS nivel_alerta,
    'bf_quantidade_familias'   AS indicador_base,
    mr.bf_quantidade_familias  AS valor_indicador,
    mr.var_mensal_bf_qty_pct   AS var_mensal_pct,
    mr.var_anual_bf_qty_pct    AS var_anual_pct,
    'Município com maior quantidade de famílias no Bolsa Família na competência atual.' AS descricao,
    'Materialidade social e financeira elevada. Recomenda-se acompanhar execução orçamentária da assistência social e cruzar com dados de educação e saúde.' AS justificativa,
    ROW_NUMBER() OVER (ORDER BY mr.bf_quantidade_familias DESC NULLS LAST) AS rn
  FROM municipios_recentes mr, media_geral
),

-- Alerta 2: Maior crescimento anual BF (top 3)
a2 AS (
  SELECT
    mr.ano_mes, mr.codigo_ibge_municipio, mr.nome_municipio,
    'crescimento_anual_bf'     AS tipo_alerta,
    CASE
      WHEN COALESCE(mr.var_anual_bf_qty_pct, 0) > 10 THEN 'ALTO'
      WHEN COALESCE(mr.var_anual_bf_qty_pct, 0) > 5  THEN 'MEDIO'
      ELSE 'BAIXO'
    END::text                  AS nivel_alerta,
    'var_anual_bf_qty_pct'     AS indicador_base,
    mr.var_anual_bf_qty_pct    AS valor_indicador,
    mr.var_mensal_bf_qty_pct   AS var_mensal_pct,
    mr.var_anual_bf_qty_pct    AS var_anual_pct,
    'Município com maior crescimento anual de famílias no Bolsa Família.' AS descricao,
    'Crescimento expressivo pode indicar aumento de vulnerabilidade social, atualização cadastral, mudança de política pública ou efeito de crise local. Necessita análise complementar.' AS justificativa,
    ROW_NUMBER() OVER (ORDER BY mr.var_anual_bf_qty_pct DESC NULLS LAST) AS rn
  FROM municipios_recentes mr
  WHERE mr.var_anual_bf_qty_pct IS NOT NULL
),

-- Alerta 3: Maior concentração BF por 1.000 hab (top 3)
a3 AS (
  SELECT
    mr.ano_mes, mr.codigo_ibge_municipio, mr.nome_municipio,
    'concentracao_bf_1000_hab' AS tipo_alerta,
    CASE
      WHEN COALESCE(mr.bf_por_1000_hab, 0) > (mg.media_bf_1000 * 1.5) THEN 'ALTO'
      WHEN COALESCE(mr.bf_por_1000_hab, 0) > (mg.media_bf_1000 * 1.2) THEN 'MEDIO'
      ELSE 'BAIXO'
    END::text                  AS nivel_alerta,
    'bf_por_1000_hab'          AS indicador_base,
    mr.bf_por_1000_hab         AS valor_indicador,
    mr.var_mensal_bf_qty_pct   AS var_mensal_pct,
    mr.var_anual_bf_qty_pct    AS var_anual_pct,
    'Município com alta concentração de famílias no Bolsa Família por 1.000 habitantes.' AS descricao,
    'Concentração acima da média estadual indica maior dependência relativa de transferência de renda. Prioridade para acompanhamento de programas sociais municipais.' AS justificativa,
    ROW_NUMBER() OVER (ORDER BY mr.bf_por_1000_hab DESC NULLS LAST) AS rn
  FROM municipios_recentes mr, media_geral mg
),

-- Alerta 4: Maior crescimento anual BPC (top 3)
a4 AS (
  SELECT
    mr.ano_mes, mr.codigo_ibge_municipio, mr.nome_municipio,
    'crescimento_anual_bpc'    AS tipo_alerta,
    CASE
      WHEN COALESCE(mr.var_anual_bpc_qty_pct, 0) > 10 THEN 'ALTO'
      WHEN COALESCE(mr.var_anual_bpc_qty_pct, 0) > 5  THEN 'MEDIO'
      ELSE 'BAIXO'
    END::text                  AS nivel_alerta,
    'var_anual_bpc_qty_pct'    AS indicador_base,
    mr.var_anual_bpc_qty_pct   AS valor_indicador,
    mr.var_mensal_bpc_qty_pct  AS var_mensal_pct,
    mr.var_anual_bpc_qty_pct   AS var_anual_pct,
    'Município com maior crescimento anual de beneficiários BPC.' AS descricao,
    'Crescimento do BPC pode refletir envelhecimento populacional, maior acesso por pessoas com deficiência ou variação cadastral. Ponto de atenção para análise do controle externo.' AS justificativa,
    ROW_NUMBER() OVER (ORDER BY mr.var_anual_bpc_qty_pct DESC NULLS LAST) AS rn
  FROM municipios_recentes mr
  WHERE mr.var_anual_bpc_qty_pct IS NOT NULL
)

SELECT ano_mes, codigo_ibge_municipio, nome_municipio, tipo_alerta, nivel_alerta,
       indicador_base, valor_indicador, var_mensal_pct, var_anual_pct, descricao, justificativa
FROM a1 WHERE rn <= 3
UNION ALL
SELECT ano_mes, codigo_ibge_municipio, nome_municipio, tipo_alerta, nivel_alerta,
       indicador_base, valor_indicador, var_mensal_pct, var_anual_pct, descricao, justificativa
FROM a2 WHERE rn <= 3
UNION ALL
SELECT ano_mes, codigo_ibge_municipio, nome_municipio, tipo_alerta, nivel_alerta,
       indicador_base, valor_indicador, var_mensal_pct, var_anual_pct, descricao, justificativa
FROM a3 WHERE rn <= 3
UNION ALL
SELECT ano_mes, codigo_ibge_municipio, nome_municipio, tipo_alerta, nivel_alerta,
       indicador_base, valor_indicador, var_mensal_pct, var_anual_pct, descricao, justificativa
FROM a4 WHERE rn <= 3

UNION ALL

-- Alerta 5: Dados zerados ou ausentes na competência recente
SELECT
  mr.ano_mes, mr.codigo_ibge_municipio, mr.nome_municipio,
  'dados_zerados_ausentes'           AS tipo_alerta,
  'MEDIO'::text                      AS nivel_alerta,
  'qualidade_dados'                  AS indicador_base,
  NULL::numeric                      AS valor_indicador,
  NULL::numeric                      AS var_mensal_pct,
  NULL::numeric                      AS var_anual_pct,
  'Município com possível dado ausente ou incompatível na competência mais recente.' AS descricao,
  'Ausência ou inconsistência de dados pode indicar falha na carga, atraso na consolidação ou descontinuidade de registro. Recomenda-se verificar a fonte primária antes de conclusões.' AS justificativa
FROM municipios_recentes mr
WHERE (
  COALESCE(mr.bf_quantidade_familias, 0) = 0 AND COALESCE(mr.bf_valor_repassado, 0) = 0
) OR COALESCE(mr.populacao_estimada, 0) = 0;
