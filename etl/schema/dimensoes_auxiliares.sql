-- =============================================================
-- Schema: Dimensoes auxiliares (CSV) - Varadouro Digital
-- Executar no SQL Editor do Supabase
-- =============================================================

CREATE TABLE IF NOT EXISTS aux_dim_uf (
    codigo        TEXT PRIMARY KEY,
    sigla         TEXT,
    nome          TEXT NOT NULL,
    dados         JSONB       NOT NULL DEFAULT '{}'::jsonb,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS aux_dim_municipio (
    codigo        TEXT PRIMARY KEY,
    nome          TEXT NOT NULL,
    uf_codigo     TEXT REFERENCES aux_dim_uf(codigo),
    dados         JSONB       NOT NULL DEFAULT '{}'::jsonb,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS aux_dim_ente (
    codigo        TEXT PRIMARY KEY,
    nome          TEXT NOT NULL,
    dados         JSONB       NOT NULL DEFAULT '{}'::jsonb,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS aux_dim_entidade (
    codigo           TEXT PRIMARY KEY,
    nome             TEXT NOT NULL,
    ente_codigo      TEXT REFERENCES aux_dim_ente(codigo),
    municipio_codigo TEXT REFERENCES aux_dim_municipio(codigo),
    uf_codigo        TEXT REFERENCES aux_dim_uf(codigo),
    dados            JSONB       NOT NULL DEFAULT '{}'::jsonb,
    atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aux_dim_municipio_uf ON aux_dim_municipio (uf_codigo);
CREATE INDEX IF NOT EXISTS idx_aux_dim_entidade_ente ON aux_dim_entidade (ente_codigo);
CREATE INDEX IF NOT EXISTS idx_aux_dim_entidade_municipio ON aux_dim_entidade (municipio_codigo);
CREATE INDEX IF NOT EXISTS idx_aux_dim_entidade_uf ON aux_dim_entidade (uf_codigo);

-- =============================================================
-- Views de apoio aos filtros do painel
-- =============================================================

CREATE OR REPLACE VIEW vw_filtro_municipios_por_uf AS
SELECT
    m.codigo,
    m.nome,
    m.uf_codigo,
    u.sigla AS uf_sigla,
    u.nome  AS uf_nome
FROM aux_dim_municipio m
LEFT JOIN aux_dim_uf u ON u.codigo = m.uf_codigo
ORDER BY m.nome;

CREATE OR REPLACE VIEW vw_filtro_entidades AS
SELECT
    e.codigo,
    e.nome,
    e.ente_codigo,
    en.nome AS ente_nome,
    e.municipio_codigo,
    m.nome AS municipio_nome,
    e.uf_codigo,
    u.sigla AS uf_sigla
FROM aux_dim_entidade e
LEFT JOIN aux_dim_ente en ON en.codigo = e.ente_codigo
LEFT JOIN aux_dim_municipio m ON m.codigo = e.municipio_codigo
LEFT JOIN aux_dim_uf u ON u.codigo = e.uf_codigo
ORDER BY e.nome;

CREATE OR REPLACE VIEW vw_filtro_tipos_combustivel AS
SELECT
    tipo_combustivel,
    valor_total,
    litros,
    qtd_notas,
    atualizado_em
FROM combustivel_tipo
ORDER BY valor_total DESC;
