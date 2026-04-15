-- =============================================================
-- Schema: Painel Combustível — Varadouro Digital
-- Fonte: dbo.vw_NF_combustiveis (NF-e — dados reais de notas fiscais)
-- Executar no SQL Editor do Supabase
-- =============================================================

-- 1. Evolução mensal
CREATE TABLE IF NOT EXISTS combustivel_mensal (
    id               BIGSERIAL PRIMARY KEY,
    ano              INT           NOT NULL,
    mes              INT           NOT NULL,
    entidade         TEXT          NOT NULL,
    tipo_combustivel TEXT          NOT NULL,
    litros           NUMERIC(15,3) NOT NULL DEFAULT 0,
    valor_total      NUMERIC(15,2) NOT NULL DEFAULT 0,
    qtd_notas        INT           NOT NULL DEFAULT 0,
    atualizado_em    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (ano, mes, entidade, tipo_combustivel)
);

-- 2. Totais por entidade
CREATE TABLE IF NOT EXISTS combustivel_entidade (
    id            BIGSERIAL PRIMARY KEY,
    entidade      TEXT          NOT NULL,
    litros        NUMERIC(15,3) NOT NULL DEFAULT 0,
    valor_total   NUMERIC(15,2) NOT NULL DEFAULT 0,
    qtd_notas     INT           NOT NULL DEFAULT 0,
    atualizado_em TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (entidade)
);

-- 3. Totais por tipo de combustível
CREATE TABLE IF NOT EXISTS combustivel_tipo (
    id               BIGSERIAL PRIMARY KEY,
    tipo_combustivel TEXT          NOT NULL,
    litros           NUMERIC(15,3) NOT NULL DEFAULT 0,
    valor_total      NUMERIC(15,2) NOT NULL DEFAULT 0,
    qtd_notas        INT           NOT NULL DEFAULT 0,
    atualizado_em    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (tipo_combustivel)
);

-- 4. Totais por emitente (posto / distribuidora)
CREATE TABLE IF NOT EXISTS combustivel_emitente (
    id            BIGSERIAL PRIMARY KEY,
    emitente      TEXT          NOT NULL,
    litros        NUMERIC(15,3) NOT NULL DEFAULT 0,
    valor_total   NUMERIC(15,2) NOT NULL DEFAULT 0,
    qtd_notas     INT           NOT NULL DEFAULT 0,
    atualizado_em TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (emitente)
);

-- 5. KPIs gerais (sempre substituída a cada sync)
CREATE TABLE IF NOT EXISTS combustivel_kpis (
    id              BIGSERIAL PRIMARY KEY,
    valor_total     NUMERIC(15,2) NOT NULL DEFAULT 0,
    litros_total    NUMERIC(15,3) NOT NULL DEFAULT 0,
    preco_medio     NUMERIC(10,4) NOT NULL DEFAULT 0,
    total_entidades INT           NOT NULL DEFAULT 0,
    total_notas     INT           NOT NULL DEFAULT 0,
    data_inicio     DATE,
    data_fim        DATE,
    atualizado_em   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- 6. Log de execuções do ETL
CREATE TABLE IF NOT EXISTS etl_log (
    id            BIGSERIAL PRIMARY KEY,
    modulo        TEXT        NOT NULL,
    status        TEXT        NOT NULL,
    mensagem      TEXT,
    registros     INT         DEFAULT 0,
    duracao_ms    INT,
    executado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_comb_mensal_ano_mes      ON combustivel_mensal (ano, mes);
CREATE INDEX IF NOT EXISTS idx_comb_mensal_entidade      ON combustivel_mensal (entidade);
CREATE INDEX IF NOT EXISTS idx_comb_mensal_tipo          ON combustivel_mensal (tipo_combustivel);
CREATE INDEX IF NOT EXISTS idx_comb_emitente_valor       ON combustivel_emitente (valor_total DESC);
