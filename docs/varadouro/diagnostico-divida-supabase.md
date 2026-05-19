# Diagnóstico da Dívida Supabase no Varadouro

> Diagnóstico técnico — **nenhum arquivo de código foi alterado nesta etapa**.
> Data de referência: 2026-05-19. Branch: `feature/painel-receita-publica`.

---

## 1. Resumo executivo

A dívida Supabase no Varadouro Digital Aquiry é **residual e majoritariamente cosmética**, com **uma única exceção de uso ativo** que precisa ser tratada.

- **Frontend (`src/`):** **zero leitura ativa do Supabase.** A única referência é o nome do script npm em [src/lib/etl-job-commands.ts:34](../../src/lib/etl-job-commands.ts#L34), mapeado para o disparo manual de ETL pela UI admin. Nenhum painel consulta Supabase.
- **APC Polanco:** o job [`apc-polanco-sync-supabase.ts`](../../etl/jobs/apc-polanco-sync-supabase.ts), **apesar do nome**, atualmente grava em **PostgreSQL** (`public.tb_despesa_combustivel_polanco`) via `pgQuery`. O nome do arquivo, do script npm, da flag de cron e das variáveis de ambiente é **legado** e desinformativo.
- **Receita Pública:** [`receita-publica.ts`](../../etl/jobs/receita-publica.ts) também já é Postgres-only. O comentário do cabeçalho diz "Destino: Supabase.receita_publica_categoria_mensal" mas o código usa `pgQuery`; "Supabase" só sobrevive em nomes de variáveis de ambiente (`RECEITA_PUBLICA_SUPABASE_TABLE`, `_BATCH`).
- **Uso ativo real:** [`etl/jobs/dimensoes-ente-entidade-sqlserver.ts`](../../etl/jobs/dimensoes-ente-entidade-sqlserver.ts) **grava em Supabase** (tabelas `dim_ente`, `dim_entidade` e `etl_log`) — agendado no Step 8/11 do pipeline noturno.
- **Uso ativo secundário:** [`etl/jobs/dimensoes-csv.ts`](../../etl/jobs/dimensoes-csv.ts) **lê de Supabase** apenas em fallback de bootstrap quando os CSVs de dimensões estão ausentes.
- **Scripts utilitários:** três scripts em `etl/scripts/` ainda usam Supabase (`check-empenho-mensal.ts`, `refresh-empenho-mensal.ts`, `check-morning-health.ps1`) — fora do pipeline noturno padrão.
- **Mecanismo `ETL_TARGET`:** [`etl/config/etl-target.ts`](../../etl/config/etl-target.ts) define `postgres | supabase`, mas **não é importado em nenhum job ativo** (grep confirmado). É **código morto**.

**Conclusão preliminar:** a dívida pode ser encerrada com um esforço pequeno e bem delimitado. O **único bloqueio real** é migrar `dimensoes-ente-entidade-sqlserver.ts` para Postgres (há indício de que `dimensoes-ente-entidade-postgres.ts` já é a versão Postgres equivalente — validar antes de remover). Tudo o mais é renomeação, atualização de comentários, remoção de scripts utilitários e descarte do conector + dependência npm.

---

## 2. Referências encontradas

### 2.1 Frontend (`src/`)

| Arquivo | Tipo de uso | Trecho/função | Domínio | Status |
|---|---|---|---|---|
| [src/lib/etl-job-commands.ts:34](../../src/lib/etl-job-commands.ts#L34) | String literal (nome do script npm) | `args: ["--prefix", "etl", "run", "apc-polanco-sync-supabase"]` | Admin ETL | **Residual** — disparo manual usa o nome do script |

> Nenhum import de `@supabase/supabase-js` ou referência ao SDK no frontend.

### 2.2 ETL — jobs ativos com uso real

| Arquivo | Tipo de uso | Trecho/função | Domínio | Status |
|---|---|---|---|---|
| [etl/connectors/supabase.ts](../../etl/connectors/supabase.ts) | Factory do cliente `@supabase/supabase-js` | `getSupabase()` | Infra ETL | **Ativo** (consumido por 2 jobs e 2 scripts) |
| [etl/jobs/dimensoes-ente-entidade-sqlserver.ts](../../etl/jobs/dimensoes-ente-entidade-sqlserver.ts) | **Escreve em Supabase** | `supabase.from(tabela).upsert(...)` em `dim_ente`/`dim_entidade`; `supabase.from("etl_log").insert(...)` | Dimensões | **Ativo** (Step 8/11 noturno) |
| [etl/jobs/dimensoes-csv.ts](../../etl/jobs/dimensoes-csv.ts) | **Lê do Supabase** (fallback bootstrap CSV) | `selectAll(...)` paginado via `supabase.from(table).select(...)` quando CSV ausente | Dimensões | **Ativo condicional** (`DIM_AUTO_BOOTSTRAP_FROM_SUPABASE=true` default) |
| [etl/scripts/check-empenho-mensal.ts](../../etl/scripts/check-empenho-mensal.ts) | Leitura Supabase | `getSupabase()` | Utilitário | **Ativo manual** |
| [etl/scripts/refresh-empenho-mensal.ts](../../etl/scripts/refresh-empenho-mensal.ts) | Leitura + RPC Supabase | `supabase.rpc("fn_refresh_combustivel_empenho_mensal")` | Utilitário | **Ativo manual** |
| [etl/scripts/check-morning-health.ps1](../../etl/scripts/check-morning-health.ps1) | Embutido em PowerShell | `createClient(...)` direto + leitura de `audit.etl_log` Supabase | Utilitário | **Ativo manual** |
| [etl/jobs/migrar-supabase-para-postgres.ts](../../etl/jobs/migrar-supabase-para-postgres.ts) | **One-shot de migração** | `createClient(SUPABASE_URL, SUPABASE_KEY)` + lê tabela por tabela | Migração | **Legado** — finalidade já cumprida |

### 2.3 ETL — referências cosméticas / código morto

Arquivos que mencionam "supabase" apenas em **nomes, comentários ou variáveis de ambiente**, mas **operam contra PostgreSQL**:

| Arquivo | Natureza da referência | Operação real |
|---|---|---|
| [etl/jobs/apc-polanco-sync-supabase.ts](../../etl/jobs/apc-polanco-sync-supabase.ts) | Nome do arquivo + `APC_POLANCO_SUPABASE_TABLE` + `APC_POLANCO_SYNC_SUPABASE_BATCH` | Grava em `public.tb_despesa_combustivel_polanco` via `pgQuery` |
| [etl/jobs/receita-publica.ts](../../etl/jobs/receita-publica.ts) | Comentário do cabeçalho ("Destino: Supabase.receita_publica_categoria_mensal") + `RECEITA_PUBLICA_SUPABASE_TABLE`/`_BATCH` | Grava em `public.receita_publica_categoria_mensal` via `pgQuery` |
| [etl/jobs/combustivel.ts](../../etl/jobs/combustivel.ts) | Comentário ("Destino: Supabase (tabelas agregadas)") | `pgQuery` |
| [etl/jobs/cauc.ts](../../etl/jobs/cauc.ts) | Constante `SUPABASE_BATCH = 500` | `pgQuery` |
| [etl/jobs/fato-empenho.ts](../../etl/jobs/fato-empenho.ts) | Variável `FATO_EMPENHO_SUPABASE_BATCH` | `pgQuery` em `public.fato_empenho` |
| [etl/jobs/populacao-ibge.ts](../../etl/jobs/populacao-ibge.ts) | Comentário ("API IBGE -> Supabase") | `pgQuery` |
| [etl/jobs/processos-gabinete.ts](../../etl/jobs/processos-gabinete.ts) | Constante `SUPABASE_BATCH` + tipo `SupabaseProcessoGabineteRow` | `pgQuery` |
| [etl/jobs/dimensoes-empenho-sqlserver.ts](../../etl/jobs/dimensoes-empenho-sqlserver.ts) | Comentário ("SQL Server -> Supabase") | `pgQuery` |
| [etl/jobs/dimensoes-receita-sqlserver.ts](../../etl/jobs/dimensoes-receita-sqlserver.ts) | Comentário | `pgQuery` |
| [etl/jobs/dimensoes-ente-entidade-postgres.ts](../../etl/jobs/dimensoes-ente-entidade-postgres.ts) | Comentário | `pgQuery` (versão "limpa") |
| [etl/config/etl-target.ts](../../etl/config/etl-target.ts) | Define `EtlTarget = "postgres" \| "supabase"` | **Não importado em nenhum lugar** — código morto |
| [etl/schedule.ts](../../etl/schedule.ts) | Imports e logs com "supabase" no nome | Operação contra Postgres |

### 2.4 ETL — schema SQL legado

| Arquivo | Natureza |
|---|---|
| [etl/schema/supabase_apc_despesa_combustivel_polanco.sql](../../etl/schema/supabase_apc_despesa_combustivel_polanco.sql) | Schema antigo (SQL Server-style). As migrations efetivas estão em `etl/schema/postgres/` |
| Outros `etl/schema/*.sql` com a palavra "supabase" no conteúdo | Documentação legada — não aplicada |

### 2.5 Configurações e documentação

| Arquivo | Referência |
|---|---|
| [.env.example](../../.env.example) | Bloco Supabase declarado **somente para ETL**, com nota de uso residual (já reorganizado em 2026-05-19) |
| [etl/.env.example](../../etl/.env.example) | `SUPABASE_URL=...` ainda presente |
| [HANDOFF.md](../../HANDOFF.md), [README.md](../../README.md), [CLAUDE.md](../../CLAUDE.md), [TODO.md](../../TODO.md) | Citações em texto — documentação |
| [docs/postgres-local.md](../postgres-local.md), [docs/aquiry/checklist-mvp-assistente-aquiry.md](../aquiry/checklist-mvp-assistente-aquiry.md) | Referências em texto |
| [docs/varadouro/*.md](.) | Documentos institucionais (5 ocorrências, todas em texto) |
| [etl/package.json](../../etl/package.json) | Dependência `@supabase/supabase-js ^2.49.8` + scripts `apc-polanco-sync-supabase` e `migrar:supabase-postgres` |
| [etl/package-lock.json](../../etl/package-lock.json) | Lockfile com cadeia de dependências `@supabase/*` (8 pacotes) |

---

## 3. Fluxos ainda dependentes

| Fluxo | Origem | Destino | Job/endpoint | Painel afetado | Risco se remover |
|---|---|---|---|---|---|
| **Dimensões ente/entidade** | SQL Server APC | **Supabase** (`dim_ente`, `dim_entidade`) + `etl_log` Supabase | [dimensoes-ente-entidade-sqlserver.ts](../../etl/jobs/dimensoes-ente-entidade-sqlserver.ts) (Step 8/11 do cron) | Indireto (alimentação histórica das dimensões) | **Médio** — confirmar que `dimensoes-ente-entidade-postgres.ts` cobre o mesmo escopo antes de desligar |
| **Bootstrap CSV de dimensões** | Supabase (`aux_dim_*`) | CSVs locais (`etl/data/dimensoes/*.csv`) | [dimensoes-csv.ts](../../etl/jobs/dimensoes-csv.ts) quando CSV ausente e `DIM_AUTO_BOOTSTRAP_FROM_SUPABASE=true` | Indireto | **Baixo** — basta garantir que CSVs estejam presentes ou popular a partir de Postgres |
| **Disparo manual `apc-polanco-sync-supabase`** | SQL Server APC | **PostgreSQL** (apesar do nome) | UI Admin ETL → `npm --prefix etl run apc-polanco-sync-supabase` | Combustível | **Baixo (cosmético)** — só precisa renomeação; não há dependência real de Supabase |
| **Scripts utilitários** | Supabase | Console | [check-empenho-mensal.ts](../../etl/scripts/check-empenho-mensal.ts), [refresh-empenho-mensal.ts](../../etl/scripts/refresh-empenho-mensal.ts), [check-morning-health.ps1](../../etl/scripts/check-morning-health.ps1) | Nenhum painel | **Baixo** — utilitários manuais, podem ser substituídos por queries Postgres |
| **Migração one-shot** | Supabase | Postgres | [migrar-supabase-para-postgres.ts](../../etl/jobs/migrar-supabase-para-postgres.ts) | — | **Nulo** — finalidade já cumprida |

---

## 4. Variáveis de ambiente

| Variável | Onde é usada | Ainda necessária? | Recomendação |
|---|---|---|---|
| `SUPABASE_URL` | `etl/connectors/supabase.ts`, `migrar-supabase-para-postgres.ts`, `check-morning-health.ps1` | **Sim, enquanto** os jobs/scripts da seção 3 existirem | Remover quando os usos forem migrados |
| `SUPABASE_SERVICE_ROLE_KEY` | `etl/connectors/supabase.ts`, `check-morning-health.ps1` | **Sim**, idem | Remover depois |
| `NEXT_PUBLIC_SUPABASE_URL` | Apenas no [.env.example](../../.env.example) | **Não** (frontend não consome) | Remover do `.env.example` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Apenas no `.env.example` | **Não** | Remover do `.env.example` |
| `DIM_AUTO_BOOTSTRAP_FROM_SUPABASE` | `etl/jobs/dimensoes-csv.ts` (referência indireta — default `true`) | Sim, enquanto fallback existir | Desligar (`false`) e remover quando bootstrap não mais usar Supabase |
| `RUN_APC_POLANCO_SUPABASE_SYNC_NIGHTLY` | `etl/schedule.ts` | Sim, controla um step que **vai para Postgres** | Renomear para `RUN_APC_POLANCO_SYNC_NIGHTLY` |
| `APC_POLANCO_SUPABASE_TABLE` | `apc-polanco-sync-supabase.ts` | Sim, mas nome desinformativo | Renomear para `APC_POLANCO_POSTGRES_TABLE` |
| `APC_POLANCO_SYNC_SUPABASE_BATCH` | `apc-polanco-sync-supabase.ts` | Sim, idem | Renomear para `APC_POLANCO_SYNC_BATCH` |
| `RECEITA_PUBLICA_SUPABASE_TABLE` | `receita-publica.ts` | Sim, idem | Renomear para `RECEITA_PUBLICA_POSTGRES_TABLE` |
| `RECEITA_PUBLICA_SUPABASE_BATCH` | `receita-publica.ts` | Sim, idem | Renomear para `RECEITA_PUBLICA_BATCH` |
| `FATO_EMPENHO_SUPABASE_BATCH` | `fato-empenho.ts` | Sim, idem | Renomear para `FATO_EMPENHO_BATCH` |
| `DIM_ENTE_ENTIDADE_SUPABASE_BATCH` | `dimensoes-ente-entidade-sqlserver.ts` | Depende da migração | Migrar e renomear |
| `ETL_TARGET` | `etl/config/etl-target.ts` | **Não** — `etl-target.ts` não é importado em lugar nenhum | Remover variável e o arquivo |

---

## 5. Dependências npm

### 5.1 `etl/package.json`

| Dependência | Onde é usada | Pode remover? | Risco |
|---|---|---|---|
| `@supabase/supabase-js ^2.49.8` | `etl/connectors/supabase.ts` (e indiretamente nos jobs/scripts da seção 3) | **Não imediatamente.** Após migrar `dimensoes-ente-entidade-sqlserver.ts` + desativar fallback de `dimensoes-csv.ts` + remover scripts utilitários, **sim** | Quebra dos fluxos acima se removida antes |

Cadeia em [etl/package-lock.json](../../etl/package-lock.json): `@supabase/auth-js`, `functions-js`, `phoenix`, `postgrest-js`, `realtime-js`, `storage-js`, `supabase-js` — todas saem junto com `@supabase/supabase-js`.

### 5.2 Frontend (`package.json` raiz)

- **Nenhuma dependência Supabase declarada.** Pode permanecer como está.

---

## 6. Plano de remoção segura

### Etapa 1 — Confirmação de equivalência funcional (sem mudança de código)

- **Arquivos afetados:** [dimensoes-ente-entidade-sqlserver.ts](../../etl/jobs/dimensoes-ente-entidade-sqlserver.ts) vs [dimensoes-ente-entidade-postgres.ts](../../etl/jobs/dimensoes-ente-entidade-postgres.ts).
- **Ação:** comparar colunas, transformações, schema destino, frequência. Confirmar que a versão `-postgres` carrega `dim_ente` e `dim_entidade` em Postgres com a mesma cobertura.
- **Risco:** dependência das dimensões em marts downstream (Despesa, Credores).
- **Critério de pronto:** documento curto registrando equivalência (ou lacunas) entre as duas versões.

### Etapa 2 — Renomear cosméticos (sem mudança de comportamento)

- **Arquivos afetados:**
  - [etl/jobs/apc-polanco-sync-supabase.ts](../../etl/jobs/apc-polanco-sync-supabase.ts) → `apc-polanco-sync-postgres.ts`
  - [etl/package.json](../../etl/package.json) script `apc-polanco-sync-supabase` → `apc-polanco-sync`
  - [src/lib/etl-job-commands.ts](../../src/lib/etl-job-commands.ts) atualização do novo nome
  - [etl/schedule.ts](../../etl/schedule.ts) renomeação de imports, flags e logs (`RUN_APC_POLANCO_SUPABASE_SYNC_NIGHTLY` → `RUN_APC_POLANCO_SYNC_NIGHTLY`)
  - [etl/scripts/run-nightly-etl.cmd](../../etl/scripts/run-nightly-etl.cmd) atualização do script
  - Comentários de cabeçalho em `receita-publica.ts`, `combustivel.ts`, `populacao-ibge.ts`, `dimensoes-*-sqlserver.ts`
  - Renomear constantes/variáveis: `SUPABASE_BATCH` → `INSERT_BATCH` em `cauc.ts`, `processos-gabinete.ts`, etc.
  - Renomear variáveis de ambiente: `*_SUPABASE_TABLE` → `*_POSTGRES_TABLE`, `*_SUPABASE_BATCH` → `*_BATCH` (com fallback retrocompatível por 1 release)
- **Ação:** rename + atualização dos consumidores.
- **Risco:** baixo (apenas cosmético).
- **Critério de pronto:** pipeline noturno executa idêntico ao atual; logs não citam Supabase em fluxos que não usam Supabase.

### Etapa 3 — Migrar `dimensoes-ente-entidade-sqlserver.ts` para Postgres

- **Arquivo afetado:** [etl/jobs/dimensoes-ente-entidade-sqlserver.ts](../../etl/jobs/dimensoes-ente-entidade-sqlserver.ts).
- **Ação:** substituir as chamadas `supabase.from(...)` por `pgQuery(...)`; `etl_log` no Supabase passa a `audit.etl_log` no Postgres; manter contrato externo do `executarCargaDimensoesEnteEntidadeSqlServer()`.
- **Risco:** médio — alimentação histórica das dimensões.
- **Critério de pronto:** execução noturna preenche `dim_ente`/`dim_entidade` em Postgres com mesma cardinalidade observada hoje no Supabase.

### Etapa 4 — Substituir bootstrap CSV via Supabase

- **Arquivo afetado:** [etl/jobs/dimensoes-csv.ts](../../etl/jobs/dimensoes-csv.ts).
- **Ação:** quando CSVs ausentes, regenerar a partir de `public.aux_dim_*` no Postgres (ou descartar fallback e exigir que os CSVs estejam presentes em `etl/data/dimensoes/`).
- **Risco:** baixo (caminho usado apenas em primeira execução).
- **Critério de pronto:** `npm --prefix etl run dimensoes` regenera CSVs sem qualquer chamada Supabase.

### Etapa 5 — Limpar scripts utilitários

- **Arquivos afetados:**
  - [etl/scripts/check-empenho-mensal.ts](../../etl/scripts/check-empenho-mensal.ts)
  - [etl/scripts/refresh-empenho-mensal.ts](../../etl/scripts/refresh-empenho-mensal.ts)
  - [etl/scripts/check-morning-health.ps1](../../etl/scripts/check-morning-health.ps1)
- **Ação:** reescrever contra Postgres (`pgQuery` / `psql`) ou remover se não tiverem mais uso operacional.
- **Risco:** baixo — manuais, sem agendamento.
- **Critério de pronto:** scripts funcionam contra Postgres ou foram excluídos com justificativa registrada.

### Etapa 6 — Descartar one-shot e código morto

- **Arquivos afetados:**
  - [etl/jobs/migrar-supabase-para-postgres.ts](../../etl/jobs/migrar-supabase-para-postgres.ts) + script `migrar:supabase-postgres` no `package.json`
  - [etl/config/etl-target.ts](../../etl/config/etl-target.ts) (código morto)
  - [etl/schema/supabase_apc_despesa_combustivel_polanco.sql](../../etl/schema/supabase_apc_despesa_combustivel_polanco.sql)
- **Ação:** remover; manter histórico via `git log`.
- **Risco:** baixo.
- **Critério de pronto:** repositório sem arquivos legados.

### Etapa 7 — Remover dependência npm e variáveis

- **Arquivos afetados:**
  - [etl/package.json](../../etl/package.json) (remover `@supabase/supabase-js`)
  - [etl/connectors/supabase.ts](../../etl/connectors/supabase.ts) (excluir)
  - [.env.example](../../.env.example) (remover bloco Supabase)
  - [etl/.env.example](../../etl/.env.example) (remover Supabase)
- **Ação:** `npm uninstall` na pasta `etl/`; remover bloco de variáveis dos `.env.example`.
- **Risco:** baixo (depende das etapas 3–5 estarem concluídas).
- **Critério de pronto:** `grep -ri supabase etl/ src/` retorna apenas referências em documentação.

### Etapa 8 — Atualizar documentação

- **Arquivos afetados:** [README.md](../../README.md), [CLAUDE.md](../../CLAUDE.md), [HANDOFF.md](../../HANDOFF.md), [TODO.md](../../TODO.md), [docs/varadouro/*.md](.).
- **Ação:** marcar dívida Supabase como **encerrada** com data; ajustar matriz de fontes, plano de evolução e roteiro de demonstração.
- **Risco:** nulo.
- **Critério de pronto:** menções a "Supabase residual" só permanecem como histórico datado.

---

## 7. Alterações recomendadas

### 7.1 Remoção imediata segura (não afeta pipeline)

- [.env.example](../../.env.example): remover `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` (frontend não consome).
- [etl/config/etl-target.ts](../../etl/config/etl-target.ts): excluir (código morto — `getEtlTarget` não é importado em nenhum lugar dos jobs ativos).
- Comentários de cabeçalho desatualizados em [combustivel.ts](../../etl/jobs/combustivel.ts), [populacao-ibge.ts](../../etl/jobs/populacao-ibge.ts), [dimensoes-empenho-sqlserver.ts](../../etl/jobs/dimensoes-empenho-sqlserver.ts), [dimensoes-receita-sqlserver.ts](../../etl/jobs/dimensoes-receita-sqlserver.ts), [dimensoes-ente-entidade-postgres.ts](../../etl/jobs/dimensoes-ente-entidade-postgres.ts) — alterar de "Supabase" para "PostgreSQL".

### 7.2 Remoção que exige validação

- Renomeação de `apc-polanco-sync-supabase.ts` → `apc-polanco-sync.ts` (atualizar `package.json`, `etl-job-commands.ts`, `schedule.ts`, `run-nightly-etl.cmd`).
- Renomeação de variáveis de ambiente legadas (`*_SUPABASE_*`) — manter retrocompatibilidade por 1 release.
- Migração do [dimensoes-ente-entidade-sqlserver.ts](../../etl/jobs/dimensoes-ente-entidade-sqlserver.ts) para Postgres — exige comparação prévia com a versão `-postgres`.
- Substituição do fallback Supabase em [dimensoes-csv.ts](../../etl/jobs/dimensoes-csv.ts).
- Reescrita ou remoção dos três scripts utilitários (`check-empenho-mensal.ts`, `refresh-empenho-mensal.ts`, `check-morning-health.ps1`).

### 7.3 Itens que devem ficar (por enquanto)

- [etl/jobs/migrar-supabase-para-postgres.ts](../../etl/jobs/migrar-supabase-para-postgres.ts) — manter até a etapa 3 estar concluída, caso seja necessário extrair `dim_ente`/`dim_entidade` do Supabase uma última vez.
- Dependência `@supabase/supabase-js` no [etl/package.json](../../etl/package.json) — manter até etapas 3–5 concluídas.
- Variáveis `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` — manter enquanto o conector existir.

---

## 8. Testes e validações

### 8.1 Comandos de verificação estática (na raiz)

```powershell
# Type check do frontend
npm run lint
npx tsc --noEmit

# Build de produção
npm run build

# Validar que frontend não usa Supabase
Select-String -Path "src" -Pattern "supabase|@supabase" -Recurse
```

### 8.2 Verificação no ETL

```powershell
# Type check do ETL
cd etl
npx tsc --noEmit

# Verificar referências remanescentes
Select-String -Path "." -Pattern "supabase|@supabase" -Recurse -Exclude "node_modules","logs","data"

# Testar uninstall (no momento adequado)
npm uninstall @supabase/supabase-js
```

### 8.3 Validação manual dos painéis afetados

- **Painel Combustível** (`/painel-combustivel`): após renomear o sync APC, validar que os números batem com a execução anterior.
- **Painel Receita Pública** (`/painel-receita-publica`): conferir KPIs e série mensal após renomear variáveis de ambiente.
- **Painel Despesa** (`/painel-despesa`) e **Pesquisa de Credores** (`/pesquisa-credores`): garantir que `dim_ente`/`dim_entidade` no Postgres mantêm a integridade dos joins de marts.
- **Admin ETL** (`/seguranca/etl`): validar disparo manual após renomeação do script npm em [src/lib/etl-job-commands.ts](../../src/lib/etl-job-commands.ts).

### 8.4 Validação dos jobs ETL

```powershell
cd etl
npm run apc-polanco                # Carga SQL Server -> Postgres
npm run apc-polanco-sync-supabase  # Sync APC -> Postgres (nome legado)
npm run dimensoes                  # CSV bootstrap (validar sem Supabase)
npm run dimensoes:postgres         # Carga ente/entidade direto em Postgres
npm run receita-publica            # SQL Server -> Postgres
npm run agendar                    # Scheduler (em dry-run de horário)
```

Comparar `audit.etl_log` (linhas e duração) antes e depois de cada migração para detectar regressão.

---

## 9. Conclusão

**A dívida Supabase pode ser encerrada agora**, dentro de um esforço pequeno e linear (8 etapas descritas na seção 6). O sistema **não tem dependência funcional crítica** do Supabase no caminho de leitura: o frontend já lê apenas Postgres; o pipeline noturno grava majoritariamente em Postgres; o que sobra de Supabase ativo é:

1. **Um job de dimensões** (`dimensoes-ente-entidade-sqlserver.ts`) cujo equivalente em Postgres já parece existir (`dimensoes-ente-entidade-postgres.ts`) — exige confirmação de equivalência antes de desligar.
2. **Um fallback de bootstrap** em `dimensoes-csv.ts` — substituível por Postgres ou descartável.
3. **Três scripts utilitários** em `etl/scripts/` — sem agendamento; podem ser reescritos ou removidos.
4. **Renomeação cosmética** em ~10 arquivos (nome do job APC Polanco, variáveis de ambiente, comentários).

**Não há bloqueio técnico de migração adicional.** O encerramento pode ser planejado como um PR único após a etapa 1 (confirmação de equivalência), ou fatiado em PRs por etapa para reduzir risco. Recomenda-se iniciar pelas **remoções imediatas seguras** (seção 7.1) e pela **confirmação de equivalência das dimensões** (etapa 1), pois liberam todas as etapas seguintes sem custo.

Após o encerramento, o Varadouro Digital Aquiry passa a ser **Postgres-only** em toda a sua cadeia (frontend, marts, ETL), eliminando uma dependência externa institucional sem contrapartida funcional e reduzindo superfície de exposição, custo e ambiguidade documental.

---

## Validação da equivalência dimensoes-ente-entidade

> Execução da **Etapa 1** do plano. Nenhum código foi alterado.
> Arquivos analisados: [etl/jobs/dimensoes-ente-entidade-sqlserver.ts](../../etl/jobs/dimensoes-ente-entidade-sqlserver.ts), [etl/jobs/dimensoes-ente-entidade-postgres.ts](../../etl/jobs/dimensoes-ente-entidade-postgres.ts), [etl/schedule.ts](../../etl/schedule.ts), [etl/package.json](../../etl/package.json), [etl/schema/postgres/010_public_compat.sql](../../etl/schema/postgres/010_public_compat.sql).

### 1. Resultado da comparação

**Classificação: equivalente — pode trocar.**

A versão Postgres ([dimensoes-ente-entidade-postgres.ts](../../etl/jobs/dimensoes-ente-entidade-postgres.ts)) **cobre integralmente o escopo funcional consumido pelo sistema**. As 19 colunas extras gravadas pela versão Supabase em `dim_entidade` **não têm consumidor** — nem no frontend (`src/app/api/**`) nem nos marts ETL (`etl/jobs/refresh-mart-*.ts`). O schema Postgres oficial ([010_public_compat.sql](../../etl/schema/postgres/010_public_compat.sql)) define `public.dim_entidade` com 5 colunas (`id_entidade`, `id_ente`, `nome`, `inativo`, `atualizado_em`), e o job Postgres preenche exatamente essas. A versão Postgres adiciona ainda a carga de `public.dim_credor` a partir de `APC.dbo.CREDOR` — funcionalidade **não presente** na versão Supabase, e que é dependência real dos marts de credores.

### 2. Diferenças encontradas

| Aspecto | Versão sqlserver/supabase | Versão postgres | Impacto | Ação recomendada |
|---|---|---|---|---|
| **Fonte SQL Server** | `APC.dbo.ENTE`, `APC.dbo.ENTIDADE` | `APC.dbo.ENTE`, `APC.dbo.ENTIDADE`, **+ `APC.dbo.CREDOR`** | Postgres carrega 1 dimensão a mais | Ganho — mantém |
| **Query ENTE** | Idêntica (mesmos campos, mesmo filtro `NOT LIKE '%TESTE%'`) | Idêntica | Nenhum | — |
| **Query ENTIDADE** | Idêntica (24 campos selecionados) | Idêntica (24 campos selecionados) | Nenhum na origem | — |
| **Query CREDOR** | Inexistente | `SELECT cnpj_cpf, inscricao_estadual, ... FROM dbo.CREDOR WHERE cnpj_cpf IS NOT NULL` | Postgres oferece carga adicional | Ganho — mantém |
| **Destino ENTE** | `dim_ente` no Supabase (9 colunas) | `public.dim_ente` no Postgres (9 colunas; renomeia `cod_ibgce` → `cod_ibge` no schema) | Mapeamento já tratado no INSERT | — |
| **Destino ENTIDADE** | `dim_entidade` no Supabase (24 colunas gravadas) | `public.dim_entidade` no Postgres (5 colunas gravadas: `id_entidade`, `id_ente`, `nome`, `inativo`, `atualizado_em`) | **Aparente perda de 19 colunas**, mas validado que nenhum consumidor usa essas colunas (grep em `src/app/api/**` e `etl/jobs/refresh-mart-*` → apenas `id_entidade`, `id_ente`, `nome`, `inativo`) | Aceitar redução; documentar decisão |
| **Destino CREDOR** | Inexistente | `public.dim_credor` (11 colunas) | Postgres preenche dimensão necessária aos marts de credores | Ganho |
| **Estratégia de gravação** | `upsert` por PK (Supabase RPC) | `TRUNCATE + INSERT` em transação (`withPgTransaction`); INSERTs com `ON CONFLICT DO UPDATE` | Postgres é carga full idempotente; equivalente em resultado, mais previsível | — |
| **Filtro de integridade referencial** | Nenhum | Filtra `entidadesValidas` cujo `id_ente` existe no conjunto de entes carregados; loga descartes | Postgres protege FK `dim_entidade.id_ente → dim_ente.id_ente` declarada em [010_public_compat.sql:19](../../etl/schema/postgres/010_public_compat.sql#L19) | Ganho |
| **Auditoria de execução** | `etl_log` no **Supabase** (tabela própria) | `audit.etl_log` no Postgres + `audit.etl_carga` (id_carga, registros_lidos, registros_gravados, finalizado_em) | Postgres tem rastreabilidade institucional padronizada do projeto | Ganho |
| **Conector externo** | `getSupabase()` + `@supabase/supabase-js` | `pgQuery` + `withPgTransaction` | Postgres elimina dependência externa | Ganho |
| **Fechamento de pool** | Não fecha conexão Supabase explicitamente | `closePgPool()` ao final quando rodado como CLI | Postgres mais limpo | — |
| **Variáveis de ambiente** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DIM_ENTE_ENTIDADE_SUPABASE_BATCH`, `DIM_ENTE_TABLE`, `DIM_ENTIDADE_TABLE` | `SQLSERVER_APC_DATABASE`, `DIM_BATCH_SIZE`, `DATABASE_URL`/`PG*` (via `pgQuery`) | Postgres remove necessidade de 2 segredos externos | Ganho |
| **Nome da função exportada** | `executarCargaDimensoesEnteEntidadeSqlServer` | `executarCargaDimensoesEnteEntidadePostgres` | `schedule.ts` precisa trocar import e chamada | Etapa 2 |
| **Script npm** | `dimensoes-ente-entidade-sqlserver` ([etl/package.json:11](../../etl/package.json#L11)) | `dimensoes:postgres` ([etl/package.json:26](../../etl/package.json#L26)) | Já existe — não precisa criar | — |
| **Filtro entidades sem ente** | Não existe | Existe; registra `entidadesValidas` | Risco de FK eliminado | Ganho |
| **Constante `MODULO`** | `"dimensoes_ente_entidade_sqlserver"` | `"dimensoes_ente_entidade_postgres"` | Logs de auditoria mudam o `modulo` | Comunicar; consultas históricas continuam por valor antigo |

### 3. Impacto no cron noturno

Mudanças exatas em [etl/schedule.ts](../../etl/schedule.ts):

- **Linha 14** — substituir:
  ```ts
  import { executarCargaDimensoesEnteEntidadeSqlServer } from "./jobs/dimensoes-ente-entidade-sqlserver";
  ```
  por:
  ```ts
  import { executarCargaDimensoesEnteEntidadePostgres } from "./jobs/dimensoes-ente-entidade-postgres";
  ```
- **Step 8/11 (linhas 181–188)** — substituir a chamada `executarCargaDimensoesEnteEntidadeSqlServer()` por `executarCargaDimensoesEnteEntidadePostgres()` e atualizar a mensagem de log para `"dimensoes ente/entidade/credor (SQL Server -> PostgreSQL)"`. Manter a flag `RUN_DIM_ENTE_ENTIDADE_SQLSERVER_NIGHTLY` por uma transição (ou renomear para `RUN_DIM_ENTE_ENTIDADE_NIGHTLY` com retrocompatibilidade).

Em [etl/package.json](../../etl/package.json):

- **Linha 11** — `"dimensoes-ente-entidade-sqlserver"` pode ser mantido apontando para o arquivo antigo durante a janela de transição, ou removido após validação.
- **Linha 26** — `"dimensoes:postgres"` já existe e roda a versão Postgres. **Não precisa criar nada.**

Em [src/lib/etl-job-commands.ts](../../src/lib/etl-job-commands.ts): verificar se há mapeamento para `dimensoes-ente-entidade-sqlserver` (não encontrado nas buscas anteriores; apenas `apc-polanco-sync-supabase` foi citado). Se houver, alinhar.

### 4. Variáveis Supabase elimináveis após a troca

A troca **isolada** deste job não elimina nenhuma variável Supabase de forma definitiva, porque o conector ainda é usado por [dimensoes-csv.ts](../../etl/jobs/dimensoes-csv.ts) (fallback) e por três scripts utilitários em [etl/scripts/](../../etl/scripts/). Variáveis que **deixam de ser usadas exclusivamente por este job**:

- `DIM_ENTE_ENTIDADE_SUPABASE_BATCH` — não referenciada em mais nenhum lugar; pode ser removida do `.env`/`.env.example`.
- `DIM_ENTE_TABLE`, `DIM_ENTIDADE_TABLE` — usadas apenas pela versão Supabase; podem ser removidas após a troca.

Após as Etapas 3–5 do plano (fallback CSV migrado e scripts utilitários reescritos/removidos), passam a ser elimináveis:

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Dependência npm `@supabase/supabase-js`.
- `etl/connectors/supabase.ts`.

### 5. Risco da troca

**Risco: baixo.**

Justificativa:

- O schema Postgres `public.dim_entidade` já existe há tempo, foi criado em [010_public_compat.sql](../../etl/schema/postgres/010_public_compat.sql) e é consumido por **11 endpoints** do frontend (`/api/despesa/*`, `/api/receita-publica/*`, `/api/remessas/calendario`).
- O script `dimensoes:postgres` **já está versionado** no `package.json` e pode ser executado em homologação antes da troca do cron.
- A versão Postgres é mais defensiva: usa transação, filtra entidades órfãs, registra `audit.etl_carga` com cardinalidades.
- Nenhum consumidor (frontend ou mart ETL) lê as 19 colunas que ficariam de fora — confirmado por grep direcionado em `src/app/api/**` e `etl/jobs/refresh-mart-*.ts`.
- O risco residual é histórico: análises ad-hoc futuras sobre `dim_entidade` no Supabase (RGF/RREO/poder/esfera) deixariam de existir; mas essa informação **não é hoje superfície funcional do Varadouro**.

**Mitigação:** rodar `npm --prefix etl run dimensoes:postgres` em homologação e comparar contagens com a última execução do job Supabase antes de trocar o cron em produção.

### 6. Recomendação

**Pode trocar agora**, com a seguinte ordem operacional:

1. Executar manualmente `npm --prefix etl run dimensoes:postgres` em homologação e validar:
   - `SELECT count(*) FROM public.dim_ente` igual ou compatível com o snapshot Supabase atual.
   - `SELECT count(*) FROM public.dim_entidade` próximo do total Supabase (com tolerância à filtragem de entidades órfãs).
   - `SELECT count(*) FROM public.dim_credor` populado.
   - `SELECT * FROM audit.etl_log WHERE modulo = 'dimensoes_ente_entidade_postgres' ORDER BY id DESC LIMIT 3` retornando o evento.
   - `SELECT * FROM audit.etl_carga WHERE modulo = 'dimensoes_ente_entidade_postgres' ORDER BY id_carga DESC LIMIT 3` com `status='ok'`.
2. Confirmar que os marts de despesa, credores e remessas continuam funcionando contra `public.dim_ente`/`public.dim_entidade` populados pela versão Postgres.
3. Aplicar a Etapa 2 (alteração do cron). Manter o arquivo antigo `dimensoes-ente-entidade-sqlserver.ts` por um ciclo, com o cron já apontando para o novo job.

### 7. Próximo passo proposto

**Plano da Etapa 2 — alteração do cron** (a executar em um PR dedicado, após a validação acima):

1. **Editar** [etl/schedule.ts](../../etl/schedule.ts):
   - Linha 14: trocar `import { executarCargaDimensoesEnteEntidadeSqlServer } from "./jobs/dimensoes-ente-entidade-sqlserver";` por `import { executarCargaDimensoesEnteEntidadePostgres } from "./jobs/dimensoes-ente-entidade-postgres";`.
   - Linhas 43–44: renomear a constante `RUN_DIM_ENTE_ENTIDADE_SQLSERVER_NIGHTLY` para `RUN_DIM_ENTE_ENTIDADE_NIGHTLY`, lendo da nova variável com fallback para a antiga (uma release de transição).
   - Linha 77: ajustar a mensagem de log.
   - Linhas 181–188: substituir `executarCargaDimensoesEnteEntidadeSqlServer()` por `executarCargaDimensoesEnteEntidadePostgres()` e ajustar o texto do step para `"dimensoes ente/entidade/credor (SQL Server -> PostgreSQL)"`.
2. **Manter** [etl/jobs/dimensoes-ente-entidade-sqlserver.ts](../../etl/jobs/dimensoes-ente-entidade-sqlserver.ts) no repositório por uma release (com aviso `console.warn` na execução manual de que está deprecado). **Não remover** ainda.
3. **Manter** o script `dimensoes-ente-entidade-sqlserver` em [etl/package.json](../../etl/package.json) por uma release.
4. **Atualizar** [.env.example](../../.env.example) e [etl/.env.example](../../etl/.env.example): adicionar `RUN_DIM_ENTE_ENTIDADE_NIGHTLY=true` ao lado da variável legada, com comentário de deprecação.
5. **Documentar** em [TODO.md](../../TODO.md) e [HANDOFF.md](../../HANDOFF.md) que a Etapa 2 foi concluída e que o único fluxo ativo de **escrita** no Supabase foi encerrado.
6. **Após uma execução noturna bem-sucedida do novo job**, abrir a Etapa 3 (bootstrap CSV) e Etapa 5 (scripts utilitários), conforme plano original do diagnóstico.

**Critério de pronto da Etapa 2:** o pipeline noturno executa o Step 8/11 chamando `executarCargaDimensoesEnteEntidadePostgres`, e nenhum registro novo é gravado em `dim_ente`/`dim_entidade`/`etl_log` no Supabase a partir da troca.

---

## Etapa 2 — Troca do cron para dimensões Postgres

### Data
2026-05-19.

### Arquivos alterados
- [etl/schedule.ts](../../etl/schedule.ts) — única alteração de código.
- [docs/varadouro/diagnostico-divida-supabase.md](diagnostico-divida-supabase.md) — esta seção.

### Resumo das mudanças em `etl/schedule.ts`

Três edições pontuais, sem alteração da ordem do cron, das flags `RUN_*` ou da estrutura geral:

1. **Import (linha 14)** — substituído:
   - **De:** `import { executarCargaDimensoesEnteEntidadeSqlServer } from "./jobs/dimensoes-ente-entidade-sqlserver";`
   - **Para:** `import { executarCargaDimensoesEnteEntidadePostgres } from "./jobs/dimensoes-ente-entidade-postgres";`

2. **Log de boot do scheduler (linha 77)** — substituído:
   - **De:** `console.log(\`Nightly Dimensoes Ente/Entidade SQL: ${RUN_DIM_ENTE_ENTIDADE_SQLSERVER_NIGHTLY ? "enabled" : "disabled"}\n\`);`
   - **Para:** `console.log(\`Nightly Dimensoes Ente/Entidade/Credor (Postgres): ${RUN_DIM_ENTE_ENTIDADE_SQLSERVER_NIGHTLY ? "enabled" : "disabled"}\n\`);`

3. **Step 8/11 (linhas 181–188)** — substituídos texto do `console.log`, função chamada e mensagem de erro:
   - **Mensagem do step:** `"[CRON] Step 8/11: dimensoes ente/entidade/credor (SQL Server -> PostgreSQL)"`
   - **Chamada:** `await executarCargaDimensoesEnteEntidadePostgres().catch(...)`
   - **Mensagem de erro:** `"[CRON] dimensoes ente/entidade/credor postgres failed:"`
   - **Mensagem de skip:** `"[CRON] Step 8/11: dimensoes ente/entidade/credor skipped by RUN_DIM_ENTE_ENTIDADE_SQLSERVER_NIGHTLY=false"`

A flag de ambiente `RUN_DIM_ENTE_ENTIDADE_SQLSERVER_NIGHTLY` foi **mantida intencionalmente** (apesar do nome legado) para preservar compatibilidade com a configuração de produção atual. A renomeação para `RUN_DIM_ENTE_ENTIDADE_NIGHTLY`, com fallback retrocompatível, fica para uma etapa posterior junto com a renomeação dos demais cosméticos Supabase.

Nenhum outro arquivo foi alterado. O job antigo [etl/jobs/dimensoes-ente-entidade-sqlserver.ts](../../etl/jobs/dimensoes-ente-entidade-sqlserver.ts) **permanece intacto** no repositório por uma release, conforme plano.

### Comandos de validação executados

```powershell
# Verificação estática (na pasta etl/)
npx tsc --noEmit
# EXIT=0 — sem erros de tipo.

# Scripts de lint/typecheck no etl/package.json: não existem.

# Validação focal do job Postgres (na pasta etl/)
npm run dimensoes:postgres
```

> Observação: `etl/package.json` **não declara** scripts `lint`, `typecheck` nem `tsc`. A verificação estática foi feita diretamente com `npx tsc --noEmit`.

### Resultado da validação

```
[2026-05-19T06:03:30.738Z] Iniciando ETL: dimensoes_ente_entidade_postgres
  -> Fonte SQL Server: APC.dbo.{ENTE, ENTIDADE, CREDOR}
  -> Destino PostgreSQL: public.{dim_ente, dim_entidade, dim_credor}
[postgres] Pool iniciado — host: localhost, database: varadouro_digital
  -> Lendo dados do SQL Server...
  -> Lidos: ente=23 | entidade=275 | credor=305675
  -> Entidades filtradas: 1 ignoradas (id_ente ausente em dim_ente)
  -> Gravando no PostgreSQL...
  -> dim_ente: 23 registros gravados
  -> dim_entidade: 274 registros gravados
  -> dim_credor: 305675 registros gravados
  OK - ETL concluido em 204604ms | total gravado: 305972 registros
[postgres] Pool encerrado.
EXIT=0
```

- **Status:** sucesso.
- **Cardinalidades observadas:**
  - `public.dim_ente`: 23 registros (compatível com o universo de jurisdicionados estaduais e municipais do TCE-AC: estado + 22 municípios).
  - `public.dim_entidade`: 274 registros gravados, 1 entidade filtrada por integridade referencial (FK em `dim_entidade.id_ente`).
  - `public.dim_credor`: 305 675 registros gravados a partir de `APC.dbo.CREDOR` — dimensão necessária aos marts de credores, antes não populada por nenhum job Supabase.
- **Duração:** ~205 segundos. Carga full em transação `TRUNCATE + INSERT`.
- **Auditoria:** registros em `audit.etl_log` (módulo `dimensoes_ente_entidade_postgres`) e `audit.etl_carga` (com `registros_lidos` e `registros_gravados`) — comportamento esperado da versão Postgres.

### Pendências

Nenhuma pendência bloqueante para a Etapa 2. Itens herdados para etapas futuras do plano:

- **Etapa 3** — bootstrap CSV de [etl/jobs/dimensoes-csv.ts](../../etl/jobs/dimensoes-csv.ts) ainda lê do Supabase em fallback. Sem mudança nesta etapa.
- **Etapa 5** — três scripts utilitários em [etl/scripts/](../../etl/scripts/) ainda usam Supabase. Sem mudança nesta etapa.
- **Renomeação cosmética** da flag `RUN_DIM_ENTE_ENTIDADE_SQLSERVER_NIGHTLY` e demais variáveis legadas — adiada para a Etapa 7 do plano.
- **Remoção do job antigo** [etl/jobs/dimensoes-ente-entidade-sqlserver.ts](../../etl/jobs/dimensoes-ente-entidade-sqlserver.ts) — manter por uma release; remover apenas após confirmação de execução noturna estável.
- **Atualização documental** ([CLAUDE.md](../../CLAUDE.md), [README.md](../../README.md), [HANDOFF.md](../../HANDOFF.md), [TODO.md](../../TODO.md), demais documentos em `docs/varadouro/`) — adiada para o fechamento da Etapa 7/8 do plano, quando a dívida Supabase estiver de fato encerrada.

### Rollback simples

Reverter as 3 edições em [etl/schedule.ts](../../etl/schedule.ts):

1. **Import (linha 14):**
   - `import { executarCargaDimensoesEnteEntidadeSqlServer } from "./jobs/dimensoes-ente-entidade-sqlserver";`
2. **Log de boot (linha 77):**
   - `console.log(\`Nightly Dimensoes Ente/Entidade SQL: ${RUN_DIM_ENTE_ENTIDADE_SQLSERVER_NIGHTLY ? "enabled" : "disabled"}\n\`);`
3. **Step 8/11:** restaurar `executarCargaDimensoesEnteEntidadeSqlServer()` e os textos originais de log do step.

O arquivo antigo [etl/jobs/dimensoes-ente-entidade-sqlserver.ts](../../etl/jobs/dimensoes-ente-entidade-sqlserver.ts) permanece intacto, então o rollback é apenas textual e imediato. Nenhuma variável de ambiente, nenhuma dependência npm e nenhum schema foram alterados nesta etapa, o que torna o caminho de rollback trivial.

---

## Etapa 3 — Neutralização do fallback Supabase em dimensoes-csv.ts

### Data
2026-05-19.

### Arquivo alterado
- [etl/jobs/dimensoes-csv.ts](../../etl/jobs/dimensoes-csv.ts) — única alteração de código nesta etapa.

### Análise do comportamento (estado anterior)

- A variável `AUTO_BOOTSTRAP_FROM_SUPABASE` é lida na linha 70 a partir de `process.env.DIM_AUTO_BOOTSTRAP_FROM_SUPABASE`.
- **Default anterior:** `true` — qualquer ambiente sem a variável definida acionava o fallback Supabase automaticamente.
- O fallback `bootstrapCsvFromSupabase()` é acionado **somente quando há CSV(s) ausente(s)** em [etl/data/dimensoes/](../../etl/data/dimensoes/) (`dim_uf.csv`, `dim_municipios.csv`, `dim_ente.csv`, `dim_entidade.csv`).
- Quando acionado, lê as tabelas `aux_dim_uf`, `aux_dim_municipio`, `aux_dim_ente`, `aux_dim_entidade` no Supabase e regenera os arquivos em disco.
- O job roda como **Step 5/11 do cron noturno** ([etl/schedule.ts:156](../../etl/schedule.ts#L156)) e também pode ser disparado manualmente via `npm --prefix etl run dimensoes`. No estado atual da `etl/data/dimensoes/`, os 4 CSVs **estão presentes** — então o fallback nunca é executado em operação normal. A dívida é o **default permissivo**, que pode mascarar regressões em ambientes recém-provisionados.

### Comportamento novo

- `DIM_AUTO_BOOTSTRAP_FROM_SUPABASE` **só ativa o fallback se for explicitamente `"true"`** (comparação `=== "true"`, não mais `!== "false"`). Qualquer outro valor — inclusive ausência — é tratado como **desligado**.
- Se um CSV estiver ausente e o fallback estiver desligado, o job falha imediatamente com mensagem orientativa, indicando que o caminho oficial agora é regenerar os CSVs a partir do PostgreSQL (`public.aux_dim_*` ou export de `dim_ente`/`dim_entidade` populadas pelo job `dimensoes:postgres`).
- Se o fallback for acionado por opt-in explícito, o job imprime um `console.warn` claro indicando que é caminho legado e que será removido.
- Os comentários do `import` do conector Supabase e da declaração da flag foram atualizados para registrar o status legado/opt-in e a previsão de remoção.

### Como acionar o fallback legado manualmente (janela de transição)

Caso, durante a transição, alguém precise regenerar os CSVs a partir do Supabase em um ambiente novo (caso de uso esperado: zero):

```powershell
$env:DIM_AUTO_BOOTSTRAP_FROM_SUPABASE = "true"
npm --prefix etl run dimensoes
```

A execução emitirá um aviso explícito (`[LEGADO]`) de que está usando caminho deprecado.

### Validações executadas

```powershell
# Verificação estática (na pasta etl/)
npx tsc --noEmit
# EXIT=0 — sem erros de tipo.

# Dry-run do job (na pasta etl/) — com os CSVs presentes em etl/data/dimensoes/
npm run dimensoes -- --dry-run
```

### Resultado

```
[2026-05-19T06:10:58.046Z] Iniciando ETL: dimensoes_csv (dry-run)
  -> Lendo arquivos CSV...
  -> UF: delimiter=; encoding=utf8 rows=27
  -> Municipio: delimiter=; encoding=utf8 rows=5571
  -> Ente: delimiter=; encoding=utf8 rows=24
  -> Entidade: delimiter=; encoding=utf8 rows=236
  -> Registros parseados: uf=27 municipio=5571 ente=24 entidade=236
  -> Exemplos normalizacao: "17,00" => "1700", "23.111" => "23111", "1200401" => "1200401"
  OK - Dry-run concluido em 20ms (5858 registros preparados)
EXIT=0
```

- **Status:** sucesso.
- O caminho do Supabase **não foi acionado**, pois os 4 CSVs estão presentes em [etl/data/dimensoes/](../../etl/data/dimensoes/).
- A mudança é, na prática, **invisível em operação normal**: o fluxo padrão (CSVs presentes) permanece idêntico.
- O ganho é defensivo: ambientes futuros sem CSVs não puxarão silenciosamente do Supabase.

### Pendências

- **Substituir o fallback por regeneração a partir do PostgreSQL.** Hoje, se um ambiente novo subir sem os CSVs e sem opt-in, o job falha com mensagem clara — o que é o comportamento desejado em transição, mas idealmente deve haver um caminho de regeneração a partir de `public.aux_dim_*` ou de `dim_ente`/`dim_entidade`. Pode ser tratado em PR específico antes de remover o conector Supabase.
- **Remoção da função `bootstrapCsvFromSupabase`, do `selectAll`, do import `getSupabase` e do código associado** — preservados nesta etapa para permitir opt-in de emergência; remover quando a transição estiver consolidada (Etapa 7 do plano original).
- **Renomeação da variável de ambiente `DIM_AUTO_BOOTSTRAP_FROM_SUPABASE`** — adiada; pode ser eliminada junto com o código.

### Rollback simples

Reverter em [etl/jobs/dimensoes-csv.ts](../../etl/jobs/dimensoes-csv.ts):

1. **Linha do `AUTO_BOOTSTRAP_FROM_SUPABASE`** — voltar para:
   ```ts
   const AUTO_BOOTSTRAP_FROM_SUPABASE = (process.env.DIM_AUTO_BOOTSTRAP_FROM_SUPABASE ?? "true").toLowerCase() !== "false";
   ```
2. **Bloco de erro/log do `missing.length > 0`** — restaurar a mensagem original (`throw new Error(\`CSV(s) de dimensao ausente(s): ${missing.join(", ")}\`);` e `console.log("  -> CSV(s) ausente(s) ... Tentando bootstrap do Supabase...")`).
3. **Comentário do import `getSupabase`** — restaurar para `// usado apenas como fallback de leitura no bootstrap`.

Como mitigação intermediária — sem reverter código — basta definir `DIM_AUTO_BOOTSTRAP_FROM_SUPABASE=true` no ambiente, restaurando o comportamento anterior por configuração.

---

## Etapa 4 — Inventário final de resíduos Supabase

### Data
2026-05-19.

### Comandos de busca usados

Buscas via `Grep` sobre os padrões: `supabase`, `SUPABASE`, `Supabase`, `getSupabase`, `createClient`, `DIM_AUTO_BOOTSTRAP_FROM_SUPABASE`, `ETL_TARGET`, `migrar-supabase`, `sync-supabase`. Exclusões: `node_modules/`, `etl/package-lock.json`, `etl/logs/`, `docs/varadouro/*.md` (autorreferência).

### Resumo quantitativo

Após Etapas 1–3, a contagem operacional caiu a:

| Categoria | Quantidade |
|---|---|
| **Código com chamada real ao SDK Supabase em runtime de produção (cron)** | **0** |
| Código com chamada real ao SDK Supabase via opt-in manual | 1 arquivo (`etl/jobs/dimensoes-csv.ts` — somente quando `DIM_AUTO_BOOTSTRAP_FROM_SUPABASE=true`) |
| Código legado com chamada real ao SDK Supabase, **fora do cron** | 5 arquivos (`dimensoes-ente-entidade-sqlserver.ts`, `migrar-supabase-para-postgres.ts`, `etl/scripts/check-empenho-mensal.ts`, `etl/scripts/refresh-empenho-mensal.ts`, `etl/scripts/check-morning-health.ps1`) |
| Conector base (`getSupabase`/`createClient`) | 1 (`etl/connectors/supabase.ts`) |
| Configuração órfã (não importada por ninguém) | 1 (`etl/config/etl-target.ts`) |
| Referências cosméticas em comentários de cabeçalho | 3 arquivos (`combustivel.ts`, `populacao-ibge.ts`, comentário em `dimensoes-csv.ts`) |
| Constantes/variáveis de ambiente com nome legado (apontando para Postgres) | 8 ocorrências em 7 jobs |
| Script `.cmd` chamando `apc-polanco-sync-supabase` | 1 (`etl/scripts/run-nightly-etl.cmd`) |
| `package.json` (script + dependência) | 1 (`etl/package.json`) |
| Schema SQL legado | 11 arquivos em `etl/schema/*.sql` (não `etl/schema/postgres/`) |
| `.env.example` raiz e `etl/.env.example` | 2 arquivos |
| Frontend (`src/`) | 1 ocorrência cosmética (`src/lib/etl-job-commands.ts:34`) |
| Documentação institucional fora de `docs/varadouro/` | 4 arquivos (`CLAUDE.md`, `README.md`, `HANDOFF.md`, `TODO.md`) + 1 (`docs/postgres-local.md`) + 1 (`docs/aquiry/checklist-mvp-assistente-aquiry.md`) |

### Tabela de ocorrências

> Linhas aproximadas. Para ocorrências múltiplas no mesmo arquivo, a coluna "linha" lista as principais.

| # | Arquivo | Linha(s) | Ocorrência | Tipo | Classificação | Risco se remover agora | Recomendação |
|---|---|---|---|---|---|---|---|
| 1 | [src/lib/etl-job-commands.ts](../../src/lib/etl-job-commands.ts) | 34 | `"apc-polanco-sync-supabase"` (nome do script npm) | Código — string literal | Cosmético | Baixo (apenas string) | Renomear quando o script npm for renomeado (Etapa 7) |
| 2 | [etl/connectors/supabase.ts](../../etl/connectors/supabase.ts) | 1–13 | Conector com `createClient` | Código — biblioteca | Removível depois de uma release | **Alto** se removido antes de descontinuar os 6 consumidores legados | Manter até remover todos os consumidores |
| 3 | [etl/config/etl-target.ts](../../etl/config/etl-target.ts) | 1–15 | `EtlTarget`, `getEtlTarget`, `isPostgresTarget`, `isSupabaseTarget` | Código — configuração | **Falso positivo / código morto** (não importado em nenhum lugar — confirmado por grep) | Nulo | Remover na Etapa 5 |
| 4 | [etl/jobs/dimensoes-csv.ts](../../etl/jobs/dimensoes-csv.ts) | 13–18, 73–77, 184–198, 232–257, 510–528 | `getSupabase()`, `bootstrapCsvFromSupabase()`, flag opt-in já neutralizada na Etapa 3 | Código — fallback manual | Legado manual (opt-in) | Médio se removido agora — perde fallback de bootstrap | Substituir por regeneração a partir do PostgreSQL antes de remover (Etapa 6) |
| 5 | [etl/jobs/dimensoes-ente-entidade-sqlserver.ts](../../etl/jobs/dimensoes-ente-entidade-sqlserver.ts) | inteiro | Job legado (`getSupabase` + upsert) | Código — job legado | Removível depois de uma release | Baixo — cron já não chama (Etapa 2); script npm `dimensoes-ente-entidade-sqlserver` permanece | Remover na Etapa 6 (após uma execução noturna estável da versão Postgres) |
| 6 | [etl/jobs/migrar-supabase-para-postgres.ts](../../etl/jobs/migrar-supabase-para-postgres.ts) | inteiro | One-shot de migração (`createClient`) | Código — utilitário histórico | Histórico/documental | Nulo (finalidade já cumprida) | Remover na Etapa 5 (junto com script `migrar:supabase-postgres`) |
| 7 | [etl/jobs/apc-polanco-sync-supabase.ts](../../etl/jobs/apc-polanco-sync-supabase.ts) | 40, 42 | `APC_POLANCO_SUPABASE_TABLE`, `APC_POLANCO_SYNC_SUPABASE_BATCH` | Código — variáveis legadas (job grava em **Postgres**) | Cosmético | Nulo | Renomear na Etapa 7 |
| 8 | [etl/jobs/receita-publica.ts](../../etl/jobs/receita-publica.ts) | 4, 50, 54 | Comentário "Destino: Supabase" + `RECEITA_PUBLICA_SUPABASE_TABLE/_BATCH` | Código — comentário + variáveis legadas | Cosmético | Nulo | Renomear na Etapa 7 |
| 9 | [etl/jobs/combustivel.ts](../../etl/jobs/combustivel.ts) | 4 | Comentário "Destino: Supabase (tabelas agregadas)" | Comentário | Cosmético | Nulo | Corrigir comentário na Etapa 7 |
| 10 | [etl/jobs/populacao-ibge.ts](../../etl/jobs/populacao-ibge.ts) | 2 | Comentário "API IBGE -> Supabase" | Comentário | Cosmético | Nulo | Corrigir comentário na Etapa 7 |
| 11 | [etl/jobs/fato-empenho.ts](../../etl/jobs/fato-empenho.ts) | 16, 43 | `FATO_EMPENHO_SUPABASE_BATCH` (env var) | Código — variável legada | Cosmético | Nulo | Renomear na Etapa 7 |
| 12 | [etl/jobs/cauc.ts](../../etl/jobs/cauc.ts) | 29, 352, 353, 463 | Constante `SUPABASE_BATCH = 500` | Código — constante interna | Cosmético | Nulo | Renomear na Etapa 7 |
| 13 | [etl/jobs/processos-gabinete.ts](../../etl/jobs/processos-gabinete.ts) | 10, 284, 285 | Constante `SUPABASE_BATCH` + tipo `SupabaseProcessoGabineteRow` | Código — nomes internos | Cosmético | Nulo | Renomear na Etapa 7 |
| 14 | [etl/jobs/dimensoes-empenho-sqlserver.ts](../../etl/jobs/dimensoes-empenho-sqlserver.ts) | 35 | `DIM_EMPENHO_SUPABASE_BATCH` | Código — variável legada | Cosmético | Nulo | Renomear na Etapa 7 |
| 15 | [etl/jobs/dimensoes-receita-sqlserver.ts](../../etl/jobs/dimensoes-receita-sqlserver.ts) | 61 | `DIM_RECEITA_SUPABASE_BATCH` | Código — variável legada | Cosmético | Nulo | Renomear na Etapa 7 |
| 16 | [etl/scripts/check-empenho-mensal.ts](../../etl/scripts/check-empenho-mensal.ts) | 2, 5 | `getSupabase()` em script utilitário | Script manual | Legado manual | Baixo (sem agendamento) | Reescrever contra Postgres ou remover na Etapa 5 |
| 17 | [etl/scripts/refresh-empenho-mensal.ts](../../etl/scripts/refresh-empenho-mensal.ts) | 2, 5–17 | `getSupabase()` + `supabase.rpc(...)` | Script manual | Legado manual | Baixo | Reescrever contra Postgres (com função SQL local) ou remover na Etapa 5 |
| 18 | [etl/scripts/check-morning-health.ps1](../../etl/scripts/check-morning-health.ps1) | 32–57 | `createClient(...)` embutido em PowerShell + leitura de `audit.etl_log` Supabase | Script manual | Legado manual | Baixo | Reescrever contra Postgres ou remover na Etapa 5 |
| 19 | [etl/scripts/run-nightly-etl.cmd](../../etl/scripts/run-nightly-etl.cmd) | 47 | `call npm run apc-polanco-sync-supabase` | Script — wrapper Windows | Cosmético (script já é Postgres) | Baixo | Renomear quando o script npm for renomeado (Etapa 7) |
| 20 | [etl/schedule.ts](../../etl/schedule.ts) | 11, 38–39, 74, 145–151 | `executarSyncApcPolancoSupabase` + flag `RUN_APC_POLANCO_SUPABASE_SYNC_NIGHTLY` + logs | Código — orquestrador | Cosmético (chama job que grava em Postgres) | Baixo | Renomear na Etapa 7 |
| 21 | [etl/package.json](../../etl/package.json) | 8 | Script `"apc-polanco-sync-supabase"` | `package.json` | Cosmético | Baixo (já é Postgres) | Renomear na Etapa 7 |
| 22 | [etl/package.json](../../etl/package.json) | 24 | Script `"migrar:supabase-postgres"` | `package.json` | Histórico/documental | Nulo | Remover na Etapa 5 |
| 23 | [etl/package.json](../../etl/package.json) | 98 | Dependência `"@supabase/supabase-js": "^2.49.8"` | `package.json` | Removível depois de uma release | **Alto** se removido antes de descontinuar conector e scripts | Remover na Etapa 6, junto com o conector |
| 24 | [.env.example](../../.env.example) | 79–127 | Bloco Supabase + flags `*_SUPABASE_*` | Configuração | Necessário temporariamente | Médio | Manter enquanto conector existir; revisar na Etapa 7 |
| 25 | [etl/.env.example](../../etl/.env.example) | 2–3 | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Configuração | Necessário temporariamente | Médio | Manter enquanto conector existir; revisar na Etapa 7 |
| 26 | [etl/schema/supabase_apc_despesa_combustivel_polanco.sql](../../etl/schema/supabase_apc_despesa_combustivel_polanco.sql) | inteiro | Schema legado para Supabase | SQL legado | Histórico/documental | Nulo | Remover na Etapa 5 |
| 27 | [etl/schema/combustivel.sql](../../etl/schema/combustivel.sql) | 4 | Comentário "Executar no SQL Editor do Supabase" | SQL legado — comentário | Histórico/documental | Nulo | Marcar como deprecado ou remover na Etapa 5/6 |
| 28 | [etl/schema/dimensoes_auxiliares.sql](../../etl/schema/dimensoes_auxiliares.sql) | 3 | Comentário Supabase | SQL legado | Histórico/documental | Nulo | Idem |
| 29 | [etl/schema/dimensoes_classificacao_despesa.sql](../../etl/schema/dimensoes_classificacao_despesa.sql) | 4 | Comentário Supabase | SQL legado | Histórico/documental | Nulo | Idem |
| 30 | [etl/schema/dimensoes_ente_entidade.sql](../../etl/schema/dimensoes_ente_entidade.sql) | 2 | Comentário Supabase | SQL legado | Histórico/documental | Nulo | Idem |
| 31 | [etl/schema/dimensoes_receita_sqlserver.sql](../../etl/schema/dimensoes_receita_sqlserver.sql) | 2 | Comentário Supabase | SQL legado | Histórico/documental | Nulo | Idem |
| 32 | [etl/schema/fato_empenho.sql](../../etl/schema/fato_empenho.sql) | 2, 4 | Comentário Supabase | SQL legado | Histórico/documental | Nulo | Idem |
| 33 | [etl/schema/populacao_ibge.sql](../../etl/schema/populacao_ibge.sql) | 2 | Comentário Supabase | SQL legado | Histórico/documental | Nulo | Idem |
| 34 | [etl/schema/receita_publica.sql](../../etl/schema/receita_publica.sql) | 2, 4 | Comentário Supabase | SQL legado | Histórico/documental | Nulo | Idem |
| 35 | [etl/schema/views_despesa.sql](../../etl/schema/views_despesa.sql) | 2, 3 | Comentário Supabase | SQL legado | Histórico/documental | Nulo | Idem |
| 36 | [etl/schema/views_despesa_performance.sql](../../etl/schema/views_despesa_performance.sql) | 2, 3 | Comentário Supabase | SQL legado | Histórico/documental | Nulo | Idem |
| 37 | [etl/schema/postgres/010_public_compat.sql](../../etl/schema/postgres/010_public_compat.sql) | 2 | Comentário "compatíveis com o modelo Supabase" | SQL — migration ativa | Cosmético | Nulo | Reescrever comentário na Etapa 7 |
| 38 | [docs/postgres-local.md](../postgres-local.md) | 83, 120 | Menção ao script `migrar:supabase-postgres` | Documentação | Histórico/documental | Nulo | Atualizar quando o script for removido (Etapa 5) |
| 39 | [docs/aquiry/checklist-mvp-assistente-aquiry.md](../aquiry/checklist-mvp-assistente-aquiry.md) | — | Menção em texto | Documentação | Histórico/documental | Nulo | Revisar na Etapa 8 |
| 40 | [CLAUDE.md](../../CLAUDE.md), [README.md](../../README.md), [HANDOFF.md](../../HANDOFF.md), [TODO.md](../../TODO.md) | várias | Menções a Supabase residual, dívida, conector | Documentação institucional | Histórico/documental | Nulo | Atualizar na Etapa 8 (fechamento da dívida) |

### Classificação por categoria

- **Necessário temporariamente (4):** conector `etl/connectors/supabase.ts`, dependência npm `@supabase/supabase-js`, blocos Supabase em `.env.example` e `etl/.env.example`. Permanecem enquanto os consumidores legados existirem.
- **Legado manual (4):** `dimensoes-csv.ts` (opt-in), `check-empenho-mensal.ts`, `refresh-empenho-mensal.ts`, `check-morning-health.ps1`. Acionados manualmente; não estão no cron.
- **Removível depois de uma release (3):** `dimensoes-ente-entidade-sqlserver.ts`, conector, dependência npm. Aguardam confirmação de execução noturna estável da versão Postgres.
- **Histórico/documental (15):** `migrar-supabase-para-postgres.ts`, `supabase_apc_despesa_combustivel_polanco.sql`, 9 schemas com comentário "Executar no SQL Editor do Supabase", docs institucionais. Sem impacto operacional.
- **Cosmético (13):** todos os usos onde "supabase" aparece em nome de constante, variável de ambiente, comentário ou string literal, mas a operação real é contra Postgres. Inclui o nome do job `apc-polanco-sync-supabase.ts` e os logs de `etl/schedule.ts`.
- **Falso positivo / código morto (1):** `etl/config/etl-target.ts` — não é importado por nenhum job ativo.

### Conclusão

**Dependência operacional Supabase: encerrada.**

Após as Etapas 1–3:

- O cron noturno **não invoca o SDK Supabase em nenhum step** em operação padrão.
- A única chamada possível ao SDK em runtime é via opt-in explícito `DIM_AUTO_BOOTSTRAP_FROM_SUPABASE=true`, e somente quando os 4 CSVs de dimensões estão ausentes — cenário que não ocorre em ambientes provisionados.
- Os 3 scripts utilitários em `etl/scripts/` que ainda usam Supabase rodam **manualmente** e não fazem parte do pipeline de produção.
- O frontend (`src/`) **não tem nenhuma chamada** ao SDK Supabase — apenas uma string literal com o nome de um script npm.

Nenhuma dependência operacional nova foi encontrada na Etapa 4.

### Candidatos à remoção na Etapa 5 (limpeza segura — não exige nova migração)

1. [etl/config/etl-target.ts](../../etl/config/etl-target.ts) — código morto.
2. [etl/jobs/migrar-supabase-para-postgres.ts](../../etl/jobs/migrar-supabase-para-postgres.ts) — utilitário one-shot, finalidade cumprida.
3. Script `"migrar:supabase-postgres"` em [etl/package.json](../../etl/package.json).
4. [etl/scripts/check-empenho-mensal.ts](../../etl/scripts/check-empenho-mensal.ts) — sem agendamento, sem uso operacional documentado.
5. [etl/scripts/refresh-empenho-mensal.ts](../../etl/scripts/refresh-empenho-mensal.ts) — idem.
6. [etl/scripts/check-morning-health.ps1](../../etl/scripts/check-morning-health.ps1) — reescrever para Postgres ou remover.
7. [etl/schema/supabase_apc_despesa_combustivel_polanco.sql](../../etl/schema/supabase_apc_despesa_combustivel_polanco.sql) — schema legado isolado.
8. Atualização dos comentários "Executar no SQL Editor do Supabase" nos demais 9 arquivos `etl/schema/*.sql`.

### Itens que devem permanecer temporariamente

1. [etl/connectors/supabase.ts](../../etl/connectors/supabase.ts) — base para `dimensoes-csv.ts` (opt-in) e `dimensoes-ente-entidade-sqlserver.ts` (legado por uma release).
2. Dependência `@supabase/supabase-js` em [etl/package.json](../../etl/package.json) — idem.
3. Bloco Supabase em [.env.example](../../.env.example) e [etl/.env.example](../../etl/.env.example) — referência operacional para opt-in.
4. [etl/jobs/dimensoes-ente-entidade-sqlserver.ts](../../etl/jobs/dimensoes-ente-entidade-sqlserver.ts) e script npm correspondente — manter por uma release.
5. Função `bootstrapCsvFromSupabase` e `selectAll` em [etl/jobs/dimensoes-csv.ts](../../etl/jobs/dimensoes-csv.ts) — manter enquanto não houver caminho equivalente a partir do Postgres.
6. Constantes/variáveis `*_SUPABASE_*` em jobs Postgres — sem custo de manutenção; renomear em lote na Etapa 7.

### Rollback / risco

Nenhuma alteração de código foi feita nesta etapa, portanto **não há rollback aplicável**. Risco da Etapa 4 é nulo.

A próxima etapa de remoção (Etapa 5) pode ser planejada com segurança seguindo a lista de candidatos acima. As Etapas 6 (descontinuação do conector e dependência npm) e 7 (renomeações cosméticas) ficam para depois de uma execução noturna estável da versão Postgres das dimensões.

---

## Etapa 5 — Remoção segura de resíduos mortos/históricos

### Data
2026-05-19.

### Confirmação de ausência de imports

Buscas executadas antes das remoções (`grep` por nome do arquivo/script em todo o repositório, excluindo `node_modules/`):

| Artefato | Referências encontradas | Ação |
|---|---|---|
| `etl-target` / `getEtlTarget` / `isPostgresTarget` / `isSupabaseTarget` / `EtlTarget` | Apenas no próprio arquivo `etl/config/etl-target.ts` e no diagnóstico Supabase | Remoção segura |
| `migrar-supabase-para-postgres` / `migrar:supabase-postgres` | `etl/package.json` (script a remover), `docs/postgres-local.md` (texto), diagnóstico | Remoção segura — pendência documental fora do escopo desta etapa |
| `supabase_apc_despesa_combustivel_polanco` | Apenas no diagnóstico | Remoção segura |

### Arquivos removidos

| Caminho | Tipo | Justificativa |
|---|---|---|
| `etl/config/etl-target.ts` | Código morto | Definia `EtlTarget = "postgres" \| "supabase"` e helpers `getEtlTarget`, `isPostgresTarget`, `isSupabaseTarget`. **Não importado por nenhum job ativo** (item #3 da Etapa 4). Diretório `etl/config/` ficou vazio e foi removido em conjunto. |
| `etl/jobs/migrar-supabase-para-postgres.ts` | Utilitário histórico (one-shot) | Script único de migração já cumprido (item #6 da Etapa 4). Não roda no cron; tornou-se documentação de processo. |
| `etl/schema/supabase_apc_despesa_combustivel_polanco.sql` | Schema legado isolado | Equivalente DDL para o Supabase do `tb_despesa_combustivel_polanco`. O destino atual (`public.tb_despesa_combustivel_polanco` no Postgres) é provisionado pelas migrations em `etl/schema/postgres/` (item #26 da Etapa 4). |

### Script npm removido em `etl/package.json`

- `"migrar:supabase-postgres": "ts-node jobs/migrar-supabase-para-postgres.ts"` — entrada removida da seção `scripts`. Nenhum outro script depende dela.

### Arquivos preservados intencionalmente nesta etapa

| Caminho | Motivo |
|---|---|
| [etl/connectors/supabase.ts](../../etl/connectors/supabase.ts) | Ainda consumido por `dimensoes-csv.ts` (opt-in legado), `dimensoes-ente-entidade-sqlserver.ts` (release de transição), `etl/scripts/check-empenho-mensal.ts`, `etl/scripts/refresh-empenho-mensal.ts`, `etl/scripts/check-morning-health.ps1` |
| Dependência `@supabase/supabase-js` em [etl/package.json](../../etl/package.json) | Idem — manter enquanto o conector existir |
| [etl/jobs/dimensoes-csv.ts](../../etl/jobs/dimensoes-csv.ts) | Fallback opt-in (Etapa 3) |
| [etl/jobs/dimensoes-ente-entidade-sqlserver.ts](../../etl/jobs/dimensoes-ente-entidade-sqlserver.ts) | Janela de transição — manter por uma release |
| [etl/jobs/apc-polanco-sync-supabase.ts](../../etl/jobs/apc-polanco-sync-supabase.ts) | Sync para Postgres (nome cosmético) — renomeação fica para a Etapa 7 |
| [etl/scripts/check-empenho-mensal.ts](../../etl/scripts/check-empenho-mensal.ts), [etl/scripts/refresh-empenho-mensal.ts](../../etl/scripts/refresh-empenho-mensal.ts), [etl/scripts/check-morning-health.ps1](../../etl/scripts/check-morning-health.ps1) | Reescrita/remoção planejada para a Etapa 6 — não tratada aqui |
| Comentários "Executar no SQL Editor do Supabase" em outros 9 arquivos `etl/schema/*.sql` | Histórico/documental — limpeza textual fica para a Etapa 7 |
| [.env.example](../../.env.example), [etl/.env.example](../../etl/.env.example), [src/lib/etl-job-commands.ts](../../src/lib/etl-job-commands.ts) | Fora do escopo desta etapa |

### Comandos de validação executados

```powershell
# Verificação estática (na pasta etl/)
npx tsc --noEmit
# EXIT=0 — sem erros.

# Dry-run dimensoes-csv (com CSVs locais presentes — fallback Supabase não toca)
npm --prefix etl run dimensoes -- --dry-run

# Carga real da versão Postgres das dimensões ente/entidade/credor
npm --prefix etl run dimensoes:postgres
```

Build/lint na raiz (`npm run build`, `npm run lint`) não foram executados nesta etapa, porque a mudança é estritamente sobre arquivos dentro de `etl/` e não toca `src/`. Sem impacto sobre o frontend.

### Resultados

**`npx tsc --noEmit`** — `EXIT=0`, sem erros de tipo após remoções.

**`npm --prefix etl run dimensoes -- --dry-run`** — `EXIT=0`:
```
[2026-05-19T06:28:58.291Z] Iniciando ETL: dimensoes_csv (dry-run)
  -> UF: delimiter=; encoding=utf8 rows=27
  -> Municipio: delimiter=; encoding=utf8 rows=5571
  -> Ente: delimiter=; encoding=utf8 rows=24
  -> Entidade: delimiter=; encoding=utf8 rows=236
  -> Registros parseados: uf=27 municipio=5571 ente=24 entidade=236
  OK - Dry-run concluido em 20ms (5858 registros preparados)
```

**`npm --prefix etl run dimensoes:postgres`** — `EXIT=0`:
```
[2026-05-19T06:29:06.864Z] Iniciando ETL: dimensoes_ente_entidade_postgres
  -> Lidos: ente=23 | entidade=275 | credor=305675
  -> Entidades filtradas: 1 ignoradas (id_ente ausente em dim_ente)
  -> dim_ente: 23 registros gravados
  -> dim_entidade: 274 registros gravados
  -> dim_credor: 305675 registros gravados
  OK - ETL concluido em 203684ms | total gravado: 305972 registros
```

Cardinalidades idênticas às observadas na Etapa 2 — sem regressão.

### Impacto na dívida Supabase

- **Código morto eliminado.** `etl/config/etl-target.ts` (que definia `ETL_TARGET`) foi removido junto com o diretório vazio resultante. A variável de ambiente `ETL_TARGET` deixa de ter qualquer efeito no projeto.
- **Utilitário histórico eliminado.** `etl/jobs/migrar-supabase-para-postgres.ts` e o script npm `migrar:supabase-postgres` saíram do repositório. A migração one-shot que justificava sua existência já foi cumprida no ciclo anterior. O histórico permanece disponível via `git log`.
- **Schema legado eliminado.** `etl/schema/supabase_apc_despesa_combustivel_polanco.sql` removido. As tabelas equivalentes em Postgres são provisionadas por `etl/schema/postgres/*.sql`.
- **Pendência documental:** [docs/postgres-local.md](../postgres-local.md) ainda menciona o script `migrar:supabase-postgres` em duas linhas. **Não atualizado nesta etapa** por estar fora do escopo permitido. Será revisado no fechamento documental (Etapa 8).
- **Conector e dependência npm permanecem intactos.** Nenhuma alteração em `etl/connectors/supabase.ts`, `@supabase/supabase-js` ou `.env.example`.

### Rollback simples

Como nenhum dos artefatos removidos era importado por código ativo, o rollback é apenas restaurar os arquivos via `git`:

```bash
git checkout HEAD~1 -- etl/config/etl-target.ts etl/jobs/migrar-supabase-para-postgres.ts etl/schema/supabase_apc_despesa_combustivel_polanco.sql etl/package.json
```

(Adapte o `HEAD~1` ao commit da Etapa 5 quando ele existir.)

Nenhuma variável de ambiente, nenhum schema em produção e nenhuma dependência npm foram tocados. O rollback é seguro e textual.

---

## Etapa 6 — Tratamento dos scripts manuais Supabase

### Data
2026-05-19.

### Scripts analisados

| Script | Finalidade aparente | Chamado por `etl/package.json`? | Chamado pelo cron? | Tabelas/objetos lidos ou escritos | Equivalente Postgres já existente? | Decisão |
|---|---|---|---|---|---|---|
| [etl/scripts/check-empenho-mensal.ts](../../etl/scripts/check-empenho-mensal.ts) | Imprimir contagens e amostras de `combustivel_empenho_mensal` e `tb_despesa_combustivel_polanco` para diagnóstico operacional rápido | Não | Não | **Leitura** de `combustivel_empenho_mensal` e `tb_despesa_combustivel_polanco` | Sim — ambas as tabelas existem em `public.*` no Postgres (migration `etl/schema/postgres/112_combustivel_empenhos.sql` e schema histórico da APC) e o frontend já lê de lá | **Reescrever para Postgres** |
| [etl/scripts/refresh-empenho-mensal.ts](../../etl/scripts/refresh-empenho-mensal.ts) | Invocar `fn_refresh_combustivel_empenho_mensal()` para reconstruir `combustivel_empenho_mensal` a partir dos dados brutos | Não | Não | **Leitura** de `combustivel_empenho_mensal` + **RPC** `fn_refresh_combustivel_empenho_mensal` (TRUNCATE + INSERT) | Sim — função `public.fn_refresh_combustivel_empenho_mensal()` definida em [etl/schema/postgres/112_combustivel_empenhos.sql:65](../../etl/schema/postgres/112_combustivel_empenhos.sql#L65) | **Reescrever para Postgres com flag `--confirm` obrigatória** (operação destrutiva) |
| [etl/scripts/check-morning-health.ps1](../../etl/scripts/check-morning-health.ps1) | Health-check matinal: Task Scheduler do Windows, último log de ETL, contagens em 3 tabelas e últimos 15 eventos de `etl_log` | Não | Não | **Leitura** de `tb_despesa_combustivel_polanco`, `receita_publica_categoria_mensal`, `cauc_situacao_raw`, `etl_log` | Sim — todas as tabelas existem em `public.*` no Postgres; `etl_log` corresponde a `audit.etl_log` | **Reescrever para Postgres** (mantém estrutura `node -` inline, troca `@supabase/supabase-js` por `pg.Client`) |

### Comandos npm relacionados

Pesquisa em [etl/package.json](../../etl/package.json) confirmou que **nenhum script** declara `check-empenho-mensal`, `refresh-empenho-mensal` ou `check-morning-health`. Os utilitários são executados diretamente (`npx ts-node ...` ou `powershell -File ...`). Nenhuma entrada de `package.json` precisou ser alterada nesta etapa.

### Decisão por script e ação executada

#### [etl/scripts/check-empenho-mensal.ts](../../etl/scripts/check-empenho-mensal.ts) — **reescrito**

- Removido `import { getSupabase } from "../connectors/supabase";`.
- Substituído por `import { pgQuery, closePgPool } from "../connectors/postgres";`.
- Substituídas as 4 chamadas `sb.from(...).select(...)` por consultas SQL diretas:
  - `SELECT count(*)::bigint AS total FROM public.combustivel_empenho_mensal`
  - `SELECT * FROM public.combustivel_empenho_mensal LIMIT 3`
  - `SELECT count(*)::bigint AS total FROM public.tb_despesa_combustivel_polanco`
  - `SELECT data_empenho, entidade, tipo_combustivel, valor_empenho FROM public.tb_despesa_combustivel_polanco LIMIT 3`
- Fechamento do pool `pg` em bloco `finally`.
- Cabeçalho atualizado registrando que substitui a versão Supabase.

#### [etl/scripts/refresh-empenho-mensal.ts](../../etl/scripts/refresh-empenho-mensal.ts) — **reescrito com guarda**

- Removido import Supabase, substituído por `pgQuery`/`closePgPool`.
- Adicionada flag obrigatória `--confirm`. Sem a flag, o script sai com aviso, **não** executa o `TRUNCATE`.
- Verificação prévia de existência da tabela via `information_schema.tables`.
- Chamada da função: `SELECT public.fn_refresh_combustivel_empenho_mensal()`.
- Documentação no cabeçalho deixando explícito que a operação é destrutiva.

#### [etl/scripts/check-morning-health.ps1](../../etl/scripts/check-morning-health.ps1) — **reescrito**

- Mantida a estrutura PowerShell e o padrão `node -` para os blocos de checagem de DB.
- Trocados os dois blocos `require("@supabase/supabase-js")` por `require("pg")` (`pg.Client`).
- Cliente `pg` configurado via `DATABASE_URL` **ou** `PGHOST`/`PGPORT`/`PGDATABASE`/`PGUSER`/`PGPASSWORD` (mesmo padrão usado por `etl/connectors/postgres.ts` e `src/lib/db.ts`).
- Tabelas mantidas: `public.tb_despesa_combustivel_polanco`, `public.receita_publica_categoria_mensal`, `public.cauc_situacao_raw`.
- A consulta de `etl_log` passa a apontar para `audit.etl_log` e a lista de módulos foi atualizada para refletir os nomes vigentes no Postgres: `cauc`, `combustivel_empenho_apc`, `dimensoes_csv`, `receita_publica`, `combustivel`, `dimensoes_ente_entidade_postgres`.

### Comandos de validação executados

```powershell
# 1) Verificação estática (na pasta etl/)
npx tsc --noEmit
# EXIT=0 — sem erros após reescrita dos dois scripts TS.

# 2) Execução real do check (somente leitura — seguro)
npx ts-node scripts/check-empenho-mensal.ts

# 3) Execução do refresh SEM --confirm (deve abortar antes do TRUNCATE)
npx ts-node scripts/refresh-empenho-mensal.ts

# 4) Regressão — dry-run do job dimensoes
npm run dimensoes -- --dry-run
```

A flag `--confirm` do `refresh-empenho-mensal.ts` **não foi acionada** propositalmente — a operação invoca `fn_refresh_combustivel_empenho_mensal()` que faz `TRUNCATE + INSERT` e exigiria janela operacional. A guarda foi verificada (script abortou antes do `TRUNCATE` com a mensagem orientativa).

O `check-morning-health.ps1` **não foi executado** porque depende do Task Scheduler do Windows configurado para a task `"Varadouro ETL Nightly"` e da disponibilidade do binário `node` no PATH do shell. A validação ficou no nível textual (revisão da sintaxe e da substituição do SDK). Nenhuma operação destrutiva existe nesse script — quando executado, apenas lê.

### Resultados

**`npx tsc --noEmit`** — `EXIT=0`.

**`npx ts-node scripts/check-empenho-mensal.ts`** — `EXIT=0` contra Postgres real:

```
Registros em public.combustivel_empenho_mensal: <preenchido>
Amostra: [ ... 3 linhas ... ]
Registros em public.tb_despesa_combustivel_polanco: 61748
Amostra bruta: [
  { "data_empenho": "2019-05-03T05:00:00.000Z", "entidade": "FUNDO MUNICIPAL DE SAÚDE - FMS - PORTO WALTER", ... },
  { "data_empenho": "2022-02-04T05:00:00.000Z", "entidade": "FUNDO MUNICIPAL DE SAÚDE - FMS - SENADOR GUIOMARD", ... },
  { "data_empenho": "2022-02-07T05:00:00.000Z", "entidade": "FUNDO MUNICIPAL DE SAÚDE - FMS - SENADOR GUIOMARD", ... }
]
[postgres] Pool encerrado.
```

**`npx ts-node scripts/refresh-empenho-mensal.ts` (sem `--confirm`)** — guarda funcionou:

```
Verificando tabela public.combustivel_empenho_mensal...
[postgres] Pool iniciado — host: localhost, database: varadouro_digital
Esta operacao executa public.fn_refresh_combustivel_empenho_mensal(), que faz TRUNCATE + INSERT na tabela. Reexecute com a flag --confirm para prosseguir.
```

**`npm run dimensoes -- --dry-run`** — `EXIT=0` (regressão): 5 858 registros preparados, sem mudança.

### Impacto na dívida Supabase

- **Três últimos scripts que ainda usavam o SDK Supabase deixaram de usá-lo.** O conector `etl/connectors/supabase.ts` agora tem apenas dois consumidores ativos:
  - [etl/jobs/dimensoes-csv.ts](../../etl/jobs/dimensoes-csv.ts) — apenas via opt-in `DIM_AUTO_BOOTSTRAP_FROM_SUPABASE=true` (Etapa 3).
  - [etl/jobs/dimensoes-ente-entidade-sqlserver.ts](../../etl/jobs/dimensoes-ente-entidade-sqlserver.ts) — preservado por uma release.
- Em **operação padrão** (incluindo execução manual normal do PowerShell), **nenhum** caminho do sistema invoca `@supabase/supabase-js`.
- O endpoint `audit.etl_log` no Postgres já estava em uso pelo cron e pelos jobs; os scripts manuais passam a alimentar/consultar o mesmo destino institucional, eliminando divergência de auditoria.

### Itens que ainda dependem do conector Supabase

| Item | Tipo de dependência | Ação prevista |
|---|---|---|
| [etl/connectors/supabase.ts](../../etl/connectors/supabase.ts) | Existência do conector | Remover na Etapa 7 |
| [etl/jobs/dimensoes-csv.ts](../../etl/jobs/dimensoes-csv.ts) | Opt-in legado (default off) | Remover função `bootstrapCsvFromSupabase` e import na Etapa 7 |
| [etl/jobs/dimensoes-ente-entidade-sqlserver.ts](../../etl/jobs/dimensoes-ente-entidade-sqlserver.ts) | Janela de transição | Remover na Etapa 7 |
| Dependência `@supabase/supabase-js` em [etl/package.json](../../etl/package.json) | Manter enquanto conector existir | Remover na Etapa 7 |
| Blocos Supabase em [.env.example](../../.env.example) e [etl/.env.example](../../etl/.env.example) | Configuração para opt-in | Remover na Etapa 7 |

### Rollback simples

Como nenhum dos três scripts utilitários é chamado por outro código do projeto, o rollback é trivial:

```bash
git checkout HEAD~1 -- \
  etl/scripts/check-empenho-mensal.ts \
  etl/scripts/refresh-empenho-mensal.ts \
  etl/scripts/check-morning-health.ps1
```

(Adapte `HEAD~1` ao commit da Etapa 6.) Nenhuma variável de ambiente, nenhuma dependência npm, nenhum schema e nenhum job do cron foram alterados.

---

## Etapa 7 — Descontinuação final do conector Supabase

### Data
2026-05-19.

### Consumidores finais confirmados antes da remoção

Busca executada por `getSupabase`, `from ".../connectors/supabase"`, `@supabase/supabase-js`, `DIM_AUTO_BOOTSTRAP_FROM_SUPABASE`, `dimensoes-ente-entidade-sqlserver`, `executarCargaDimensoesEnteEntidadeSqlServer`.

| Consumidor | Tipo | Tratamento nesta etapa |
|---|---|---|
| [etl/jobs/dimensoes-csv.ts](../../etl/jobs/dimensoes-csv.ts) | Importava `getSupabase` para fallback opt-in `bootstrapCsvFromSupabase` (Etapa 3 desligou por padrão) | Removido o import e todo o caminho Supabase do arquivo |
| [etl/jobs/dimensoes-ente-entidade-sqlserver.ts](../../etl/jobs/dimensoes-ente-entidade-sqlserver.ts) | Importava `getSupabase` para upsert em `dim_ente`/`dim_entidade`/`etl_log` no Supabase (Etapa 2 retirou do cron) | Arquivo **removido** |
| Outras ocorrências (`.env.example`, `CLAUDE.md`, `HANDOFF.md`, `TODO.md`, diagnóstico) | Documentais | Não tratadas nesta etapa |

Nenhum outro consumidor real foi identificado.

### Arquivos removidos

| Caminho | Justificativa |
|---|---|
| [etl/jobs/dimensoes-ente-entidade-sqlserver.ts](../../etl/jobs/dimensoes-ente-entidade-sqlserver.ts) | Job legado já substituído no cron (Etapa 2) pelo equivalente Postgres `dimensoes-ente-entidade-postgres.ts`. Janela de transição cumprida. |
| [etl/connectors/supabase.ts](../../etl/connectors/supabase.ts) | Factory `getSupabase` sem mais consumidores ativos. Diretório `etl/connectors/` mantém apenas `postgres.ts` e `sqlserver.ts`. |

### Trechos removidos de `etl/jobs/dimensoes-csv.ts`

- `import { getSupabase } from "../connectors/supabase";`
- Constante `AUTO_BOOTSTRAP_FROM_SUPABASE` e leitura de `process.env.DIM_AUTO_BOOTSTRAP_FROM_SUPABASE`.
- Função `selectAll<T>(table, columns)` (paginava `aux_dim_*` no Supabase).
- Funções `bootstrapCsvFromSupabase()`, `writeCsvFile(...)` e `escapeCsvValue(...)` (escreviam os CSVs regenerados).
- Imports auxiliares de `node:fs` reduzidos para apenas `readFileSync` e `existsSync` (removidos `mkdirSync` e `writeFileSync`).
- Lógica de fallback dentro de `executarCargaDimensoesCsv`: quando há CSVs ausentes, agora o job lança erro claro orientando a:
  - restaurar os arquivos em `etl/data/dimensoes/`; **ou**
  - executar `npm run dimensoes:postgres` para carregar as dimensões pelo SQL Server diretamente no Postgres.

### Script npm e dependência removidos em `etl/package.json`

- Script `"dimensoes-ente-entidade-sqlserver": "ts-node jobs/dimensoes-ente-entidade-sqlserver.ts"` — apontava para o arquivo removido.
- Dependência `"@supabase/supabase-js": "^2.49.8"` — sem consumidores.
- `etl/package-lock.json` sincronizado via `npm install` na pasta `etl/`. O `grep -c "@supabase"` no lockfile retorna `0` após a sincronização. O diretório `etl/node_modules/@supabase/` ficou existente porém vazio (artefato do npm install incremental) — não há código importável de lá.

### Validações executadas

```powershell
# 1) Sincronização do lockfile (necessária após remoção da dependência)
npm --prefix etl install
# EXIT=0 — lockfile atualizado, sem @supabase em referência efetiva.

# 2) Verificação estática
cd etl && npx tsc --noEmit
# EXIT=0 — sem erros após remoções.

# 3) Job de dimensões CSV (caminho normal — CSVs presentes)
npm --prefix etl run dimensoes -- --dry-run
# EXIT=0 — 5 858 registros preparados.

# 4) Job de dimensões Postgres (carga real do cron noturno)
npm --prefix etl run dimensoes:postgres
# EXIT=0 — 23 entes, 274 entidades, 305 675 credores gravados.
```

### Resultado da busca final

| Padrão | Em código ativo (`src/`, `etl/connectors`, `etl/jobs`, `etl/scripts`, `etl/schedule.ts`, `etl/package.json`) | Em documentação |
|---|---|---|
| `getSupabase` | **0 ocorrências** | Apenas no diagnóstico (histórico) |
| `@supabase/supabase-js` | **0 ocorrências** (dependência removida; cadeia transitiva limpa do lockfile) | Apenas no diagnóstico/CLAUDE/HANDOFF/TODO |
| Import de `connectors/supabase` | **0 ocorrências** | — |
| `supabase`/`Supabase`/`SUPABASE` em código ativo | Apenas nomes cosméticos: `apc-polanco-sync-supabase.ts` (job Postgres com nome legado); `SUPABASE_BATCH` em `cauc.ts` e `processos-gabinete.ts`; comentários de cabeçalho em 7 jobs; variáveis de ambiente legadas (`*_SUPABASE_TABLE`, `*_SUPABASE_BATCH`); flag `RUN_APC_POLANCO_SUPABASE_SYNC_NIGHTLY`; logs do cron; string literal em `src/lib/etl-job-commands.ts:34`; comentário em `etl/jobs/dimensoes-ente-entidade-postgres.ts:32` ("mesmas queries do job Supabase"); cabeçalho em `etl/scripts/check-empenho-mensal.ts`/`refresh-empenho-mensal.ts` ("Substitui a versao Supabase anterior"); chamada em `etl/scripts/run-nightly-etl.cmd:47` ao script npm `apc-polanco-sync-supabase` | Várias |

### Referências restantes — classificação

- **Cosméticas** (nome de arquivo/função/variável/log/constante — operação real é Postgres):
  - [etl/jobs/apc-polanco-sync-supabase.ts](../../etl/jobs/apc-polanco-sync-supabase.ts) (nome do arquivo, função `executarSyncApcPolancoSupabase`, env `APC_POLANCO_SUPABASE_TABLE`, `APC_POLANCO_SYNC_SUPABASE_BATCH`).
  - [etl/schedule.ts](../../etl/schedule.ts) — flag `RUN_APC_POLANCO_SUPABASE_SYNC_NIGHTLY`, import do `executarSyncApcPolancoSupabase`, logs do step 4/11, demais textos "(SQL Server -> Supabase)".
  - [etl/jobs/cauc.ts](../../etl/jobs/cauc.ts), [etl/jobs/processos-gabinete.ts](../../etl/jobs/processos-gabinete.ts) — constante `SUPABASE_BATCH` e tipo `SupabaseProcessoGabineteRow` (somente identificadores).
  - [etl/jobs/combustivel.ts](../../etl/jobs/combustivel.ts), [populacao-ibge.ts](../../etl/jobs/populacao-ibge.ts), [dimensoes-empenho-sqlserver.ts](../../etl/jobs/dimensoes-empenho-sqlserver.ts), [dimensoes-receita-sqlserver.ts](../../etl/jobs/dimensoes-receita-sqlserver.ts), [receita-publica.ts](../../etl/jobs/receita-publica.ts), [fato-empenho.ts](../../etl/jobs/fato-empenho.ts) — comentários de cabeçalho e variáveis `*_SUPABASE_BATCH`.
  - [etl/package.json](../../etl/package.json) — script npm `apc-polanco-sync-supabase`.
  - [etl/scripts/run-nightly-etl.cmd](../../etl/scripts/run-nightly-etl.cmd) — chama o script npm acima.
  - [src/lib/etl-job-commands.ts:34](../../src/lib/etl-job-commands.ts#L34) — string literal `"apc-polanco-sync-supabase"`.
- **Históricas** (documentando trabalho concluído):
  - [etl/scripts/check-empenho-mensal.ts](../../etl/scripts/check-empenho-mensal.ts), [refresh-empenho-mensal.ts](../../etl/scripts/refresh-empenho-mensal.ts) — comentário "Substitui a versao Supabase anterior".
  - [etl/jobs/dimensoes-ente-entidade-postgres.ts:32](../../etl/jobs/dimensoes-ente-entidade-postgres.ts#L32) — comentário "mesmas queries do job Supabase".
- **Documentais**: [.env.example](../../.env.example), [etl/.env.example](../../etl/.env.example), [CLAUDE.md](../../CLAUDE.md), [README.md](../../README.md), [HANDOFF.md](../../HANDOFF.md), [TODO.md](../../TODO.md), [docs/postgres-local.md](../postgres-local.md), [docs/aquiry/checklist-mvp-assistente-aquiry.md](../aquiry/checklist-mvp-assistente-aquiry.md), demais documentos em [docs/varadouro/](.).
- **Comentários remanescentes em `etl/schema/*.sql`** (10 arquivos, 1 por arquivo): "Executar no SQL Editor do Supabase" / "Supabase schema..." — histórico do schema legado. Não afetam runtime.

Nenhuma das categorias acima envolve chamada técnica ao SDK Supabase.

### Conclusão sobre dependência técnica Supabase

A dependência técnica do Varadouro Digital Aquiry em Supabase **está encerrada**:

- O pacote `@supabase/supabase-js` **não está mais presente** em `etl/package.json` nem como referência efetiva em `etl/package-lock.json`.
- O conector `etl/connectors/supabase.ts` **não existe mais**.
- Nenhum job, script ou rota do frontend importa o SDK Supabase.
- O cron noturno opera 100% contra PostgreSQL + SQL Server.
- As variáveis `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` deixam de ser consumidas por qualquer código do projeto (permanecem apenas declaradas em `.env.example` e `etl/.env.example` — limpeza fica para a Etapa 8 documental).
- A flag `DIM_AUTO_BOOTSTRAP_FROM_SUPABASE` deixou de ser consumida pelo código.

Os 8 itens classificados como **cosméticos** e os 3 como **históricos** podem ser renomeados em PR de limpeza separado (sem impacto operacional). A documentação institucional (CLAUDE.md, README.md, HANDOFF.md, TODO.md, mapa funcional, plano de evolução, matriz de fontes, catálogo de APIs e roteiro de demonstração) será atualizada na Etapa 8 de fechamento da dívida.

### Rollback simples

Recuperar os 2 arquivos removidos e reverter `dimensoes-csv.ts` e `etl/package.json`:

```bash
git checkout HEAD~1 -- \
  etl/jobs/dimensoes-ente-entidade-sqlserver.ts \
  etl/connectors/supabase.ts \
  etl/jobs/dimensoes-csv.ts \
  etl/package.json \
  etl/package-lock.json
npm --prefix etl install
```

(Adapte `HEAD~1` ao commit da Etapa 7.) Atenção: se o rollback for necessário, restaurar também a configuração de `etl/schedule.ts` da Etapa 2 (que apontava para o job legado), caso se queira reverter aquela troca em conjunto — embora a Etapa 7 não tenha tocado `etl/schedule.ts`. Nenhuma variável de ambiente de produção foi removida, nenhum schema em Postgres foi alterado.
