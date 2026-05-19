-- =============================================================================
-- Consultas operacionais de auditoria do Assistente Aquiry — piloto
-- =============================================================================
-- Estas consultas usam APENAS metadados da tabela public.aquiry_evento_uso.
-- Nenhuma pergunta ou resposta do usuário é exposta — não há colunas com
-- conteúdo textual livre. Os campos disponíveis são:
--   tipo, estrategia, rota, tipo_pagina, bases (jsonb), flags booleanas,
--   tamanho_pergunta, tamanho_resposta, tempo_resposta_ms, erro_codigo,
--   timestamp, created_at.
--
-- Use-as para governança, acompanhamento de adoção, desempenho do modelo
-- e identificação de lacunas (perguntas que exigem fonte estruturada que
-- ainda não está disponível, telas com mais uso, latência fora da curva,
-- erros recorrentes).
--
-- Política: respeite as regras institucionais de retenção, segurança e LGPD
-- do TCE-AC. Acesso a estas consultas deve ser limitado a perfis com
-- necessidade legítima de avaliar o piloto.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- A. Volume diário de uso
-- -----------------------------------------------------------------------------
-- Visão geral por dia: quantos eventos, perguntas, respostas e erros.
-- Útil para ver curvas de adoção e identificar dias atípicos.
SELECT
  date_trunc('day', timestamp)::date                        AS data,
  COUNT(*)                                                  AS total_eventos,
  COUNT(*) FILTER (WHERE tipo = 'pergunta')                 AS total_perguntas,
  COUNT(*) FILTER (WHERE tipo = 'resposta')                 AS total_respostas,
  COUNT(*) FILTER (WHERE tipo = 'erro')                     AS total_erros
FROM public.aquiry_evento_uso
GROUP BY 1
ORDER BY 1 DESC;


-- -----------------------------------------------------------------------------
-- B. Uso por estratégia (sobre respostas)
-- -----------------------------------------------------------------------------
-- Distribuição de respostas entre varadouro, conhecimento_geral e busca_externa.
SELECT
  estrategia,
  COUNT(*)                                                  AS quantidade_respostas,
  ROUND(
    100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0),
    2
  )                                                         AS percentual
FROM public.aquiry_evento_uso
WHERE tipo = 'resposta'
GROUP BY estrategia
ORDER BY quantidade_respostas DESC;


-- -----------------------------------------------------------------------------
-- C. Uso por estratégia por dia
-- -----------------------------------------------------------------------------
-- Evolução diária de cada estratégia — útil para acompanhar mudanças após
-- ajustes de prompt, classificador ou base documental.
SELECT
  date_trunc('day', timestamp)::date                        AS data,
  estrategia,
  COUNT(*)                                                  AS quantidade_respostas
FROM public.aquiry_evento_uso
WHERE tipo = 'resposta'
GROUP BY 1, 2
ORDER BY 1 DESC, quantidade_respostas DESC;


-- -----------------------------------------------------------------------------
-- D. Telas/rotas mais usadas
-- -----------------------------------------------------------------------------
-- Onde o assistente é mais acionado. Apoia decisão sobre quais telas
-- merecem prioridade para evoluir contexto/análise contextual determinística.
SELECT
  rota,
  tipo_pagina,
  COUNT(*) FILTER (WHERE tipo = 'pergunta')                 AS total_perguntas,
  COUNT(*) FILTER (WHERE tipo = 'resposta')                 AS total_respostas,
  MAX(timestamp)                                            AS ultima_interacao
FROM public.aquiry_evento_uso
WHERE rota IS NOT NULL
GROUP BY rota, tipo_pagina
ORDER BY total_perguntas DESC NULLS LAST
LIMIT 50;


-- -----------------------------------------------------------------------------
-- E. Uso das bases (sobre respostas)
-- -----------------------------------------------------------------------------
-- Quantas respostas usaram cada tipo de base. Indica o quanto o assistente
-- depende de contexto de tela, análise contextual, base documental e
-- pesquisa externa. Inclui os sinais sobre fonte oficial/estruturada.
SELECT
  COUNT(*) FILTER (WHERE usou_contexto_tela           = true) AS com_contexto_tela,
  COUNT(*) FILTER (WHERE usou_analise_contextual      = true) AS com_analise_contextual,
  COUNT(*) FILTER (WHERE usou_base_documental         = true) AS com_base_documental,
  COUNT(*) FILTER (WHERE usou_pesquisa_externa        = true) AS com_pesquisa_externa,
  COUNT(*) FILTER (WHERE exige_fonte_estruturada      = true) AS com_exigencia_estruturada,
  COUNT(*) FILTER (WHERE fonte_estruturada_encontrada = true) AS com_fonte_estruturada_encontrada,
  COUNT(*) FILTER (WHERE fontes_oficiais_encontradas  = true) AS com_fontes_oficiais_encontradas,
  COUNT(*)                                                    AS total_respostas
FROM public.aquiry_evento_uso
WHERE tipo = 'resposta';


-- -----------------------------------------------------------------------------
-- F. Lacuna de fonte estruturada por rota/tipo_pagina/estratégia
-- -----------------------------------------------------------------------------
-- Onde o assistente está sendo pedido para responder a algo que exige base
-- estruturada (SIOPE/FNDE, SICONFI/RREO, DataSUS/SIOPS) mas a fonte estruturada
-- não foi encontrada na pesquisa externa. Sinaliza prioridades para integrar
-- ou expor base estruturada no Varadouro.
SELECT
  rota,
  tipo_pagina,
  estrategia,
  COUNT(*)                                                                AS total_respostas,
  COUNT(*) FILTER (WHERE exige_fonte_estruturada = true)                  AS total_exigiu_fonte_estruturada,
  COUNT(*) FILTER (
    WHERE exige_fonte_estruturada = true
      AND COALESCE(fonte_estruturada_encontrada, false) = false
  )                                                                       AS total_sem_fonte_estruturada,
  ROUND(
    100.0
    * COUNT(*) FILTER (
        WHERE exige_fonte_estruturada = true
          AND COALESCE(fonte_estruturada_encontrada, false) = false
      )
    / NULLIF(
        COUNT(*) FILTER (WHERE exige_fonte_estruturada = true), 0
      ),
    2
  )                                                                       AS percentual_sem_fonte_estruturada
FROM public.aquiry_evento_uso
WHERE tipo = 'resposta'
GROUP BY rota, tipo_pagina, estrategia
HAVING COUNT(*) FILTER (WHERE exige_fonte_estruturada = true) > 0
ORDER BY total_sem_fonte_estruturada DESC, total_respostas DESC;


-- -----------------------------------------------------------------------------
-- G. Pesquisa externa — visão consolidada
-- -----------------------------------------------------------------------------
-- Acompanha o comportamento da busca externa via Gemini.
SELECT
  COUNT(*) FILTER (WHERE usou_pesquisa_externa = true)            AS total_com_pesquisa_externa,
  COUNT(*) FILTER (WHERE pesquisa_externa_suficiente = true)      AS total_pesquisa_suficiente,
  COUNT(*) FILTER (WHERE pesquisa_externa_suficiente = false)     AS total_pesquisa_insuficiente,
  COUNT(*) FILTER (WHERE fontes_oficiais_encontradas = true)      AS total_com_fontes_oficiais,
  COUNT(*) FILTER (WHERE fonte_estruturada_encontrada = true)     AS total_com_fonte_estruturada
FROM public.aquiry_evento_uso
WHERE tipo = 'resposta';


-- -----------------------------------------------------------------------------
-- H. Latência por estratégia
-- -----------------------------------------------------------------------------
-- P50 e P95 ajudam a detectar regressões de performance. Considera apenas
-- respostas com tempo registrado.
SELECT
  estrategia,
  COUNT(*)                                                                 AS quantidade,
  ROUND(AVG(tempo_resposta_ms))::int                                       AS tempo_medio_ms,
  percentile_cont(0.50) WITHIN GROUP (ORDER BY tempo_resposta_ms)::int     AS p50_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY tempo_resposta_ms)::int     AS p95_ms,
  MAX(tempo_resposta_ms)                                                   AS max_ms
FROM public.aquiry_evento_uso
WHERE tipo = 'resposta'
  AND tempo_resposta_ms IS NOT NULL
GROUP BY estrategia
ORDER BY quantidade DESC;


-- -----------------------------------------------------------------------------
-- I. Erros — agrupados por código sanitizado
-- -----------------------------------------------------------------------------
-- erro_codigo é sanitizado pela camada de auditoria (apenas [a-z0-9_-], máx 60).
SELECT
  COALESCE(erro_codigo, '(sem_codigo)')          AS erro_codigo,
  COUNT(*)                                       AS quantidade,
  MIN(timestamp)                                 AS primeira_ocorrencia,
  MAX(timestamp)                                 AS ultima_ocorrencia
FROM public.aquiry_evento_uso
WHERE tipo = 'erro'
GROUP BY 1
ORDER BY quantidade DESC, ultima_ocorrencia DESC;


-- -----------------------------------------------------------------------------
-- J. Adoção semanal
-- -----------------------------------------------------------------------------
-- Tendência semanal de uso, com diversidade de rotas/estratégias e
-- tempo médio de resposta.
SELECT
  date_trunc('week', timestamp)::date                              AS semana,
  COUNT(*) FILTER (WHERE tipo = 'pergunta')                        AS total_perguntas,
  COUNT(*) FILTER (WHERE tipo = 'resposta')                        AS total_respostas,
  COUNT(DISTINCT rota) FILTER (WHERE tipo = 'pergunta')            AS rotas_distintas,
  COUNT(DISTINCT estrategia) FILTER (WHERE tipo = 'resposta')      AS estrategias_distintas,
  ROUND(
    AVG(tempo_resposta_ms) FILTER (WHERE tipo = 'resposta')
  )::int                                                           AS tempo_medio_resposta_ms
FROM public.aquiry_evento_uso
GROUP BY 1
ORDER BY 1 DESC;


-- -----------------------------------------------------------------------------
-- K. Bases mais frequentes (jsonb → linhas)
-- -----------------------------------------------------------------------------
-- bases é jsonb (array textual). Esta consulta "achata" para contar quantas
-- vezes cada base apareceu nas respostas.
SELECT
  base,
  COUNT(*) AS quantidade
FROM public.aquiry_evento_uso,
     jsonb_array_elements_text(bases) AS base
WHERE tipo = 'resposta'
  AND bases IS NOT NULL
GROUP BY base
ORDER BY quantidade DESC;


-- -----------------------------------------------------------------------------
-- L. Últimos 50 eventos (inspeção operacional)
-- -----------------------------------------------------------------------------
-- Consulta simples para olhar a fila recente — útil em diagnóstico do dia.
SELECT
  id,
  timestamp,
  tipo,
  estrategia,
  rota,
  tipo_pagina,
  bases,
  usou_contexto_tela,
  usou_analise_contextual,
  usou_base_documental,
  usou_pesquisa_externa,
  pesquisa_externa_suficiente,
  exige_fonte_estruturada,
  fonte_estruturada_encontrada,
  fontes_oficiais_encontradas,
  tempo_resposta_ms,
  erro_codigo
FROM public.aquiry_evento_uso
ORDER BY timestamp DESC
LIMIT 50;
