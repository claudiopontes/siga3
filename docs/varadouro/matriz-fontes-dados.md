# Matriz de Fontes de Dados do Varadouro Digital Aquiry

> Documento de governança. Referência cruzada com [README.md](README.md), [mapa-funcional-varadouro.md](mapa-funcional-varadouro.md), [plano-evolucao-varadouro.md](plano-evolucao-varadouro.md) e [roteiro-demonstracao-institucional.md](roteiro-demonstracao-institucional.md).
> Data de referência: 2026-05-19.

---

## 1. Finalidade

Este documento registra, em uma única referência, **as fontes de dados utilizadas pelo Varadouro Digital Aquiry**, suas origens, periodicidade, confiabilidade, integrações, painéis consumidores e riscos associados.

A matriz apoia:

- **Governança dos dados** — clareza sobre origem, responsável e periodicidade.
- **Priorização de integrações** — onde investir esforço de automação.
- **Demonstrações institucionais seguras** — identificar o que pode ou não ser apresentado.
- **Auditoria de atualização** — saber quando cada base foi atualizada e por qual job.
- **Transparência sobre limitações** — registrar fragilidades em vez de ocultá-las.
- **Evolução dos painéis e do Assistente Aquiry** — embasar planejamento técnico e contextual.

---

## 2. Critérios de classificação

### 2.1 Tipo de origem

- **SQL Server interno** — base operacional do TCE-AC (APC, EJURIS, eProcess, contabilidade).
- **PostgreSQL interno** — banco principal lido pelo frontend (`varadouro_digital`).
- **API pública oficial** — Tesouro (SICONFI/CAUC), DataSUS, IBGE, BrasilAPI.
- **API institucional** — Active Directory interno, Apache PDF interno.
- **Arquivo CSV/XLSX manual** — ingestão manual em `etl/data/`.
- **Dado hardcoded** — valores embutidos em arquivo `.ts`.
- **Dado simulado/mockado** — valores fictícios em componentes.
- **Base documental local** — Markdown versionado em `src/data/aquiry/base-conhecimento/`.
- **Serviço de IA** — Azure OpenAI; provedores opcionais de busca externa.
- **Serviço de autenticação** — LDAP/AD.

### 2.2 Maturidade (escala 0–5)

- **0** — inexistente.
- **1** — planejado.
- **2** — manual / frágil.
- **3** — parcial.
- **4** — automatizado / confiável.
- **5** — maduro / auditável.

### 2.3 Risco de demonstração

- **Baixo** — pode ser apresentado livremente, com dados oficiais e fresc.
- **Médio** — pode ser apresentado com ressalvas (ex.: indicar ano de referência).
- **Alto** — não deve ser apresentado em demonstração institucional.

### 2.4 Periodicidade

Valores admitidos: **tempo real**, **diária**, **semanal**, **mensal**, **bimestral**, **quadrimestral**, **anual**, **sob demanda**, **indeterminada**.

---

## 3. Matriz geral de fontes de dados

| Fonte/Base | Tipo de origem | Sistema/origem externa | Tabelas internas ou arquivos | ETL/Job relacionado | Painéis/funcionalidades consumidoras | Periodicidade atual | Periodicidade ideal | Maturidade | Risco demo | Observações |
|---|---|---|---|---|---|---|---|---|---|---|
| **SQL Server APC / Polanco (combustível)** | SQL Server interno | APC — `dbo.sp_carga_tb_despesa_combustivel_polanco` | `raw.*`, `mart.combustivel_*` | `etl/jobs/apc-combustivel-polanco.ts`, `etl/jobs/combustivel.ts` | Painel Combustível, Empenhos Combustível | Diária (noturna, incremental) | Diária | 4 | Baixo | Carga procedure-based; sync residual para Supabase em `apc-polanco-sync-supabase.ts` |
| **SQL Server APC / Receita** | SQL Server interno | View `audit.vw_ReceitaPorCategoria` (APC) | `mart.receita_publica_*` | `etl/jobs/receita-publica.ts`, `etl/schema/postgres/110_receita_publica.sql` | Painel Receita Pública | Diária (noturna, incremental 3 meses) | Mensal | 3 | Médio | Em estabilização na branch `feature/painel-receita-publica`; sync residual Supabase |
| **SQL Server APC / Despesa-Empenho** | SQL Server interno | APC | `dw.fato_empenho`, `mart.mart_despesa*`, `mart.mart_credor_despesa*` | `etl/jobs/fato-empenho.ts`, `etl/jobs/despesa-full-postgres.ts`, `etl/jobs/despesa-incremental-postgres.ts`, `etl/jobs/refresh-mart-despesa.ts`, `etl/jobs/refresh-mart-credor-despesa.ts` | Painel Despesa, Pesquisa de Credores, Credor Detalhe | Diária (noturna) | Diária | 4 | Baixo | Migrations `020_mart_despesa.sql`, `030_stage_despesa.sql`, `140_mart_credor_despesa.sql` |
| **SQL Server Pautas / EJURIS** | SQL Server interno | EJURIS | `public.pauta_julgamento*`, `public.processo*` | `etl/jobs/pauta-julgamento.ts` | Pautas de Julgamento, Análise IA de Processo, Resumo de Pauta | Diária (noturna) | Diária | 4 | Baixo | Migrations `240_pauta_julgamento.sql` a `247_pauta_julgamento_arquivo_enrich.sql` |
| **SQL Server eProcess** | SQL Server interno | eProcess CE | `public.processo*`, vinculados | `etl/jobs/processos.ts`, `etl/jobs/processos-ce.ts`, `etl/jobs/processos-gabinete.ts` | Processos eProcess, Análise IA, Pautas | Diária (noturna) | Diária | 4 | Baixo | Migrations `100_processos_gabinete.sql`, `248_processo.sql` |
| **SQL Server contabilidade / Remessas** | SQL Server interno | Contabilidade institucional | `mart.mart_remessas*`, dimensoes de remessas | `etl/jobs/remessas-contabeis-full-postgres.ts`, `etl/jobs/remessas-dimensoes-postgres.ts`, `etl/jobs/refresh-mart-remessas.ts` | Calendário de Remessas, Alertas Remessas | Diária (noturna) | Diária | 4 | Baixo | Migration `120_remessas.sql` |
| **PostgreSQL Varadouro (banco principal)** | PostgreSQL interno | Banco local Docker (`infra/postgres/`) | Todos os schemas (`raw`, `stage`, `dw`, `mart`, `audit`, `public`) | `etl/jobs/postgres-migrate.ts`, `etl/jobs/postgres-check.ts` | Toda a UI lê via `src/lib/db.ts` | Sob demanda (consulta) | Tempo real | 5 | Baixo | 62 migrations versionadas em `etl/schema/postgres/000–260` |
| **SICONFI / Tesouro Nacional** | API pública oficial | `apidatalake.tesouro.gov.br/ords/siconfi/tt` | `dw.fato_siconfi_rreo`, `dw.fato_siconfi_rgf`, `raw.siconfi_extrato_entregas`, marts SICONFI | `etl/jobs/siconfi-rreo-full-postgres.ts`, `etl/jobs/siconfi-rreo-incremental-postgres.ts`, `etl/jobs/siconfi-rgf-full-postgres.ts`, `etl/jobs/siconfi-extrato-entregas-postgres.ts`, `etl/jobs/refresh-mart-siconfi-rreo.ts`, `etl/jobs/refresh-mart-siconfi-rgf.ts`. Cliente em `src/lib/fontes/siconfi/siconfiClient.ts` | Painel SICONFI (RREO/RGF/Extrato), Alertas SICONFI, Alertas Gabinete | Diária (noturna, incremental RREO; full RGF) | RREO bimestral / RGF quadrimestral / Extrato semanal | 4 | Baixo | Throttle 1 req/s; sem auth. Migrations `160_siconfi_rreo.sql`, `170_siconfi_extrato_entregas.sql`, `180_siconfi_rgf.sql`, `181`, `254`, `255`, `256` |
| **CAUC / Tesouro Transparente** | API pública oficial | Tesouro Transparente | `mart.*` CAUC (não confirmado nome exato no código) | `etl/jobs/cauc.ts` | Painel CAUC, Alertas CAUC, Alertas Gabinete | Diária (noturna) | Semanal/Diária | 4 | Baixo | Migrations `040_cauc.sql`, `041_cauc_views.sql` |
| **SIOPS (DataSUS)** | API pública oficial | DataSUS SIOPS | `dw.*`/`mart.*` SIOPS | `etl/jobs/siops-full-postgres.ts`, `etl/jobs/refresh-mart-siops.ts` | Painel Saúde — Orçamento, Alertas SIOPS, Alertas Gabinete | Conforme calendário DataSUS | Bimestral | 4 | Baixo | Migrations `150_siops.sql`, `151_siops_home.sql` |
| **SISAGUA (DataSUS)** | API pública oficial | DataSUS SISAGUA | `raw.*`/`mart.*` SISAGUA | `etl/jobs/sisagua-full-postgres.ts`, `etl/jobs/refresh-mart-sisagua.ts` | Painel Saúde — Qualidade da Água, Alertas SISAGUA | Conforme DataSUS | Mensal | 4 | Baixo | Migration `190_sisagua.sql`. Duplicidades tratadas em [../fase2a2-diagnostico-duplicatas-sisagua-siconfi.md](../fase2a2-diagnostico-duplicatas-sisagua-siconfi.md) |
| **InfoDengue** | API pública oficial | API InfoDengue | `dw.*`/`mart.*` InfoDengue | `etl/jobs/infodengue-full-postgres.ts`, `etl/jobs/refresh-mart-infodengue.ts` | Painel Vigilância Epidemiológica, Alertas Vigilância | Semanal | Semanal | 4 | Baixo | Migration `200_infodengue.sql` |
| **CNES / UBS (saúde-estrutura)** | API pública oficial | DataSUS CNES | `dw.*`/`mart.*` CNES | `etl/jobs/cnes-ubs-full-postgres.ts`, `etl/jobs/refresh-mart-saude-estrutura.ts` | Alertas Saúde-Estrutura | Conforme DataSUS | Mensal | 4 | Baixo | Migration `170_cnes_ubs.sql` |
| **PNI / Vacinação** | Arquivo CSV/XLSX manual | DataSUS PNI (APIs majoritariamente 404) | `raw.*`/`mart.*` PNI; arquivos em `etl/data/pni/cobertura/` | `etl/jobs/ingest-pni.ts`, `etl/jobs/ingest-pni-cobertura-xlsx.ts`, `etl/jobs/refresh-mart-pni.ts`, `etl/jobs/refresh-mart-pni-cobertura.ts` | Painel Saúde — Vacinação, Mapa Vacinação | Manual (XLSX/CSV) | Mensal | 3 | Médio | Migrations `210_pni_vacinacao.sql`, `211_pni_cobertura.sql`. Diagnóstico em [../pni-inventario.md](../pni-inventario.md) |
| **SIM / Mortalidade** | Arquivo CSV manual | DataSUS SIM | `raw.*`/`mart.*` mortalidade; arquivos `etl/data/sim/DO22OPEN..DO25OPEN.csv` | `etl/jobs/ingest-sim-csv.ts`, `etl/jobs/ingest-sim-api.ts`, `etl/jobs/refresh-mart-mortalidade.ts` | Painel Mortalidade | Manual (CSV) | Anual (oficial) / Trimestral (ingestão) | 3 | Médio | Migration `220_mortalidade_sinasc.sql`. Existe inspetor `sim-api-inspecionar.ts` e ingestor `ingest-sim-api.ts` (não confirmado em produção). Ver [../mortalidade-inventario.md](../mortalidade-inventario.md) |
| **SINASC (nascidos vivos)** | API/CSV — não confirmado em produção | DataSUS SINASC | Estrutura prevista em `220_mortalidade_sinasc.sql` | Sem job dedicado localizado | Sem painel dedicado localizado | Indeterminada | Anual | 2 | Alto | Migration prevê SINASC, mas **uso ativo não confirmado no código** |
| **CadÚnico (SAGI)** | Arquivo CSV/XLSX manual | SAGI | `raw.*`/`mart.*` CadÚnico; arquivos em `etl/data/cadunico/sagi/` | `etl/jobs/cadunico-incremental.ts` | Painel Social, Alertas CadÚnico | Manual + incremental | Mensal | 3 | Médio | Migration `220_cadunico.sql` |
| **MIS / Bolsa Família / BPC** | Arquivo XLSX manual | SAGI/MIS | `raw.*`/`mart.*` MIS; 22 XLSX em `etl/data/mis/` | `etl/jobs/mis-bolsa-familia-bpc.ts` | Painel Social — Transferência de Renda, Mapa Social | Manual mensal | Mensal | 3 | Médio | Migrations `221_mis_bolsa_familia_bpc.sql`, `222_mis_views.sql`, `223_fix_nomes_municipios.sql` |
| **IBGE — População** | API pública oficial | `servicodados.ibge.gov.br` | `dw.populacao_ibge` (não confirmado nome exato) | `etl/jobs/populacao-ibge.ts` | Cálculo de per capita em vários painéis | Anual | Anual | 4 | Baixo | Migration `090_populacao_ibge.sql` |
| **IBGE — GeoJSON / Malhas** | API pública oficial | `servicodados.ibge.gov.br/api/v3/malhas/estados/12?intrarregiao=municipio` | Não persistido (fetch em runtime) | Sem ETL (frontend) | Mapa Acre, Mapa Vacinação, Mapa Social, Mapa Receita, Mapa CAUC, Mapa Desmatamento | Tempo real (fetch live) | Tempo real | 4 | Baixo | Consumido em `src/components/Maps/MapaAcreContent.tsx` e mapas derivados |
| **BrasilAPI — CNPJ** | API pública oficial | `brasilapi.com.br` | `mart.mart_credor_despesa*` (campos enriquecidos) | `etl/jobs/credor-enriquecer-cnpj.ts`, `etl/jobs/credor-enriquecer-interno.ts`, `etl/jobs/credor-enriquecimento-preparar.ts`, `etl/jobs/credor-fontes-internas-inspecionar.ts` | Pesquisa de Credores, Painel Despesa | Diária (noturna, 4 steps) | Diária + sob demanda | 4 | Baixo | Migrations `130_credor_enriquecimento.sql`, `131_v2`, `132_v3` |
| **Active Directory (LDAP)** | Serviço de autenticação | `ldap://172.20.12.86:389` (domínio `tceac`) | `usuarios_autorizados` (Postgres) | Sem ETL (autenticação em runtime) | Login, autorização, gestão de usuários | Tempo real | Tempo real | 4 | Baixo | Cliente `ldapts` em `src/lib/auth/active-directory.ts` |
| **Apache PDF interno do eProcess** | API institucional | `http://172.20.12.105:8090` | Não persistido (proxy de leitura) | Sem ETL (fetch em runtime) | Detalhe de Processo, leitura PDF, IA de Processo (extração) | Tempo real | Tempo real | 3 | Médio | IP fixo; proxy reverso recomendado (ação #10 do plano) |
| **Azure OpenAI** | Serviço de IA | `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}/...` | `public.aquiry_evento_uso`, `public.ia_analise_processo_pauta`, `public.ia_analise_descartes`, `public.ia_job_analise_pauta` | Sem ETL (runtime); cache em DB | Assistente Aquiry, Análise IA de Processo, Resumo de Pauta, Relatório consolidado | Sob demanda | Sob demanda | 4 | Baixo | Cliente `src/lib/ia/azureOpenAI.ts`. Migrations `250–253` (IA) e `260` (auditoria) |
| **Busca externa do Aquiry** | Serviço de IA externo | Tavily / Brave / SerpAPI / Gemini (`AQUIRY_EXTERNAL_SEARCH_PROVIDER`) | — | Sem ETL (runtime) | Assistente Aquiry (estratégia `busca_externa`) | Sob demanda | Sob demanda | 3 | Médio | Opt-in via variável de ambiente; fallback "Busca externa necessária" quando ausente |
| **Base de conhecimento local do Aquiry** | Base documental local | — | `src/data/aquiry/base-conhecimento/{fontes,normas,projeto}/*.md` | Versionada em git | Assistente Aquiry (estratégia `varadouro` e `conhecimento_geral`) | Sob demanda | Mensal (revisão) | 4 | Baixo | Lookup por regex em `src/lib/aquiry/baseConhecimentoAquiry.ts`; previsto RAG vetorial (Fase 4) |
| **Cobertura Florestal (hardcoded)** | Dado hardcoded | — | `src/data/desmatamentoAcre.ts` | — | Painel Cobertura Florestal, Gráfico Cobertura, Gráfico Desmatamento, Mapa Desmatamento | Estático | Anual | 2 | **Alto** | Substituir por integração PRODES/DETER (INPE) — Fase 3 do plano |
| **IDEB (simulado)** | Dado simulado/mockado | — | Embutido em `src/components/Maps/MapaAcreContent.tsx` (22 municípios) | — | Mapa IDEB (Gabinete Digital) | Estático | Bienal | 2 | **Alto** | Substituir por dados INEP oficiais — Fase 2/3 do plano |
| **Supabase (residual)** | API/Postgres externo | Supabase (projeto institucional) | `tb_despesa_combustivel_polanco`, `receita_publica_categoria_mensal` (Supabase) | `etl/jobs/apc-polanco-sync-supabase.ts` + lógica em `etl/jobs/receita-publica.ts` | **Não consumido pelo frontend** (apenas sync de saída) | Diária (noturna) | — | 3 | Médio | Dívida técnica a encerrar — ação #1 do plano de evolução. Frontend lê apenas Postgres |
| **Configuração de ETL (interno)** | PostgreSQL interno | — | `audit.etl_log`, `audit.etl_carga`, `audit.etl_monitoramento_config`, `audit.etl_execucao_config` | `etl/jobs/postgres-migrate.ts`, `src/lib/etl-config.ts`, `src/lib/etl-job-commands.ts` | Painel Admin ETL (`/seguranca/etl`, `/seguranca/etl/configuracao`) | Tempo real | Tempo real | 3 | Médio | Logs voláteis no disparo manual (ação #4 do plano). Migrations `230_etl_config.sql`, `231`, `241`, `246`, `254` |
| **Auditoria do Aquiry** | PostgreSQL interno | — | `public.aquiry_evento_uso` | Inserido em runtime por `src/lib/aquiry/auditoriaAquiry.ts` quando `AQUIRY_AUDIT_PERSIST=true` | Auditoria institucional (consultas em [../aquiry/sql/auditoria-aquiry-consultas.sql](../aquiry/sql/auditoria-aquiry-consultas.sql)) | Tempo real | Tempo real | 4 | Baixo | Migration `260_aquiry_audit.sql`. Apenas metadados; **nenhum conteúdo textual persistido** |

---

## 4. Fontes por painel

| Painel/Funcionalidade | Fontes utilizadas | Tabelas internas principais | Job/carga responsável | Última atualização visível? | Fragilidade conhecida | Pode demonstrar hoje? |
|---|---|---|---|---|---|---|
| **Alertas do Gabinete (home)** | Postgres (agregação) | `mart.*`, `audit.*` consolidados | Vários jobs upstream | Sim (selo sidebar) | Personalização por conselheiro ainda ausente | Sim |
| **Despesa** | SQL Server APC | `mart.mart_despesa*`, `dw.fato_empenho` | `despesa-*-postgres.ts`, `refresh-mart-despesa.ts` | Parcial (via sidebar) | — | Sim |
| **Credores (Pesquisa + Detalhe)** | SQL Server APC + BrasilAPI | `mart.mart_credor_despesa*` | `credor-enriquecer-*.ts`, `refresh-mart-credor-despesa.ts` | Parcial | Enriquecimento CNPJ depende de rate da BrasilAPI | Sim |
| **Combustível** | SQL Server APC (Polanco) | `mart.combustivel_*` | `apc-combustivel-polanco.ts`, `combustivel.ts` | Parcial | Sync residual Supabase | Sim |
| **Receita Pública** | SQL Server APC (view receita) | `mart.receita_publica_*` | `receita-publica.ts` | Parcial | Em estabilização na branch atual | Interno apenas |
| **SICONFI RREO** | API SICONFI/Tesouro | `dw.fato_siconfi_rreo`, marts | `siconfi-rreo-*-postgres.ts`, `refresh-mart-siconfi-rreo.ts` | Parcial | — | Sim |
| **SICONFI RGF** | API SICONFI/Tesouro | `dw.fato_siconfi_rgf`, marts | `siconfi-rgf-full-postgres.ts`, `refresh-mart-siconfi-rgf.ts` | Parcial | Cobertura RGF estadual a ampliar | Sim |
| **Entregas SICONFI** | API SICONFI/Tesouro | `raw.siconfi_extrato_entregas` | `siconfi-extrato-entregas-postgres.ts` | Parcial | — | Sim |
| **CAUC** | API Tesouro Transparente | `mart.*` CAUC | `cauc.ts` | Parcial | Histórico de mudanças de status ainda ausente | Sim |
| **Remessas** | SQL Server contabilidade | `mart.mart_remessas*` | `remessas-contabeis-full-postgres.ts`, `refresh-mart-remessas.ts` | Parcial | Personalização por relator ainda ausente | Sim |
| **Saúde geral** | Agregação multi-fonte | `mart.saude_consolidado*` | `refresh-mart-saude-consolidado.ts` | Parcial | Depende de bases manuais (PNI/SIM) | Sim (com ressalva para PNI/SIM) |
| **SIOPS** | API DataSUS | `mart.*` SIOPS | `siops-full-postgres.ts`, `refresh-mart-siops.ts` | Parcial | — | Sim |
| **SISAGUA** | API DataSUS | `mart.*` SISAGUA | `sisagua-full-postgres.ts`, `refresh-mart-sisagua.ts` | Parcial | Duplicidades pontuais (tratadas) | Sim |
| **InfoDengue (Vigilância)** | API InfoDengue | `mart.*` InfoDengue | `infodengue-full-postgres.ts`, `refresh-mart-infodengue.ts` | Parcial | — | Sim |
| **PNI / Vacinação** | XLSX manual | `mart.*` PNI | `ingest-pni*.ts`, `refresh-mart-pni*.ts` | Não explícito | Ingestão manual | Com ressalva |
| **Mortalidade SIM** | CSV manual | `mart.*` mortalidade | `ingest-sim-csv.ts`, `refresh-mart-mortalidade.ts` | Não explícito | Ingestão manual | Com ressalva |
| **Social (CadÚnico/MIS)** | XLSX manual + SAGI | `mart.*` social/MIS | `cadunico-incremental.ts`, `mis-bolsa-familia-bpc.ts` | Não explícito | Ingestão manual | Com ressalva |
| **IDEB (Mapa Gabinete Digital)** | Dado simulado embutido | — | — | Não aplicável | Valor simulado | **Não** |
| **Cobertura Florestal** | Dado hardcoded | `src/data/desmatamentoAcre.ts` | — | Não aplicável | Hardcoded | **Não** |
| **Pautas de Julgamento** | SQL Server EJURIS | `public.pauta_julgamento*` | `pauta-julgamento.ts` | Parcial | — | Sim |
| **eProcessos** | SQL Server eProcess + Apache PDF | `public.processo*` + stream PDF | `processos-ce.ts`, `processos-gabinete.ts`, `processos.ts` | Parcial | IP fixo do servidor PDF | Sim |
| **Análise IA de Processo** | Azure OpenAI + Postgres (cache) | `public.ia_analise_processo_pauta`, `_html`, `_descartes`, `_job` | Runtime + jobs assíncronos | Sim (timestamp do cache) | — | Sim |
| **Resumo de Pauta** | Azure OpenAI + agregação | `public.ia_analise_processo_pauta` + sessão | Runtime | Sim (timestamp) | — | Sim |
| **Assistente Aquiry** | Azure OpenAI + base local + busca externa | `public.aquiry_evento_uso` (auditoria) | Runtime | Não aplicável | RAG vetorial ainda ausente | Sim |
| **Administração ETL** | Postgres `audit.*` | `audit.etl_log`, `audit.etl_carga`, configs | Runtime + jobs admin | Sim (via UI) | Logs voláteis no disparo manual | Apenas técnico |

---

## 5. Fontes críticas para demonstração

### 5.1 Fontes de baixo risco (recomendadas para demonstração)

- **PostgreSQL Varadouro** — base local, sob controle do TCE-AC.
- **SQL Server APC / EJURIS / eProcess / contabilidade** — fontes institucionais autoritativas.
- **SICONFI / Tesouro Nacional** — base oficial federal.
- **CAUC / Tesouro Transparente** — base oficial federal.
- **SIOPS, SISAGUA, InfoDengue, CNES** — APIs oficiais com ingestão automatizada.
- **IBGE — população e malhas** — base oficial estável.
- **BrasilAPI — CNPJ** — enriquecimento de credores, fonte conhecida.
- **Active Directory institucional** — controle de acesso interno.
- **Azure OpenAI + base documental local + auditoria** — IA institucional com rastreabilidade.

**Por quê:** todas têm fonte oficial, ingestão automatizada e auditoria de carga em `audit.etl_log` ou rastreabilidade institucional.

### 5.2 Fontes de risco médio (demonstrar com ressalva)

- **PNI / Vacinação** — ingestão manual; exibir ano/data de referência.
- **CadÚnico / SAGI** — ingestão semi-manual; ressaltar periodicidade.
- **MIS / Bolsa Família / BPC** — XLSX mensal manual.
- **Mortalidade SIM** — CSV manual; sinalizar ano de referência.
- **Receita Pública** — em estabilização na branch atual.
- **Apache PDF interno** — depende de IP fixo (`172.20.12.105:8090`).
- **Busca externa do Aquiry** — depende de provider opt-in; pode falhar silenciosamente.
- **Supabase residual** — dívida técnica em fase de remoção.

**Por quê:** funcionam, mas têm fragilidade operacional, periodicidade não-automática ou dependência sensível.

### 5.3 Fontes de risco alto (não demonstrar)

- **IDEB simulado** — valores não oficiais embutidos em código.
- **Cobertura Florestal hardcoded** — `src/data/desmatamentoAcre.ts`.
- **SINASC** — não confirmado em produção.

**Por quê:** publicar como dado oficial pode induzir percepção errada e gerar risco institucional.

---

## 6. Fontes frágeis ou manuais

| Fonte | Tipo de fragilidade | Problema | Impacto | Ação recomendada |
|---|---|---|---|---|
| PNI / Vacinação | CSV/XLSX manual | APIs DataSUS instáveis (404) | Indicador defasado frente ao período | Reavaliar APIs trimestralmente; exibir data da última carga |
| Mortalidade SIM | CSV manual | Ingestão sem periodicidade automática | Sugerir atualização que não existe | Avaliar API SIM atual (ver `ingest-sim-api.ts` e [../mortalidade-inventario.md](../mortalidade-inventario.md)) |
| CadÚnico (SAGI) | Importação manual | Ingestão semi-manual | Indicador defasado | Automatizar coleta SAGI |
| MIS / Bolsa Família / BPC | XLSX manual mensal | Ingestão manual | Indicador defasado | Automatizar coleta SAGI/MIS |
| IDEB | Dado simulado | Embutido em componentes | Risco de publicar valor não oficial como oficial | Integrar INEP — Fase 2/3 do plano |
| Cobertura Florestal | Dado hardcoded | `src/data/desmatamentoAcre.ts` | Divergência com fontes oficiais | Integrar PRODES/DETER (INPE) |
| APIs DataSUS CKAN | Endpoint instável | 404 generalizado | Bloqueia automação | Monitoramento contínuo via inspetores |
| Apache PDF interno | IP fixo | `172.20.12.105:8090` no código | Mudança de IP quebra produção | Proxy reverso / serviço dedicado |
| `AZURE_OPENAI_*` | Variável de ambiente sensível | Sem validação no boot | Falha silenciosa de IA em runtime | Validação obrigatória no boot — ação #7 do plano |
| Supabase residual | Sincronização residual | Dois jobs ainda sincronizam | Custo e exposição desnecessários | Encerramento total — ação #1 do plano |

---

## 7. Dependências técnicas sensíveis

### 7.1 Variáveis de ambiente críticas

- `DATABASE_URL` ou `PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD` — banco principal.
- `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_KEY`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION` — IA.
- `AD_LDAP_URL`, `AD_DOMAIN_PREFIX`, `AUTH_SESSION_SECRET`, `AUTH_USERS_TABLE` — autenticação.
- `REPOSITORIO_BASE_URL` — PDF do eProcess.
- `AQUIRY_EXTERNAL_SEARCH_PROVIDER`, `AQUIRY_EXTERNAL_SEARCH_API_KEY`, `AQUIRY_GEMINI_API_KEY` — busca externa (opt-in).
- `AQUIRY_AUDIT_PERSIST` — auditoria do Aquiry.
- `SICONFI_API_BASE_URL`, `SICONFI_TIMEOUT_MS` — cliente SICONFI.

### 7.2 IPs internos fixos

- `172.20.12.86:389` — Active Directory.
- `172.20.12.105:8090` — Apache PDF interno (substituir por proxy).

### 7.3 Serviços externos

- Azure OpenAI (chave institucional).
- SICONFI/Tesouro, IBGE, BrasilAPI, DataSUS, InfoDengue (sem auth, sujeitos a indisponibilidade).
- Supabase (residual).
- Providers de busca externa do Aquiry (Tavily/Brave/SerpAPI/Gemini, opcional).

### 7.4 Credenciais

- `SQLSERVER_USER`/`PASSWORD` (ETL).
- `SUPABASE_SERVICE_ROLE_KEY` (ETL residual).
- `AZURE_OPENAI_KEY` (runtime).
- `AQUIRY_*_API_KEY` (runtime, opcional).
- `AUTH_SESSION_SECRET` (assinatura JWT).

### 7.5 APIs sujeitas a indisponibilidade

- DataSUS CKAN — 404 generalizado documentado em [../datasus-inventario.md](../datasus-inventario.md).
- SICONFI — sem auth, mas com throttle exigido (1 req/s).
- BrasilAPI — limite de rate público.

### 7.6 Jobs noturnos

- Orquestrador único em `etl/schedule.ts` (cron `0 1 * * *`, TZ `America/Rio_Branco`).
- 21 steps controlados por flags `RUN_*_NIGHTLY=true|false`.
- Logs em `etl/logs/nightly_etl_*.log`.

### 7.7 Logs e auditoria

- `audit.etl_log`, `audit.etl_carga`, `audit.etl_monitoramento_config`, `audit.etl_execucao_config`.
- `public.aquiry_evento_uso` — auditoria do Aquiry (somente metadados).
- `public.ia_analise_descartes`, `public.ia_job_analise_pauta` — rastreabilidade da IA de processo.
- **Lacuna:** logs do disparo manual de ETL pela UI ainda são voláteis (console do Next).

### 7.8 Dependências do Azure OpenAI

- Toda a IA institucional do Varadouro depende deste serviço.
- Sem fallback local. Ausência de configuração leva a falha em runtime.
- Custos dependem de uso (Aquiry + análises IA).
- Recomendado: monitoramento de consumo e tetos por ambiente.

---

## 8. Regras de governança de dados

1. **Não demonstrar dado simulado como oficial.** Telas em ressalva permanecem fora de demonstrações institucionais.
2. **Exibir última atualização por base.** Cada painel deve expor a data/hora da última carga consumida.
3. **Manter origem visível.** Citar fonte (Tesouro, IBGE, DataSUS, INEP, INPE, eProcess) sempre que possível na UI.
4. **Registrar falhas de carga.** `audit.etl_log` deve refletir todas as execuções, inclusive falhas, com mensagem e timestamp.
5. **Separar dado manual de dado automatizado.** Painéis baseados em CSV/XLSX manual devem sinalizar essa natureza.
6. **Auditar uso da IA.** `AQUIRY_AUDIT_PERSIST=true` em produção, com retenção e expurgo definidos. Conteúdo textual **nunca** é persistido.
7. **Documentar limitações.** Lacunas registradas neste documento e nos demais da pasta `docs/varadouro/`.
8. **Priorizar fontes oficiais.** Em caso de divergência entre fonte oficial e enriquecimento interno, a oficial prevalece.
9. **Validar periodicidade.** SLA de atualização por base, monitorado por alerta automático quando ultrapassado.
10. **Evitar conclusões institucionais com dado desatualizado.** Alertas de defasagem devem bloquear (ou no mínimo sinalizar) decisões automáticas.

---

## 9. Recomendações prioritárias

1. **Painel de atualização por base** — expor, na UI, a data/hora da última carga de cada fonte, com SLA visível.
2. **Remoção do Supabase residual** — encerrar `apc-polanco-sync-supabase.ts` e o destino Supabase de receita-publica; manter apenas Postgres.
3. **Automação de SIM / PNI / Social** — substituir CSV/XLSX manual por jobs automatizados quando APIs oficiais permitirem; até lá, sinalizar data de referência.
4. **Substituição de dados hardcoded** — integrar Cobertura Florestal com PRODES/DETER (INPE) via ETL.
5. **Substituição de IDEB simulado** — integrar dados oficiais do INEP no Mapa Gabinete Digital.
6. **Proxy/configuração para PDFs eProcess** — desacoplar o frontend do IP interno `172.20.12.105:8090`.
7. **Logs persistentes do ETL Admin** — substituir log via console por streaming persistido em `audit.etl_log` e expor na UI.
8. **Testes de integridade de carga** — checks pós-carga (linhas, hashes, faixas plausíveis); alertar quando fora do esperado.
9. **Rastreabilidade de fontes no Aquiry** — exibir, na UI, qual base/fonte sustenta cada parágrafo das respostas; persistir em metadados de auditoria.
10. **Validação de variáveis críticas no boot** — falha explícita do Next em ausência de `DATABASE_URL`/`PG*`, `AZURE_OPENAI_*`, `AD_LDAP_URL`, `AUTH_SESSION_SECRET`, `REPOSITORIO_BASE_URL`.

---

## 10. Resumo executivo

O Varadouro Digital Aquiry é sustentado por um conjunto de **bases oficiais e institucionais** consolidadas em um único PostgreSQL local: SQL Server interno do TCE-AC (APC, EJURIS, eProcess, contabilidade), SICONFI e CAUC do Tesouro Nacional, IBGE (população e malhas), BrasilAPI (enriquecimento CNPJ), DataSUS (SIOPS, SISAGUA, InfoDengue, CNES, com restrições em PNI/SIM), Active Directory interno, Azure OpenAI para o Assistente Aquiry e a análise IA de processos, além da base documental local versionada do Aquiry.

São **maduras e demonstráveis hoje**: SICONFI, CAUC, Despesa/Credores, Combustível, Remessas, Pautas, eProcessos, Análise IA de Processo, Resumo de Pauta, Assistente Aquiry, SIOPS, SISAGUA e InfoDengue. São **frágeis ou exigem cautela**: PNI, Mortalidade SIM, CadÚnico/MIS (ingestão manual), Receita Pública (em estabilização) e a sincronização Supabase residual. **Não devem ser demonstradas**: o Mapa IDEB (valores simulados) e o painel de Cobertura Florestal (dados hardcoded).

As ações que reduzem o **maior risco institucional** são: integrar IDEB e Cobertura Florestal com fontes oficiais, automatizar as bases manuais de saúde e social, encerrar a dívida Supabase residual, desacoplar o servidor PDF do IP fixo, persistir os logs do ETL Admin, validar variáveis críticas no boot do Next e ampliar a rastreabilidade de fontes nas respostas do Aquiry. Executadas em conjunto, consolidam o Varadouro como ferramenta cotidiana do controle externo do TCE-AC, com governança de dados rastreável, periodicidade auditável e zero tolerância a apresentar dado simulado como oficial.
