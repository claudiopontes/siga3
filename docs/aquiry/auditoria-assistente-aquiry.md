# Auditoria do Assistente Aquiry

Documento de referência institucional para a auditoria/métricas de uso do Assistente Aquiry no Varadouro Digital (TCE-AC).

## Princípio

A auditoria do Aquiry registra **apenas metadados** sobre cada interação. **Nenhum conteúdo textual sensível** (pergunta do usuário, resposta da IA, fontes externas completas, documentos da base) é armazenado.

## Modos de operação

| Modo | Como | Onde os eventos vão |
|------|------|---------------------|
| Log apenas (padrão) | `AQUIRY_AUDIT_PERSIST` ausente ou `false` | `console.info("[Aquiry][audit]", ...)` no stdout do servidor |
| Log + persistência | `AQUIRY_AUDIT_PERSIST=true` em `.env.local` | Log + `INSERT` em `public.aquiry_evento_uso` |

Falhas de persistência **nunca quebram a resposta ao usuário** — apenas geram `console.warn` no servidor.

## Tabela `public.aquiry_evento_uso`

Migration: [`etl/schema/postgres/260_aquiry_audit.sql`](../../etl/schema/postgres/260_aquiry_audit.sql).

### Campos armazenados

| Campo | Tipo | Significado |
|---|---|---|
| `id` | bigserial | Chave primária. |
| `timestamp` | timestamptz | Quando o evento ocorreu (origem: servidor). |
| `tipo` | text | `pergunta` / `resposta` / `erro`. |
| `rota` | text | Caminho da página onde o usuário disparou a pergunta (até 200 chars). |
| `tipo_pagina` | text | Classificação semântica da rota (até 50 chars). |
| `estrategia` | text | `varadouro` / `conhecimento_geral` / `busca_externa`. |
| `bases` | jsonb | Lista das bases declaradas na resposta (Contexto da tela atual, Análise contextual, Base documental, Pesquisa externa realizada, Fonte estruturada necessária, Orientação geral da IA). |
| `usou_contexto_tela` | boolean | A tela registrou contexto via `useContextoAquiry`. |
| `usou_analise_contextual` | boolean | A análise determinística do Varadouro foi acionada. |
| `usou_base_documental` | boolean | A base documental versionada foi consultada. |
| `usou_pesquisa_externa` | boolean | A pesquisa externa via Gemini foi executada com sucesso. |
| `pesquisa_externa_suficiente` | boolean | A pesquisa atendeu ao nível de prova exigido pela pergunta. |
| `exige_fonte_estruturada` | boolean | A pergunta exige dado estruturado (csv/api/microdados). |
| `fonte_estruturada_encontrada` | boolean | Algum resultado da busca foi classificado como `estruturada`. |
| `fontes_oficiais_encontradas` | boolean | Algum resultado da busca foi classificado como `oficial_textual` ou `estruturada`. |
| `tamanho_pergunta` | integer | Número de caracteres da pergunta enviada. |
| `tamanho_resposta` | integer | Número de caracteres da resposta gerada. |
| `tempo_resposta_ms` | integer | Latência total da requisição. |
| `erro_codigo` | text | Identificador sanitizado de erro (`[a-z0-9_-]`, máx 60). |
| `created_at` | timestamptz | Quando o registro entrou no banco. |

### Campos NÃO armazenados

A auditoria **não** registra, em nenhuma hipótese:

- Conteúdo da pergunta do usuário.
- Conteúdo da resposta da IA.
- Stack trace, mensagens livres de erro ou trechos de exception.
- URLs, títulos e trechos das fontes externas.
- Documentos da base documental do Aquiry.
- Payloads brutos do Gemini ou do Azure OpenAI.
- API keys (Azure, Gemini, Tavily, Brave, SerpAPI etc.).
- Headers HTTP, IP de origem ou identificação direta do usuário.

## Como ativar

1. Aplique a migration `260_aquiry_audit.sql` no banco Postgres do projeto.
2. Em `.env.local`, defina:
   ```
   AQUIRY_AUDIT_PERSIST=true
   ```
3. Reinicie o servidor (`npm run dev` ou redeploy).

Cada interação com `/api/assistente-aquiry` passa a gerar até 2 linhas em `aquiry_evento_uso` (uma `pergunta` + uma `resposta` ou uma `pergunta` + um `erro`).

## Como desativar

1. Em `.env.local`, defina:
   ```
   AQUIRY_AUDIT_PERSIST=false
   ```
   ou remova a variável.
2. Reinicie o servidor.

A tabela permanece com os registros anteriores; novos eventos voltam a sair apenas como `console.info("[Aquiry][audit]", ...)`. A migration **não precisa ser revertida** para desativar.

## Consultas operacionais prontas

Catálogo completo (12 consultas — A a L) versionado em:
[`docs/aquiry/sql/auditoria-aquiry-consultas.sql`](sql/auditoria-aquiry-consultas.sql)

Conteúdo:

- **A — Volume diário** (eventos, perguntas, respostas, erros por dia).
- **B — Uso por estratégia** (% de respostas em varadouro / conhecimento_geral / busca_externa).
- **C — Uso por estratégia por dia** (evolução diária por estratégia).
- **D — Telas/rotas mais usadas** (top 50, com última interação).
- **E — Uso das bases** (contagem por flag: contexto da tela, análise contextual, base documental, pesquisa externa, fonte estruturada).
- **F — Lacuna de fonte estruturada** (rotas onde a pergunta exige base estruturada mas a busca não a encontrou).
- **G — Pesquisa externa consolidada** (suficiente vs. insuficiente, fontes oficiais, fonte estruturada).
- **H — Latência por estratégia** (média, P50, P95, máximo).
- **I — Erros agrupados** por `erro_codigo` sanitizado.
- **J — Adoção semanal** (tendência, diversidade de rotas/estratégias, tempo médio).
- **K — Bases mais frequentes** (`jsonb_array_elements_text(bases)`).
- **L — Últimos 50 eventos** (inspeção operacional).

Recortes rápidos inline (também presentes lá em forma mais completa):

```sql
-- Volume diário por estratégia
SELECT date_trunc('day', timestamp) AS dia, estrategia, COUNT(*)
FROM public.aquiry_evento_uso
WHERE tipo = 'resposta'
GROUP BY 1, 2
ORDER BY 1 DESC, 2;

-- Telas onde a busca externa é mais usada
SELECT rota, COUNT(*) AS perguntas_com_busca
FROM public.aquiry_evento_uso
WHERE tipo = 'resposta' AND usou_pesquisa_externa = true
GROUP BY rota
ORDER BY 2 DESC
LIMIT 20;

-- Casos em que faltou fonte estruturada
SELECT rota, tipo_pagina, COUNT(*)
FROM public.aquiry_evento_uso
WHERE tipo = 'resposta'
  AND exige_fonte_estruturada = true
  AND fonte_estruturada_encontrada = false
GROUP BY rota, tipo_pagina
ORDER BY 3 DESC;

-- P50/P95 de latência por estratégia
SELECT estrategia,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY tempo_resposta_ms) AS p50_ms,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY tempo_resposta_ms) AS p95_ms,
       COUNT(*) AS n
FROM public.aquiry_evento_uso
WHERE tipo = 'resposta' AND tempo_resposta_ms IS NOT NULL
GROUP BY estrategia;
```

## Retenção, LGPD e governança

- A persistência só armazena **metadados não identificáveis** sobre o uso da ferramenta. Ainda assim, a decisão sobre **prazo de retenção** e **rotina de expurgo** deve seguir a política institucional do TCE-AC.
- Recomendado definir uma política explícita (ex.: retenção rotativa por 180 dias) antes de habilitar `AQUIRY_AUDIT_PERSIST=true` em produção.
- Antes de qualquer compartilhamento agregado externo, revise se algum cruzamento de `rota` + `timestamp` poderia identificar indiretamente um usuário específico em ambiente de uso restrito.
- Acesso à tabela `aquiry_evento_uso` deve ser limitado a perfis com necessidade legítima de avaliar o piloto.

## Manutenção e evolução

A função `registrarEventoAquiry` em [`src/lib/aquiry/auditoriaAquiry.ts`](../../src/lib/aquiry/auditoriaAquiry.ts) é o único ponto que precisa mudar para trocar o destino futuro (fila, telemetry, produto de analytics). Os call sites em `route.ts` permanecem inalterados.
