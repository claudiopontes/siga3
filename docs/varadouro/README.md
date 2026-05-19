# Documentação do Varadouro Digital Aquiry

> Índice oficial da documentação institucional e funcional do Varadouro Digital Aquiry — TCE-AC.
> Data de referência: 2026-05-19.

---

## 1. Finalidade desta documentação

Esta pasta reúne os documentos de referência do **Varadouro Digital Aquiry**, voltados à compreensão funcional do sistema, ao planejamento técnico de sua evolução, à condução de demonstrações institucionais e ao apoio direto aos gabinetes dos conselheiros do **Tribunal de Contas do Estado do Acre (TCE-AC)**.

A documentação aqui mantida é a fonte de verdade compartilhada entre as equipes envolvidas no projeto. Deve ser consultada antes de decisões de priorização, antes de apresentações institucionais e antes de mudanças relevantes de escopo. Não substitui a documentação técnica de código ([CLAUDE.md](../../CLAUDE.md), [README.md](../../README.md), [HANDOFF.md](../../HANDOFF.md), [TODO.md](../../TODO.md)), mas complementa-a com o olhar funcional, executivo e institucional.

---

## 2. Visão geral do Varadouro

O Varadouro Digital Aquiry é uma **plataforma de inteligência para o controle externo do TCE-AC**, orientada pela pergunta-guia que organiza todas as decisões de produto, técnica e demonstração:

> **"Onde o gabinete do conselheiro deve olhar primeiro?"**

A plataforma se organiza ao redor dos seguintes eixos:

- **Risco** — alertas que indicam exposição imediata (fiscal, sanitária, cadastral, contábil).
- **Materialidade** — concentração de recursos públicos, fornecedores e jurisdicionados.
- **Alertas** — sinalização ativa, priorizada e auditável para o gabinete.
- **Processos** — integração nativa com o eProcess do TCE-AC.
- **Pautas de julgamento** — preparação executiva da sessão.
- **Fornecedores/credores** — rastreio do recurso público até o beneficiário.
- **Situação fiscal dos jurisdicionados** — adimplência (CAUC), execução (SICONFI/RREO/RGF) e qualidade dos envios (Remessas).
- **Qualidade e atualização dos dados** — fontes oficiais, periodicidade documentada, ETL versionado.
- **Apoio institucional por IA** — Assistente Aquiry e análise IA de processo, com auditoria por metadados e princípio inegociável de que **não emitem voto, parecer ou juízo de mérito**.

---

## 3. Documentos principais

| Documento | Caminho | Finalidade | Quando usar |
|---|---|---|---|
| **Mapa Funcional do Varadouro** | [mapa-funcional-varadouro.md](mapa-funcional-varadouro.md) | Explica as áreas, rotas, painéis, APIs, funcionalidades de IA, ETLs, maturidade e lacunas do sistema | Para entender o que existe hoje, o que está maduro, o que é parcial e o que não deve ser demonstrado |
| **Plano de Evolução do Varadouro** | [plano-evolucao-varadouro.md](plano-evolucao-varadouro.md) | Organiza a evolução do sistema em fases, prioridades, riscos, critérios de pronto e próximas ações | Para planejar desenvolvimento, priorização técnica e amadurecimento institucional do sistema |
| **Roteiro de Demonstração Institucional** | [roteiro-demonstracao-institucional.md](roteiro-demonstracao-institucional.md) | Define como demonstrar o Varadouro para conselheiros, gabinetes, equipe técnica e TI, evitando funcionalidades frágeis | Antes de apresentações, reuniões institucionais, validações com gabinete ou demonstrações internas |

### Documentação técnica complementar (fora desta pasta)

| Documento | Caminho | Finalidade |
|---|---|---|
| Contexto técnico do projeto | [../../CLAUDE.md](../../CLAUDE.md) | Arquitetura, módulos, padrões, integrações e variáveis de ambiente |
| README institucional | [../../README.md](../../README.md) | Apresentação, stack, instalação e scripts |
| Handoff técnico | [../../HANDOFF.md](../../HANDOFF.md) | Estado atual e ponto de retomada |
| Backlog priorizado | [../../TODO.md](../../TODO.md) | Itens P0/P1/P2 ativos e concluídos |
| Auditoria do Aquiry | [../aquiry/auditoria-assistente-aquiry.md](../aquiry/auditoria-assistente-aquiry.md) | Princípios e schema da auditoria |
| Checklist MVP do Aquiry | [../aquiry/checklist-mvp-assistente-aquiry.md](../aquiry/checklist-mvp-assistente-aquiry.md) | Critérios MVP |
| Roteiro de testes do Aquiry | [../aquiry/roteiro-testes-assistente-aquiry.md](../aquiry/roteiro-testes-assistente-aquiry.md) | Roteiro técnico |
| Inventários DataSUS / Mortalidade / PNI | [../datasus-inventario.md](../datasus-inventario.md), [../mortalidade-inventario.md](../mortalidade-inventario.md), [../pni-inventario.md](../pni-inventario.md) | Viabilidade e estado das APIs públicas |
| Diagnósticos de ETL | [../fase2a-diagnostico-etl.md](../fase2a-diagnostico-etl.md), [../fase2a2-diagnostico-duplicatas-sisagua-siconfi.md](../fase2a2-diagnostico-duplicatas-sisagua-siconfi.md), [../fase2b2-diagnostico-auditoria-etl.md](../fase2b2-diagnostico-auditoria-etl.md) | Diagnósticos técnicos por fase |
| Operação Postgres local | [../postgres-local.md](../postgres-local.md) | Subida do banco em Docker |

---

## 4. Como usar esta documentação

### 4.1 Desenvolvedor

- **Ler primeiro:** [CLAUDE.md](../../CLAUDE.md), [README.md](../../README.md), [mapa-funcional-varadouro.md](mapa-funcional-varadouro.md), [plano-evolucao-varadouro.md](plano-evolucao-varadouro.md).
- **Objetivo:** entender arquitetura, convenções, módulos existentes e priorização atual antes de abrir um PR.

### 4.2 Gestor do projeto

- **Ler primeiro:** [mapa-funcional-varadouro.md](mapa-funcional-varadouro.md), [plano-evolucao-varadouro.md](plano-evolucao-varadouro.md), [TODO.md](../../TODO.md).
- **Objetivo:** ter a visão de maturidade por área, fases de evolução, riscos e ordem prática das próximas ações.

### 4.3 Chefe de gabinete

- **Ler primeiro:** seções 1 e 2 deste README, seções 1–2 do [mapa funcional](mapa-funcional-varadouro.md) e o [roteiro de demonstração](roteiro-demonstracao-institucional.md).
- **Objetivo:** entender o que o sistema entrega ao gabinete hoje e preparar a interação com o conselheiro.

### 4.4 Conselheiro

- **Ler primeiro:** seções 1, 2 e 5 deste README e o [roteiro de demonstração](roteiro-demonstracao-institucional.md).
- **Objetivo:** compreender, em alto nível, o valor institucional do sistema e o que pode ser solicitado ao gabinete.

### 4.5 Equipe de dados / ETL

- **Ler primeiro:** seção 6 do [plano de evolução](plano-evolucao-varadouro.md) (matriz de periodicidade), [fase2a-diagnostico-etl.md](../fase2a-diagnostico-etl.md), [fase2a2-diagnostico-duplicatas-sisagua-siconfi.md](../fase2a2-diagnostico-duplicatas-sisagua-siconfi.md), [datasus-inventario.md](../datasus-inventario.md), [mortalidade-inventario.md](../mortalidade-inventario.md), [pni-inventario.md](../pni-inventario.md).
- **Objetivo:** entender periodicidades ideais vs atuais, problemas conhecidos por base e o plano de remoção da dependência Supabase residual.

### 4.6 Equipe de IA

- **Ler primeiro:** Fase 4 do [plano de evolução](plano-evolucao-varadouro.md), [auditoria-assistente-aquiry.md](../aquiry/auditoria-assistente-aquiry.md), [checklist-mvp-assistente-aquiry.md](../aquiry/checklist-mvp-assistente-aquiry.md), [roteiro-testes-assistente-aquiry.md](../aquiry/roteiro-testes-assistente-aquiry.md), base documental versionada em [`src/data/aquiry/base-conhecimento/`](../../src/data/aquiry/base-conhecimento/).
- **Objetivo:** compreender contexto de tela, estratégias de resposta, auditoria, princípios de rastreabilidade e roadmap para RAG vetorial.

---

## 5. Funcionalidades centrais do Varadouro

Resumo das funcionalidades hoje em maturidade adequada para uso institucional (detalhes em [mapa-funcional-varadouro.md](mapa-funcional-varadouro.md)):

- **Central de Alertas do Gabinete** — ponto único de priorização da rotina (`/`).
- **Painéis de Despesa e Credores** — materialidade orçamentária e drilldown por CPF/CNPJ.
- **SICONFI (RREO/RGF/Extrato)** — execução orçamentária e entregas oficiais do Tesouro.
- **CAUC** — situação fiscal/cadastral dos municípios e risco de bloqueio de repasses.
- **Remessas Contábeis** — calendário e alertas de envio.
- **Pautas de Julgamento** — preparação executiva das sessões.
- **eProcessos CE** — acesso a processos, movimentações, sessões e PDFs originais.
- **Análise IA de Processo** — leitura técnica organizada, cacheada, versionada e descartável.
- **Resumo de Pauta** — visão consolidada da sessão.
- **Assistente Aquiry** — copilot institucional contextual com base documental versionada e auditoria por metadados.
- **Administração de ETL** — disparo manual, status e configuração de cargas, com advisory lock Postgres.
- **Segurança e usuários** — autenticação Active Directory e autorização em tabela institucional.

---

## 6. Funcionalidades que exigem cautela

Áreas existentes que não devem ser apresentadas como maduras enquanto não atenderem aos critérios de maturidade descritos no [mapa funcional](mapa-funcional-varadouro.md) e no [plano de evolução](plano-evolucao-varadouro.md):

- **Mapa IDEB**, enquanto os valores estiverem simulados nos componentes.
- **Cobertura Florestal**, enquanto os dados estiverem hardcoded em `src/data/desmatamentoAcre.ts`.
- **PNI / Vacinação**, enquanto depender de ingestão manual por XLSX/CSV.
- **Mortalidade SIM**, enquanto depender de CSV manual e não houver migração para a API atual.
- **Social / MIS**, enquanto depender de XLSX mensal manual.
- **Painel Receita Pública**, enquanto estiver em estabilização na branch atual.
- **Telas administrativas de ETL**, fora do público técnico apropriado.
- **Qualquer tela herdada do template TailAdmin** que não faça parte do fluxo institucional do TCE-AC.

> Nota: a página `/signup` herdada do template foi **removida em 2026-05-19**. O acesso é exclusivamente institucional, via Active Directory + autorização em `usuarios_autorizados`.

---

## 7. Princípios de evolução

Princípios inegociáveis que orientam o desenvolvimento, a documentação e as demonstrações:

1. **Não demonstrar dado simulado como dado oficial.** Áreas em ressalva permanecem fora de demonstrações institucionais até atingirem maturidade adequada.
2. **Priorizar fontes oficiais.** Tesouro, IBGE, DataSUS, INEP, INPE, eProcess e dados internos auditáveis têm precedência sobre fontes secundárias.
3. **Mostrar atualização dos dados.** Cada painel deve expor a data/hora da última carga consumida.
4. **Preservar rastreabilidade.** Respostas da IA devem citar base/fonte; auditoria por metadados é obrigatória; descarte e regeneração da análise IA devem permanecer visíveis.
5. **IA apoia, não decide.** Assistente Aquiry e análise IA de processo organizam leitura técnica; **nunca emitem voto, parecer ou juízo de mérito**.
6. **Evitar conclusão jurídica automática.** Saídas IA são insumos para revisão humana, não instrumentos oficiais.
7. **Priorizar valor para o gabinete.** A pergunta-guia ("onde o gabinete deve olhar primeiro?") orienta todas as decisões.
8. **Amadurecer observabilidade das cargas.** Logs persistentes, alertas de falha e qualidade de dados são prioridade contínua.
9. **Documentar limitações.** Lacunas e dependências manuais são registradas com transparência, nunca ocultadas.

---

## 8. Próximos documentos sugeridos

Documentos planejados para ampliar e fortalecer a documentação institucional:

- **Matriz de fontes de dados** — catálogo completo das fontes (oficiais e internas), responsáveis e SLA de atualização.
- **Catálogo de APIs internas** — inventário dos 107 endpoints em `src/app/api/`, com método, finalidade, integrações e perfil de acesso.
- **Manual do Assistente Aquiry** — orientações ao usuário institucional sobre como interagir com o Aquiry, perguntas adequadas e limitações.
- **Guia de operação do ETL** — procedimentos para administração, execução manual, monitoramento e recuperação de falhas.
- **Política de uso da IA** — regras institucionais de uso, retenção, auditoria e limites das funcionalidades de IA.
- **Matriz de riscos dos painéis** — risco por painel (técnico, reputacional, jurídico), mitigações e responsáveis.
- **Checklist de entrada em produção** — pré-flight técnico e institucional para releases relevantes.

---

## 9. Manutenção desta documentação

- **Atualizar este README** sempre que um novo documento for criado nesta pasta.
- **Atualizar o [mapa funcional](mapa-funcional-varadouro.md)** sempre que uma nova área, rota, API ou integração for adicionada ou removida.
- **Atualizar o [plano de evolução](plano-evolucao-varadouro.md)** quando prioridades mudarem, fases concluírem ou novos riscos forem identificados.
- **Atualizar o [roteiro de demonstração](roteiro-demonstracao-institucional.md)** antes de apresentações relevantes, retirando ressalvas já superadas e ajustando o checklist.
- **Registrar limitações conhecidas em vez de escondê-las.** Transparência sobre lacunas é parte do compromisso institucional do Varadouro.
- **Datar revisões.** Sempre que possível, manter a "Data de referência" no topo de cada documento atualizada.
- **Manter coerência entre documentos.** Quando um item muda (ex.: maturidade de um painel, conclusão de uma fase), refletir a mudança nos três documentos principais e neste índice.
