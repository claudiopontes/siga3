# Varadouro Digital Aquiry

Sistema web interno do **Tribunal de Contas do Estado do Acre (TCE-AC)** para apoio à decisão dos gabinetes dos conselheiros. Reúne painéis de transparência, análise de processos e pautas de julgamento com IA, central de alertas e o assistente institucional **Aquiry**.

> Base UI: template TailAdmin (Next.js + Tailwind) — fortemente customizado para o domínio de controle externo.

---

## Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4
- **Mapas/Charts:** React-Leaflet, ApexCharts, FullCalendar
- **Banco:** PostgreSQL 17 (acesso direto via `pg`, sem ORM)
- **Autenticação:** Active Directory (LDAP) via `ldapts` + sessão JWT em cookie httpOnly
- **IA:** Azure OpenAI (Assistente Aquiry e análise IA de processos/pautas)
- **ETL:** Node/TypeScript em `etl/` (conectores Postgres, SQL Server e Supabase residual)

---

## Módulos

| Módulo | Rota |
|---|---|
| Home / Alertas Gabinete | `/` |
| Combustível (NFe Polanco) | `/painel-combustivel`, `/painel-combustivel-empenhos` |
| Receita Pública | `/painel-receita-publica` |
| Despesa + Credores | `/painel-despesa`, `/pesquisa-credores` |
| CAUC Municípios | `/painel-cauc` |
| Cobertura Florestal | `/painel-cobertura-florestal` |
| SICONFI (RREO / RGF / Extrato) | `/painel-siconfi/*` |
| Saúde Pública (SIOPS, SISAGUA, InfoDengue, PNI, SIM) | `/painel-saude/*` |
| Vulnerabilidade Social (CadÚnico, MIS) | `/painel-social` |
| Mapa IDEB (Gabinete Digital) | `/gabinete-digital/mapa` |
| Pautas de Julgamento + IA | `/pautas-julgamento` |
| Processos eProcess CE + IA | `/eprocessos-ce/processos` |
| Remessas Contábeis | `/remessas/calendario` |
| Segurança (admin) | `/seguranca/{usuarios,etl,etl/configuracao}` |

O **Assistente Aquiry** é um overlay global montado no layout `(admin)`. Recebe contexto da tela atual via React Context e consulta Azure OpenAI com base documental institucional versionada em `src/data/aquiry/base-conhecimento/`.

---

## Pré-requisitos

- Node.js 20.x ou superior
- Docker (para subir o Postgres local) — ver [docs/postgres-local.md](docs/postgres-local.md)
- Acesso à rede interna do TCE-AC para autenticação AD em ambiente real
- Variáveis de ambiente configuradas (ver [.env.example](.env.example))

---

## Instalação e execução

```bash
# 1) Subir Postgres local
docker compose -f infra/postgres/docker-compose.postgres.yml up -d

# 2) Aplicar migrations (62 arquivos versionados em etl/schema/postgres/)
cd etl
npm install
npm run postgres:migrate

# 3) Voltar à raiz e rodar o frontend
cd ..
npm install
npm run dev
```

O servidor Next.js sobe em `http://localhost:3000`. O acesso exige autenticação AD; em ambiente isolado, popular `usuarios_autorizados` manualmente.

### Scripts do frontend

| Script | Descrição |
|---|---|
| `npm run dev` | Servidor de desenvolvimento Next.js |
| `npm run build` | Build de produção |
| `npm run start` | Servir build de produção |
| `npm run lint` | ESLint |

### Scripts do ETL (pasta `etl/`)

Mais de 90 scripts. Destaques:

- `npm run agendar` — orquestrador noturno (cron `0 1 * * *`, TZ `America/Rio_Branco`)
- `npm run postgres:migrate` — aplicar migrations
- `npm run combustivel` / `receita-publica` / `cauc` / `processos-eprocess` / `pauta-julgamento` — jobs individuais
- `npm run mart:*` — refresh dos marts (despesa, saúde, SICONFI, social etc.)
- `npm run *-inspecionar` — inspetores de fontes externas (DataSUS, SIOPS, InfoDengue, etc.)

---

## Documentação

- [CLAUDE.md](CLAUDE.md) — contexto técnico completo para agentes e devs novos
- [HANDOFF.md](HANDOFF.md) — estado atual e próxima sessão
- [TODO.md](TODO.md) — backlog priorizado
- [docs/](docs/) — diagnósticos, inventários (DataSUS, mortalidade, PNI) e fases ETL
- [docs/aquiry/](docs/aquiry/) — auditoria, checklist MVP e roteiro de testes do assistente
- [docs/postgres-local.md](docs/postgres-local.md) — subir Postgres em Docker

---

## Variáveis de ambiente

Ver [.env.example](.env.example) na raiz. Blocos principais:

- **Postgres** — `DATABASE_URL` ou `PG*`
- **Azure OpenAI** — `AZURE_OPENAI_ENDPOINT`, `_KEY`, `_DEPLOYMENT`, `_API_VERSION`
- **Active Directory** — `AD_LDAP_URL`, `AD_DOMAIN_PREFIX`, `AUTH_SESSION_SECRET`
- **Repositório PDF do eProcess** — `REPOSITORIO_BASE_URL`
- **Aquiry busca externa (opcional)** — Tavily/Brave/SerpAPI/Gemini
- **ETL** — Supabase, SQL Server, CSVs de dimensões, agendamento

---

## Licença

Uso interno do TCE-AC. O template TailAdmin base permanece sob licença MIT (ver crédito original em commits iniciais).
