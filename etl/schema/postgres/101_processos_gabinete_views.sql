-- Views sobre public.processos_gabinete_raw
-- Ambas consideram somente o último snapshot (MAX carga_id)

-- View 1: Resumo agregado por gabinete
CREATE OR REPLACE VIEW public.vw_processos_gabinete_por_gabinete AS
SELECT
  id_grupo,
  grupo_atual,
  COUNT(*)                                                                   AS total_processos,
  SUM(CASE WHEN flag_mais_15_dias             = 1 THEN 1 ELSE 0 END)::int   AS processos_mais_15_dias,
  SUM(CASE WHEN flag_processo_sensivel        = 1 THEN 1 ELSE 0 END)::int   AS processos_sensiveis,
  SUM(CASE WHEN flag_prazo_regulamentar_vencido = 1 THEN 1 ELSE 0 END)::int AS processos_prazo_regulamentar_vencido,
  MAX(duracao_setor_dias)                                                    AS maior_duracao_setor,
  ROUND(AVG(duracao_setor_dias)::numeric, 1)                                AS media_dias_setor,
  MAX(coletado_em)                                                           AS atualizado_em
FROM public.processos_gabinete_raw
WHERE carga_id = (SELECT MAX(carga_id) FROM public.processos_gabinete_raw)
GROUP BY id_grupo, grupo_atual;

-- View 2: Detalhe de alertas ativos (uma linha por tipo de alerta por processo)
CREATE OR REPLACE VIEW public.vw_alertas_processos_gabinete AS
SELECT
  'processo_sensivel'::text        AS tipo_alerta,
  'Processo sensível'::text        AS titulo_alerta,
  'alto'::text                     AS nivel_alerta,
  processo, grupo_atual, id_grupo, relator, classe, assunto, orgao,
  atividade_atual, duracao_setor_dias, dias_em_atraso,
  data_chegada_setor_atual,
  coletado_em                      AS atualizado_em
FROM public.processos_gabinete_raw
WHERE carga_id = (SELECT MAX(carga_id) FROM public.processos_gabinete_raw)
  AND flag_processo_sensivel = 1

UNION ALL

SELECT
  'prazo_regulamentar_vencido'::text AS tipo_alerta,
  'Prazo de referência vencido'::text AS titulo_alerta,
  'alto'::text                       AS nivel_alerta,
  processo, grupo_atual, id_grupo, relator, classe, assunto, orgao,
  atividade_atual, duracao_setor_dias, dias_em_atraso,
  data_chegada_setor_atual,
  coletado_em                        AS atualizado_em
FROM public.processos_gabinete_raw
WHERE carga_id = (SELECT MAX(carga_id) FROM public.processos_gabinete_raw)
  AND flag_prazo_regulamentar_vencido = 1

UNION ALL

SELECT
  'mais_15_dias'::text             AS tipo_alerta,
  'Mais de 15 dias no setor'::text AS titulo_alerta,
  'medio'::text                    AS nivel_alerta,
  processo, grupo_atual, id_grupo, relator, classe, assunto, orgao,
  atividade_atual, duracao_setor_dias, dias_em_atraso,
  data_chegada_setor_atual,
  coletado_em                      AS atualizado_em
FROM public.processos_gabinete_raw
WHERE carga_id = (SELECT MAX(carga_id) FROM public.processos_gabinete_raw)
  AND flag_mais_15_dias = 1;
