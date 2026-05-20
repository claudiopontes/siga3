-- 275_mart_gasto_aluno_tce.sql
-- Adiciona colunas calculadas a partir do empenho/receita do TCE-AC (fato_empenho
-- + receita_publica_categoria_mensal), permitindo comparar com o que o ente
-- reportou no RREO Anexo 8 do SICONFI.
--
-- Despesa: SUM(valor_liquidado) função 12 (Educação) exceto sub-funções
-- 122 (Adm Geral), 367 (Ed. Especial não obrigatória), 392 (Difusão Cultural).
-- Receita base MDE: impostos próprios + transferências constitucionais
-- (excluindo FUNDEB e transferências de saúde).
-- % Aplicado = despesa MDE / receita base × 100.
--
-- Convergência com SICONFI: divergencia_mde_pct = (pct_aplicado_tce - pct_aplicado_siconfi)
-- (positivo = TCE registrou mais que reportado; negativo = TCE registrou menos).

ALTER TABLE mart.gasto_aluno_municipio
  ADD COLUMN IF NOT EXISTS total_mde_tce             numeric NULL,
  ADD COLUMN IF NOT EXISTS total_despesa_educacao_tce numeric NULL,
  ADD COLUMN IF NOT EXISTS receita_base_mde_tce      numeric NULL,
  ADD COLUMN IF NOT EXISTS pct_aplicado_mde_tce      numeric NULL,
  ADD COLUMN IF NOT EXISTS gasto_aluno_mde_tce       numeric NULL,
  ADD COLUMN IF NOT EXISTS ano_referencia_tce        integer NULL,
  ADD COLUMN IF NOT EXISTS divergencia_mde_pct       numeric NULL;
