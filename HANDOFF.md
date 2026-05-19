# HANDOFF - Varadouro Digital Aquiry

## 1) Resumo do Projeto
- Nome: Varadouro Digital Aquiry
- Objetivo: portal interno do TCE-AC com paineis de transparencia, analise de processos e pautas de julgamento com IA, central de alertas do gabinete e copilot institucional Aquiry.
- Publico-alvo: conselheiros, gabinetes e analistas do TCE-AC.

## 2) Stack e Ambiente
- Frontend:
  - Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 4.
  - Template TailAdmin como base, fortemente customizado.
- Banco:
  - PostgreSQL 17 local (Docker em `infra/postgres/`). Schemas `raw / stage / dw / mart / audit / public`.
  - Acesso server-only via `pg` em `src/lib/db.ts`. Sem ORM.
- Autenticacao:
  - LDAP/AD (`ldapts`) contra `172.20.12.86:389`, dominio `tceac`. Autorizacao em `usuarios_autorizados`. Sessao JWT em cookie httpOnly.
- IA:
  - Azure OpenAI (Assistente Aquiry e analise IA de processos/pautas).
  - Aquiry: pipeline deterministico + base documental versionada em `src/data/aquiry/base-conhecimento/` + busca externa multi-provider (Tavily/Brave/SerpAPI/Gemini) + auditoria por metadados (sem conteudo) em `public.aquiry_evento_uso`.
- ETL standalone (`etl/`):
  - Conectores Postgres, SQL Server (`mssql` + `msnodesqlv8`) e Supabase residual.
  - 62 migrations versionadas em `etl/schema/postgres/`.
  - Orquestrador noturno `etl/schedule.ts` (21 steps).
- Variaveis de ambiente:
  - Frontend: `DATABASE_URL`/`PG*`, `AZURE_OPENAI_*`, `AD_*`, `AUTH_SESSION_SECRET`, `REPOSITORIO_BASE_URL`, `AQUIRY_*` (opcional).
  - ETL: `SUPABASE_*`, `SQLSERVER_*`, `DIM_*_CSV`, `ETL_TIMEZONE`, `FACT_ETL_CRON`, `RUN_*_NIGHTLY`.
  - Ver `.env.example` para o conjunto completo.
- Como rodar:
  - `docker compose -f infra/postgres/docker-compose.postgres.yml up -d`
  - `cd etl && npm install && npm run postgres:migrate`
  - `cd .. && npm install && npm run dev`

## 3) Decisoes Tecnicas (Fonte de Verdade)
- Toda leitura do banco passa por rotas API Next.js (`/api/*`); cliente nunca toca banco.
- SQL puro com `pg` (sem ORM). Migrations versionadas em arquivos `.sql` numerados.
- ETLs por substituicao total ou incremental, dependendo do dominio; auditoria em `audit.etl_log` / `audit.etl_carga`.
- Mapas Leaflet sempre `dynamic import` com `ssr: false`. Tiles CartoDB Light. Limites IBGE em tempo real.
- Aquiry tem chamada real a Azure OpenAI; nao inventa dados; nao gera voto/parecer; auditoria sem conteudo textual.
- Analise IA de processo usa cache por SHA-256 e suporta descarte/regeneracao (`public.ia_analise_processo_pauta`).
- Disparo de ETL pela UI admin usa `spawn` + advisory lock Postgres para evitar concorrencia.
- Pagina `/signup` foi removida (incompativel com fluxo AD); somente `/signin` permanece publico.

## 4) Estrutura Importante
- Rotas principais:
  - `src/app/(admin)/page.tsx` (Home / Alertas Gabinete)
  - `src/app/(admin)/painel-{combustivel,combustivel-empenhos,receita-publica,despesa,cauc,cobertura-florestal,saude,social,siconfi}/...`
  - `src/app/(admin)/pautas-julgamento/[sessaoId]/page.tsx`
  - `src/app/(admin)/eprocessos-ce/processos/[processoId]/analise-ia/page.tsx`
  - `src/app/(admin)/seguranca/{usuarios,etl,etl/configuracao}/page.tsx`
  - `src/app/(admin)/gabinete-digital/mapa/page.tsx`
- Componentes criticos:
  - `src/components/aquiry/*` (assistente + provider)
  - `src/components/alertas-gabinete/AlertasGabineteClient.tsx`
  - `src/components/pautas-julgamento/*` e `src/components/processos/*`
  - `src/components/siconfi/*` e `src/components/saude/*`
  - `src/layout/AppSidebar.tsx` e `src/layout/AppHeader.tsx`
- APIs principais:
  - `src/app/api/assistente-aquiry/route.ts`
  - `src/app/api/ia/*` (analise de processo, resumo de pauta, jobs)
  - `src/app/api/processos/*`, `src/app/api/pauta-julgamento/*`
  - `src/app/api/despesa/*`, `src/app/api/siconfi/*`, `src/app/api/saude/*`, `src/app/api/alertas/*`
  - `src/app/api/admin/etl/{status,configuracao,executar}/route.ts`
- Infra/dados:
  - `src/lib/db.ts`, `src/lib/auth/*`, `src/lib/ia/*`, `src/lib/aquiry/*`, `src/lib/fontes/siconfi/*`
  - `etl/jobs/*`, `etl/schedule.ts`, `etl/schema/postgres/*` (000–260)
  - `infra/postgres/docker-compose.postgres.yml`

## 5) Estado Atual
- Ultima atualizacao: 2026-05-19
- Concluido recentemente:
  - Sistema completo com 20+ paineis em producao interna.
  - Assistente Aquiry com IA real (Azure OpenAI), base documental versionada, busca externa multi-provider e auditoria por metadados.
  - Analise IA de processo e resumo de pauta com cache em Postgres, suporte a descarte e jobs assincronos.
  - Autenticacao LDAP/AD real, autorizacao em Postgres, sessao JWT.
  - ETL noturno consolidado em pipeline unico (21 steps) com flags por etapa.
  - SICONFI (RREO/RGF/Extrato) e CAUC totalmente integrados.
  - Saude: SIOPS, SISAGUA, InfoDengue, alertas de estrutura (CNES/UBS).
  - Social: CadUnico e MIS (Bolsa Familia/BPC).
  - Pagina `/signup` removida (era heranca do template, incompativel com AD).
  - Documentacao raiz (`CLAUDE.md`, `README.md`, `.env.example`) atualizada para refletir o estado real do sistema.
- Em andamento / pendente:
  - Encerrar divida Supabase: dois jobs ainda sincronizam (APC Polanco e receita-publica).
  - PNI e SIM dependem de ingestao manual via CSV/XLSX (APIs DataSUS instaveis).
  - Mapa IDEB ainda usa dados simulados.
  - Cobertura florestal ainda usa dados estaticos hardcoded.
- Bloqueios:
  - APIs DataSUS CKAN com 404 generalizado (ver `docs/datasus-inventario.md`).
  - Sem testes automatizados e sem CI/CD.

## 6) Proxima Tarefa Prioritaria
- Tarefa principal sugerida:
  - Encerrar a divida Supabase (P0): migrar APC Polanco e receita-publica para destino unico Postgres e remover `@supabase/supabase-js` do ETL.
- Alternativa P0:
  - Integrar IDEB real (INEP) no mapa `/gabinete-digital/mapa`.
- Criterio de pronto:
  - Pipeline noturno roda sem variaveis `SUPABASE_*` e marts equivalentes em Postgres validados, ou mapa IDEB carrega dados oficiais.
- Riscos/atencao:
  - Frontend ja le apenas Postgres; risco esta no schema de destino e na compatibilidade dos consumidores ETL.
  - IDEB real exige fonte autoritativa (INEP) e periodicidade definida.

## 7) Pendencias de Produto e Tecnica
- Produto:
  - Dados reais de IDEB e desmatamento.
  - Refinar central de alertas do gabinete por conselheiro (personalizacao).
  - Definir KPIs oficiais por painel.
- Tecnica:
  - Testes automatizados (Vitest + Playwright).
  - CI/CD GitHub Actions.
  - Persistir logs do ETL Admin em `audit.etl_log` em vez do console do Next.
  - Substituir lookup por regex do Aquiry por RAG vetorial.
  - Documentar e automatizar ingestao PNI/SIM quando DataSUS estabilizar.
  - Padronizar encoding PT-BR em terminais Windows.
- Divida tecnica:
  - Supabase residual em 2 tabelas (APC Polanco, receita-publica).
  - `placeholder=` e textos UI revisar consistentemente.
  - Servidor PDF eProcess fixo em IP `172.20.12.105:8090` (sem fallback/proxy).

## 8) Instrucao para Retomar no Proximo Chat
Use esta frase no inicio da proxima conversa:

`Continue o projeto Varadouro Digital Aquiry lendo HANDOFF.md e TODO.md. Foque no P0 (Supabase ou IDEB), execute e atualize os dois arquivos ao final da sessao.`
