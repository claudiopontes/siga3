# TODO - Varadouro Digital Aquiry

## Como usar
- Mantenha no topo apenas os itens ativos.
- Ao concluir, mova para "Concluidos Recentemente".
- Cada item deve ter: prioridade, responsavel, status e criterio de pronto.

## Backlog Prioritario
| Prioridade | Tarefa | Responsavel | Status | Criterio de Pronto |
|---|---|---|---|---|
| P0 | Definir e implementar backlog funcional do modulo `gabinete-digital/mapa` (escopo V1) | Claudio + Codex | TODO | Objetivo + filtros + interacoes V1 definidos e primeiro incremento implementado |
| P1 | Formalizar checklist operacional das dimensoes (origem, revisao e atualizacao dos CSVs) | Claudio + Codex | TODO | Processo documentado com periodicidade e responsavel definido |
| P2 | Revisar textos/encoding e padronizar exibicao em PT-BR | Claudio + Codex | TODO | Sem caracteres quebrados em UI e docs principais |

Legenda de status: `TODO` | `DOING` | `BLOCKED` | `DONE`

## Concluidos Recentemente
- [2026-04-16] P0 concluido: automacao de dimensoes implementada (`DIM_AUTO_BOOTSTRAP_FROM_SUPABASE=true`) e scheduler unificado noturno (`RUN_DIMENSOES_NIGHTLY=true`).
- [2026-04-16] Validado fallback real de CSV ausente: `npm run dimensoes` regenerou `etl/data/dimensoes/*.csv` a partir de `aux_dim_*` e concluiu com sucesso.
- [2026-04-16] P0 anterior concluido: validado pipeline ETL -> Supabase -> leitura frontend do painel de combustivel; evidencias registradas no `HANDOFF.md` (logs ids 17 e 19).
- [2026-04-16] Gerados CSVs tecnicos em `etl/data/dimensoes/` a partir de snapshot de `aux_dim_*` para viabilizar execucao do ETL de dimensoes na validacao operacional.
- [2026-04-16] Criados `HANDOFF.md` e `TODO.md` para continuidade entre sessoes.
- [2026-04-16] Mapeado estado atual do projeto (rotas, componentes criticos e ETL).

## Bloqueios Atuais
- Sem bloqueio de credencial no ambiente atual.
- Sem bloqueio tecnico no ETL noturno (dimensoes + combustivel).
- Gap de processo: governanca de atualizacao dos CSVs de dimensoes ainda depende de definicao operacional.

## Proxima Sessao (copiar e colar no chat)
`Continue do HANDOFF.md e TODO.md. Foque no P0 do modulo gabinete-digital/mapa (escopo V1), implemente e atualize ambos os arquivos ao final.`
