# Fase 2A.2 — Diagnóstico de Risco de Duplicatas: SISAGUA e SICONFI RREO

**Projeto:** Varadouro Digital  
**Data:** 2026-05-12  
**Status:** Somente diagnóstico — nenhuma alteração de código ou banco

---

## Resumo Executivo

O diagnóstico anterior classificou ambos os módulos como **Frágil** por risco de duplicatas.  
Após leitura completa dos quatro arquivos, o resultado é significativamente diferente por módulo:

| Módulo | Classificação anterior | Risco real | Causa |
|---|---|---|---|
| `mart_sisagua` | Frágil | **Alta — risco ativo** | `ON CONFLICT DO NOTHING` sem UNIQUE constraint; fallback executa INSERT puro |
| `mart_siconfi_rreo` | Frágil | **Baixo — falso positivo** | Job já usa DELETE+INSERT por transação; é idempotente |

---

## 1. Diagnóstico SISAGUA

### Tabela `dw.fato_sisagua_parametro`

**Schema (`etl/schema/postgres/190_sisagua.sql`, linhas 108–138):**

```sql
CREATE TABLE IF NOT EXISTS dw.fato_sisagua_parametro (
  id                    bigserial   PRIMARY KEY,
  endpoint              text        NOT NULL,
  uf                    text,
  codigo_municipio_ibge text,
  competencia           text,    -- AAAAMM
  parametro             text,
  resultado             text,
  valor                 numeric,
  data_coleta           date,
  forma_abastecimento   text,
  sistema_abastecimento text,
  ponto_coleta          text,
  atualizado_em         timestamptz NOT NULL DEFAULT now()
);
-- Apenas índices simples. NENHUMA UNIQUE CONSTRAINT.
```

O próprio schema documenta a chave de negócio no comentário da linha 106:
```sql
-- Chave de negócio: municipio + endpoint + competencia + parametro + ponto_coleta
```
Mas **não a implementa como constraint**.

---

### Comportamento do job `sisagua-full-postgres.ts` (linhas 399–429)

```typescript
// Tentativa 1: ON CONFLICT DO NOTHING — mas não há UNIQUE, então FALHA
const [pRow] = await pgQuery<{ n: string }>(
  `INSERT INTO dw.fato_sisagua_parametro (...)
   SELECT ... FROM stage.sisagua_parametros_stg
   ON CONFLICT DO NOTHING
   RETURNING count(*)::text AS n`
).catch(async () => {
  // Fallback (linha 413): INSERT simples SEM ON CONFLICT
  const rows = await pgQuery<{ n: string }>(
    `WITH ins AS (
       INSERT INTO dw.fato_sisagua_parametro (...)
       SELECT ... FROM stage.sisagua_parametros_stg
       RETURNING 1
     )
     SELECT count(*)::text AS n FROM ins`
  );
  return rows;
});
```

### Sequência de falha em reexecução

1. `ON CONFLICT DO NOTHING` **sem UNIQUE** → PostgreSQL retorna erro `"there is no unique or exclusion constraint matching the ON CONFLICT specification"`
2. O `.catch()` captura o erro **silenciosamente**
3. O fallback executa `INSERT` puro da stage inteira
4. Como `raw.sisagua_raw` e `stage.sisagua_parametros_stg` também fazem INSERT puro sem truncate, **a stage cresce a cada execução**
5. Resultado: **cada reexecução dobra (ou mais) os registros no dw**

---

### Chave Natural Recomendada para `dw.fato_sisagua_parametro`

```sql
UNIQUE (endpoint, codigo_municipio_ibge, competencia, parametro, ponto_coleta)
```

| Campo | Papel | Pode ser NULL? | Observação |
|---|---|---|---|
| `endpoint` | Distingue controle_mensal de vigilancia | Não (NOT NULL) | Sem risco |
| `codigo_municipio_ibge` | Identifica o município | Sim (dados sujos da API) | NULLs agrupados juntos |
| `competencia` | Mês/ano de referência (YYYYMM) | Sim | NULLs agrupados juntos |
| `parametro` | Nome do parâmetro medido | Sim | NULLs agrupados juntos |
| `ponto_coleta` | Ponto de monitoramento | Sim (muito variável) | NULLs agrupados juntos |

**Atenção:** No PostgreSQL, `NULL ≠ NULL` em UNIQUE constraints — dois registros com `NULL` em qualquer campo da chave são considerados distintos e **ambos seriam aceitos**, não eliminando duplicatas com campos nulos.

**Alternativa mais segura:** coluna hash calculada:

```sql
ALTER TABLE dw.fato_sisagua_parametro
  ADD COLUMN chave_hash text GENERATED ALWAYS AS (
    md5(
      COALESCE(endpoint, '')        || '|' ||
      COALESCE(codigo_municipio_ibge, '') || '|' ||
      COALESCE(competencia, '')     || '|' ||
      COALESCE(parametro, '')       || '|' ||
      COALESCE(ponto_coleta, '')
    )
  ) STORED;

CREATE UNIQUE INDEX uq_sisagua_parametro_hash
  ON dw.fato_sisagua_parametro (chave_hash);
```

---

### SQL de Diagnóstico — Duplicatas Existentes em SISAGUA

```sql
-- 1. Duplicatas por chave natural (não executar em produção com tabela muito grande sem LIMIT)
SELECT
  endpoint,
  codigo_municipio_ibge,
  competencia,
  parametro,
  ponto_coleta,
  COUNT(*) AS qtd
FROM dw.fato_sisagua_parametro
GROUP BY endpoint, codigo_municipio_ibge, competencia, parametro, ponto_coleta
HAVING COUNT(*) > 1
ORDER BY qtd DESC
LIMIT 50;

-- 2. Resumo: total vs únicos
SELECT
  COUNT(*) AS total_registros,
  COUNT(DISTINCT (
    COALESCE(endpoint,''), COALESCE(codigo_municipio_ibge,''),
    COALESCE(competencia,''), COALESCE(parametro,''), COALESCE(ponto_coleta,'')
  )) AS registros_unicos,
  COUNT(*) - COUNT(DISTINCT (
    COALESCE(endpoint,''), COALESCE(codigo_municipio_ibge,''),
    COALESCE(competencia,''), COALESCE(parametro,''), COALESCE(ponto_coleta,'')
  )) AS duplicatas_estimadas
FROM dw.fato_sisagua_parametro;

-- 3. Acúmulo na stage (indica quantas reexecuções ocorreram)
SELECT
  endpoint, codigo_municipio_ibge, competencia, parametro, ponto_coleta,
  COUNT(*) AS qtd
FROM stage.sisagua_parametros_stg
GROUP BY endpoint, codigo_municipio_ibge, competencia, parametro, ponto_coleta
HAVING COUNT(*) > 1
ORDER BY qtd DESC
LIMIT 20;

-- 4. Crescimento por execução (verifica distribuição de carregado_em na stage)
SELECT
  DATE_TRUNC('day', carregado_em) AS dia,
  COUNT(*) AS registros
FROM stage.sisagua_parametros_stg
GROUP BY 1
ORDER BY 1 DESC
LIMIT 30;
```

---

## 2. Diagnóstico SICONFI RREO

### Tabela `dw.fato_siconfi_rreo`

**Schema (`etl/schema/postgres/160_siconfi_rreo.sql`, linhas 53–76):**

```sql
CREATE TABLE IF NOT EXISTS dw.fato_siconfi_rreo (
  id                    bigserial PRIMARY KEY,
  an_exercicio          integer NOT NULL,
  nr_periodo            integer NOT NULL,
  id_municipio          integer NULL,
  no_municipio          text,
  co_tipo_demonstrativo text,
  no_anexo              text,
  coluna                text,
  conta                 text,
  valor                 numeric,
  fonte                 text NOT NULL DEFAULT 'SICONFI_RREO',
  coletado_em           timestamptz NOT NULL DEFAULT now(),
  atualizado_em         timestamptz NOT NULL DEFAULT now()
);
-- Apenas índices em (an_exercicio, nr_periodo), (id_municipio), (no_anexo).
-- NENHUMA UNIQUE CONSTRAINT.
```

### Comportamento real do job `siconfi-rreo-full-postgres.ts` (linhas 194–235)

```typescript
await withPgTransaction(async (client) => {
  // DELETE idempotente por recorte municipio/periodo/ano
  await client.query(`
    DELETE FROM dw.fato_siconfi_rreo
    WHERE an_exercicio = $1 AND nr_periodo = $2 AND id_municipio = $3
  `, [ano, periodo, municipio.id_municipio]);

  // INSERT dos novos itens dentro da mesma transação
  for (const item of items) {
    await client.query(`INSERT INTO dw.fato_siconfi_rreo (...) VALUES (...)`);
  }
});
```

**Achado:** o job já é **idempotente por design**. O DELETE dentro da transação garante que reexecutar o mesmo `(an_exercicio, nr_periodo, id_municipio)` apaga e reinserido corretamente. **O risco apontado no diagnóstico anterior era um falso positivo.**

### Tabela `mart.siconfi_rreo_resumo_municipio`

O refresh usa `ON CONFLICT (an_exercicio, nr_periodo, id_municipio) DO UPDATE SET ...` e a tabela tem `PRIMARY KEY (an_exercicio, nr_periodo, id_municipio)`. **Sem risco.**

### Chave Natural para `dw.fato_siconfi_rreo`

Um registro RREO representa: para um município × período × exercício × anexo × conta × coluna, um valor específico.

```sql
UNIQUE (an_exercicio, nr_periodo, id_municipio, no_anexo, conta, coluna)
```

| Campo | Papel | Pode ser NULL? |
|---|---|---|
| `an_exercicio` | Ano fiscal | NOT NULL |
| `nr_periodo` | Bimestre (1–6) | NOT NULL |
| `id_municipio` | Código IBGE 7 dígitos | NULL (preenchido na prática) |
| `no_anexo` | Anexo do RREO (ex: "RREO-Anexo 12") | NULL |
| `conta` | Nome da conta contábil | NULL |
| `coluna` | Coluna do demonstrativo | NULL |

---

### SQL de Diagnóstico — Duplicatas Existentes em SICONFI RREO

```sql
-- 1. Verifica se o DELETE+INSERT está funcionando (não deve haver duplicatas)
SELECT
  an_exercicio, nr_periodo, id_municipio,
  no_anexo, conta, coluna,
  COUNT(*) AS qtd
FROM dw.fato_siconfi_rreo
GROUP BY an_exercicio, nr_periodo, id_municipio, no_anexo, conta, coluna
HAVING COUNT(*) > 1
ORDER BY qtd DESC
LIMIT 20;

-- 2. Resumo: total vs únicos
SELECT
  COUNT(*) AS total_registros,
  COUNT(DISTINCT (
    an_exercicio, nr_periodo,
    COALESCE(id_municipio, 0),
    COALESCE(no_anexo, ''),
    COALESCE(conta, ''),
    COALESCE(coluna, '')
  )) AS registros_unicos,
  COUNT(*) - COUNT(DISTINCT (
    an_exercicio, nr_periodo,
    COALESCE(id_municipio, 0),
    COALESCE(no_anexo, ''),
    COALESCE(conta, ''),
    COALESCE(coluna, '')
  )) AS duplicatas_estimadas
FROM dw.fato_siconfi_rreo;
```

---

## 3. Alternativas de Correção

### SISAGUA — Problema real, correção necessária

**Alternativa recomendada: B (DELETE por janela) como correção imediata**

**Passo 1 — correção no job (sem alterar schema):**  
Adicionar `TRUNCATE stage.sisagua_parametros_stg` antes de promover ao dw, para limpar a stage a cada execução.

**Passo 2 — substituir o fallback por DELETE + INSERT por competência:**

```typescript
// Em vez do fallback com INSERT puro:
// 1. Coletar competências distintas da stage atual
// 2. DELETE FROM dw WHERE competencia IN (...)
// 3. INSERT FROM stage
```

**Alternativa A (UNIQUE + ON CONFLICT) — correção definitiva:**  
Usar coluna hash calculada para lidar com NULLs:

```sql
ALTER TABLE dw.fato_sisagua_parametro
  ADD COLUMN chave_hash text GENERATED ALWAYS AS (
    md5(COALESCE(endpoint,'') || '|' || COALESCE(codigo_municipio_ibge,'') || '|' ||
        COALESCE(competencia,'') || '|' || COALESCE(parametro,'') || '|' ||
        COALESCE(ponto_coleta,''))
  ) STORED;

CREATE UNIQUE INDEX uq_sisagua_parametro_hash
  ON dw.fato_sisagua_parametro (chave_hash);
```

**Impacto nos dados existentes:** duplicatas já gravadas precisariam ser removidas antes do `CREATE UNIQUE INDEX`.

| Critério | Alt A (UNIQUE hash) | Alt B (DELETE+INSERT por janela) |
|---|---|---|
| Elimina duplicatas | Sim, definitivamente | Sim |
| Idempotente | Sim | Sim |
| Preserva reprocessamento | Sim | Sim |
| Exige ALTER TABLE | Sim | Não |
| Exige alteração de código | Sim | Sim (mínima) |
| Impacta dados existentes | Sim (limpeza prévia necessária) | Não |
| Risco de implantação | Médio | **Baixo** |

---

### SICONFI RREO — Falso positivo; apenas proteção preventiva necessária

O job já é idempotente. Correção recomendada: **adicionar UNIQUE como proteção defensiva**.

```sql
-- Executar somente após confirmar que não há duplicatas com o SQL de diagnóstico
ALTER TABLE dw.fato_siconfi_rreo
  ADD CONSTRAINT uq_siconfi_rreo_natural
  UNIQUE (an_exercicio, nr_periodo, id_municipio, no_anexo, conta, coluna);
```

| Critério | Aplicação |
|---|---|
| Elimina duplicatas futuras | Sim (proteção de banco) |
| Job atual já é idempotente | Sim |
| Exige ALTER TABLE | Sim |
| Impacta dados existentes | Só se já houver duplicatas (confirmar com SQL) |
| Risco de implantação | Baixo |

---

## 4. Recomendação Final

**Corrigir primeiro: SISAGUA**

| | SISAGUA | SICONFI RREO |
|---|---|---|
| Risco real hoje | **Alta — duplicatas a cada reexecução** | **Baixo — job já é idempotente** |
| Duplicatas já existentes | **Provável** (confirmar com SQL) | Improvável (confirmar com SQL) |
| Urgência | **Alta** | Baixa–Média |
| Correção mínima sem schema | Sim (TRUNCATE stage + DELETE por competência) | Não aplicável |
| Correção definitiva | UNIQUE com coluna hash calculada | UNIQUE na chave natural |

### Sequência sugerida para Fase 2B

1. Executar os SQLs de diagnóstico no banco para confirmar quantidade de duplicatas existentes
2. **SISAGUA:** corrigir `sisagua-full-postgres.ts` com Alternativa B (DELETE por competência antes de promover ao dw) + TRUNCATE da stage
3. **SICONFI RREO:** confirmar ausência de duplicatas, depois aplicar UNIQUE preventiva
4. Avaliar coluna hash calculada para SISAGUA como passo seguinte após estabilização
5. Estender padronização de auditoria (`audit.etl_carga`) para os módulos que só usam `etl_log` ou não registram nada

---

## Referência dos Arquivos Analisados

| Arquivo | Linhas relevantes |
|---|---|
| `etl/jobs/sisagua-full-postgres.ts` | 282–308 (insert raw+stage), 396–429 (promoção dw, ON CONFLICT + fallback) |
| `etl/jobs/refresh-mart-sisagua.ts` | 364–466 (DELETE→INSERT marts), 377–381 (ON CONFLICT no mart) |
| `etl/jobs/siconfi-rreo-full-postgres.ts` | 194–235 (DELETE+INSERT em transação por municipio/periodo) |
| `etl/jobs/refresh-mart-siconfi-rreo.ts` | 245–255 (ON CONFLICT no mart resumo) |
| `etl/schema/postgres/190_sisagua.sql` | 104–138 (definição dw.fato_sisagua_parametro, sem UNIQUE) |
| `etl/schema/postgres/160_siconfi_rreo.sql` | 50–76 (definição dw.fato_siconfi_rreo, sem UNIQUE), 82–94 (mart com PK) |
