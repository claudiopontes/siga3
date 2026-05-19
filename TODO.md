# TODO - Varadouro Digital Aquiry

## Como usar
- Mantenha no topo apenas os itens ativos.
- Ao concluir, mova para "Concluidos Recentemente".
- Cada item deve ter: prioridade, responsavel, status e criterio de pronto.

## Backlog Prioritario
| Prioridade | Tarefa | Responsavel | Status | Criterio de Pronto |
|---|---|---|---|---|
| P0 | Encerrar divida Supabase: migrar APC Polanco e receita-publica para destino unico Postgres e remover dependencia `@supabase/supabase-js` do ETL | Claudio + Codex | TODO | Pipeline noturno roda sem `SUPABASE_*`, marts equivalentes em Postgres validados |
| P0 | Integrar IDEB real (INEP) no mapa `/gabinete-digital/mapa` substituindo dados simulados | Claudio + Codex | TODO | Mapa exibe IDEB oficial dos 22 municipios com fonte/ano documentados |
| P1 | Substituir dados estaticos de cobertura florestal (`src/data/desmatamentoAcre.ts`) por fonte real (PRODES/DETER) | Claudio + Codex | TODO | Painel carrega dados reais via ETL ou API, sem hardcode |
| P1 | Automatizar ingestao PNI e SIM quando APIs DataSUS estabilizarem (hoje via CSV/XLSX manual) | Claudio + Codex | TODO | Job ETL automatico documentado em `docs/datasus-inventario.md` |
| P1 | Adicionar testes automatizados minimos (Vitest p/ libs + Playwright p/ login, Aquiry e analise IA de processo) | Claudio + Codex | TODO | Suite roda local e em CI |
| P1 | Configurar CI/CD (GitHub Actions): lint, build, testes, migrations check | Claudio + Codex | TODO | Pipeline obrigatorio em PRs |
| P2 | Persistir logs do ETL Admin (`/api/admin/etl/executar`) em `audit.etl_log` em vez do console do Next | Claudio + Codex | TODO | Logs visiveis na UI de `seguranca/etl` em tempo real e armazenados em DB |
| P2 | Substituir lookup por regex do Aquiry (`baseConhecimentoAquiry`) por RAG vetorial sobre `src/data/aquiry/base-conhecimento/` | Claudio + Codex | TODO | Topicos fora dos regexes atuais sao recuperados corretamente |
| P2 | Formalizar checklist operacional das dimensoes (origem, revisao e atualizacao dos CSVs) | Claudio + Codex | TODO | Processo documentado com periodicidade e responsavel |
| P2 | Revisar textos/encoding e padronizar exibicao em PT-BR (acentuacao em terminais Windows) | Claudio + Codex | TODO | Sem caracteres quebrados em UI e docs principais |

Legenda de status: `TODO` | `DOING` | `BLOCKED` | `DONE`

## Concluidos Recentemente
- [2026-05-19] Documentacao raiz reescrita (CLAUDE.md e README.md) para refletir o estado atual do sistema (20+ paineis, Aquiry, IA de processo, ETL, AD).
- [2026-05-19] `.env.example` atualizado com variaveis Azure OpenAI, Postgres (`DATABASE_URL`/`PG*`) e SICONFI, antes ausentes.
- [2026-05-19] Removida pagina `/signup` (incompativel com fluxo AD): excluidos `src/app/(full-width-pages)/(auth)/signup/` e `src/components/auth/SignUpForm.tsx`; `proxy.ts` atualizado para tirar `/signup` das rotas publicas.
- [2026-05-18] Logs ETL noturnos confirmando execucao continua ate maio/2026 (ver `etl/logs/nightly_etl_*.log`).
- [2026-04-16] Automacao de dimensoes implementada (`DIM_AUTO_BOOTSTRAP_FROM_SUPABASE=true`) e scheduler unificado noturno.
- [2026-04-16] Validado fallback real de CSV ausente: `npm run dimensoes` regenerou `etl/data/dimensoes/*.csv` a partir de `aux_dim_*` e concluiu com sucesso.
- [2026-04-16] Validado pipeline ETL -> Supabase -> leitura frontend do painel de combustivel.
- [2026-04-16] Mapeado estado inicial do projeto (rotas, componentes criticos e ETL).

## Bloqueios Atuais
- Endpoints DataSUS CKAN majoritariamente 404 (ver `docs/datasus-inventario.md`) — bloqueia automacao PNI/SIM.
- Sem testes automatizados e sem CI — risco a cada deploy.
- Variaveis Azure OpenAI dependem de provisionamento institucional do TCE-AC.

## Proxima Sessao (copiar e colar no chat)
`Continue do HANDOFF.md e TODO.md. Foque no P0 de encerrar divida Supabase ou no P0 de integrar IDEB real, e atualize ambos os arquivos ao final.`
