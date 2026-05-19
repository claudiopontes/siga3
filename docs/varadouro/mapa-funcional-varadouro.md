# Mapa Funcional do Varadouro Digital Aquiry

> Documento executivo para apresentação interna, priorização de desenvolvimento e preparação de demonstrações.
> Data de referência: 2026-05-19.

---

## 1. Visão institucional

O **Varadouro Digital Aquiry** é a plataforma de inteligência de apoio aos gabinetes dos conselheiros do **Tribunal de Contas do Estado do Acre (TCE-AC)**. Sua finalidade é concentrar, em um único ambiente seguro e auditável, os instrumentos analíticos necessários para o exercício do controle externo: visão consolidada de **risco**, **materialidade**, **processos em julgamento**, **alertas de fiscalização**, **qualidade dos dados** dos jurisdicionados e indicadores temáticos prioritários (fiscal, saúde, social, ambiental).

A plataforma é orientada a três princípios:

1. **Foco no gabinete do conselheiro** — interfaces e alertas pensados para a rotina decisória, não para o usuário operacional.
2. **Dados oficiais e rastreáveis** — todas as informações são originadas em fontes autoritativas (SQL Server institucional, SICONFI/Tesouro, IBGE, DataSUS, eProcess/EJURIS, AD), com ETL versionado e auditoria.
3. **Inteligência aumentada com responsabilidade** — o **Assistente Aquiry** e a **análise IA de processos** apoiam a leitura técnica do conselheiro, **sem substituir voto, parecer ou juízo de mérito**, com auditoria de uso e base documental institucional versionada.

O Varadouro não é um portal de transparência genérico. É uma ferramenta de **controle externo**, focada em **onde o gabinete deve olhar primeiro**.

---

## 2. Macroáreas do sistema

### 2.1 Gabinete e Alertas

- **Finalidade:** centralizar, na home do conselheiro, os alertas mais relevantes do dia (fiscais, contábeis, de saúde, de envio de remessas, de estrutura).
- **Principais funcionalidades:** Central de Alertas do Gabinete (`/`), agregador `/api/alertas-gabinete`, alertas transversais SIOPS/SICONFI/SISAGUA/Vigilância/Saúde-Estrutura.
- **Público-alvo:** conselheiros e chefias de gabinete.
- **Maturidade:** 4/5.
- **Demonstrável hoje:** **sim**.

### 2.2 Processos e Pautas

- **Finalidade:** instrumentar a preparação de sessões e a análise individual de processos do TCE-AC.
- **Principais funcionalidades:** lista de pautas abertas, detalhe de sessão, lista/detalhe/análise IA de processos eProcess, ingestão de PDFs originais, descarte/regeneração de análises, jobs assíncronos de geração em lote.
- **Público-alvo:** conselheiros, assessores técnicos e secretarias de sessão.
- **Maturidade:** 4/5.
- **Demonstrável hoje:** **sim**.

### 2.3 Assistente Aquiry e IA

- **Finalidade:** copilot institucional contextual, integrado a cada tela, com base documental do TCE-AC, busca externa controlada e auditoria.
- **Principais funcionalidades:** chat com contexto da tela, classificação de intenção/estratégia, base de conhecimento versionada em Markdown, busca externa multi-provider (Tavily/Brave/SerpAPI/Gemini), análise IA de processo, resumo de pauta, relatório consolidado, descarte e regeneração.
- **Público-alvo:** conselheiros, assessores e auditores.
- **Maturidade:** 4/5.
- **Demonstrável hoje:** **sim**.

### 2.4 Orçamento, Receita e Despesa

- **Finalidade:** acompanhar a execução orçamentária dos jurisdicionados com foco em materialidade e ranking de credores.
- **Principais funcionalidades:** Painel Despesa, ranking de entes/credores, pesquisa de credores por CPF/CNPJ, drilldown por credor, Painel Receita Pública, Painel Combustível (NFe Polanco) e empenhos cruzados.
- **Público-alvo:** conselheiros, auditores e relatores.
- **Maturidade:** 4/5 (despesa, receita e combustível); receita ainda em estabilização na branch atual.
- **Demonstrável hoje:** **sim** (despesa, credores, combustível, SICONFI). Receita pública: demonstração interna apenas.

### 2.5 Saúde

- **Finalidade:** monitorar indicadores sanitários e orçamentários da saúde pública estadual e municipal.
- **Principais funcionalidades:** SIOPS (orçamento), SISAGUA (qualidade da água), InfoDengue/SINAN (vigilância), PNI (cobertura vacinal), SIM (mortalidade).
- **Público-alvo:** conselheiros e relatores de processos de saúde.
- **Maturidade:** 4/5 para SIOPS, SISAGUA, InfoDengue. 3/5 para PNI e SIM (ingestão manual via CSV/XLSX).
- **Demonstrável hoje:** **parcial** — SIOPS, SISAGUA e InfoDengue podem ser demonstrados. PNI e SIM apenas com ressalva sobre origem dos dados.

### 2.6 Educação

- **Finalidade:** visão territorial e qualitativa da educação básica (IDEB).
- **Principais funcionalidades:** Mapa IDEB por município do Acre (`/gabinete-digital/mapa`).
- **Público-alvo:** conselheiros relatores de processos educacionais.
- **Maturidade:** 2/5 — IDEB ainda simulado nos componentes.
- **Demonstrável hoje:** **não** — não apresentar como dado oficial.

### 2.7 Social

- **Finalidade:** acompanhar vulnerabilidade social, CadÚnico e transferências (Bolsa Família/BPC) por município.
- **Principais funcionalidades:** Painel Social, mapa social, série temporal MIS, ranking municipal.
- **Público-alvo:** conselheiros relatores de processos sociais e socioeconômicos.
- **Maturidade:** 3/5 — ingestão de MIS via XLSX manual.
- **Demonstrável hoje:** **sim**, com ressalva sobre periodicidade de atualização.

### 2.8 Fiscal — SICONFI e CAUC

- **Finalidade:** transparência da execução orçamentária e situação fiscal dos municípios (capacidade de pagamento).
- **Principais funcionalidades:** RREO bimestral, RGF quadrimestral, extrato de entregas, ocorrências, painel CAUC com alertas.
- **Público-alvo:** conselheiros, relatores de contas e auditores fiscais.
- **Maturidade:** 4/5.
- **Demonstrável hoje:** **sim**.

### 2.9 Meio Ambiente

- **Finalidade:** acompanhar cobertura florestal e desmatamento no Acre.
- **Principais funcionalidades:** Painel de Cobertura Florestal, mapa e séries.
- **Público-alvo:** conselheiros relatores de processos ambientais.
- **Maturidade:** 2/5 — dados estáticos hardcoded em `src/data/desmatamentoAcre.ts`.
- **Demonstrável hoje:** **não** — não apresentar como dado oficial.

### 2.10 Remessas e Obrigações

- **Finalidade:** acompanhar o calendário de envio de informações contábeis pelos jurisdicionados.
- **Principais funcionalidades:** Calendário de Remessas, alertas de atraso, status consolidado.
- **Público-alvo:** secretarias de controle externo e gabinete.
- **Maturidade:** 4/5.
- **Demonstrável hoje:** **sim**.

### 2.11 Administração, Segurança e ETL

- **Finalidade:** gerir usuários autorizados, monitorar e operar as cargas ETL.
- **Principais funcionalidades:** Gestão de Usuários, Status ETL, Configuração ETL, disparo manual com lock concorrente (advisory lock), auditoria em `audit.etl_log`.
- **Público-alvo:** administradores do sistema.
- **Maturidade:** 3/5 — funciona, mas logs de execução manual ainda são voláteis (console do Next).
- **Demonstrável hoje:** **sim**, apenas em ambiente técnico/administrativo.

---

## 3. Funcionalidades demonstráveis

Funcionalidades aptas a integrar uma demonstração oficial.

### 3.1 Assistente Aquiry

- **Objetivo:** mostrar a capacidade de o sistema responder, no contexto da tela atual, com base institucional e auditoria.
- **Roteiro curto:**
  1. Abrir um painel (ex.: SICONFI/RREO de um município).
  2. Acionar o Aquiry e perguntar: "Quais riscos fiscais esse município apresenta neste bimestre?".
  3. Mostrar resposta contextual, citação de fonte e a auditoria de metadados.
- **Mensagem institucional:** o Aquiry é um apoio à leitura técnica, com base documental do TCE-AC, e **não substitui o juízo do conselheiro**.

### 3.2 Central de Alertas do Gabinete

- **Objetivo:** entregar a visão única de "onde olhar primeiro".
- **Roteiro curto:** abrir a home, percorrer os blocos de alertas (fiscal, saúde, remessas, estrutura), abrir um detalhe e navegar até o painel de origem.
- **Mensagem institucional:** o gabinete passa a contar com um ponto único de priorização da rotina decisória.

### 3.3 Painel Despesa

- **Objetivo:** evidenciar consumo orçamentário consolidado por ente/entidade.
- **Roteiro curto:** filtrar ano e ente, mostrar ranking de credores e evolução mensal, abrir composição.
- **Mensagem institucional:** materialidade e concentração visíveis em segundos.

### 3.4 Pesquisa de Credores

- **Objetivo:** drilldown completo por CPF/CNPJ.
- **Roteiro curto:** buscar um CNPJ relevante, abrir detalhe do credor, mostrar empenhos por ente/ano.
- **Mensagem institucional:** o sistema permite seguir o recurso público até o beneficiário final.

### 3.5 SICONFI (RREO/RGF/Extrato)

- **Objetivo:** acompanhar execução e situação fiscal dos municípios em dados oficiais do Tesouro.
- **Roteiro curto:** abrir painel SICONFI, mostrar RREO de um município, alertar entregas pendentes, abrir RGF.
- **Mensagem institucional:** o controle externo do TCE-AC dialoga diretamente com a base oficial do Tesouro Nacional.

### 3.6 CAUC

- **Objetivo:** mostrar situação de adimplência/cadastro dos municípios.
- **Roteiro curto:** abrir painel CAUC, destacar municípios em alerta e o impacto sobre repasses.
- **Mensagem institucional:** identificação imediata de jurisdicionados em risco de bloqueio de transferências.

### 3.7 Pautas de Julgamento

- **Objetivo:** preparar a sessão a partir da pauta oficial.
- **Roteiro curto:** abrir lista de sessões abertas, entrar em uma sessão, percorrer processos e abrir o resumo de pauta.
- **Mensagem institucional:** o tempo do conselheiro deixa de ser gasto em organização e passa a ser concentrado na análise.

### 3.8 Análise IA de Processo

- **Objetivo:** gerar uma análise sucinta e auditável de um processo da pauta.
- **Roteiro curto:** dentro de uma sessão, abrir um processo, acionar a análise IA, mostrar HTML do relatório, mostrar descarte/regeneração.
- **Mensagem institucional:** a IA é cacheada, versionada e descartável; **nunca emite voto ou parecer**, apenas organiza a leitura técnica.

### 3.9 Resumo de Pauta

- **Objetivo:** entregar a leitura agregada da sessão antes do colegiado.
- **Roteiro curto:** acionar resumo de pauta, mostrar relatório consolidado HTML, permitir descarte.
- **Mensagem institucional:** preparação executiva da sessão em minutos.

### 3.10 eProcessos

- **Objetivo:** acessar processo, movimentações, sessões e PDFs originais.
- **Roteiro curto:** abrir lista de processos, filtrar por relator/órgão, abrir um processo e visualizar o PDF.
- **Mensagem institucional:** integração nativa com o eProcess do TCE-AC.

---

## 4. Funcionalidades que exigem cautela

Não devem ser apresentadas como funcionalidades maduras em demonstração oficial.

### 4.1 Mapa IDEB

- **Problema atual:** valores de IDEB e população dos 22 municípios estão **simulados** nos componentes de mapa.
- **Risco de demonstração:** publicar valores oficiosos como se fossem oficiais.
- **Ação necessária:** integrar fonte INEP oficial, com ano de referência exibido, e validar com a área de educação do TCE-AC.

### 4.2 Cobertura Florestal

- **Problema atual:** dados estáticos em `src/data/desmatamentoAcre.ts`.
- **Risco de demonstração:** divergência com fontes oficiais (PRODES/DETER/INPE).
- **Ação necessária:** integrar série oficial via ETL e exibir fonte/ano.

### 4.3 PNI / Vacinação

- **Problema atual:** ingestão via XLSX manual em `etl/data/pni/cobertura/`; APIs DataSUS CKAN majoritariamente 404.
- **Risco de demonstração:** dado desatualizado frente ao período exibido.
- **Ação necessária:** monitorar reabertura das APIs DataSUS e, quando viável, automatizar; até lá, evidenciar o ano de referência no painel.

### 4.4 Mortalidade (SIM) com CSV manual

- **Problema atual:** ingestão por arquivos `DO22OPEN..DO25OPEN.csv` baixados manualmente.
- **Risco de demonstração:** sugerir periodicidade automática que não existe.
- **Ação necessária:** avaliar API SIM mais recente (ver `docs/mortalidade-inventario.md`) e migrar para ingestão automatizada.

### 4.5 Social / MIS

- **Problema atual:** XLSX mensais do MIS baixados manualmente.
- **Risco de demonstração:** indicador atrasado frente ao mês corrente.
- **Ação necessária:** automatizar coleta SAGI quando possível.

### 4.6 Página `/signup` herdada do template

- **Problema atual:** já **removida** em 2026-05-19. O sistema é restrito a usuários autorizados em `usuarios_autorizados` com login AD.
- **Risco de demonstração:** menção a "cadastro público" induz erro sobre o modelo de acesso.
- **Ação necessária:** garantir que materiais de apresentação não citem cadastro; reforçar que o acesso é institucional, controlado por AD e tabela de autorização.

---

## 5. Funcionalidades estratégicas para o gabinete

Reorganização das funcionalidades pela pergunta central: **"onde o gabinete do conselheiro deve olhar primeiro?"**

### 5.1 Onde há maior risco

- Central de Alertas do Gabinete (`/`) — agregador.
- Alertas SIOPS, SISAGUA, Saúde-Estrutura e Vigilância (InfoDengue).
- Alertas CAUC (bloqueio de transferências).

### 5.2 Onde há maior impacto financeiro

- Painel Despesa — ranking de entes e credores.
- Pesquisa de Credores — drilldown CPF/CNPJ.
- Painel Combustível e Empenhos cruzados.
- Painel Receita Pública (por categoria, com per capita).

### 5.3 Onde há atraso ou falha de envio

- Calendário de Remessas Contábeis e seus alertas.
- SICONFI Extrato de Entregas e ocorrências.
- Status ETL (Administração) — falhas internas de carga.

### 5.4 Onde há indício de inconsistência

- SICONFI/RREO/RGF — divergências e ocorrências oficiais.
- Painel SISAGUA — vide diagnóstico de duplicatas em [docs/fase2a2-diagnostico-duplicatas-sisagua-siconfi.md](../fase2a2-diagnostico-duplicatas-sisagua-siconfi.md).
- Saúde-Estrutura (CNES/UBS) — divergências cadastrais.

### 5.5 Quais processos exigem atenção

- Pautas de Julgamento — lista de sessões abertas.
- Análise IA de Processo — leitura técnica acelerada.
- Resumo de Pauta — preparação executiva da sessão.

### 5.6 Quais fornecedores/credores merecem análise

- Pesquisa de Credores — concentração por CNPJ.
- Painel Despesa — ranking nacional e por ente.
- Painel Combustível — credor único Polanco e cruzamento de empenhos.

### 5.7 Quais municípios/jurisdicionados estão mais críticos

- CAUC — situação fiscal/cadastral.
- SICONFI/RREO por município.
- Saúde — SIOPS (mínimo constitucional), SISAGUA, InfoDengue.
- Social — concentração de vulnerabilidade (MIS, CadÚnico).

---

## 6. Matriz de maturidade

| Área | Status atual | Maturidade (0–5) | Pode demonstrar? | Prioridade | Próxima ação recomendada |
|---|---|---|---|---|---|
| Assistente Aquiry | IA real + base + auditoria | 4 | Sim | Alta | RAG vetorial substituindo regex |
| Análise IA de Processo / Resumo de Pauta | Cache + descarte + jobs | 4 | Sim | Alta | Métricas de qualidade da análise |
| Central de Alertas do Gabinete | Agregador real multi-fonte | 4 | Sim | Alta | Personalização por conselheiro |
| Pautas de Julgamento | ETL + IA | 4 | Sim | Alta | Indicadores executivos da sessão |
| eProcessos CE | ETL + PDF + IA | 4 | Sim | Alta | Reduzir dependência de IP fixo do servidor PDF |
| Painel Despesa + Credores | Dados reais + enriquecimento CNPJ | 4 | Sim | Alta | Concluir enriquecimento e dashboards de drill |
| SICONFI (RREO/RGF/Extrato) | API oficial + dw + alertas | 4 | Sim | Alta | Ampliar cobertura RGF estadual |
| CAUC | API + Postgres + alertas | 4 | Sim | Alta | — |
| Painel Combustível | ETL diário + cruzamento | 4 | Sim | Média | Encerrar sync residual com Supabase |
| Remessas | Calendário + alertas | 4 | Sim | Média | Personalização por jurisdicionado |
| Painel Receita Pública | Em estabilização (branch atual) | 3 | Interno | Alta | Estabilizar e fazer merge |
| Saúde — SIOPS/SISAGUA/InfoDengue | ETL automatizado + alertas | 4 | Sim | Média | Tratar duplicatas SISAGUA |
| Saúde — PNI/SIM | Ingestão manual via CSV/XLSX | 3 | Com ressalva | Média | Automatizar quando DataSUS estabilizar |
| Painel Social (CadÚnico/MIS) | XLSX manual MIS | 3 | Com ressalva | Média | Automatizar coleta SAGI |
| Mapa IDEB | IDEB simulado | 2 | Não | Alta | Integrar INEP oficial |
| Cobertura Florestal | Dados estáticos | 2 | Não | Média | Integrar PRODES/DETER via ETL |
| Administração / ETL | Funciona; logs voláteis | 3 | Interno | Média | Persistir logs em `audit.etl_log` e expor na UI |
| Segurança / Usuários | CRUD + LDAP | 4 | Interno | Média | Auditoria de ações administrativas |
| Documentação raiz | Reescrita em 2026-05-19 | 4 | — | — | Manter sincronizada a cada release |
| Testes automatizados | Inexistentes | 0 | — | Alta | Vitest (libs) + Playwright (fluxos críticos) |
| CI/CD | Inexistente | 0 | — | Alta | GitHub Actions: lint, build, testes, migrations |

---

## 7. Roadmap sugerido

### 7.1 Curto prazo (4–8 semanas)

- [x] Atualizar `README.md` e `CLAUDE.md` para refletir o estado real do sistema. — concluído em 2026-05-19.
- [x] Documentar variáveis `AZURE_OPENAI_*` (e `DATABASE_URL`/`PG*`) no `.env.example`. — concluído em 2026-05-19.
- [x] Remover página `/signup` herdada do template. — concluído em 2026-05-19.
- [ ] Encerrar dependência residual do **Supabase** no ETL (APC Polanco e receita-publica para destino único Postgres).
- [ ] Amadurecer a base de **Mortalidade (SIM)** avaliando a API mais recente e migrando da ingestão por CSV manual.
- [ ] Criar **testes mínimos**: Vitest para `src/lib/aquiry/*`, `src/lib/ia/*`, `src/lib/auth/*`; Playwright para login AD + uso do Aquiry + análise IA de processo.
- [ ] Melhorar **logs do ETL Admin** (`/api/admin/etl/executar`): persistir streaming em `audit.etl_log` e expor na UI de `seguranca/etl`.

### 7.2 Médio prazo (2–4 meses)

- [ ] Integrar **IDEB real (INEP)** no Mapa Gabinete Digital, com ano de referência e fonte exibida.
- [ ] Integrar **cobertura florestal/desmatamento** com PRODES/DETER (INPE) via ETL.
- [ ] Automatizar ingestão **PNI** quando APIs DataSUS estabilizarem.
- [ ] Automatizar coleta **SAGI/MIS**.
- [ ] Configurar **CI/CD** (GitHub Actions) com gates de lint, build, testes e checagem de migrations.
- [ ] Reduzir dependência do **servidor PDF interno fixo em IP** (proxy reverso ou serviço dedicado).
- [ ] Personalizar **Central de Alertas** por conselheiro/gabinete.

### 7.3 Longo prazo (4–9 meses)

- [ ] Substituir lookup por regex do Aquiry por **RAG vetorial** sobre `src/data/aquiry/base-conhecimento/`, com indexação automática a cada release.
- [ ] Estabelecer **métricas de qualidade** das análises IA (concordância humana, taxa de descarte, tempo médio de revisão).
- [ ] Ampliar o módulo de **Pautas** com indicadores executivos (volume, materialidade, recorrência por jurisdicionado).
- [ ] Integrar **outras bases temáticas** relevantes ao controle externo (educação INEP completa, segurança pública, obras públicas).
- [ ] Avaliar publicação de **versão pública institucional** com camada de transparência restrita aos dados já oficiais.

---

## 8. Resumo final para apresentação

O **Varadouro Digital Aquiry** é a plataforma de inteligência de apoio aos gabinetes dos conselheiros do TCE-AC. Em sua versão atual, reúne mais de vinte painéis integrados a bases oficiais — SICONFI/Tesouro, CAUC, SQL Server institucional, eProcess/EJURIS, IBGE e DataSUS — em um único ambiente seguro, autenticado por Active Directory e auditável em todas as camadas.

A plataforma já entrega, com dados reais e prontos para demonstração: **Central de Alertas do Gabinete**, **Pautas de Julgamento com análise IA por processo e resumo de pauta**, **Painel Despesa com pesquisa de credores**, **SICONFI/RREO/RGF e CAUC**, **Painel Combustível** e **Remessas Contábeis**. Sobre todas as telas roda o **Assistente Aquiry**, copilot institucional com base documental versionada do TCE-AC, busca externa controlada e auditoria por metadados, que apoia a leitura técnica do conselheiro **sem substituir voto, parecer ou juízo de mérito**.

Áreas como **IDEB, cobertura florestal, PNI, SIM e MIS** estão presentes, mas dependem da maturação de fontes públicas e devem ser apresentadas com ressalva. O próximo estágio de evolução prioriza **encerrar a dívida técnica residual do Supabase**, **automatizar as bases manuais de saúde e social**, **introduzir testes e CI/CD** e **amadurecer a inteligência do Aquiry com RAG vetorial e métricas de qualidade**. Com isso, o Varadouro consolida-se como ferramenta cotidiana do controle externo do TCE-AC, com foco em **risco, materialidade, processos, fornecedores e jurisdicionados críticos**.
