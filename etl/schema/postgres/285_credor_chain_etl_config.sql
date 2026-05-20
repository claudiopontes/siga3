-- 285_credor_chain_etl_config.sql
-- Registra a cadeia de enriquecimento de credores no painel /seguranca/etl:
--   credor_preparar           — extrai documentos distintos de fato_empenho
--   credor_enriquecer_interno — busca nomes em fontes internas (APC/SQL Server)
--   credor_enriquecer_cnpj    — busca nomes em API CNPJ externa (BrasilAPI)
--   mart_credor_despesa       — refresh dos marts de credores
--
-- Ordem é a do schedule.ts. A migration também não registra dependências
-- entre eles — o vínculo é exposto via ETL_CONFIG.dependeDe no front.

INSERT INTO audit.etl_monitoramento_config (
  modulo, nome_exibicao, periodicidade, tolerancia_dias,
  ativo_painel, descricao, ordem_exibicao
)
VALUES
  ('credor_preparar',
   'Credor — Preparar candidatos',
   'diaria', 1, true,
   'Extrai documentos distintos de fato_empenho para dw.dim_credor_enriquecido. Primeira etapa da cadeia de enriquecimento.',
   30),
  ('credor_enriquecer_interno',
   'Credor — Enriquecer (fontes internas)',
   'diaria', 1, true,
   'Busca nomes de credores em fontes internas (APC/SQL Server) e atualiza dw.dim_credor_enriquecido.',
   31),
  ('credor_enriquecer_cnpj',
   'Credor — Enriquecer (API CNPJ)',
   'diaria', 1, true,
   'Para CPFs/CNPJs ainda pendentes, consulta API externa (BrasilAPI) e atualiza dw.dim_credor_enriquecido.',
   32),
  ('mart_credor_despesa',
   'Mart Credores (despesa)',
   'diaria', 1, true,
   'Reconstrói as marts de pesquisa e análise de credores a partir de fato_empenho + dim_credor_enriquecido.',
   33)
ON CONFLICT (modulo) DO UPDATE
SET
  nome_exibicao   = EXCLUDED.nome_exibicao,
  periodicidade   = EXCLUDED.periodicidade,
  tolerancia_dias = EXCLUDED.tolerancia_dias,
  ativo_painel    = EXCLUDED.ativo_painel,
  descricao       = EXCLUDED.descricao,
  ordem_exibicao  = EXCLUDED.ordem_exibicao,
  atualizado_em   = now();
