# HANDOFF - Varadouro Digital Aquiry

## 1) Resumo do Projeto
- Nome: Varadouro Digital Aquiry
- Objetivo principal:
  - Entregar paineis de transparencia e analise para apoio a decisao, com foco inicial em combustivel (NFe) e visualizacao territorial do Acre.
- Publico-alvo:
  - Equipe de gabinete/analistas e gestao publica que consultam indicadores e recortes por municipio, entidade e periodo.

## 2) Stack e Ambiente
- Frontend:
  - Next.js 16 (App Router) + React 19 + TypeScript + Tailwind.
- UI base:
  - Template TailAdmin, com rotas customizadas no grupo `(admin)`.
- Backend/Servicos:
  - Supabase (consumo no frontend e destino das tabelas agregadas).
  - ETL Node/TypeScript em `etl/` para carga de fatos e dimensoes.
  - Fonte de dados operacional: SQL Server (no ETL).
- Variaveis de ambiente essenciais:
  - Frontend: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  - ETL: `SUPABASE_SERVICE_ROLE_KEY`, `SQLSERVER_*`, `DIM_*_CSV`, `ETL_TIMEZONE`, `FACT_ETL_CRON`.
- Como rodar:
  - Frontend: `npm install` e `npm run dev`.
  - ETL: na pasta `etl`, `npm install`, depois `npm run combustivel`, `npm run dimensoes` ou `npm run agendar`.

## 3) Decisoes Tecnicas (Fonte de Verdade)
- Uso de Supabase no frontend somente com chave anonima publica; service role fica restrita ao ETL.
- ETL de combustivel faz substituicao total das tabelas agregadas em cada execucao (estrategia simples e previsivel).
- Frontend de combustivel possui fallback para schema legado sem coluna `emitente`.
- Componentes de mapa (Leaflet) e mapas dinâmicos rodam client-side (`ssr: false`) para evitar conflitos de SSR.

## 4) Estrutura Importante
- Rotas principais:
  - `src/app/(admin)/painel-combustivel/page.tsx`
  - `src/app/(admin)/gabinete-digital/mapa/page.tsx`
  - `src/app/(admin)/gabinete-digital/seletor-municipio/page.tsx`
- Componentes criticos:
  - `src/components/combustivel/PainelCombustivelClient.tsx`
  - `src/components/combustivel/CombustivelHeaderFilters.tsx`
  - `src/components/Maps/SeletorMunicipio.tsx`
  - `src/layout/AppHeader.tsx` e `src/layout/AppSidebar.tsx`
- Infra/dados:
  - `src/lib/supabase.ts`
  - `etl/jobs/combustivel.ts`
  - `etl/jobs/dimensoes-csv.ts`
  - `etl/schedule.ts`
  - `etl/schema/*.sql`

## 5) Estado Atual
- Ultima atualizacao: 2026-04-16
- O que ja foi concluido:
  - Rotas de menu para Combustivel, IDEB Acre (mapa) e Seletor de Municipio estao ativas.
  - Painel de combustivel com filtros via query string (municipio, entidade, tipo, emitente).
  - Carregamento de dados no painel com protecao para Supabase nao configurado.
  - ETL com job de combustivel, job de dimensoes por CSV e scheduler diario.
  - Validacao P0 executada em ambiente real (ETL -> Supabase -> leitura frontend):
    - `npm run combustivel` (etl): sucesso em 2026-04-16T13:02:17Z, 3749 registros (log id 17).
    - `npm run dimensoes` (etl): primeira tentativa falhou por CSV ausente (log id 18), depois sucesso em 2026-04-16T13:04:34Z, 5858 registros (log id 19).
    - Conferencia Supabase apos carga:
      - `combustivel_mensal=3507`, `combustivel_entidade=81`, `combustivel_tipo=8`, `combustivel_emitente=153`, `combustivel_kpis=1`.
      - `aux_dim_uf=27`, `aux_dim_municipio=5571`, `aux_dim_ente=24`, `aux_dim_entidade=236`.
      - `max(atualizado_em)` de `combustivel_*`: `2026-04-16T13:02:27.115+00:00`.
      - `max(atualizado_em)` de `aux_dim_*`: `2026-04-16T13:04:34.031+00:00`.
    - Leitura com chave anonima (simulando frontend): consultas em `combustivel_mensal` e `aux_dim_municipio` retornando dados sem erro de RLS/config.
  - Automacao de dimensoes e scheduler noturno (P0 atual) concluida:
    - `etl/jobs/dimensoes-csv.ts` agora faz auto-bootstrap dos CSVs quando arquivos estiverem ausentes, usando `aux_dim_*` do Supabase.
    - Nova variavel de controle: `DIM_AUTO_BOOTSTRAP_FROM_SUPABASE` (default `true`).
    - `etl/schedule.ts` evoluido para pipeline noturno unico: dimensoes -> combustivel (1x/dia), com `RUN_DIMENSOES_NIGHTLY` (default `true`).
    - Validacao de resiliencia concluida em 2026-04-16:
      - Simulado CSV ausente (`dim_uf.csv`) e o job `npm run dimensoes` regenerou automaticamente os arquivos e concluiu com sucesso (5858 registros).
      - `npm run combustivel` executou em seguida com sucesso (3749 registros).
      - `npm run agendar` iniciou scheduler com cron noturno unico sem erro.
- O que esta em andamento:
  - Refinar governanca da fonte oficial dos CSVs (quem atualiza, quando e checklist operacional).
- O que esta bloqueado:
  - Sem bloqueio para ETL de combustivel.
  - Sem bloqueio tecnico para ETL de dimensoes apos auto-bootstrap.

## 6) Proxima Tarefa Prioritaria
- Tarefa:
  - Definir backlog funcional do modulo `gabinete-digital/mapa` (escopo V1) e implementar primeiro incremento.
- Criterio de pronto:
  - Objetivo do mapa, filtros e interacoes V1 documentados.
  - Primeira entrega funcional implementada no modulo de mapa.
- Riscos/atencao:
  - CSVs de dimensoes continuam com baixa frequencia de atualizacao; manter processo de revisao periodica para evitar drift.
  - Divergencia de schema (ex.: coluna `emitente` ausente em algum ambiente).
  - Qualidade dos CSVs de dimensoes (header e encoding) impactando relacionamento por codigo.

## 7) Pendencias de Produto e Tecnica
- Produto:
  - Definir backlog funcional do modulo `gabinete-digital/mapa` (atualmente pagina base com `MapaAcre`).
  - Definir KPIs oficiais e filtros obrigatorios para versao 1.
- Tecnica:
  - Padronizar encoding de textos com acento para evitar exibicao inconsistente em alguns terminais.
  - Criar checklist de publicacao (env, ETL, smoke test).
- Divida tecnica:
  - Alguns componentes possuem alta complexidade e merecem modularizacao incremental (especialmente filtros/dialogos do combustivel).

## 8) Instrucao para Retomar no Proximo Chat
Use esta frase no inicio da proxima conversa:

`Continue o projeto Varadouro Digital Aquiry lendo HANDOFF.md e TODO.md. Foque no P0, execute e atualize os dois arquivos ao final da sessao.`
