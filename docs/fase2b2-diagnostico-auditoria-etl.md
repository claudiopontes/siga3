# Fase 2B-2A — Diagnóstico: Auditoria dos ETLs em `audit.etl_carga`

**Projeto:** Varadouro Digital  
**Data:** 2026-05-12  
**Status:** Somente diagnóstico — nenhuma alteração de código ou banco

---

## 1. Inventário de Jobs e Classificação de Auditoria

### Módulos do painel (14 mapeados)

| Módulo (painel) | Arquivo(s)/Job principal | Grava `audit.etl_carga`? | Grava `audit.etl_log`? | Classificação | Observações |
|---|---|---|---|---|---|
| `despesa_full_postgres` | `despesa-full-postgres.ts` | ✅ Sim — completo | ✅ Sim | **Completa** | Padrão de referência: `iniciarCarga()` + `finalizarCarga()` |
| `remessas_full_postgres` | `remessas-contabeis-full-postgres.ts` | ✅ Sim — completo | ✅ Sim | **Completa** | Mesma estrutura do despesa; cópia do padrão |
| `mart_despesa` | `refresh-mart-despesa.ts` | ❌ Não | ✅ Sim (parcial: sem `registros`) | **Parcial** | Grava `etl_log` mas omite campo `registros` |
| `processos_gabinete` | `processos-gabinete.ts` | ❌ Não (`public.processos_gabinete_carga`) | ✅ Sim | **Parcial** | Tabela de controle própria fora do schema `audit`; `etl_log` gravado |
| `mart_infodengue` | `infodengue-full-postgres.ts` + `refresh-mart-infodengue.ts` | ❌ Não | ✅ Sim | **Parcial** | Somente `etl_log`; sem `etl_carga` |
| `mart_saude_consolidado` | `refresh-mart-saude-consolidado.ts` | ❌ Não | ✅ Sim | **Parcial** | Somente `etl_log` |
| `mart_pni` | `ingest-pni.ts` + `refresh-mart-pni.ts` | ❌ Não | ✅ Sim (ingest e refresh) | **Parcial** | Somente `etl_log`; sem `etl_carga` |
| `mart_pni_cobertura` | `ingest-pni-cobertura-xlsx.ts` + `refresh-mart-pni-cobertura.ts` | ❌ Não | ✅ Sim | **Parcial** | Somente `etl_log` |
| `mart_sisagua` | `sisagua-full-postgres.ts` + `refresh-mart-sisagua.ts` | ✅ Sim — parcial | ✅ Sim | **Parcial** | `etl_carga` existe mas incompleto: sem `modo_carga`, sem `registros_lidos`/`registros_gravados`; usa coluna `registros` não-padrão |
| `mart_saude_estrutura` | `cnes-ubs-full-postgres.ts` + `refresh-mart-saude-estrutura.ts` | ❌ Não | ✅ Sim | **Parcial** | Somente `etl_log` |
| `mart_remessas` | `refresh-mart-remessas.ts` | ❌ Não | ✅ Sim (parcial: sem `registros`) | **Parcial** | `etl_log` sem campo `registros` |
| `mart_siops` | `siops-full-postgres.ts` + `refresh-mart-siops.ts` | ✅ Sim — **com bug** | ✅ Sim | **Frágil** | Grava em `etl_carga` com colunas inexistentes no schema: `registros_inseridos`, `registros_total`; INSERT vai falhar em banco limpo |
| `mart_siconfi_rreo` | `siconfi-rreo-full-postgres.ts` + `refresh-mart-siconfi-rreo.ts` | ❌ Não | ✅ Sim | **Parcial** | Somente `etl_log` |
| `mart_mortalidade` | `ingest-sim-api.ts` + `ingest-sim-csv.ts` + `refresh-mart-mortalidade.ts` | ❌ Não | ✅ Sim (inclui status `ERRO`) | **Parcial** | Somente `etl_log`; `ingest-sim-api.ts` registra erro em `etl_log` — único job que loga erro além de sucesso |

---

## 2. Tabela Detalhada por Módulo

| Módulo | `etl_carga`? | `modulo` | `modo_carga` | `registros_lidos` | `registros_gravados` | `iniciado_em` | `finalizado_em` | `mensagem/erro` | Classificação |
|---|---|---|---|---|---|---|---|---|---|
| `despesa_full_postgres` | ✅ | ✅ | ✅ `full_truncate_insert` | ✅ | ✅ | ✅ (implícito via `DEFAULT now()`) | ✅ | ✅ | **Completa** |
| `remessas_full_postgres` | ✅ | ✅ | ✅ `full_truncate_insert` | ✅ | ✅ | ✅ | ✅ | ✅ | **Completa** |
| `mart_sisagua` | ✅ | ✅ | ❌ ausente | ❌ usa `registros` | ❌ ausente | ✅ explícito | ✅ | ✅ (só sucesso) | **Parcial** |
| `mart_siops` | ✅ **bugado** | ✅ | ❌ | ❌ `registros_inseridos`* | ❌ `registros_total`* | ❌ | ❌ | ❌ | **Frágil** |
| Demais 10 módulos | ❌ | — | — | — | — | — | — | — | **Parcial/Ausente** |

> *`registros_inseridos` e `registros_total` **não existem** no schema `000_init_varadouro.sql`. O INSERT em `audit.etl_carga` do `siops-full-postgres.ts` **falhará silenciosamente** (`.catch(() => void 0)`) em qualquer banco onde essas colunas não foram adicionadas manualmente.

---

## 3. Helpers/Funções de Auditoria Existentes

### 3.1 Padrão `despesa-full-postgres.ts` (mais completo — referência)

```typescript
// iniciarCarga() — INSERT no início
async function iniciarCarga(): Promise<number> {
  const rows = await pgQuery<{ id_carga: number }>(
    `INSERT INTO audit.etl_carga
       (modulo, origem, destino, modo_carga, status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id_carga`,
    [MODULO, ORIGEM, DESTINO, "full_truncate_insert", "iniciado"]
  );
  return rows[0].id_carga;
}

// finalizarCarga() — UPDATE no final
async function finalizarCarga(
  idCarga: number,
  status: "ok" | "erro",
  lidos: number,
  gravados: number,
  mensagem?: string,
): Promise<void> {
  await pgQuery(
    `UPDATE audit.etl_carga
     SET status = $1, registros_lidos = $2, registros_gravados = $3,
         finalizado_em = now(), mensagem = $4
     WHERE id_carga = $5`,
    [status, lidos, gravados, mensagem ?? null, idCarga],
  );
}

// registrarLog() — INSERT em etl_log (separado)
async function registrarLog(status, registros, duracao, mensagem): Promise<void> { ... }
```

**Quem usa este padrão exato:**
- `despesa-full-postgres.ts` — `iniciarCarga()` + `finalizarCarga()` + `registrarLog()`
- `remessas-contabeis-full-postgres.ts` — cópia fiel do mesmo padrão
- `dimensoes-ente-entidade-postgres.ts` — variação: `registrarLog()` + `registrarCarga()` + `iniciarCarga()`

**Limitações do padrão atual:**
- Funções definidas localmente em cada job — **não compartilhadas** entre arquivos
- Não captura erro: se o job lançar exceção antes de `finalizarCarga()`, o registro fica com `status='iniciado'` indefinidamente
- `iniciado_em` depende do `DEFAULT now()` do banco, não é passado explicitamente

---

### 3.2 Padrão `processos-gabinete.ts` (tabela própria)

```typescript
async function finalizarCarga(
  cargaId: number,
  status: "sucesso" | "erro",
  registros: number,
  mensagem?: string
): Promise<void> {
  await pgQuery(
    `UPDATE public.processos_gabinete_carga     -- ← tabela diferente!
     SET status = $1, finalizado_em = now(), registros = $2, mensagem = $3
     WHERE id = $4`,
    [status, registros, mensagem ?? null, cargaId]
  );
}
```

**Problema:** grava em `public.processos_gabinete_carga`, que é invisível para a API do painel (que só lê `audit.etl_log` e `audit.etl_carga`).

---

### 3.3 Padrão inline de `sisagua-full-postgres.ts` (incompleto)

```typescript
// INSERT inline no início
INSERT INTO audit.etl_carga (modulo, status, iniciado_em)
VALUES ('sisagua:full', 'EM_ANDAMENTO', now())
RETURNING id

// UPDATE inline no final
UPDATE audit.etl_carga
SET status='OK', finalizado_em=now(), registros=$1, duracao_ms=$2
WHERE id=$3
```

**Problema:** usa coluna `registros` (não está no schema padrão) em vez de `registros_lidos`/`registros_gravados`. Não grava `modo_carga`.

---

## 4. `audit.etl_log` vs `audit.etl_carga` — Diferença Prática

### Definições no schema (`000_init_varadouro.sql`)

```sql
-- audit.etl_log: log de eventos/execuções
CREATE TABLE audit.etl_log (
  id          bigserial PRIMARY KEY,
  modulo      text NOT NULL,
  status      text NOT NULL,
  mensagem    text NULL,
  registros   integer NOT NULL DEFAULT 0,
  duracao_ms  integer NULL,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

-- audit.etl_carga: controle de cargas individuais com ciclo de vida
CREATE TABLE audit.etl_carga (
  id_carga           bigserial PRIMARY KEY,
  modulo             text NOT NULL,
  origem             text NULL,
  destino            text NULL,
  modo_carga         text NULL,
  status             text NOT NULL,
  registros_lidos    integer NOT NULL DEFAULT 0,
  registros_gravados integer NOT NULL DEFAULT 0,
  iniciado_em        timestamptz NOT NULL DEFAULT now(),
  finalizado_em      timestamptz NULL,
  mensagem           text NULL
);
```

### Diferença semântica

| Aspecto | `audit.etl_log` | `audit.etl_carga` |
|---|---|---|
| **Propósito** | Evento pontual de execução (append-only) | Ciclo de vida de uma carga: início → fim |
| **Estrutura** | Uma linha INSERT por execução | INSERT no início + UPDATE no final |
| **Ciclo de vida** | Sem estado; imutável após INSERT | Tem estado: `iniciado` → `ok`/`erro` |
| **Campos de volume** | `registros` (genérico) | `registros_lidos` + `registros_gravados` |
| **Diagnóstico** | Último estado por módulo | Permite ver cargas em andamento, travadas ou sem finalização |
| **Uso atual** | 100% dos jobs (ao menos parcialmente) | Apenas 3 jobs completos (despesa, remessas, dimensoes-ente) |

### Quem usa qual no painel?

**API `src/app/api/admin/etl/status/route.ts`:**

```typescript
// Consulta AMBAS as tabelas
const [logs, cargas] = await Promise.all([
  // PRIMARY: etl_log — determina o módulo e status exibido
  dbQuery(`SELECT DISTINCT ON (modulo)
             modulo, status, registros, duracao_ms, mensagem,
             criado_em AS executado_em
           FROM audit.etl_log
           ORDER BY modulo, criado_em DESC`),

  // SECONDARY: etl_carga — dados complementares (pode estar vazia)
  dbQuery(`SELECT DISTINCT ON (modulo)
             modulo, status, registros_lidos, registros_gravados,
             iniciado_em, finalizado_em, mensagem
           FROM audit.etl_carga
           ORDER BY modulo, iniciado_em DESC`).catch(() => []),
]);
```

**Conclusão:**
- **`audit.etl_log` é a fonte primária do painel** — determina o que aparece na lista de módulos
- **`audit.etl_carga` é complementar** — enriquece com `registros_lidos/gravados`, `iniciado_em`, `finalizado_em`
- Módulo que grava **apenas em `etl_carga`** ficará **invisível no painel**
- Módulo que grava **apenas em `etl_log`** aparece no painel, mas sem os detalhes de ciclo de vida
- Os dois são necessários e complementares; nenhum é legado

---

## 5. Anomalias e Riscos Identificados

| Job | Anomalia | Severidade |
|---|---|---|
| `siops-full-postgres.ts` | INSERT em `etl_carga` com colunas inexistentes no schema (`registros_inseridos`, `registros_total`) | **Alta** — INSERT falha silenciosamente |
| `sisagua-full-postgres.ts` | Usa coluna `registros` e `duracao_ms` em vez de `registros_lidos`/`registros_gravados` | Média — funciona se colunas existirem localmente, mas inconsistente com o schema |
| `processos-gabinete.ts` | Grava em `public.processos_gabinete_carga` em vez de `audit.etl_carga` | Média — invisível para a API do painel |
| Todos os jobs sem `etl_carga` | Se o job falha antes de gravar `etl_log`, não há rastreabilidade nenhuma | Média |
| Jobs com `etl_carga` mas sem try/catch no `finalizarCarga` | Registro pode ficar com `status='iniciado'` para sempre se o job falhar | Média |
| `refresh-mart-despesa.ts` | Grava `etl_log` sem campo `registros` | Baixa — painel exibe "0" |
| `refresh-mart-remessas.ts` | Grava `etl_log` sem campo `registros` | Baixa |

---

## 6. Proposta de Padrão Único de Auditoria

### Padrão desejado

```typescript
// No início da execução:
INSERT INTO audit.etl_carga (modulo, modo_carga, status, iniciado_em)
VALUES ($1, $2, 'executando', now())
RETURNING id_carga

// No sucesso:
UPDATE audit.etl_carga
SET status = 'sucesso',
    finalizado_em = now(),
    registros_lidos = $2,
    registros_gravados = $3,
    mensagem = $4
WHERE id_carga = $1

// No erro:
UPDATE audit.etl_carga
SET status = 'erro',
    finalizado_em = now(),
    mensagem = $2   -- mensagem de erro
WHERE id_carga = $1

// Sempre (sucesso ou erro):
INSERT INTO audit.etl_log (modulo, status, registros, duracao_ms, mensagem)
VALUES ($1, $2, $3, $4, $5)
```

**Observações sobre valores de `status`:**
- Os jobs existentes usam `"ok"`, `"OK"`, `"sucesso"`, `"ERRO"`, `"EM_ANDAMENTO"`, `"iniciado"` — sem padronização
- Recomendação para o padrão novo: `"executando"` (início) / `"sucesso"` / `"erro"`
- O componente `EtlStatusClient.tsx` já trata `"ok"`, `"sucesso"`, `"erro"` — compatível

---

## 7. Proposta de Helper Comum

### Opção A — Funções separadas (evolutiva, menor risco)

```typescript
// etl/lib/auditoria.ts

export async function iniciarCargaEtl(
  modulo: string,
  modoCarga: string,
): Promise<number> {
  const rows = await pgQuery<{ id_carga: number }>(
    `INSERT INTO audit.etl_carga (modulo, modo_carga, status, iniciado_em)
     VALUES ($1, $2, 'executando', now())
     RETURNING id_carga`,
    [modulo, modoCarga],
  );
  return rows[0].id_carga;
}

export async function finalizarCargaEtl(
  idCarga: number,
  status: "sucesso" | "erro",
  registrosLidos: number,
  registrosGravados: number,
  mensagem?: string,
): Promise<void> {
  await pgQuery(
    `UPDATE audit.etl_carga
     SET status = $1, finalizado_em = now(),
         registros_lidos = $2, registros_gravados = $3,
         mensagem = $4
     WHERE id_carga = $5`,
    [status, registrosLidos, registrosGravados, mensagem ?? null, idCarga],
  ).catch(() => void 0);
}

export async function registrarLogEtl(
  modulo: string,
  status: "sucesso" | "erro" | "aviso",
  registros: number,
  duracaoMs: number,
  mensagem?: string,
): Promise<void> {
  await pgQuery(
    `INSERT INTO audit.etl_log (modulo, status, registros, duracao_ms, mensagem)
     VALUES ($1, $2, $3, $4, $5)`,
    [modulo, status, registros, duracaoMs, mensagem ?? null],
  ).catch(() => void 0);
}
```

### Opção B — Wrapper com try/catch automático (mais seguro, mais invasivo)

```typescript
// etl/lib/auditoria.ts

export async function executarComAuditoria<T>(params: {
  modulo: string;
  modoCarga: string;
  run: (idCarga: number) => Promise<{
    registrosLidos: number;
    registrosGravados: number;
    mensagem?: string;
    resultado: T;
  }>;
}): Promise<T> {
  const inicio = Date.now();
  const idCarga = await iniciarCargaEtl(params.modulo, params.modoCarga);

  try {
    const { registrosLidos, registrosGravados, mensagem, resultado } =
      await params.run(idCarga);

    const duracao = Date.now() - inicio;
    await finalizarCargaEtl(idCarga, "sucesso", registrosLidos, registrosGravados, mensagem);
    await registrarLogEtl(params.modulo, "sucesso", registrosGravados, duracao, mensagem);
    return resultado;

  } catch (err) {
    const duracao = Date.now() - inicio;
    const msg = (err as Error).message;
    await finalizarCargaEtl(idCarga, "erro", 0, 0, msg);
    await registrarLogEtl(params.modulo, "erro", 0, duracao, msg);
    throw err;
  }
}
```

### Recomendação

**Opção A para adoção gradual** — substitui as funções locais duplicadas (`iniciarCarga`, `finalizarCarga`, `registrarLog`) por importações de um módulo central, sem mudar a estrutura dos jobs.

**Opção B a longo prazo** — adotar depois que A estiver estável, para garantir que erros não deixem registros em `status='executando'`.

---

## 8. Plano de Implantação Gradual

### Fase 2B-2A (esta etapa) — Diagnóstico ✅
- Mapear todos os jobs
- Identificar padrões, inconsistências e bugs
- Propor helper e padrão

### Fase 2B-2B — Criar `etl/lib/auditoria.ts`
- Criar arquivo com as 3 funções: `iniciarCargaEtl`, `finalizarCargaEtl`, `registrarLogEtl`
- Compilação TypeScript deve passar sem erros
- **Nenhum job alterado ainda**

### Fase 2B-2C — ETL piloto: `remessas-contabeis-full-postgres.ts`
- Substituir as funções locais `iniciarCarga()`, `finalizarCarga()`, `registrarLog()` pelas importadas do helper
- Resultado deve ser idêntico ao atual
- Validar painel: módulo `remessas_full_postgres` deve continuar aparecendo

### Fase 2B-2D — Validar painel e registros
- Executar job piloto
- Confirmar que `audit.etl_carga` e `audit.etl_log` estão sendo gravados corretamente
- Confirmar que o painel exibe o módulo piloto com status correto

### Fase 2B-2E — Corrigir anomalias críticas
- `siops-full-postgres.ts`: corrigir colunas erradas (`registros_inseridos`, `registros_total`)
- `sisagua-full-postgres.ts`: corrigir coluna `registros` para `registros_lidos`/`registros_gravados`

### Fase 2B-2F — Expansão gradual (por prioridade)
1. `despesa-full-postgres.ts` — apenas substituir funções locais pelo helper
2. `processos-gabinete.ts` — adicionar gravação em `audit.etl_carga` (manter `processos_gabinete_carga` para não quebrar)
3. Jobs com somente `etl_log` — adicionar `iniciarCargaEtl`/`finalizarCargaEtl` ao redor do bloco principal

---

## 9. ETL Recomendado como Piloto

**`remessas-contabeis-full-postgres.ts`**

Motivos:
- Já tem as três funções locais bem definidas (`iniciarCarga`, `finalizarCarga`, `registrarLog`) — substituição é mecânica
- É um dos 2 jobs com auditoria completa — risco mínimo de regressão
- Tem estrutura idêntica ao `despesa-full-postgres.ts`, então o aprendizado se replica diretamente
- Aparece no painel (`remessas_full_postgres`) — permite validação visual imediata
- Não tem dependências de outras ETLs — pode ser testado isoladamente

---

## 10. Resumo Executivo

| Categoria | Quantidade | Módulos |
|---|---|---|
| Auditoria **Completa** | 2 | `despesa_full_postgres`, `remessas_full_postgres` |
| Auditoria **Parcial** (etl_log apenas) | 11 | `mart_despesa`, `processos_gabinete`*, `mart_infodengue`, `mart_saude_consolidado`, `mart_pni`, `mart_pni_cobertura`, `mart_sisagua`**, `mart_saude_estrutura`, `mart_remessas`, `mart_siconfi_rreo`, `mart_mortalidade` |
| Auditoria **Frágil** (etl_carga com bug) | 1 | `mart_siops` |
| **Total módulos do painel** | **14** | — |

> *`processos_gabinete` usa tabela própria  
> **`mart_sisagua` usa colunas não-padrão em `etl_carga`

**Prioridade de correção:**
1. `siops-full-postgres.ts` — colunas erradas no INSERT de `etl_carga` (falha silenciosa)
2. `sisagua-full-postgres.ts` — normalizar `registros` → `registros_lidos`/`registros_gravados`
3. Criar `etl/lib/auditoria.ts` com helper compartilhado
4. Expandir para demais jobs progressivamente
