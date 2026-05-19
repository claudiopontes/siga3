# Varadouro Digital Aquiry — Contexto do Projeto

## Visão Geral

Sistema web interno do **Tribunal de Contas do Estado do Acre (TCE-AC)**, usado pelo gabinete dos conselheiros para inteligência de controle externo: painéis de transparência, análise de processos e pautas de julgamento, central de alertas e copilot institucional **Aquiry**.

- **Repositório:** `https://github.com/claudiopontes/gabinete-digital`
- **Base:** TailAdmin (template Next.js + Tailwind CSS), fortemente customizado
- **Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, React-Leaflet, ApexCharts
- **Banco:** PostgreSQL 17 local (Docker em `infra/postgres/`), acessado via `pg` em [src/lib/db.ts](src/lib/db.ts). Sem ORM — SQL puro.
- **IA:** Azure OpenAI (Assistente Aquiry + análise IA de processos/pautas).

---

## Arquitetura em 3 camadas

1. **Frontend Next.js** (este repositório, `src/`) — read-only sobre Postgres via `dbQuery`. Autenticação LDAP/AD com sessão JWT em cookie httpOnly.
2. **ETL standalone** (`etl/`) — Node/TypeScript, conectores `pg`, `mssql`, `@supabase/supabase-js`. Pipeline noturno orquestrado por `etl/schedule.ts`. 62 migrations em `etl/schema/postgres/`.
3. **APIs internas com IA** (`src/app/api/`) — 107 endpoints, sendo o Aquiry (`/api/assistente-aquiry`) e a IA de processos (`/api/ia/*`) os mais complexos.

---

## Módulos do sistema

| Módulo | Rota base | Status |
|---|---|---|
| Home / Alertas Gabinete | `/` | Implementado |
| Combustível (NFe Polanco) | `/painel-combustivel`, `/painel-combustivel-empenhos` | Implementado |
| Receita Pública | `/painel-receita-publica` | Implementado |
| Despesa + Credores | `/painel-despesa`, `/pesquisa-credores` | Implementado |
| CAUC Municípios | `/painel-cauc` | Implementado |
| Cobertura Florestal | `/painel-cobertura-florestal` | Parcial (dados estáticos) |
| SICONFI (RREO/RGF/Extrato) | `/painel-siconfi/*` | Implementado |
| Saúde Pública (SIOPS, SISAGUA, InfoDengue, PNI, SIM) | `/painel-saude/*` | Implementado (PNI/SIM com ingestão manual via CSV) |
| Vulnerabilidade Social (CadÚnico/MIS) | `/painel-social` | Implementado |
| Mapa IDEB (Gabinete Digital) | `/gabinete-digital/mapa` | Parcial (IDEB simulado) |
| Pautas de Julgamento + IA | `/pautas-julgamento/*` | Implementado |
| Processos eProcess CE + IA | `/eprocessos-ce/processos/*` | Implementado |
| Remessas Contábeis | `/remessas/calendario` | Implementado |
| Segurança (admin) | `/seguranca/{usuarios,etl,etl/configuracao}` | Implementado |
| Assistente Aquiry (global) | overlay em `(admin)/layout.tsx` | Implementado |

---

## Estrutura de pastas (resumo)

```
src/
├── app/
│   ├── (admin)/                       # Layout com sidebar + Aquiry global
│   │   ├── painel-*/                  # Painéis de transparência e saúde
│   │   ├── gabinete-digital/mapa/     # Mapa IDEB
│   │   ├── pautas-julgamento/         # Pautas + análise IA
│   │   ├── eprocessos-ce/processos/   # eProcess + análise IA
│   │   ├── remessas/calendario/
│   │   └── seguranca/                 # Admin
│   ├── (full-width-pages)/(auth)/signin/  # Login AD
│   └── api/                           # 107 endpoints
├── components/
│   ├── alertas-gabinete/  aquiry/  auth/  Maps/
│   ├── combustivel/  receita-publica/  despesa/  cauc/
│   ├── siconfi/  saude/  social/
│   ├── pautas-julgamento/  processos/  remessas/
│   ├── seguranca/  home/  header/  user-profile/  ui/  form/
├── lib/
│   ├── db.ts                          # Pool pg único
│   ├── auth/                          # LDAP/AD + sessão + autorização
│   ├── aquiry/                        # Pipeline do assistente
│   ├── ia/                            # Análise IA de processos/pautas
│   ├── fontes/siconfi/                # Cliente SICONFI
│   └── processos/documentos/          # Extração PDF
├── data/aquiry/base-conhecimento/     # Base documental versionada (Markdown)
├── context/   hooks/   layout/   icons/

etl/
├── jobs/                              # ~80 jobs ETL
├── connectors/                        # pg, mssql, supabase
├── schema/postgres/                   # 62 migrations 000–260
├── schedule.ts                        # Cron noturno
└── data/                              # CSV/XLSX (SIM, MIS, PNI, dimensoes)

infra/postgres/                        # docker-compose do Postgres 17
docs/                                  # Documentação (aquiry, datasus, fases ETL)
```

---

## Decisões técnicas

- **Acesso a banco apenas no server.** Toda rota cliente consome `/api/*`; banco fica restrito ao Node via `dbQuery`.
- **Sem ORM.** SQL puro, schemas `raw → stage → dw → mart`, auditoria em `audit`.
- **Migrations versionadas em arquivos `.sql`** ordenadas numericamente (`etl/schema/postgres/000_*` … `260_*`). Executar com `npm run postgres:migrate` na pasta `etl/`.
- **Autenticação real LDAP/AD** contra `172.20.12.86:389`, domínio `tceac`. Autorização via tabela Postgres `usuarios_autorizados`. Sessão JWT em cookie httpOnly.
- **Aquiry**: pipeline determinístico (classificação de intenção/estratégia) + base documental versionada em Markdown + busca externa multi-provider (Tavily/Brave/SerpAPI/Gemini) + chamada real Azure OpenAI. Auditoria por metadados (sem conteúdo) em `public.aquiry_evento_uso`.
- **IA de processo/pauta**: prompt versionado (`modelos/analiseProcessoPauta.ts` v1.5.0), modo `response_format: json_object`, cache por SHA-256 da entrada em `public.ia_analise_processo_pauta`, suporte a descarte e jobs assíncronos.
- **Mapas (Leaflet)**: sempre `dynamic import` com `ssr: false`. Tile provider CartoDB Light (gratuito, institucional). Limites municipais GeoJSON via IBGE em tempo real.
- **Servidor PDF eProcess** em `http://172.20.12.105:8090` (Apache), endpoint proxy em `/api/processos/[id]/arquivos/[id]/pdf`.
- **Disparo de ETL pela UI admin**: `/api/admin/etl/executar` usa `spawn` com advisory lock Postgres (`pg_try_advisory_lock`) para evitar concorrência.

---

## Integrações externas

| Integração | Onde | Uso |
|---|---|---|
| Active Directory (LDAP) | `src/lib/auth/active-directory.ts` (`ldapts`) | Login |
| Azure OpenAI | `src/lib/ia/azureOpenAI.ts` | Aquiry + análise IA |
| SICONFI (Tesouro) | `src/lib/fontes/siconfi/siconfiClient.ts` + jobs ETL | RREO/RGF/Extrato |
| IBGE | `MapaAcreContent.tsx` (malhas) + `etl/jobs/populacao-ibge.ts` | Geo + população |
| BrasilAPI | `etl/jobs/credor-enriquecer-cnpj.ts` | Enriquecimento credor |
| DataSUS/SIOPS/SISAGUA/InfoDengue/PNI/CNES | jobs em `etl/jobs/` | Saúde (parte via CSV manual — ver `docs/datasus-inventario.md`) |
| SQL Server (APC, EJURIS, eProcess) | `etl/connectors/sqlserver.ts` | Fonte operacional |
| Supabase | residual (APC Polanco + receita-publica) | Sync legado em transição para Postgres-only |
| Apache PDF interno (172.20.12.105:8090) | API processos | Servir PDFs originais |

---

## Variáveis de ambiente

Ver `.env.example` na raiz para o conjunto completo. Resumo dos blocos:

- **Postgres** (`DATABASE_URL` ou `PG*`) — frontend e ETL.
- **Azure OpenAI** (`AZURE_OPENAI_ENDPOINT`, `_KEY`, `_DEPLOYMENT`, `_API_VERSION`) — obrigatórias para IA.
- **Active Directory** (`AD_LDAP_URL`, `AD_DOMAIN_PREFIX`, `AUTH_SESSION_SECRET`, `AUTH_USERS_TABLE`).
- **Repositório PDF** (`REPOSITORIO_BASE_URL`).
- **Aquiry busca externa** (`AQUIRY_EXTERNAL_SEARCH_PROVIDER`, chaves Gemini etc.) — opcional.
- **Aquiry auditoria** (`AQUIRY_AUDIT_PERSIST`) — opcional.
- **SICONFI** (`SICONFI_API_BASE_URL`, `SICONFI_TIMEOUT_MS`) — opcional.
- **ETL only**: Supabase (`SUPABASE_SERVICE_ROLE_KEY` etc.), SQL Server (`SQLSERVER_*`), CSVs (`DIM_*_CSV`), agendamento (`FACT_ETL_CRON`, `RUN_*_NIGHTLY`).

---

## Como rodar localmente

```bash
# 1) Subir Postgres (ver docs/postgres-local.md)
docker compose -f infra/postgres/docker-compose.postgres.yml up -d

# 2) Aplicar migrations
cd etl && npm install && npm run postgres:migrate

# 3) Rodar frontend
cd .. && npm install && npm run dev
```

Login disponível apenas via AD interno do TCE-AC. Em ambiente sem rede do TCE, popular `usuarios_autorizados` manualmente e mockar LDAP é necessário (não há fluxo de cadastro público — `/signup` foi removido).

---

## Padrões do projeto

- Toda comunicação, comentários e mensagens de UI em **português do Brasil**.
- Componentes responsivos (mobile-first) com classes Tailwind responsivas obrigatórias.
- Componentes de mapa sempre com `dynamic import` e `ssr: false`.
- Páginas dos painéis em `src/app/(admin)/<modulo>/`.
- Componentes Client (`"use client"`) terminam em `*Client.tsx` por convenção.
- Endpoints API sempre `export const runtime = "nodejs"` (uso de `pg`, LDAP, fetch).
- Histórico do Aquiry limitado a 10 mensagens; auditoria nunca persiste conteúdo textual.

---

## Próximos passos

- [ ] Encerrar dívida Supabase (migrar APC Polanco e receita-publica para destino único Postgres).
- [ ] Integrar IDEB real (INEP) no mapa Gabinete Digital — atualmente simulado.
- [ ] Integrar dados reais de cobertura florestal/desmatamento — atualmente hardcoded em `src/data/desmatamentoAcre.ts`.
- [ ] Automatizar ingestão PNI e SIM quando APIs DataSUS estabilizarem (ver `docs/datasus-inventario.md`).
- [ ] Adicionar testes automatizados (Vitest para libs + Playwright para fluxos críticos).
- [ ] Configurar CI/CD (GitHub Actions).
- [ ] Substituir lookup por regex do Aquiry por RAG vetorial.
