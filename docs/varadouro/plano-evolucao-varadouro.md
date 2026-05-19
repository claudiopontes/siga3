# Plano de Evolução do Varadouro Digital Aquiry

> Plano prático de evolução, organizado em fases, derivado de [mapa-funcional-varadouro.md](mapa-funcional-varadouro.md).
> Data de referência: 2026-05-19.

---

## 1. Premissa estratégica

A evolução do Varadouro Digital Aquiry deve, em todas as decisões de priorização, responder à pergunta central do controle externo do TCE-AC:

> **"Onde o gabinete do conselheiro deve olhar primeiro?"**

Toda nova feature, ajuste de painel ou investimento em integração deve ser avaliado sob este critério. Isso implica priorizar, nesta ordem:

1. **Risco** — alertas que indicam exposição fiscal, sanitária, ambiental ou cadastral imediata.
2. **Materialidade** — concentração de recursos públicos, fornecedores e jurisdicionados.
3. **Processos** — pautas, processos eletrônicos e instrumentos de preparação de julgamento.
4. **Alertas** — sinalização ativa e priorizada para o gabinete.
5. **Qualidade dos dados** — confiabilidade, rastreabilidade e completude.
6. **Atualização das bases** — periodicidade adequada e visível ao usuário final.
7. **Apoio à preparação de julgamento** — análise IA, resumo de pauta, documentos consolidados.
8. **Segurança e auditabilidade** — autenticação AD, autorização, logs e rastreabilidade da IA.

Itens que não respondem a esses critérios são adiados ou descartados. O Varadouro **não é um portal de transparência genérico**: é instrumento de controle externo.

---

## 2. Fase 1 — Consolidação institucional e técnica

**Objetivo:** tornar o sistema mais compreensível, demonstrável e seguro tecnicamente.

| Item | Justificativa | Arquivos prováveis | Risco se não fizer | Resultado esperado |
|---|---|---|---|---|
| Atualizar `README.md` | Atualmente é o README original do TailAdmin | [README.md](../../README.md) | Onboarding parte de premissa errada | README institucional do Varadouro com módulos, stack e instalação. **Concluído em 2026-05-19.** |
| Atualizar `CLAUDE.md` | Citava apenas o Mapa IDEB; sistema cresceu para 20+ painéis | [CLAUDE.md](../../CLAUDE.md) | Agentes/IDE perdem contexto técnico | Documentação técnica completa de arquitetura, módulos e padrões. **Concluído em 2026-05-19.** |
| Documentar variáveis Azure OpenAI no `.env.example` | `AZURE_OPENAI_*` e `DATABASE_URL`/`PG*` não estavam declaradas | [.env.example](../../.env.example) | Configuração silenciosamente quebrada em novos ambientes | `.env.example` reorganizado por blocos (frontend × ETL). **Concluído em 2026-05-19.** |
| Revisar itens herdados do TailAdmin | Páginas/components do template não usados poluem o repositório | `src/app/(admin)/(others-pages)/`, `src/components/form/`, `src/components/ui/` | Confusão sobre o que é institucional vs template | Inventário do que mantém, customiza ou remove |
| Remover ou ocultar `/signup` | Incompatível com fluxo exclusivo AD | `src/app/(full-width-pages)/(auth)/signup/`, `src/components/auth/SignUpForm.tsx`, `src/proxy.ts` | Indução a erro sobre o modelo de acesso | `/signup` removido; `proxy.ts` apenas com `/signin` público. **Concluído em 2026-05-19.** |
| Documentar rotas demonstráveis | Apresentações precisam de roteiro | [docs/varadouro/mapa-funcional-varadouro.md](mapa-funcional-varadouro.md) | Demos improvisadas e inconsistentes | Lista oficial mantida no mapa funcional |
| Criar checklist de demonstração institucional | Garantir consistência entre demos | `docs/varadouro/checklist-demonstracao.md` (novo) | Cada apresentação repete preparação | Checklist único com pré-flight: ambiente, dados de teste, ordem das telas, ressalvas a falar |

**Status da fase:** parcialmente concluída. Itens pendentes: revisão TailAdmin, documentação de rotas demonstráveis (parcial via mapa funcional), criação do checklist.

---

## 3. Fase 2 — Dados e painéis críticos do gabinete

**Objetivo:** fortalecer os painéis com maior valor imediato para o controle externo.

| Painel/Funcionalidade | Valor para o gabinete | Situação atual | Melhoria necessária | Prioridade | Critério de aceite |
|---|---|---|---|---|---|
| **Alertas do Gabinete** | Visão única de "onde olhar primeiro" | Agregador multi-fonte funcional | Personalização por conselheiro + ordenação por risco/materialidade | Alta | Conselheiro vê alertas filtrados por sua área de relatoria |
| **Painel Despesa** | Materialidade e concentração orçamentária | Dados reais; ranking ente/credor | Drilldown por elemento de despesa + indicador de variação anômala | Alta | Variação ≥ X% destacada automaticamente |
| **Pesquisa de Credores** | Rastreio do recurso público até o beneficiário | Implementado com enriquecimento CNPJ parcial | Concluir enriquecimento BrasilAPI + alerta de concentração | Alta | Top-N credores com sinalização de risco visível |
| **SICONFI (RREO/RGF/Extrato)** | Situação fiscal oficial dos municípios | Implementado | Ampliar cobertura RGF estadual + ocorrências priorizadas | Alta | Estado e 22 municípios com RGF do último quadrimestre |
| **CAUC** | Risco de bloqueio de transferências | Implementado | Histórico mensal de mudanças de status + alerta de novo bloqueio | Alta | Painel exibe entrada/saída de municípios da lista |
| **Remessas** | Pendências de envio contábil | Calendário + alertas | Personalização por jurisdicionado e por relator | Média | Filtros por conselheiro e por entidade |
| **Pautas de Julgamento** | Preparação executiva das sessões | Implementado | Indicadores executivos da sessão (volume, materialidade, recorrência) | Alta | Cabeçalho da sessão com 4–6 KPIs |
| **Processos eProcess** | Acesso direto a processos, movimentações e PDFs | Implementado; servidor PDF em IP fixo | Proxy reverso para servidor PDF + cache local | Média | Frontend não conhece o IP do servidor PDF |
| **Análise IA de Processo** | Leitura técnica acelerada | Cache + descarte + jobs | Métricas de qualidade (concordância, descarte, tempo de revisão) + revisão humana visível | Alta | Painel admin de qualidade IA disponível |
| **Resumo de Pauta** | Preparação executiva da sessão | Implementado | Versão imprimível e versão executiva por relator | Média | Botão "Exportar PDF" funcional |

---

## 4. Fase 3 — Saúde, educação, social e meio ambiente

**Objetivo:** separar o que já é útil do que ainda precisa amadurecer.

| Item | Fonte atual | Problema/Limitação | Caminho recomendado | Demonstração? | Ação mínima para maturidade 4 |
|---|---|---|---|---|---|
| **Mortalidade SIM** | CSV manual (`etl/data/sim/DO22OPEN..DO25OPEN.csv`) | Ingestão sem periodicidade automática | Avaliar API SIM mais recente (ver [docs/mortalidade-inventario.md](../mortalidade-inventario.md)) | Com ressalva | Job ETL automatizado com ano de referência exibido |
| **PNI / Vacinação** | XLSX/CSV manual em `etl/data/pni/cobertura/` | APIs DataSUS CKAN 404 (ver [docs/datasus-inventario.md](../datasus-inventario.md)) | Reavaliar reabertura de APIs trimestralmente | Com ressalva | Automação completa quando API oficial estabilizar |
| **SIOPS** | API DataSUS via ETL | Funcional | Manter; tratar duplicidades pontuais | Sim | — (já em maturidade 4) |
| **SISAGUA** | ETL automatizado | Duplicatas tratadas (ver [docs/fase2a2-diagnostico-duplicatas-sisagua-siconfi.md](../fase2a2-diagnostico-duplicatas-sisagua-siconfi.md)) | Monitorar duplicidades novas | Sim | — (já em maturidade 4) |
| **InfoDengue** | API semanal | Funcional | Alertar mudança de patamar semanal | Sim | — (já em maturidade 4) |
| **Social / MIS** | XLSX manual mensal (Bolsa Família/BPC) | Ingestão manual atrasa indicador | Automatizar coleta SAGI | Com ressalva | Job ETL mensal automatizado |
| **IDEB (Mapa Gabinete Digital)** | Hardcoded nos componentes do mapa | Valor simulado nos 22 municípios | Integrar INEP oficial com ano de referência | **Não** | Mapa exibe IDEB oficial com fonte/ano |
| **Cobertura Florestal** | Estático em `src/data/desmatamentoAcre.ts` | Hardcoded | Integrar PRODES/DETER (INPE) via ETL | **Não** | Painel carrega série oficial atualizada |

---

## 5. Fase 4 — Assistente Aquiry como camada transversal

**Objetivo:** evoluir o Aquiry de copiloto contextual para camada institucional de inteligência do TCE-AC.

| Frente | Estado atual | Evolução recomendada | Risco | Prioridade |
|---|---|---|---|---|
| **Contexto de tela** | Provider React injeta dados da tela atual | Padronizar `contextoTela` por tipo de painel + versionar contratos | Drift entre painéis | Alta |
| **Base de conhecimento versionada** | Markdown em `src/data/aquiry/base-conhecimento/` (fontes, normas, projeto) | Estabelecer processo formal de revisão (responsável, periodicidade, changelog) | Conhecimento desatualizado | Alta |
| **Busca externa** | Multi-provider (Tavily/Brave/SerpAPI/Gemini), opt-in | Definir provider oficial + monitorar custo e qualidade | Risco de fonte não autoritativa | Média |
| **Auditoria** | Apenas metadados em `public.aquiry_evento_uso`, sem conteúdo | Painel administrativo de auditoria (consumo, estratégias, descartes) | Falta de visibilidade institucional do uso | Alta |
| **Histórico de conversas** | Apenas em memória do cliente (10 últimas msgs) | Persistir histórico por usuário (com retenção e expurgo definidos) | Perda de continuidade entre sessões | Média |
| **RAG vetorial futuro** | Lookup atual por regex em `baseConhecimentoAquiry.ts` | Indexação vetorial automática a cada release da base | Tópicos fora dos regexes ficam sem suporte | Alta |
| **Fontes oficiais** | Citação de fontes na resposta (estratégia `busca_externa`) | Prioridade absoluta a fontes oficiais (Tesouro, IBGE, DataSUS, INEP) | Citação de fonte não autoritativa | Alta |
| **Respostas com rastreabilidade** | Auditoria por metadados + origem da resposta | Exibir, na UI, qual base/fonte sustenta cada parágrafo | Resposta sem evidência institucional | Alta |

**Princípio inegociável:** o Aquiry e a IA de processo **não emitem voto, parecer ou juízo de mérito**. Toda resposta é apoio à leitura técnica do conselheiro, com auditoria e descarte disponíveis.

---

## 6. Fase 5 — ETL, observabilidade e qualidade de dados

**Objetivo:** melhorar confiabilidade das cargas e transparência sobre a atualização dos dados.

### 6.1 Iniciativas

- **Logs persistentes do ETL Admin** — substituir log via console do Next por streaming persistido em `audit.etl_log`.
- **Status das cargas** — painel `seguranca/etl` com timeline e sucesso/falha por base.
- **Última atualização por base** — exibir em cada painel a data/hora da última carga consumida.
- **Alertas de falha** — notificação automática para administradores em falha noturna.
- **Qualidade dos dados** — checks automatizados pós-carga (linhas, hashes, faixas plausíveis).
- **Duplicidades** — monitorar continuamente, especialmente SISAGUA e SICONFI ([docs/fase2a2-diagnostico-duplicatas-sisagua-siconfi.md](../fase2a2-diagnostico-duplicatas-sisagua-siconfi.md)).
- **Dependências manuais** — inventariar e priorizar automação (PNI, SIM, MIS).
- **Remoção de Supabase residual** — migrar APC Polanco e receita-publica para destino único Postgres.
- **Padronização de periodicidade** — cada base com periodicidade ideal documentada e monitorada.

### 6.2 Matriz de periodicidade

| Base | Periodicidade ideal | Periodicidade atual | Origem | Problema conhecido | Ação recomendada |
|---|---|---|---|---|---|
| Combustível (NFe Polanco) | Diária | Diária (noturna) | SQL Server APC | Sync residual Supabase | Encerrar destino Supabase |
| Receita Pública | Mensal | Diária (noturna, incremental 3 meses) | SQL Server | Sync residual Supabase | Encerrar destino Supabase |
| Despesa / Empenho | Diária | Diária (noturna) | SQL Server | — | Manter |
| Credor — enriquecimento CNPJ | Sob demanda + diária | Diária (noturna, em 4 steps) | BrasilAPI | Limites de rate | Cache local + retry com backoff |
| Dimensões (ente, entidade, UF, municípios) | Mensal | Diária com auto-bootstrap | CSV + `aux_dim_*` | Drift de schema possível | Checklist operacional de revisão |
| Processos Gabinete / Pauta / eProcess | Diária | Diária (noturna) | SQL Server EJURIS/eProcess | — | Manter |
| SICONFI RREO | Bimestral oficial; ingestão semanal | Diária (incremental) | API SICONFI | Duplicatas pontuais | Monitorar duplicatas |
| SICONFI RGF | Quadrimestral oficial; ingestão semanal | Diária (full) | API SICONFI | Cobertura estadual a ampliar | Ampliar RGF estadual |
| SICONFI Extrato/Entregas | Semanal | Diária (noturna) | API SICONFI | — | Manter |
| CAUC | Semanal | Diária (noturna) | Tesouro Transparente | — | Histórico de mudanças de status |
| SIOPS | Bimestral | Conforme calendário DataSUS | DataSUS | Duplicidades pontuais | Manter monitoramento |
| SISAGUA | Mensal | Conforme DataSUS | DataSUS | Duplicidades históricas | Manter expurgo |
| InfoDengue | Semanal | Semanal | API InfoDengue | — | Manter |
| CNES/UBS (saúde-estrutura) | Mensal | Conforme DataSUS | DataSUS | Divergências cadastrais | Monitorar |
| PNI / Cobertura Vacinal | Mensal | **Manual (XLSX)** | DataSUS (APIs 404) | Automação inviável hoje | Reavaliar trimestralmente |
| Mortalidade SIM | Anual oficial; ingestão trimestral | **Manual (CSV)** | DataSUS | Automação inviável hoje | Avaliar API SIM nova |
| CadÚnico / SAGI | Mensal | **Manual + incremental** | SAGI | Coleta manual | Automatizar coleta SAGI |
| MIS (Bolsa Família/BPC) | Mensal | **Manual (XLSX)** | SAGI/MIS | Coleta manual | Automatizar coleta SAGI |
| Remessas Contábeis | Diária | Diária | Postgres interno | — | Manter |
| População IBGE | Anual | Anual | IBGE | — | Manter |
| Cobertura Florestal | Anual/Mensal | **Estático/hardcoded** | — | Sem fonte oficial integrada | Integrar PRODES/DETER |
| IDEB | Bienal | **Simulado** | — | Sem fonte oficial integrada | Integrar INEP |

---

## 7. Fase 6 — Testes, segurança e produção

**Objetivo:** preparar o Varadouro para operação mais robusta e auditável.

### 7.1 Testes

- **Unitários mínimos (Vitest):** `src/lib/aquiry/*` (classificação de intenção/estratégia, lookup de base), `src/lib/ia/*` (montagem de prompts, hash de cache), `src/lib/auth/*` (autorização, sessão), `src/lib/fontes/siconfi/*`.
- **Fluxo crítico (Playwright):** login AD → home com alertas → abrir Pauta → abrir Análise IA → acionar Aquiry e validar resposta com fonte.

### 7.2 Validação de variáveis de ambiente

- Boot do Next valida presença e formato de: `DATABASE_URL`/`PG*`, `AZURE_OPENAI_*`, `AD_LDAP_URL`, `AD_DOMAIN_PREFIX`, `AUTH_SESSION_SECRET`, `REPOSITORIO_BASE_URL`.
- Falha explícita e imediata se variável crítica estiver ausente.

### 7.3 CI/CD

- GitHub Actions com gates: lint, build, testes, checagem de migrations.
- Bloqueio de merge sem testes verdes.

### 7.4 Auditoria e segurança

- **Auditoria de login** — registrar sucesso/falha LDAP com IP e horário em `audit.login_log` (novo).
- **Logs de ações administrativas** — gestão de usuários, disparo manual de ETL, configuração ETL.
- **Proteção de endpoints** — todos os `/api/*` validam sessão; admin valida `requireAdminSession`.
- **Controle de permissões por perfil** — separar perfis (admin, conselheiro, assessor, auditor) e mapear permissões finas (visualização por área de relatoria).

---

## 8. Ordem recomendada das próximas 10 ações

| # | Ação | Por que fazer agora | Arquivos prováveis | Critério de pronto |
|---|---|---|---|---|
| 1 | **Encerrar dívida Supabase residual** | Único bloqueio para migração final a Postgres-only; reduz superfície de risco e custo | `etl/jobs/apc-polanco*.ts`, `etl/jobs/receita-publica*.ts`, `etl/connectors/supabase.ts`, `.env.example` | Pipeline noturno roda sem variáveis `SUPABASE_*`; marts equivalentes em Postgres validados |
| 2 | **Criar testes mínimos das libs críticas** | Sem testes hoje; risco em cada deploy | `src/lib/aquiry/__tests__/`, `src/lib/ia/__tests__/`, `src/lib/auth/__tests__/`, `package.json` | Suite Vitest verde local; cobertura ≥ 60% nas libs críticas |
| 3 | **Configurar CI/CD (GitHub Actions)** | Garante que itens 1 e 2 não regridam | `.github/workflows/ci.yml` (novo) | PRs travam sem lint, build e testes verdes |
| 4 | **Persistir logs do ETL Admin em `audit.etl_log`** | Logs hoje são voláteis (console); UI admin precisa do streaming | `src/app/api/admin/etl/executar/route.ts`, `src/components/seguranca/EtlStatusClient.tsx` | Logs visíveis em tempo real na UI e armazenados em DB |
| 5 | **Integrar IDEB real (INEP)** no Mapa Gabinete Digital | Painel hoje é simulado e não pode ser demonstrado | `src/components/Maps/MapaAcreContent.tsx`, `etl/jobs/ideb-inep-*.ts` (novo), nova tabela `dw.fato_ideb` | Mapa exibe IDEB oficial com ano/fonte; painel é demonstrável |
| 6 | **Avaliar e migrar Mortalidade SIM para API atual** | Hoje depende de CSV manual; consultar [docs/mortalidade-inventario.md](../mortalidade-inventario.md) | `etl/jobs/sim-api-*.ts`, `etl/jobs/mortalidade-*.ts` | Job ETL automatizado; painel exibe data da última carga |
| 7 | **Validação de variáveis de ambiente no boot** | Hoje, ausência de `AZURE_OPENAI_*` falha silenciosamente em runtime | `src/lib/env.ts` (novo), `src/app/(admin)/layout.tsx`, `instrumentation.ts` | Boot falha explicitamente com mensagem clara |
| 8 | **Personalização da Central de Alertas por conselheiro** | Maior valor percebido pelo gabinete | `src/components/alertas-gabinete/*`, `src/app/api/alertas-gabinete/route.ts`, nova tabela `public.gabinete_relatoria` | Conselheiro vê alertas filtrados por área de relatoria |
| 9 | **Painel administrativo de auditoria do Aquiry** | Auditoria existe em DB mas sem visualização institucional | `src/app/(admin)/seguranca/aquiry/page.tsx` (novo), consultas em [docs/aquiry/sql/auditoria-aquiry-consultas.sql](../aquiry/sql/auditoria-aquiry-consultas.sql) | Painel exibe consumo, estratégias e descartes por período |
| 10 | **Proxy reverso para o servidor PDF do eProcess** | Frontend não deve conhecer IP interno `172.20.12.105:8090` | `src/app/api/processos/[processoId]/arquivos/[arquivoId]/pdf/route.ts`, `next.config.ts` | Frontend acessa PDF via endpoint próprio; IP pode mudar sem rebuild |

---

## 9. Riscos principais

| Risco | Cenário | Mitigação |
|---|---|---|
| **Dado defasado** | Base saúde/social com ingestão manual atrasa frente ao período exibido | Exibir data da última carga em cada painel; alertar quando ultrapassar SLA |
| **Painel demonstrado com dado simulado** | IDEB ou cobertura florestal apresentados como oficiais | Manter ressalvas explícitas no mapa funcional; bloquear demos até maturidade 4 |
| **IA sem fonte rastreável** | Aquiry responde sem citar base/fonte | Princípio "respostas com rastreabilidade" (Fase 4); auditoria por metadados |
| **Carga manual esquecida** | PNI/SIM/MIS deixam de ser atualizados | Alerta automático quando última carga > SLA; responsável nomeado no checklist operacional |
| **Erro em análise de processo** | IA gera análise com viés ou erro técnico | Descarte/regeneração visíveis; revisão humana; métricas de concordância |
| **Dependência de IP interno fixo** | Servidor PDF (`172.20.12.105:8090`) muda de IP | Proxy reverso ou serviço dedicado (ação #10) |
| **Ausência de teste** | Regressões silenciosas a cada deploy | Vitest + Playwright + CI (ações #2 e #3) |
| **Logs insuficientes** | ETL manual ou erro de IA sem rastro institucional | Logs persistentes (`audit.*`), painel admin de auditoria do Aquiry |
| **Dependência Supabase residual** | Custo, exposição e fragilidade de duas tabelas | Encerramento total (ação #1) |
| **Aquiry com lookup por regex** | Tópicos fora dos padrões previstos ficam sem suporte | Migração para RAG vetorial (Fase 4) |

---

## 10. Resumo executivo

O Varadouro Digital Aquiry consolidou, em sua versão atual, mais de vinte painéis temáticos integrados a bases oficiais e ao eProcess do TCE-AC, sob autenticação Active Directory e auditoria em todas as camadas, com um copilot institucional — o **Aquiry** — atuando como camada transversal de inteligência.

Este plano organiza a evolução em seis fases, todas orientadas pela pergunta **"onde o gabinete do conselheiro deve olhar primeiro?"**. A **Fase 1** (consolidação institucional e técnica) já está parcialmente concluída em 2026-05-19, com a reescrita do `README.md` e `CLAUDE.md`, a documentação completa do `.env.example` e a remoção da página `/signup` herdada do template. A **Fase 2** fortalece os painéis críticos do gabinete (Alertas, Despesa, Credores, SICONFI, CAUC, Pautas, IA de Processo). A **Fase 3** trata, com cautela, das áreas temáticas ainda dependentes de ingestão manual ou dados simulados (IDEB, cobertura florestal, PNI, SIM, MIS). A **Fase 4** evolui o Aquiry com RAG vetorial, fontes oficiais e rastreabilidade explícita por resposta. A **Fase 5** trata da confiabilidade do ETL, observabilidade e qualidade dos dados, incluindo o encerramento da dívida Supabase residual. A **Fase 6** prepara o sistema para operação robusta, com testes automatizados, CI/CD, auditoria de login, logs administrativos e controle fino de permissões por perfil.

As **próximas dez ações** priorizam impacto imediato sobre o gabinete e reduzem dívida técnica acumulada: encerrar Supabase, criar testes mínimos, configurar CI/CD, persistir logs do ETL Admin, integrar IDEB oficial, automatizar Mortalidade SIM, validar variáveis no boot, personalizar a Central de Alertas, criar painel admin de auditoria do Aquiry e desacoplar o servidor PDF do IP interno. Executadas em ordem, conduzem o Varadouro do estado atual de "plataforma demonstrável com pontos de cautela" para "plataforma de uso institucional cotidiano do controle externo do TCE-AC", com risco, materialidade, processos e qualidade dos dados sob controle.
