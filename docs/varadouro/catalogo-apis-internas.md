# Catálogo de APIs Internas do Varadouro Digital Aquiry

> Documento técnico-institucional. Referência cruzada com [README.md](README.md), [mapa-funcional-varadouro.md](mapa-funcional-varadouro.md), [plano-evolucao-varadouro.md](plano-evolucao-varadouro.md), [roteiro-demonstracao-institucional.md](roteiro-demonstracao-institucional.md) e [matriz-fontes-dados.md](matriz-fontes-dados.md).
> Data de referência: 2026-05-19. Inventário derivado de [`src/app/api/`](../../src/app/api/).

---

## 1. Finalidade

Este documento registra os **endpoints internos do Varadouro Digital Aquiry**, agrupados por domínio funcional, com finalidade, entrada, saída, dependências, risco técnico, criticidade institucional e uso nos painéis.

O catálogo apoia:

- **Manutenção técnica** — visão única de onde a UI fala com o backend.
- **Integração entre frontend e backend** — referência para implementadores.
- **Análise de impacto** — saber quais endpoints são afetados por uma mudança em uma tabela ou fonte.
- **Segurança** — identificar endpoints sensíveis e dependências externas.
- **Rastreabilidade de dados** — vincular endpoint → tabela/integração → painel consumidor.
- **Priorização de testes** — direcionar esforço de QA e CI.
- **Documentação para novos desenvolvedores** — porta de entrada para o backend.

Todos os endpoints listados foram extraídos diretamente de `src/app/api/**/route.ts`. Quando uma característica não foi confirmada no código com certeza, está marcada como **"não confirmado no código"**.

---

## 2. Critérios de classificação

### 2.1 Domínio funcional

Autenticação e sessão · Assistente Aquiry · IA de processos e pautas · Processos e eProcess · Pautas de julgamento · Despesa e credores · Receita pública · Combustível · SICONFI · CAUC · Saúde · Social · Remessas · Alertas · Administração ETL · Segurança · Dados auxiliares.

### 2.2 Risco técnico

- **Baixo** — leitura simples de Postgres, sem dependência externa volátil.
- **Médio** — depende de IA, servidor PDF, base manual ou parâmetros sensíveis.
- **Alto** — efeito colateral relevante: `spawn` de processo, escrita em banco crítica, manipulação de sessão.

### 2.3 Criticidade institucional

- **Baixa** — funcionalidade auxiliar.
- **Média** — painel temático regular.
- **Alta** — login, IA, pautas, processos, alertas do gabinete e administração de ETL.

### 2.4 Status

- **Implementado** — em uso pela UI, em produção interna.
- **Parcial** — funcional, mas com lacunas conhecidas.
- **Experimental** — em validação.
- **Legado** — em desuso ou em fase de remoção.
- **Não confirmado** — presente no código sem uso confirmado pela UI.

---

## 3. Inventário geral de endpoints

Total: **99 endpoints** confirmados em `src/app/api/**/route.ts`. Todos exportam `runtime = "nodejs"` (uso de `pg`, `ldapts`, `fetch` externo).

### 3.1 Visão consolidada por domínio

| Domínio | Quant. | Endpoints (resumo) |
|---|---|---|
| Autenticação e sessão | 4 | `/auth/login`, `/auth/logout`, `/auth/me`, `/auth/photo` |
| Assistente Aquiry | 1 | `/assistente-aquiry` |
| IA de processos e pautas | 11 | `/ia/analisar-processo`, `/ia/analisar-processo-pauta`, `/ia/analise-processo-pauta/descartar`, `/ia/pauta/descartar-analise`, `/ia/pauta/gerar-analises-job`, `/ia/pauta/gerar-analises-job/status`, `/ia/gerar-analises-pendentes-pauta`, `/ia/resumo-pauta`, `/ia/resumo-pauta-ejuris`, `/ia/relatorio-resumo-pauta`, `/ia/relatorio-resumo-pauta/descartar`, `/ia/relatorio-processo/[processoId]` |
| Pautas de julgamento | 3 | `/pauta-julgamento`, `/pauta-julgamento/sessoes-abertas`, `/pauta-julgamento/sessoes-abertas/[sessaoId]` |
| Processos / eProcess | 7 | `/processos`, `/processos/filtros`, `/processos/[id]`, `/processos/[id]/arquivos`, `/processos/[id]/arquivos/[arquivoId]/pdf`, `/processos/[id]/movimentacoes`, `/processos/[id]/sessoes` |
| Despesa e credores | 12 | `/despesa/resumo`, `/anos`, `/entes`, `/entidades`, `/evolucao`, `/composicao`, `/ranking-entes`, `/ranking-credores`, `/credores/search`, `/credor/[cpfCnpj]`, `/credor/[cpfCnpj]/revalidar`, `/alertas` |
| Receita pública | 2 | `/receita-publica/dados`, `/receita-publica/filtros` |
| Combustível | 4 | `/combustivel/dados`, `/filtros`, `/empenhos`, `/empenhos/filtros` |
| SICONFI | 7 | `/siconfi/entes`, `/extrato`, `/rreo`, `/rreo/painel`, `/rreo/entregas`, `/rreo/ocorrencias`, `/rreo/municipio/[id]`, `/rgf/painel` |
| CAUC | 2 | `/cauc/situacao`, `/cauc/alertas` |
| Saúde | 19 | `/saude/resumo`, `/municipios`, `/alertas`, `/alertas/contagem`, `/orcamento/{resumo,municipios,periodos,alertas}`, `/pni/{resumo,municipios,serie,alertas}`, `/pni/cobertura/{resumo,municipios,imunobiologicos,evolucao,alertas}`, `/mortalidade/{resumo,municipios,serie,alertas}` |
| Social | 9 | `/social/cadunico/{resumo,alertas,status-carga}`, `/social/mis/{resumo,filtros,mapa,municipio,ranking,serie,alertas}` |
| Remessas | 3 | `/remessas/resumo`, `/remessas/alertas`, `/remessas/calendario` |
| Alertas (transversais) | 11 | `/alertas-gabinete`, `/alertas/{siops,siconfi-rreo,saude-estrutura,sisagua}/{resumo,detalhes}`, `/alertas/vigilancia/{resumo,detalhes,municipios,serie}` |
| Administração ETL | 3 | `/admin/etl/status`, `/admin/etl/configuracao`, `/admin/etl/executar` |
| Segurança | 1 | `/seguranca/usuarios` |
| Dados auxiliares | 1 | `/dados/ultima-atualizacao` |

### 3.2 Tabela detalhada

Convenções: **Dep. internas** = `src/lib/db.ts` (`dbQuery`) + tabelas Postgres; **Dep. externas** = serviços fora do banco interno; **Consumidores** = componentes/painéis em `src/components/` ou `src/app/(admin)/`.

| Endpoint | Método | Domínio | Finalidade | Entrada | Saída | Dep. internas | Dep. externas | Consumidores principais | Status | Risco | Criticidade | Observações |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/api/auth/login` | POST | Autenticação | Autenticar via LDAP + autorização DB | `{usuario, senha, lembrar}` | `{user}` + cookie JWT | `usuarios_autorizados` | Active Directory `ldap://172.20.12.86:389` | `SignInForm` | Implementado | Médio | Alta | Cliente `ldapts`; sessão em `AUTH_COOKIE_NAME` |
| `/api/auth/logout` | POST | Autenticação | Encerrar sessão | — | 204/OK | — | — | `LogoutButton`, header | Implementado | Baixo | Alta | Limpa cookie httpOnly |
| `/api/auth/me` | GET | Sessão | Retornar perfil ativo | cookie | `{user}` | — | — | `AppSidebar`, header | Implementado | Baixo | Alta | Base para detectar admin |
| `/api/auth/photo` | GET/POST | Sessão | Upload/serve foto de perfil | multipart (POST) / — (GET) | binary/JSON | armazenamento de foto (não confirmado no código) | — | `UserMetaCard` | Implementado | Médio | Baixa | Validar tipos e tamanho |
| `/api/assistente-aquiry` | POST | Aquiry | Resposta contextual do copilot | `{pergunta, historico, paginaAtual, contextoPagina, contextoTela}` | `{resposta, origem}` | `aquiry_evento_uso`, base local `src/data/aquiry/base-conhecimento/` | Azure OpenAI; busca externa (Tavily/Brave/SerpAPI/Gemini) | `AssistenteAquiry` | Implementado | Médio | Alta | Pipeline determinístico + IA; sanitização + auditoria |
| `/api/ia/analisar-processo` | POST | IA | Análise IA de processo | `{processoId, contexto}` | `{html, json, hashCache}` | `ia_analise_processo_pauta`, `ia_analise_processo_pauta_html`, `processo` | Azure OpenAI | `ModalAnaliseProcessoPautaIA` | Implementado | Médio | Alta | Cache por SHA-256 |
| `/api/ia/analisar-processo-pauta` | POST | IA | Análise IA em fase de pauta | `{sessaoId, processoId}` | idem | idem | Azure OpenAI | `SessaoDetalheClient` | Implementado | Médio | Alta | Modelo `analiseProcessoPauta v1.5.0` |
| `/api/ia/analise-processo-pauta/descartar` | POST | IA | Invalidar análise | `{processoId/sessaoId}` | `{ok}` | `ia_analise_descartes` | — | UI da sessão | Implementado | Médio | Alta | Permite regeneração auditada |
| `/api/ia/pauta/descartar-analise` | POST | IA | Variante de descarte por pauta | `{sessaoId, processoId}` | `{ok}` | `ia_analise_descartes` | — | UI da sessão | Implementado | Médio | Alta | — |
| `/api/ia/pauta/gerar-analises-job` | POST | IA | Job assíncrono de geração em lote | `{sessaoId}` | `{jobId}` | `ia_job_analise_pauta` | Azure OpenAI | UI da sessão | Implementado | Alto | Alta | Operação cara; deve ter rate limit |
| `/api/ia/pauta/gerar-analises-job/status` | GET | IA | Status do job | `?jobId=` | `{status, progresso}` | `ia_job_analise_pauta` | — | UI da sessão | Implementado | Baixo | Alta | Polling |
| `/api/ia/gerar-analises-pendentes-pauta` | POST | IA | Disparo síncrono de pendentes | `{sessaoId}` | `{geradas}` | idem | Azure OpenAI | UI da sessão | Implementado | Alto | Alta | Variante síncrona |
| `/api/ia/resumo-pauta` | POST | IA | Resumo agregado da sessão | `{sessaoId}` | `{html, json}` | `ia_analise_processo_pauta` + agregação | Azure OpenAI | `ModalResumoPautaIA` | Implementado | Médio | Alta | — |
| `/api/ia/resumo-pauta-ejuris` | POST | IA | Variante EJURIS | `{sessaoId}` | `{html}` | idem | Azure OpenAI | UI da sessão | Implementado | Médio | Alta | — |
| `/api/ia/relatorio-resumo-pauta` | GET | IA | Recuperar relatório consolidado | `?sessaoId=` | HTML | DB | — | `ModalRelatorioResumoPauta` | Implementado | Baixo | Alta | — |
| `/api/ia/relatorio-resumo-pauta/descartar` | POST | IA | Descartar relatório | `{sessaoId}` | `{ok}` | DB | — | UI da sessão | Implementado | Médio | Alta | — |
| `/api/ia/relatorio-processo/[processoId]` | GET | IA | HTML do relatório IA do processo | `processoId` (path) | HTML | `ia_analise_processo_pauta_html` | — | Página `/eprocessos-ce/.../analise-ia` | Implementado | Baixo | Alta | — |
| `/api/pauta-julgamento` | GET | Pautas | Lista de pautas | filtros | lista | `pauta_julgamento*` | — | `PautasJulgamentoClient` | Implementado | Baixo | Alta | — |
| `/api/pauta-julgamento/sessoes-abertas` | GET | Pautas | Sessões abertas | — | lista | `pauta_julgamento*` | — | `PautasJulgamentoClient` | Implementado | Baixo | Alta | — |
| `/api/pauta-julgamento/sessoes-abertas/[sessaoId]` | GET | Pautas | Detalhe da sessão | `sessaoId` | `{processos, metadados}` | `pauta_julgamento*` | — | `SessaoDetalheClient` | Implementado | Baixo | Alta | — |
| `/api/processos` | GET | Processos | Lista paginada | filtros | lista | `processo*` | — | `ProcessosClient` | Implementado | Baixo | Alta | — |
| `/api/processos/filtros` | GET | Processos | Filtros disponíveis | — | facets | DB | — | `ProcessosHeaderFilters` | Implementado | Baixo | Média | — |
| `/api/processos/[processoId]` | GET | Processos | Detalhe | `processoId` | `{processo}` | DB | — | `ProcessoDetalheClient` | Implementado | Baixo | Alta | — |
| `/api/processos/[processoId]/arquivos` | GET | Processos | Lista de arquivos | `processoId` | lista | DB | — | `ProcessoDetalheClient` | Implementado | Baixo | Alta | — |
| `/api/processos/[processoId]/arquivos/[arquivoId]/pdf` | GET | Processos | Stream do PDF | `processoId, arquivoId` | binário PDF | DB (metadata) | Apache `REPOSITORIO_BASE_URL` (`172.20.12.105:8090`) | UI processo | Implementado | Médio | Alta | IP fixo; substituir por proxy reverso |
| `/api/processos/[processoId]/movimentacoes` | GET | Processos | Movimentações | `processoId` | lista | DB | — | UI processo | Implementado | Baixo | Média | — |
| `/api/processos/[processoId]/sessoes` | GET | Processos | Sessões do processo | `processoId` | lista | DB | — | UI processo | Implementado | Baixo | Média | — |
| `/api/despesa/resumo` | GET | Despesa | KPIs agregados | filtros | `{kpis}` | `mart.mart_despesa*` | — | `PainelDespesaClient` | Implementado | Baixo | Alta | — |
| `/api/despesa/evolucao` | GET | Despesa | Série mensal | filtros | série | `mart.mart_despesa*` | — | idem | Implementado | Baixo | Alta | — |
| `/api/despesa/composicao` | GET | Despesa | Composição por categoria | filtros | breakdown | `mart.mart_despesa*` | — | idem | Implementado | Baixo | Alta | — |
| `/api/despesa/anos` | GET | Despesa | Anos disponíveis | — | lista | DB | — | filtros | Implementado | Baixo | Média | — |
| `/api/despesa/entes` | GET | Despesa | Entes | — | lista | DB | — | filtros | Implementado | Baixo | Média | — |
| `/api/despesa/entidades` | GET | Despesa | Entidades | — | lista | DB | — | filtros | Implementado | Baixo | Média | — |
| `/api/despesa/ranking-entes` | GET | Despesa | Ranking por ente | filtros | ranking | `mart.mart_despesa*` | — | painel | Implementado | Baixo | Alta | — |
| `/api/despesa/ranking-credores` | GET | Despesa | Ranking por credor | filtros | ranking | `mart.mart_credor_despesa*` | — | painel | Implementado | Baixo | Alta | — |
| `/api/despesa/credores/search` | GET | Credores | Busca CPF/CNPJ/razão | `?q=` | lista | `mart.mart_credor_despesa*` | — | `PesquisaCredoresClient` | Implementado | Baixo | Alta | Validar `q` |
| `/api/despesa/credor/[cpfCnpj]` | GET | Credores | Detalhe credor | `cpfCnpj` | dados | `mart.mart_credor_despesa*` | — | `CredorDespesaDetalheClient` | Implementado | Baixo | Alta | — |
| `/api/despesa/credor/[cpfCnpj]/revalidar` | POST | Credores | Forçar revalidação CNPJ | `cpfCnpj` | `{ok}` | DB | BrasilAPI | UI credor | Implementado | Médio | Média | Sujeito a rate da BrasilAPI |
| `/api/despesa/alertas` | GET | Despesa | Alertas de despesa | filtros | lista | DB | — | central de alertas | Implementado | Baixo | Alta | — |
| `/api/receita-publica/dados` | GET | Receita | Dados receita | filtros | série + breakdown | `mart.receita_publica_*` | — | `PainelReceitaPublicaClient` | Implementado | Baixo | Alta | Branch atual em estabilização |
| `/api/receita-publica/filtros` | GET | Receita | Filtros | — | facets | DB | — | `ReceitaPublicaHeaderFilters` | Implementado | Baixo | Média | — |
| `/api/combustivel/dados` | GET | Combustível | KPIs e séries | filtros | dados | `mart.combustivel_*` | Supabase (fallback, residual) | `PainelCombustivelClient` | Implementado | Baixo | Alta | Fallback Supabase em transição |
| `/api/combustivel/filtros` | GET | Combustível | Filtros | — | facets | DB | — | `CombustivelHeaderFilters` | Implementado | Baixo | Média | — |
| `/api/combustivel/empenhos` | GET | Combustível | Empenhos | filtros | dados | `mart.combustivel_*` | — | `PainelEmpenhoClient` | Implementado | Baixo | Alta | — |
| `/api/combustivel/empenhos/filtros` | GET | Combustível | Filtros empenhos | — | facets | DB | — | `EmpenhoHeaderFilters` | Implementado | Baixo | Média | — |
| `/api/siconfi/entes` | GET | SICONFI | Lista entes | — | lista | DB | — | painel SICONFI | Implementado | Baixo | Alta | — |
| `/api/siconfi/extrato` | GET | SICONFI | Extrato de entregas | filtros | lista | `raw.siconfi_extrato_entregas` | — | `EntregasSiconfiClient` | Implementado | Baixo | Alta | — |
| `/api/siconfi/rreo` | GET | SICONFI | RREO consolidado | filtros | dados | `dw.fato_siconfi_rreo` | — | `RreoClient` | Implementado | Baixo | Alta | — |
| `/api/siconfi/rreo/painel` | GET | SICONFI | Painel RREO | filtros | KPIs | DW | — | `PainelSiconfiClient` | Implementado | Baixo | Alta | — |
| `/api/siconfi/rreo/entregas` | GET | SICONFI | Entregas RREO | filtros | lista | DW | — | painel | Implementado | Baixo | Alta | — |
| `/api/siconfi/rreo/ocorrencias` | GET | SICONFI | Ocorrências RREO | filtros | lista | DW | — | painel | Implementado | Baixo | Alta | — |
| `/api/siconfi/rreo/municipio/[id]` | GET | SICONFI | RREO município | `id` | dados | DW | — | `RreoMunicipioClient` | Implementado | Baixo | Alta | — |
| `/api/siconfi/rgf/painel` | GET | SICONFI | Painel RGF | filtros | KPIs | `dw.fato_siconfi_rgf` | — | `RgfClient` | Implementado | Baixo | Alta | — |
| `/api/cauc/situacao` | GET | CAUC | Situação cadastral | filtros | dados | mart CAUC (não confirmado nome exato) | — | `PainelCaucClient` | Implementado | Baixo | Alta | — |
| `/api/cauc/alertas` | GET | CAUC | Alertas CAUC | filtros | lista | DB | — | central de alertas | Implementado | Baixo | Alta | — |
| `/api/saude/resumo` | GET | Saúde | KPIs gerais | filtros | KPIs | mart saúde | — | `PainelSaudeClient` | Implementado | Baixo | Alta | — |
| `/api/saude/municipios` | GET | Saúde | Indicadores municipais | filtros | lista | DB | — | painel | Implementado | Baixo | Alta | — |
| `/api/saude/alertas` | GET | Saúde | Alertas | filtros | lista | DB | — | central | Implementado | Baixo | Alta | — |
| `/api/saude/alertas/contagem` | GET | Saúde | Contagem | filtros | `{count}` | DB | — | central | Implementado | Baixo | Média | — |
| `/api/saude/orcamento/resumo` | GET | Saúde — SIOPS | Resumo orçamento | filtros | KPIs | mart SIOPS | — | `OrcamentoSaudeClient` | Implementado | Baixo | Alta | — |
| `/api/saude/orcamento/municipios` | GET | Saúde — SIOPS | Municípios | filtros | lista | DB | — | painel | Implementado | Baixo | Alta | — |
| `/api/saude/orcamento/periodos` | GET | Saúde — SIOPS | Períodos | — | lista | DB | — | filtros | Implementado | Baixo | Média | — |
| `/api/saude/orcamento/alertas` | GET | Saúde — SIOPS | Alertas | filtros | lista | DB | — | central | Implementado | Baixo | Alta | — |
| `/api/saude/pni/resumo` | GET | Saúde — PNI | Resumo PNI | filtros | KPIs | mart PNI | — | `VacinacaoClient` | Implementado | Médio | Média | Ingestão manual upstream |
| `/api/saude/pni/municipios` | GET | Saúde — PNI | Municípios | filtros | lista | DB | — | painel | Implementado | Médio | Média | — |
| `/api/saude/pni/serie` | GET | Saúde — PNI | Série | filtros | série | DB | — | painel | Implementado | Médio | Média | — |
| `/api/saude/pni/alertas` | GET | Saúde — PNI | Alertas | filtros | lista | DB | — | central | Implementado | Médio | Média | — |
| `/api/saude/pni/cobertura/resumo` | GET | Saúde — PNI cob. | Cobertura resumo | filtros | KPIs | mart PNI cobertura | — | painel | Implementado | Médio | Média | — |
| `/api/saude/pni/cobertura/municipios` | GET | Saúde — PNI cob. | Municípios | filtros | lista | DB | — | painel | Implementado | Médio | Média | — |
| `/api/saude/pni/cobertura/imunobiologicos` | GET | Saúde — PNI cob. | Imunobiológicos | filtros | lista | DB | — | painel | Implementado | Médio | Média | — |
| `/api/saude/pni/cobertura/evolucao` | GET | Saúde — PNI cob. | Evolução | filtros | série | DB | — | painel | Implementado | Médio | Média | — |
| `/api/saude/pni/cobertura/alertas` | GET | Saúde — PNI cob. | Alertas | filtros | lista | DB | — | central | Implementado | Médio | Média | — |
| `/api/saude/mortalidade/resumo` | GET | Saúde — SIM | Resumo SIM | filtros | KPIs | mart mortalidade | — | `MortalidadeClient` | Implementado | Médio | Média | CSV manual upstream |
| `/api/saude/mortalidade/municipios` | GET | Saúde — SIM | Municípios | filtros | lista | DB | — | painel | Implementado | Médio | Média | — |
| `/api/saude/mortalidade/serie` | GET | Saúde — SIM | Série | filtros | série | DB | — | painel | Implementado | Médio | Média | — |
| `/api/saude/mortalidade/alertas` | GET | Saúde — SIM | Alertas | filtros | lista | DB | — | central | Implementado | Médio | Média | — |
| `/api/social/cadunico/resumo` | GET | Social | Resumo CadÚnico | filtros | KPIs | mart CadÚnico | — | `PainelSocialClient` | Implementado | Médio | Média | — |
| `/api/social/cadunico/alertas` | GET | Social | Alertas | filtros | lista | DB | — | central | Implementado | Médio | Média | — |
| `/api/social/cadunico/status-carga` | GET | Social | Status da carga | — | `{status, ts}` | `audit.etl_*` (provável) | — | painel | Implementado | Baixo | Média | — |
| `/api/social/mis/resumo` | GET | Social — MIS | Resumo MIS | filtros | KPIs | mart MIS | — | `TransferenciaRendaClient` | Implementado | Médio | Média | XLSX manual upstream |
| `/api/social/mis/filtros` | GET | Social — MIS | Filtros | — | facets | DB | — | `SocialHeaderFilters` | Implementado | Baixo | Média | — |
| `/api/social/mis/mapa` | GET | Social — MIS | Dados do mapa | filtros | lista | DB | — | `MapaSocialContent` | Implementado | Médio | Média | — |
| `/api/social/mis/municipio` | GET | Social — MIS | Detalhe município | filtros | dados | DB | — | painel | Implementado | Médio | Média | — |
| `/api/social/mis/ranking` | GET | Social — MIS | Ranking | filtros | ranking | DB | — | painel | Implementado | Médio | Média | — |
| `/api/social/mis/serie` | GET | Social — MIS | Série temporal | filtros | série | DB | — | painel | Implementado | Médio | Média | — |
| `/api/social/mis/alertas` | GET | Social — MIS | Alertas | filtros | lista | DB | — | central | Implementado | Médio | Média | — |
| `/api/remessas/resumo` | GET | Remessas | KPIs remessas | filtros | KPIs | `mart.mart_remessas*` | — | `CalendarioRemessasClient` | Implementado | Baixo | Alta | — |
| `/api/remessas/alertas` | GET | Remessas | Alertas | filtros | lista | DB | — | central | Implementado | Baixo | Alta | — |
| `/api/remessas/calendario` | GET | Remessas | Calendário | filtros | eventos | DB | — | `CalendarioRemessasClient` | Implementado | Baixo | Alta | — |
| `/api/alertas-gabinete` | GET | Alertas | Agregador home | — | bloco consolidado | múltiplas marts | — | `AlertasGabineteClient` (home `/`) | Implementado | Médio | **Alta** | Endpoint mais visível do sistema |
| `/api/alertas/siops/resumo` | GET | Alertas | Resumo SIOPS | filtros | resumo | DB | — | central | Implementado | Baixo | Alta | — |
| `/api/alertas/siops/detalhes` | GET | Alertas | Detalhes SIOPS | filtros | lista | DB | — | central | Implementado | Baixo | Alta | — |
| `/api/alertas/siconfi-rreo/resumo` | GET | Alertas | Resumo SICONFI/RREO | filtros | resumo | DW | — | central | Implementado | Baixo | Alta | — |
| `/api/alertas/siconfi-rreo/detalhes` | GET | Alertas | Detalhes SICONFI/RREO | filtros | lista | DW | — | central | Implementado | Baixo | Alta | — |
| `/api/alertas/saude-estrutura/resumo` | GET | Alertas | Resumo CNES/UBS | filtros | resumo | DB | — | central | Implementado | Baixo | Alta | — |
| `/api/alertas/saude-estrutura/detalhes` | GET | Alertas | Detalhes CNES/UBS | filtros | lista | DB | — | central | Implementado | Baixo | Alta | — |
| `/api/alertas/sisagua/resumo` | GET | Alertas | Resumo SISAGUA | filtros | resumo | mart SISAGUA | — | central | Implementado | Baixo | Alta | — |
| `/api/alertas/sisagua/detalhes` | GET | Alertas | Detalhes SISAGUA | filtros | lista | DB | — | central | Implementado | Baixo | Alta | — |
| `/api/alertas/vigilancia/resumo` | GET | Alertas | Resumo InfoDengue | filtros | resumo | mart InfoDengue | — | central | Implementado | Baixo | Alta | — |
| `/api/alertas/vigilancia/detalhes` | GET | Alertas | Detalhes InfoDengue | filtros | lista | DB | — | central | Implementado | Baixo | Alta | — |
| `/api/alertas/vigilancia/municipios` | GET | Alertas | Municípios | filtros | lista | DB | — | central | Implementado | Baixo | Alta | — |
| `/api/alertas/vigilancia/serie` | GET | Alertas | Série temporal | filtros | série | DB | — | central | Implementado | Baixo | Alta | — |
| `/api/admin/etl/status` | GET | Admin ETL | Status das cargas | — | timeline | `audit.etl_log`, `audit.etl_carga` | — | `EtlStatusClient` | Implementado | Médio | Alta | Apenas perfil admin |
| `/api/admin/etl/configuracao` | GET/POST | Admin ETL | CRUD config | `{config}` (POST) | dados | `audit.etl_monitoramento_config`, `audit.etl_execucao_config` | — | `EtlConfiguracaoClient` | Implementado | Médio | Alta | Apenas admin |
| `/api/admin/etl/executar` | POST | Admin ETL | Disparar job manual | `{jobId, params}` | `{ok, output}` | `pg_try_advisory_lock`, `audit.*` | `spawn(jobCommand.command, args)` | UI admin | Implementado | **Alto** | Alta | Spawn de processo; logs voláteis hoje (ver Fase 5 do plano) |
| `/api/seguranca/usuarios` | GET | Segurança | Lista usuários autorizados | — | lista | `usuarios_autorizados` | — | `UsuariosSegurancaClient` | Implementado | Médio | Alta | Apenas admin |
| `/api/dados/ultima-atualizacao` | GET | Auxiliares | Última carga consolidada | — | `{ts}` | `audit.etl_*` | — | `AppSidebar` | Implementado | Baixo | Média | Selo visível na sidebar |

---

## 4. APIs de autenticação, sessão e segurança

### 4.1 `POST /api/auth/login`

- **Fluxo:** valida `{usuario, senha, lembrar}` → autentica via `ldapts` em `AD_LDAP_URL` → busca autorização em `usuarios_autorizados` (`getAuthorizedUser`) → gera JWT (`AUTH_SESSION_SECRET`) → grava cookie httpOnly `AUTH_COOKIE_NAME`.
- **Dependências:** Active Directory `172.20.12.86:389`, Postgres, `src/lib/auth/active-directory.ts`, `src/lib/auth/authorization.ts`, `src/lib/auth/session.ts`.
- **Riscos:** dependência de rede do TCE-AC; segredo `AUTH_SESSION_SECRET` é crítico; tempo de timeout LDAP configurável.
- **Recomendações:** validação de tentativas, rate limit anti-brute force, registro em `audit.login_log` (Fase 6 do plano), proteção contra LDAP injection nos valores enviados ao filtro.

### 4.2 `POST /api/auth/logout`

- **Fluxo:** invalida o cookie de sessão.
- **Dependências:** cookie.
- **Riscos:** baixo.
- **Recomendações:** confirmar resposta de erro silenciosa para chamadas sem sessão.

### 4.3 `GET /api/auth/me`

- **Fluxo:** valida JWT do cookie; retorna `{user}` ou 401.
- **Dependências:** `verifySessionToken`.
- **Riscos:** baixo.
- **Recomendações:** considerar cache de curto prazo no client.

### 4.4 `GET|POST /api/auth/photo`

- **Fluxo:** upload (POST) ou serve (GET) foto de perfil.
- **Dependências:** armazenamento de foto (**não confirmado no código** — verificar `src/app/api/auth/photo/route.ts`).
- **Riscos:** sem validação clara de tipo/tamanho pode permitir upload abusivo.
- **Recomendações:** validar MIME, limitar tamanho, sanitizar nome do arquivo.

### 4.5 `GET /api/seguranca/usuarios`

- **Fluxo:** lista usuários autorizados em `usuarios_autorizados`.
- **Dependências:** `requireAdminSession` (não confirmado em todos os pontos).
- **Riscos:** vazamento de PII se acessado por perfil não-admin.
- **Recomendações:** reforçar guarda de admin; paginação obrigatória; máscara de campos sensíveis.

---

## 5. APIs do Assistente Aquiry e IA

### 5.1 `POST /api/assistente-aquiry`

- **Entrada:** `{pergunta, historico, paginaAtual, contextoPagina, contextoTela}`.
- **Saída:** `{resposta, origem}` (origem = `varadouro` / `conhecimento_geral` / `busca_externa`).
- **Azure OpenAI:** chamada real via `src/lib/ia/azureOpenAI.ts` (`temperature` 0.4, `max_completion_tokens` 4096/8192).
- **Cache:** sem cache de resposta; cache em memória da base local em `baseConhecimentoAquiry.ts`.
- **Persistência:** auditoria em `public.aquiry_evento_uso` quando `AQUIRY_AUDIT_PERSIST=true` (**apenas metadados**).
- **Riscos:** dependência de Azure OpenAI; busca externa opt-in pode falhar; ausência de RAG vetorial limita tópicos.
- **Observações institucionais:** princípio inegociável — não emite voto, parecer ou juízo de mérito.

### 5.2 `POST /api/ia/analisar-processo` e `/api/ia/analisar-processo-pauta`

- **Entrada:** `{processoId, sessaoId?}`.
- **Saída:** `{html, json, hashCache}` (modelo `analiseProcessoPauta v1.5.0`).
- **Azure OpenAI:** modo `response_format: json_object`, prompt em `montarSystemPromptAnalise.ts`/`montarUserPromptAnalise.ts`.
- **Cache:** SHA-256 do input em `public.ia_analise_processo_pauta`; HTML em `_html` (migration 251).
- **Persistência:** análise + HTML + descartes (`_descartes`, migration 252).
- **Riscos:** custo Azure OpenAI; processos grandes podem estourar token budget (`tokenBudget.ts`).
- **Observações:** revisão humana é obrigatória; resultado é insumo.

### 5.3 `POST /api/ia/pauta/gerar-analises-job` e `/status`

- **Entrada:** `{sessaoId}` (POST); `?jobId=` (GET).
- **Saída:** `{jobId, status, progresso}`.
- **Persistência:** `public.ia_job_analise_pauta` (migration 253).
- **Riscos:** **alto** — job em lote sem rate limit explícito; custo Azure OpenAI.
- **Observações:** prever fila e backpressure em produção.

### 5.4 `POST /api/ia/gerar-analises-pendentes-pauta`

- **Variante síncrona** do job acima. **Alto risco** de timeout HTTP para sessões grandes.

### 5.5 `POST /api/ia/resumo-pauta` e `/api/ia/resumo-pauta-ejuris`

- **Entrada:** `{sessaoId}`.
- **Saída:** `{html, json}`.
- **Azure OpenAI:** chamada agregada com as análises individuais já cacheadas.
- **Persistência:** parte do fluxo `ia_analise_processo_pauta`.

### 5.6 `GET /api/ia/relatorio-resumo-pauta` e `POST /descartar`

- **Entrada:** `?sessaoId=` (GET); `{sessaoId}` (POST).
- **Saída:** HTML / `{ok}`.
- **Persistência:** rascunho/relatório consolidado.

### 5.7 `GET /api/ia/relatorio-processo/[processoId]`

- **Saída:** HTML do relatório IA do processo.
- **Persistência:** `ia_analise_processo_pauta_html`.

### 5.8 `POST /api/ia/analise-processo-pauta/descartar` e `/api/ia/pauta/descartar-analise`

- **Função:** invalidar análise cacheada, permitindo regeneração auditada.
- **Persistência:** `public.ia_analise_descartes`.

**Recomendação institucional comum a todos os endpoints de IA:** auditoria, rastreabilidade, descarte visível e indicação clara de que a saída **não substitui voto, parecer ou juízo de mérito**.

---

## 6. APIs de processos, pautas e documentos

### 6.1 Pautas de julgamento

- `GET /api/pauta-julgamento` — lista geral.
- `GET /api/pauta-julgamento/sessoes-abertas` — sessões abertas.
- `GET /api/pauta-julgamento/sessoes-abertas/[sessaoId]` — detalhe da sessão.
- **Origem:** SQL Server EJURIS → `public.pauta_julgamento*` (migrations 240–247).
- **Risco:** baixo.
- **Melhoria recomendada:** indicadores executivos no cabeçalho da sessão (Fase 2 do plano).

### 6.2 Processos / eProcess

- `GET /api/processos` — lista paginada.
- `GET /api/processos/filtros` — facets.
- `GET /api/processos/[processoId]` — detalhe.
- `GET /api/processos/[processoId]/arquivos` — lista de arquivos.
- `GET /api/processos/[processoId]/arquivos/[arquivoId]/pdf` — **stream PDF** via Apache `REPOSITORIO_BASE_URL`.
- `GET /api/processos/[processoId]/movimentacoes` — movimentações.
- `GET /api/processos/[processoId]/sessoes` — sessões vinculadas.
- **Origem:** SQL Server eProcess → `public.processo*` (migration 248).
- **Dependência sensível:** servidor PDF interno em IP fixo `172.20.12.105:8090`.
- **Risco:** médio (apenas o endpoint de PDF).
- **Melhoria recomendada:** proxy reverso desacoplando o frontend do IP interno (ação #10 do plano).

---

## 7. APIs dos painéis de dados

### 7.1 Despesa (`/api/despesa/*`)

- **Endpoints:** `resumo`, `evolucao`, `composicao`, `anos`, `entes`, `entidades`, `ranking-entes`, `ranking-credores`, `credores/search`, `credor/[cpfCnpj]`, `credor/[cpfCnpj]/revalidar`, `alertas`.
- **Filtros aceitos:** ano, ente, entidade, elemento, credor.
- **Tabelas prováveis:** `mart.mart_despesa*`, `mart.mart_credor_despesa*`, `dw.fato_empenho`.
- **Painéis consumidores:** Painel Despesa, Pesquisa de Credores, Detalhe Credor.
- **Fragilidades:** `credor/[cpfCnpj]/revalidar` depende de rate da BrasilAPI.
- **Prioridade de teste:** **alta**.

### 7.2 Receita Pública (`/api/receita-publica/*`)

- **Endpoints:** `dados`, `filtros`.
- **Tabelas prováveis:** `mart.receita_publica_*`.
- **Fragilidade:** branch atual em estabilização.
- **Prioridade de teste:** **alta**.

### 7.3 Combustível (`/api/combustivel/*`)

- **Endpoints:** `dados`, `filtros`, `empenhos`, `empenhos/filtros`.
- **Tabelas prováveis:** `mart.combustivel_*`.
- **Fragilidade:** fallback Supabase residual.
- **Prioridade de teste:** **média**.

### 7.4 SICONFI (`/api/siconfi/*`)

- **Endpoints:** `entes`, `extrato`, `rreo`, `rreo/painel`, `rreo/entregas`, `rreo/ocorrencias`, `rreo/municipio/[id]`, `rgf/painel`.
- **Tabelas prováveis:** `dw.fato_siconfi_rreo`, `dw.fato_siconfi_rgf`, `raw.siconfi_extrato_entregas`, marts SICONFI.
- **Painéis consumidores:** Painel SICONFI, RREO, RREO Município, RGF, Entregas.
- **Prioridade de teste:** **alta**.

### 7.5 CAUC (`/api/cauc/*`)

- **Endpoints:** `situacao`, `alertas`.
- **Tabelas prováveis:** marts CAUC (**nome exato não confirmado no código** — migrations 040/041).
- **Prioridade de teste:** **alta**.

### 7.6 Saúde (`/api/saude/*`)

- **Endpoints:** 19 ao todo (resumo geral + SIOPS + PNI + PNI cobertura + Mortalidade SIM + alertas).
- **Tabelas prováveis:** marts saúde consolidados.
- **Fragilidade:** PNI e SIM dependem de ingestão manual upstream.
- **Prioridade de teste:** **média** (SIOPS alta; PNI/SIM média).

### 7.7 Social (`/api/social/*`)

- **Endpoints:** CadÚnico (resumo, alertas, status-carga) + MIS (resumo, filtros, mapa, município, ranking, série, alertas).
- **Tabelas prováveis:** marts CadÚnico e MIS.
- **Fragilidade:** XLSX manual upstream.
- **Prioridade de teste:** **média**.

### 7.8 Remessas (`/api/remessas/*`)

- **Endpoints:** `resumo`, `alertas`, `calendario`.
- **Tabelas prováveis:** `mart.mart_remessas*`.
- **Prioridade de teste:** **alta**.

### 7.9 Alertas transversais (`/api/alertas/*`)

- **Endpoints:** SIOPS, SICONFI-RREO, Saúde-Estrutura, SISAGUA, Vigilância (resumo/detalhes + municípios/série na vigilância).
- **Prioridade de teste:** **alta** (alimentam a home).

### 7.10 `/api/alertas-gabinete`

- **Função:** agregador da home.
- **Tabelas prováveis:** múltiplas marts.
- **Prioridade de teste:** **crítica** — é o endpoint mais visível para o gabinete.

### 7.11 `/api/dados/ultima-atualizacao`

- **Função:** selo de "última atualização" exibido na sidebar.
- **Tabela provável:** `audit.etl_*`.
- **Prioridade de teste:** **média**.

---

## 8. APIs de administração ETL

### 8.1 `GET /api/admin/etl/status`

- **Função:** retorna o status consolidado das cargas a partir de `audit.etl_log` e `audit.etl_carga`.
- **Relação com `audit.etl_*`:** leitura.
- **Riscos:** baixo (leitura).
- **Recomendações:** exigir perfil admin; paginação; filtros por job/data.

### 8.2 `GET|POST /api/admin/etl/configuracao`

- **Função:** CRUD da configuração de execução e de monitoramento (`audit.etl_execucao_config`, `audit.etl_monitoramento_config`).
- **Riscos:** médio — alteração indevida afeta o pipeline noturno.
- **Recomendações:** validação rígida do payload; auditoria de quem alterou; histórico de mudanças.

### 8.3 `POST /api/admin/etl/executar`

- **Função:** disparo manual de um job ETL via `spawn(jobCommand.command, args)` com mapeamento em `src/lib/etl-job-commands.ts`.
- **Controle de concorrência:** `pg_try_advisory_lock(hashtext($1))`.
- **Riscos:** **alto** — `spawn` de processo; logs hoje voláteis no console do Next; tratamento Windows EINVAL com fallback `cmd.exe`.
- **Recomendações:**
  - Persistir streaming de stdout/stderr em `audit.etl_log` (ação #4 do plano).
  - Limitar quem pode acionar (`requireAdminSession`).
  - Auditar quem disparou, com IP e timestamp.
  - Timeout configurável por job.

---

## 9. Endpoints críticos para testes automatizados

| Endpoint/grupo | Por que testar | Tipo de teste | Cenário mínimo | Criticidade |
|---|---|---|---|---|
| `/api/auth/login` | Porta de entrada; LDAP é o caminho crítico | Integração + e2e | Login válido, inválido, usuário não autorizado, AD fora do ar | **Crítica** |
| `/api/auth/me` | Verifica sessão; usado em todas as rotas privadas | Unit + integração | Cookie válido, expirado, inexistente | Alta |
| `/api/assistente-aquiry` | IA institucional; auditoria; busca externa | Integração (mock Azure) + contrato | Pergunta varadouro, conhecimento_geral, busca_externa, sem Azure configurado | **Crítica** |
| `/api/ia/analisar-processo-pauta` | Núcleo da IA de processos | Integração (mock Azure) + cache | Geração nova, hit de cache, descarte, regeneração | **Crítica** |
| `/api/ia/resumo-pauta` e `/relatorio-resumo-pauta` | Preparação executiva | Integração | Sessão sem análises, com análises, descarte | Alta |
| `/api/ia/pauta/gerar-analises-job` e `/status` | Job assíncrono caro | Integração + carga | Criação de job, polling de status, falha simulada | Alta |
| `/api/processos/[id]/arquivos/[id]/pdf` | Stream PDF + IP interno | Integração | PDF existente, inexistente, servidor PDF indisponível | Alta |
| `/api/pauta-julgamento/sessoes-abertas/[sessaoId]` | Detalhe da sessão | Integração | Sessão válida, vazia, com muitos processos | Alta |
| `/api/despesa/resumo`, `/ranking-credores`, `/credores/search` | Painéis de despesa e credores | Integração | Filtros nulos, filtros agressivos, busca por CNPJ válido/inválido | Alta |
| `/api/siconfi/rreo/painel`, `/rgf/painel`, `/extrato` | Painéis SICONFI | Integração | Bimestre/quadrimestre corrente, anterior, sem dados | Alta |
| `/api/cauc/situacao`, `/cauc/alertas` | Painel CAUC e alertas | Integração | Município em alerta, sem alerta | Alta |
| `/api/alertas-gabinete` | Home — endpoint mais visível | Integração + contrato | Agregação completa, agregação parcial (uma fonte fora) | **Crítica** |
| `/api/admin/etl/executar` | Spawn de processo + lock | Integração + segurança | Disparo concorrente, perfil não-admin, job inválido | Alta |
| `/api/admin/etl/status`, `/configuracao` | Painel administrativo | Integração | Sem registros, com falhas, alteração de configuração | Média |

---

## 10. Riscos e fragilidades identificadas

| Tipo de risco | Endpoints afetados | Impacto | Mitigação recomendada |
|---|---|---|---|
| **Variáveis de ambiente ausentes** | Todos os endpoints IA (`AZURE_OPENAI_*`), `/auth/login` (`AD_*`, `AUTH_SESSION_SECRET`), `/processos/.../pdf` (`REPOSITORIO_BASE_URL`) | Falha silenciosa em runtime | Validar no boot (ação #7 do plano) |
| **IP interno fixo** | `/api/processos/[id]/arquivos/[id]/pdf` (`172.20.12.105:8090`), `/api/auth/login` (`172.20.12.86:389`) | Mudança de IP quebra produção | Proxy reverso / DNS interno |
| **Chamadas externas voláteis** | `/assistente-aquiry` (Azure + busca externa), `/ia/*` (Azure), `/despesa/credor/[cpfCnpj]/revalidar` (BrasilAPI) | Indisponibilidade externa afeta UX | Timeout configurável + circuit breaker + fallback |
| **IA (custo e qualidade)** | `/ia/pauta/gerar-analises-job`, `/ia/gerar-analises-pendentes-pauta`, `/ia/analisar-processo*`, `/assistente-aquiry`, `/ia/resumo-pauta*` | Custo Azure OpenAI; saída técnica imperfeita | Rate limit; fila; métricas de qualidade; revisão humana |
| **Spawn de processo** | `/api/admin/etl/executar` | Execução incontrolada se autorização falhar | `requireAdminSession`; advisory lock (já em uso); persistir log; timeout |
| **Validação fraca de entrada** | Não auditado de forma uniforme | SQL injection / NoSQL injection / path traversal | Schema (Zod) padronizado por endpoint |
| **Dados manuais a montante** | `/saude/pni/*`, `/saude/mortalidade/*`, `/social/cadunico/*`, `/social/mis/*`, `/receita-publica/*` | Indicador defasado | Exibir `ultima_atualizacao` por base; alertar SLA |
| **Endpoints sem testes** | **Todos** os endpoints (sistema sem suíte de testes) | Regressão silenciosa | Vitest + Playwright + CI (ações #2 e #3 do plano) |
| **Logs voláteis** | `/api/admin/etl/executar` | Perda de rastro de execução manual | Persistir em `audit.etl_log` (ação #4 do plano) |
| **PII em listagem** | `/api/seguranca/usuarios`, `/api/despesa/credor/[cpfCnpj]` | Vazamento se autorização falhar | Guarda de admin; máscara opcional; paginação |
| **Auditoria parcial** | Login, ações administrativas, IA | Falta de visibilidade institucional | `audit.login_log` + painel de auditoria do Aquiry (Fase 6 do plano) |

---

## 11. Recomendações prioritárias

1. **Validação padronizada de entrada** — adotar Zod (ou equivalente) em todos os endpoints; rejeição com 400 e mensagem segura.
2. **Tratamento uniforme de erro** — padronizar envelopes `{error: {code, message, details?}}`; mapear erros internos para códigos HTTP estáveis.
3. **Autenticação/autorização por endpoint** — middleware único que decide pública / autenticada / admin a partir de um mapa explícito; remover dúvidas caso a caso.
4. **Logs estruturados** — emissão JSON (`pino`/`winston`) com `traceId`, `userId`, `rota`, `latencia_ms`, `status`; sink configurável.
5. **OpenAPI ou documentação automatizada** — anotar rotas e expor `/api/openapi.json`; manter este catálogo derivado dela.
6. **Testes de contrato** — para endpoints críticos (login, alertas-gabinete, IA), congelar payload de entrada/saída.
7. **Rate limit para IA** — `/assistente-aquiry`, `/ia/*` com limite por usuário/IP e fila para jobs em lote.
8. **Proteção de endpoints administrativos** — `requireAdminSession` em todo `/api/admin/*` e `/api/seguranca/*`; auditoria obrigatória.
9. **Parametrização de IPs internos** — encapsular `REPOSITORIO_BASE_URL` e `AD_LDAP_URL` em camada de configuração validada; documentar em [.env.example](../../.env.example).
10. **Auditoria de ações sensíveis** — registrar login (sucesso/falha), disparo de ETL, alteração de configuração, descarte de análise IA em tabelas `audit.*` específicas; expor em painel admin.

---

## 12. Resumo executivo

As **99 APIs internas** do Varadouro Digital Aquiry sustentam toda a experiência institucional: do login Active Directory à análise IA de processos, passando pelos painéis de transparência (Despesa, Credores, SICONFI, CAUC, Saúde, Social, Combustível, Receita, Remessas) e pela central de alertas do gabinete. Todas operam em `runtime = "nodejs"`, leem o PostgreSQL local via `dbQuery`, e comunicam-se com serviços externos críticos — Azure OpenAI, LDAP/AD, SICONFI/Tesouro, BrasilAPI e o servidor Apache de PDFs do eProcess.

Os domínios **mais críticos** são, em ordem: autenticação, Assistente Aquiry, IA de processos e pautas, processos eProcess, alertas-gabinete, administração de ETL e SICONFI. O endpoint **mais visível** é `/api/alertas-gabinete`, que alimenta a home consultada diariamente pelo gabinete. Os **mais sensíveis tecnicamente** são `/api/admin/etl/executar` (faz `spawn` com advisory lock), `/api/ia/pauta/gerar-analises-job` (operação cara) e `/api/processos/[id]/arquivos/[id]/pdf` (dependência de IP fixo). Os **mais críticos institucionalmente** são `/api/auth/login`, `/api/assistente-aquiry` e os endpoints `/api/ia/*` — diretamente associados à confiança no sistema.

Os **endpoints que mais merecem testes** estão concentrados em autenticação, IA, alertas-gabinete, SICONFI e ETL admin. Antes de produção ampla, devem ser tratados: validação padronizada de entrada, tratamento uniforme de erro, rate limit para IA, persistência de logs do ETL admin, validação obrigatória das variáveis de ambiente no boot e proxy reverso para o servidor PDF interno. A combinação destas medidas, junto com a introdução de testes automatizados e CI/CD previstas na Fase 6 do plano de evolução, eleva a robustez do backend ao nível necessário para o uso cotidiano e auditável pelos gabinetes do TCE-AC.
