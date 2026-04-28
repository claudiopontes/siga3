-- =============================================================
-- Supabase schema - Painel Receita Publica
-- Fonte: audit.vw_ReceitaPorCategoria (SQL Server)
-- Executar no SQL Editor do Supabase antes da primeira carga
-- =============================================================

CREATE TABLE IF NOT EXISTS public.receita_publica_categoria_mensal (
  id BIGSERIAL PRIMARY KEY,
  id_remessa BIGINT NOT NULL,
  id_entidade_cjur BIGINT,
  id_entidade BIGINT NOT NULL,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  id_natureza_receita_orcamentaria BIGINT,
  id_catreceita BIGINT,
  codigo TEXT NOT NULL,
  natureza_codigo TEXT,
  natureza_nome TEXT,
  natureza_descricao TEXT,
  natureza_nivel INTEGER,
  natureza_tipo TEXT,
  natureza_ano_inicio INTEGER,
  natureza_ano_fim INTEGER,
  numero_fonte_recurso BIGINT,
  fonte_classificacao TEXT,
  fonte_nome TEXT,
  codigo_conta_contabil TEXT NOT NULL,
  tipo_receita TEXT NOT NULL,
  previsao_inicial NUMERIC(18,2) NOT NULL DEFAULT 0,
  previsao_atualizada NUMERIC(18,2) NOT NULL DEFAULT 0,
  receita_realizada NUMERIC(18,2) NOT NULL DEFAULT 0,
  registros_origem BIGINT NOT NULL DEFAULT 0,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (
    id_remessa,
    id_entidade_cjur,
    id_entidade,
    ano,
    mes,
    id_natureza_receita_orcamentaria,
    id_catreceita,
    codigo,
    numero_fonte_recurso,
    codigo_conta_contabil,
    tipo_receita
  )
);

CREATE INDEX IF NOT EXISTS idx_receita_publica_competencia
  ON public.receita_publica_categoria_mensal (ano, mes);

CREATE INDEX IF NOT EXISTS idx_receita_publica_entidade_competencia
  ON public.receita_publica_categoria_mensal (id_entidade, ano, mes);

CREATE INDEX IF NOT EXISTS idx_receita_publica_codigo_competencia
  ON public.receita_publica_categoria_mensal (codigo, ano, mes);

CREATE INDEX IF NOT EXISTS idx_receita_publica_natureza_nome
  ON public.receita_publica_categoria_mensal (natureza_nome);

CREATE INDEX IF NOT EXISTS idx_receita_publica_fonte_competencia
  ON public.receita_publica_categoria_mensal (numero_fonte_recurso, ano, mes);

CREATE INDEX IF NOT EXISTS idx_receita_publica_tipo_competencia
  ON public.receita_publica_categoria_mensal (tipo_receita, ano, mes);

CREATE INDEX IF NOT EXISTS idx_receita_publica_realizada_desc
  ON public.receita_publica_categoria_mensal (receita_realizada DESC);

ALTER TABLE public.receita_publica_categoria_mensal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_receita_publica_categoria_mensal_anon"
  ON public.receita_publica_categoria_mensal;

CREATE POLICY "read_receita_publica_categoria_mensal_anon"
ON public.receita_publica_categoria_mensal
FOR SELECT
TO anon, authenticated
USING (true);

CREATE OR REPLACE VIEW public.vw_receita_publica_kpis AS
SELECT
  ano,
  mes,
  SUM(previsao_inicial) AS previsao_inicial,
  SUM(previsao_atualizada) AS previsao_atualizada,
  SUM(receita_realizada) AS receita_realizada,
  CASE
    WHEN SUM(previsao_atualizada) <> 0
      THEN SUM(receita_realizada) / SUM(previsao_atualizada)
    ELSE 0
  END AS percentual_execucao,
  COUNT(DISTINCT id_entidade) AS total_entidades,
  MAX(atualizado_em) AS atualizado_em
FROM public.receita_publica_categoria_mensal
GROUP BY ano, mes;

DROP VIEW IF EXISTS public.vw_receita_publica_categoria;

CREATE VIEW public.vw_receita_publica_categoria AS
SELECT
  ano,
  mes,
  codigo,
  COALESCE(natureza_codigo, codigo) AS natureza_codigo,
  COALESCE(natureza_nome, codigo) AS natureza_nome,
  MAX(natureza_descricao) AS natureza_descricao,
  natureza_nivel,
  natureza_tipo,
  tipo_receita,
  SUM(previsao_inicial) AS previsao_inicial,
  SUM(previsao_atualizada) AS previsao_atualizada,
  SUM(receita_realizada) AS receita_realizada,
  MAX(atualizado_em) AS atualizado_em
FROM public.receita_publica_categoria_mensal
GROUP BY
  ano,
  mes,
  codigo,
  COALESCE(natureza_codigo, codigo),
  COALESCE(natureza_nome, codigo),
  natureza_nivel,
  natureza_tipo,
  tipo_receita;
