-- 090_populacao_ibge.sql
-- Tabela para o ETL de populacao municipal IBGE

CREATE TABLE IF NOT EXISTS public.aux_populacao_ibge (
  cod_ibge      integer     NOT NULL,
  ano           integer     NOT NULL,
  populacao     integer     NOT NULL,
  fonte         text        NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cod_ibge, ano)
);

CREATE INDEX IF NOT EXISTS idx_aux_populacao_cod_ibge ON public.aux_populacao_ibge (cod_ibge);
CREATE INDEX IF NOT EXISTS idx_aux_populacao_ano      ON public.aux_populacao_ibge (ano);

-- View para obter a populacao vigente com fallback ao ano mais recente disponivel
CREATE OR REPLACE VIEW public.vw_populacao_ibge_vigente AS
SELECT DISTINCT ON (cod_ibge)
  cod_ibge,
  ano,
  populacao,
  fonte
FROM public.aux_populacao_ibge
WHERE ano <= EXTRACT(YEAR FROM now())
ORDER BY cod_ibge, ano DESC;
