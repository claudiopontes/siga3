-- =============================================================
-- Supabase - Views do Painel de Despesa
-- Executar no SQL Editor do Supabase
-- Dependência: tabela public.fato_empenho deve existir e ter dados
-- =============================================================

-- View principal: agrega fato_empenho por mês/ente/credor/classificação
-- Usa ano_remessa + id_entidade (colunas indexadas) como chave primária de filtro
CREATE OR REPLACE VIEW public.vw_despesa_painel AS
SELECT
  fe.ano_remessa,
  fe.id_entidade,
  date_trunc('month', fe.data_empenho)::date        AS mes_empenho,
  fe.cpf_cnpj_credor,
  fe.numero_categoria_economica,
  fe.numero_grupo_natureza_despesa,
  SUM(fe.valor_empenhado_liquido)                   AS valor_empenhado_liquido,
  SUM(fe.valor_liquidado)                           AS valor_liquidado,
  SUM(fe.valor_pago)                                AS valor_pago,
  SUM(fe.valor_a_liquidar)                          AS valor_a_liquidar,
  SUM(fe.valor_a_pagar)                             AS valor_a_pagar,
  COUNT(*)                                          AS qtd_empenhos
FROM public.fato_empenho fe
GROUP BY 1, 2, 3, 4, 5, 6;

-- Política RLS: a view herda as políticas da tabela base,
-- mas é boa prática garantir que a role anon consiga selecionar
GRANT SELECT ON public.vw_despesa_painel TO anon, authenticated;

-- =============================================================
-- Índice sugerido para a coluna ano_empenho (caso prefira filtrar por ela)
-- Rodar apenas se quiser usar ano_empenho como filtro em vez de ano_remessa
-- CREATE INDEX IF NOT EXISTS idx_fato_empenho_ano_empenho
--   ON public.fato_empenho (ano_empenho);
-- =============================================================
