# Fase 2A — Diagnóstico: Política de Execução dos ETLs

**Projeto:** Varadouro Digital  
**Data:** 2026-05-12  
**Status:** Somente diagnóstico — nenhuma alteração de código ou banco

---

## 1. Tabela de Diagnóstico por Módulo

| Módulo | Arquivo(s)/Job | Fonte | Destino principal | Estratégia real | Campo incremental / referência | Janela de reprocess. | `modo_carga` gravado | Permite incremental? | Exige full? | Observações |
|---|---|---|---|---|---|---|---|---|---|---|
| `despesa_full_postgres` | `despesa-full-postgres.ts` | SQL Server `APC` / `audit.vw_fato_empenho_polanco` | `public.fato_empenho` via `stage.fato_empenho_full_stg` | TRUNCATE stage → TRUNCATE destino → INSERT | Nenhum (paginação por `ano_remessa`/`numero_remessa`) | Nenhuma | `"full_truncate_insert"` | Não | Sempre | Sem filtro de data; reinserção total a cada execução |
| `mart_despesa` | `refresh-mart-despesa.ts` | `public.fato_empenho` | `mart.despesa_*` (6 tabelas) | TRUNCATE cada tabela mart → INSERT agregado | `data_empenho` (só no filtro IS NOT NULL) | Nenhuma | Grava em `audit.etl_log`, não em `etl_carga` | Não | Sempre | Usa ON CONFLICT apenas em `despesa_composicao` |
| `processos_gabinete` | `processos-gabinete.ts` | SQL Server `EPROCESS` / `vw_ProcessosGabinetesConselheiros` | `public.processos_gabinete_raw` + `_carga` | Append-only com deduplicação por hash SHA-256 | Hash de `processo+id_grupo+grupo_atual+...` | Nenhuma | Grava em `public.processos_gabinete_carga` (tabela própria) | Sim (por hash) | Não | Único job com tabela de auditoria fora do schema `audit` |
| `mart_infodengue` | `infodengue-full-postgres.ts` | API InfoDengue/AlertaDengue | `dw.fato_infodengue_semana` via `raw` + `stage` | UPSERT por `(municipio, doenca, ano_epi, semana_epi)` | `ano_epidemiologico`, `semana_epidemiologica` | Sim — janela de anos: `ANO_INICIO`–`ANO_FIM` (hardcoded 2024–2026) | Grava em `audit.etl_log` | Sim (upsert idempotente) | Não | Janela configurável por variável; sem watermark de semana |
| `mart_saude_consolidado` | `refresh-mart-saude-consolidado.ts` | Todas as tabelas `mart.*` de saúde | `mart.saude_resumo_municipio`, `mart.saude_alertas`, `mart.saude_resumo_home` | DELETE em todas as tabelas → INSERT agregado | Nenhum | Nenhuma | Grava em `audit.etl_log` | Não | Sempre | Dependente de todos os outros marts de saúde estarem atualizados |
| `mart_pni` | `ingest-pni.ts` + `refresh-mart-pni.ts` | API Dados Abertos Saúde (`/pni-{ano}`) | `dw.fato_pni_dose` via `raw`+`stage`; mart em `mart.pni_*` | Ingest: UPSERT por `(co_dose_id, ano)` · Refresh: DELETE → INSERT | `ano`, `mes` (extraído de `dt_aplicacao`) | Janela por ano (parâmetro `ano`) | Não grava em `audit.etl_carga` | Sim (upsert por dose_id) | Não | Remove campos PII antes de gravar; sem watermark de mês |
| `mart_pni_cobertura` | `ingest-pni-cobertura-xlsx.ts` + `refresh-mart-pni-cobertura.ts` | XLSX baixado do DATASUS | `dw.fato_pni_cobertura`; mart em `mart.pni_cobertura_*` | Ingest: full por arquivo XLSX · Refresh: DELETE → INSERT | `status_arquivo` (ATIVO/SUPERADO/RETIFICADO), `ano`, `imunobiologico` | Nenhuma | Não identificado | Não (por arquivo) | Sim | Dados anuais; ciclo de vida controlado por `status_arquivo` |
| `mart_sisagua` | `sisagua-full-postgres.ts` + `refresh-mart-sisagua.ts` | API SISAGUA (`/controle-mensal`, `/vigilancia`) | `dw.fato_sisagua_parametro` via `raw`+`stage`; mart em `mart.sisagua_*` | Ingest: INSERT sem ON CONFLICT no dw · Refresh: DELETE → INSERT | `competencia` (formato YYYYMM) | Janela de anos: `ANO_INICIO`–`ANO_FIM` (hardcoded 2024–2026) | Não grava em `audit.etl_carga` | Potencial (por `competencia`) | Não | **Risco de duplicatas**: sem ON CONFLICT na camada dw |
| `mart_saude_estrutura` | `cnes-ubs-full-postgres.ts` + `refresh-mart-saude-estrutura.ts` | API CNES/DATASUS | `dw.dim_estabelecimento_saude`, `dw.dim_ubs`; mart em `mart.saude_estrutura_*` | TRUNCATE stage → UPSERT em `dw` por PK (cnes) · Refresh: DELETE → INSERT | Nenhum campo incremental | Nenhuma | Não grava em `audit.etl_carga` | Não | Sempre (UPSERT total) | Relê toda a base CNES a cada execução |
| `mart_remessas` | `refresh-mart-remessas.ts` | `dw.fato_remessa_contabil` | `mart.remessa_alertas`, `mart.remessa_resumo` | TRUNCATE → INSERT | `prazo_envio`, `data_confirmacao` (só para alertas) | Nenhuma | Grava em `audit.etl_log` | Não | Sempre | Sem `etl_carga`; só grava em `etl_log` |
| `remessas_full_postgres` | `remessas-contabeis-full-postgres.ts` | SQL Server `APC` / `dbo.REMESSA` | `dw.fato_remessa_contabil` via `stage.remessa_contabil_stg` | TRUNCATE stage → TRUNCATE destino CASCADE → INSERT | Nenhum | Nenhuma | `"full_truncate_insert"` | Não | Sempre | Mesmo padrão do `despesa_full`; sem filtro por data |
| `mart_siops` | `siops-full-postgres.ts` + `refresh-mart-siops.ts` | API SIOPS Pública | `dw.fato_siops_indicador` via stage; mart em `mart.siops_*` | TRUNCATE stage → DELETE por `(ano, periodo, municipio)` + INSERT · Refresh: DELETE → INSERT | `ano`, `periodo` (bimestral/semestral) | Nenhuma (recarrega todos os anos/períodos disponíveis) | Não grava em `audit.etl_carga` | Sim (DELETE por chave) | Não | Não usa ON CONFLICT; DELETE explícito por chave antes de inserir |
| `mart_siconfi_rreo` | `siconfi-rreo-full-postgres.ts` + `refresh-mart-siconfi-rreo.ts` | API DataLake Tesouro Nacional | `dw.fato_siconfi_rreo` via `raw`; mart em `mart.siconfi_rreo_*` | INSERT only sem ON CONFLICT no dw · Refresh: DELETE → INSERT | `an_exercicio`, `nr_periodo` | Nenhuma (recarrega todos exercícios disponíveis) | Não grava em `audit.etl_carga` | Potencial | Não | **Risco**: sem ON CONFLICT no dw; reprocessamento gera duplicatas |
| `mart_mortalidade` | `ingest-sim-api.ts` + `ingest-sim-csv.ts` + `refresh-mart-mortalidade.ts` | API Dados Abertos + CSV DATASUS | `dw.fato_sim_obito` via `raw`+`stage`; mart em `mart.mortalidade_*` | Ingest API: DELETE por `(ano, fonte='SIM_API_V1')` + INSERT · Refresh: DELETE → INSERT | `ano_obito` | Por ano (`ano` como parâmetro) | Não grava em `audit.etl_carga` | Sim (por ano) | Não | Dois ingestores (API e CSV) com prioridade para API; `fonte` gravada para rastreabilidade |

---

## 2. Auditoria em `audit.etl_carga` vs `audit.etl_log`

| Módulo | `etl_carga`? | `etl_log`? | `modo_carga`? | `registros_lidos/gravados`? | `iniciado_em/finalizado_em`? | Mensagem de erro? |
|---|---|---|---|---|---|---|
| `despesa_full_postgres` | ✅ | ✅ | ✅ `full_truncate_insert` | ✅ | ✅ | ✅ |
| `remessas_full_postgres` | ✅ | ✅ | ✅ `full_truncate_insert` | ✅ | ✅ | ✅ |
| `mart_despesa` | ❌ | ✅ | ❌ | Parcial (só `registros`) | ❌ | ✅ |
| `mart_remessas` | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| `mart_infodengue` | ❌ | ✅ | ❌ | ✅ | ❌ | ✅ |
| `mart_saude_consolidado` | ❌ | ✅ | ❌ | Parcial (municípios) | ❌ | ✅ |
| `processos_gabinete` | Tabela própria | ✅ | ❌ | ✅ | ✅ | ✅ |
| `mart_pni` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `mart_pni_cobertura` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `mart_sisagua` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `mart_saude_estrutura` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `mart_siops` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `mart_siconfi_rreo` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `mart_mortalidade` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

Apenas **2 de 14 módulos** usam `audit.etl_carga` de forma completa.

---

## 3. Maturidade por ETL

| Módulo | Maturidade | Justificativa |
|---|---|---|
| `despesa_full_postgres` | **OK** | Estratégia clara (full), `modo_carga` gravado, audit completo |
| `remessas_full_postgres` | **OK** | Mesmo padrão do despesa; full bem auditado |
| `processos_gabinete` | **Parcial** | Estratégia clara (append+hash), mas auditoria fora do schema `audit`; sem `etl_carga` |
| `mart_infodengue` | **Parcial** | UPSERT correto, janela configurável, grava em `etl_log`; falta `etl_carga` e watermark de semana |
| `mart_siops` | **Parcial** | DELETE por chave antes de insert é correto; falta `etl_carga` e `modo_carga` |
| `mart_mortalidade` | **Parcial** | DELETE por `(ano, fonte)` é incremental funcional; falta padronização de auditoria |
| `mart_despesa` | **Frágil** | TRUNCATE→INSERT correto, mas sem `etl_carga`, sem `iniciado_em/finalizado_em` |
| `mart_remessas` | **Frágil** | TRUNCATE correto; apenas `etl_log`; sem `etl_carga` |
| `mart_saude_consolidado` | **Frágil** | Dependência oculta de todos os outros marts; sem `etl_carga`; falha silenciosa se alguma fonte estiver desatualizada |
| `mart_saude_estrutura` | **Frágil** | UPSERT correto; sem qualquer auditoria em `etl_log` ou `etl_carga` |
| `mart_pni` | **Frágil** | UPSERT correto no ingest; refresh sem auditoria; sem `etl_carga` |
| `mart_pni_cobertura` | **Frágil** | Ciclo de vida por `status_arquivo` bem pensado; sem auditoria alguma |
| `mart_sisagua` | **Frágil** | Sem ON CONFLICT explícito no dw; risco de duplicata em reexecução; sem auditoria |
| `mart_siconfi_rreo` | **Frágil** | INSERT sem ON CONFLICT no dw; risco real de duplicata; sem auditoria |

---

## 4. Riscos Identificados

| Risco | Módulos afetados | Severidade |
|---|---|---|
| **Duplicatas em reexecução** (sem ON CONFLICT no dw) | `mart_sisagua`, `mart_siconfi_rreo` | Alta |
| **Auditoria ausente** (sem `etl_carga` nem `etl_log`) | `mart_pni`, `mart_pni_cobertura`, `mart_sisagua`, `mart_saude_estrutura`, `mart_siops`, `mart_siconfi_rreo`, `mart_mortalidade` | Alta |
| **Auditoria fora do padrão** (`processos_gabinete` usa tabela própria) | `processos_gabinete` | Média |
| **Dependência em cascata sem controle** (`mart_saude_consolidado` lê todos os outros marts) | `mart_saude_consolidado` | Média |
| **Janela de anos hardcoded** (2024–2026) | `mart_infodengue`, `mart_sisagua` | Média |
| **Sem watermark persistente** (todos os jobs releem do zero ou da janela configurada) | Todos | Baixa–Média |

---

## 5. Proposta de Modelagem — Fase 2B (não implementar ainda)

### A) Configuração de Monitoramento — `audit.etl_monitoramento`
*(migração do `ETL_CONFIG` do front-end para o banco)*

```sql
CREATE TABLE audit.etl_monitoramento (
  modulo                  text PRIMARY KEY,
  nome_exibicao           text NOT NULL,
  periodicidade           text NOT NULL,   -- diaria | semanal | mensal | bimestral | anual | variavel
  tolerancia_dias         integer NOT NULL,
  ativo_painel            boolean NOT NULL DEFAULT true,
  ordem_exibicao          integer,
  descricao_periodicidade text,
  criado_em               timestamptz NOT NULL DEFAULT now(),
  atualizado_em           timestamptz NOT NULL DEFAULT now()
);
```

### B) Configuração de Execução — `audit.etl_execucao_config`
*(política de como cada job deve rodar)*

```sql
CREATE TABLE audit.etl_execucao_config (
  modulo                            text PRIMARY KEY,
  estrategia_execucao               text NOT NULL,  -- full | incremental | incremental_janela | upsert | manual
  modo_carga_padrao                 text,           -- "full_truncate_insert" | "upsert" | "delete_insert" | "append_hash"
  campo_incremental                 text,           -- ex: "ano_obito", "competencia", "semana_epidemiologica"
  janela_reprocessamento_dias       integer,        -- quantos dias de histórico recarregar
  full_quando_dias_atraso_maior_que integer,        -- escalar para full se N dias sem execução bem-sucedida
  permite_full_manual               boolean NOT NULL DEFAULT true,
  observacao_execucao               text,
  criado_em                         timestamptz NOT NULL DEFAULT now(),
  atualizado_em                     timestamptz NOT NULL DEFAULT now()
);
```

Valores iniciais com base neste diagnóstico:

| modulo | estrategia | modo_carga_padrao | campo_incremental | janela_dias | full_quando_atraso |
|---|---|---|---|---|---|
| `despesa_full_postgres` | `full` | `full_truncate_insert` | — | — | — |
| `remessas_full_postgres` | `full` | `full_truncate_insert` | — | — | — |
| `mart_despesa` | `full` | `full_truncate_insert` | — | — | — |
| `mart_remessas` | `full` | `full_truncate_insert` | — | — | — |
| `mart_saude_consolidado` | `full` | `delete_insert` | — | — | — |
| `mart_saude_estrutura` | `full` | `upsert` | — | — | — |
| `mart_pni_cobertura` | `full` | `delete_insert` | `status_arquivo` | — | — |
| `processos_gabinete` | `incremental` | `append_hash` | `hash_processo` | 0 | 30 |
| `mart_mortalidade` | `incremental` | `delete_insert` | `ano_obito` | 365 | — |
| `mart_siops` | `incremental` | `delete_insert` | `competencia` | 180 | — |
| `mart_pni` | `incremental` | `upsert` | `mes_referencia` | 90 | — |
| `mart_infodengue` | `incremental_janela` | `upsert` | `semana_epidemiologica` | 730 | 365 |
| `mart_sisagua` | `incremental_janela` | `upsert`* | `competencia` | 730 | 365 |
| `mart_siconfi_rreo` | `incremental_janela` | `upsert`* | `nr_periodo` | 365 | — |

> *`mart_sisagua` e `mart_siconfi_rreo` precisam de correção de ON CONFLICT antes de serem classificados como upsert seguro.

### C) Evolução de `audit.etl_carga`

Três campos adicionais (sem quebrar o schema atual):

```sql
ALTER TABLE audit.etl_carga
  ADD COLUMN tipo_execucao          text DEFAULT 'automatica',  -- automatica | manual | reprocessamento
  ADD COLUMN data_referencia_inicio date,  -- início do período de dados processados
  ADD COLUMN data_referencia_fim    date;  -- fim do período de dados processados
```

Isso permitiria separar **data de processamento** de **data de competência dos dados**.

---

## 6. Resumo Executivo

| Item | Situação |
|---|---|
| Módulos com auditoria completa (`etl_carga` + `etl_log`) | 2 de 14 (`despesa_full`, `remessas_full`) |
| Módulos sem qualquer auditoria | 7 de 14 |
| Módulos com risco de duplicatas | 2 (`mart_sisagua`, `mart_siconfi_rreo`) |
| Módulos com janela hardcoded | 2 (`mart_infodengue`, `mart_sisagua`) |
| Módulos sem watermark persistente | 14 de 14 |

**Prioridade sugerida para Fase 2B:**
1. Corrigir ON CONFLICT em `mart_sisagua` e `mart_siconfi_rreo` (risco de dados corrompidos)
2. Padronizar auditoria nos 7 módulos sem `etl_carga`
3. Migrar `ETL_CONFIG` do front-end para `audit.etl_monitoramento`
4. Criar `audit.etl_execucao_config` com os valores mapeados acima
5. Adicionar `tipo_execucao`, `data_referencia_inicio`, `data_referencia_fim` em `audit.etl_carga`
