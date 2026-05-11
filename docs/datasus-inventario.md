# Inventário DATASUS / OpenDataSUS

**Projeto:** Varadouro Digital — TCE-AC  
**Data da inspeção:** 2026-05-10  
**Job:** `etl/jobs/datasus-inspecionar.ts` (`npm run datasus:inspecionar`)  
**UF:** AC | **Anos de interesse:** 2023–2026

---

## Resultado da Inspeção Automatizada

| Fonte | Finalidade | Endpoint/Recurso testado | Formato | Viabilidade | Subpágina sugerida | Observações |
|-------|-----------|--------------------------|---------|-------------|-------------------|-------------|
| SIM | Óbitos e mortalidade | `apidadosabertos.saude.gov.br/sim/v1/obitos` | ERRO (HTTP 404) | BAIXA | mortalidade | Endpoint não existe nesta base |
| SIM | Óbitos e mortalidade | `apidadosabertos.saude.gov.br/sim/obitos` | ERRO (HTTP 404) | BAIXA | mortalidade | Variante de path também inexistente |
| SINASC | Nascidos vivos | `apidadosabertos.saude.gov.br/sinasc/v1/nascidos` | ERRO (HTTP 404) | BAIXA | mortalidade | Endpoint não existe nesta base |
| SIH/SUS | Internações (AIH) | `apidadosabertos.saude.gov.br/sih/v1/aih` | ERRO (HTTP 404) | BAIXA | assistencia | Endpoint não existe |
| SIH/SUS | Internações consolidadas | `apidadosabertos.saude.gov.br/sih/internacoes` | ERRO (HTTP 404) | BAIXA | assistencia | Endpoint não existe |
| SIA/SUS | Produção ambulatorial (BPA) | `apidadosabertos.saude.gov.br/sia/v1/bpa` | ERRO (HTTP 404) | BAIXA | assistencia | Endpoint não existe |
| SI-PNI | Cobertura vacinal | `apidadosabertos.saude.gov.br/pni/v1/cobertura` | ERRO (HTTP 404) | BAIXA | vacinacao | Endpoint não existe |
| SI-PNI | Doses aplicadas | `apidadosabertos.saude.gov.br/pni/doses` | ERRO (HTTP 404) | BAIXA | vacinacao | Endpoint não existe |
| SINAN/Dengue | Casos dengue | `apidadosabertos.saude.gov.br/sinan/v1/dengue` | ERRO (HTTP 404) | BAIXA | vigilancia | Endpoint não existe |
| SINAN/Tuberculose | Casos tuberculose | `apidadosabertos.saude.gov.br/sinan/v1/tuberculose` | ERRO (HTTP 404) | BAIXA | vigilancia | Endpoint não existe |
| SINAN/Hanseníase | Casos hanseníase | `apidadosabertos.saude.gov.br/sinan/v1/hanseniase` | ERRO (HTTP 404) | BAIXA | vigilancia | Endpoint não existe |
| SVS/Arboviroses | Dengue/chikungunya/zika | `apidadosabertos.saude.gov.br/svs/arboviroses` | ERRO (HTTP 404) | BAIXA | vigilancia | Endpoint não existe |
| CKAN (todas as buscas) | Todos os datasets | `opendatasus.saude.gov.br/api/3/action/package_search` | HTML | BAIXA | — | Portal retorna HTML em vez de JSON para buscas programáticas; CKAN API não está acessível via curl/fetch direto |

---

## Diagnóstico

### Portal CKAN (`opendatasus.saude.gov.br`)

A API CKAN do OpenDataSUS (`/api/3/action/package_search`) retornou **HTML (HTTP 200)** em todas as buscas, em vez de JSON. Isso indica que:

- O portal pode estar exigindo cookies de sessão ou headers específicos de navegador
- A API CKAN pode estar protegida por Cloudflare ou WAF que bloqueia `User-Agent` de scripts
- O endpoint pode ter mudado de versão

**Impacto:** Não foi possível enumerar datasets nem resource_ids automaticamente.

### API alternativa (`apidadosabertos.saude.gov.br`)

Todos os 12 endpoints testados retornaram **HTTP 404**. Os paths testados seguiram padrões `/sim/v1/`, `/sinasc/v1/`, `/sih/v1/`, `/sia/v1/`, `/pni/v1/`, `/sinan/v1/` e `/svs/` — nenhum está ativo.

O que **está** ativo nesta mesma base (confirmado por jobs anteriores do projeto):
- `/cnes/estabelecimentos` — CNES/UBS (já integrado)
- `/sisagua/` — SISAGUA (já integrado)
- `/siops/` (via `siops-consulta-publica-api.saude.gov.br`) — SIOPS (já integrado)

---

## Fontes Alternativas Identificadas (pesquisa manual)

Com base na documentação pública e experiência de integrações anteriores do projeto, as fontes abaixo têm caminhos alternativos viáveis:

### SI-PNI — Vacinação

| Recurso | Detalhes |
|---------|----------|
| **Portal SI-PNI** | `https://si.pni.saude.gov.br` — relatórios por UF/município/imunobiológico |
| **API e-SUS** | `https://rnds-service.saude.gov.br` — requer certificado ICP-Brasil (inviável para ETL público) |
| **TABNET/DATASUS** | `http://tabnet.datasus.gov.br/cgi/tabcgi.exe?pni/cnv/cpniuf.def` — retorna CSV, requer scraping de formulário |
| **Planilhas publicadas** | Ministério da Saúde publica coberturas anuais em planilhas no `saude.gov.br` — download manual, mas estruturado |
| **Periodicidade** | Mensal (competência) |
| **Defasagem estimada** | 1–2 meses |
| **Viabilidade via planilha** | MEDIA — download manual periódico ou scraping do TABNET |

### SIM — Mortalidade / SINASC — Nascidos Vivos

| Recurso | Detalhes |
|---------|----------|
| **TABNET/DATASUS** | `http://tabnet.datasus.gov.br` — acesso via formulário POST, retorna CSV (scraping) |
| **FTP DATASUS** | `ftp://ftp.datasus.gov.br/dissemin/publicos/SIM/` e `.../SINASC/` — arquivos DBF por UF e ano (ex: `DOAC23.DBC` para Acre 2023) |
| **Formato DBF/DBC** | Requer biblioteca `read.dbc` (R) ou `pydbc` (Python); `ts-node` não tem suporte nativo |
| **Periodicidade** | Anual (com defasagem de 1–2 anos para dados consolidados) |
| **Defasagem estimada** | Dados 2023 disponíveis em meados de 2025 |
| **Viabilidade via FTP** | MEDIA — necessário pipeline de conversão DBC→CSV→PostgreSQL |

### SIH/SUS — Internações / SIA/SUS — Produção Ambulatorial

| Recurso | Detalhes |
|---------|----------|
| **FTP DATASUS** | `ftp://ftp.datasus.gov.br/dissemin/publicos/SIHSUS/` e `.../SIASUS/` — arquivos DBC mensais |
| **Volume** | Alto — arquivos mensais por UF, cada um com dezenas de milhares de registros |
| **Formato** | DBF/DBC — mesmo problema de conversão do SIM/SINASC |
| **TABNET** | Disponível, mas via formulário |
| **Periodicidade** | Mensal |
| **Defasagem estimada** | 2–3 meses |
| **Viabilidade** | BAIXA (curto prazo) — pipeline de conversão DBC necessário; volume alto |

### SINAN — Agravos / Dengue / Tuberculose / Hanseníase

| Recurso | Detalhes |
|---------|----------|
| **FTP DATASUS** | `ftp://ftp.datasus.gov.br/dissemin/publicos/SINAN/` — arquivos DBF por agravo e ano |
| **InfoDengue (Fiocruz)** | `https://info.dengue.mat.br/api/alertcity/` — **API REST JSON funcional**, filtrável por geocode de município, doença e semana epidemiológica |
| **SVS Painel** | `https://datasus.saude.gov.br/acesso-a-informacao/morbidade-hospitalar-do-sus-sih-sus/` — navegável, sem API |
| **Periodicidade** | Semanal (InfoDengue) / Anual (FTP) |
| **Defasagem estimada** | InfoDengue: 1–2 semanas; FTP: 1–2 anos |
| **Viabilidade InfoDengue** | **ALTA** — API REST JSON pública, sem autenticação, filtrável por município, doença e período |

---

## Recomendação por Subpágina

### `/painel-saude/vigilancia` — **Recomendada como próxima** ⭐

**Fonte:** InfoDengue (Fiocruz) — `https://info.dengue.mat.br/api/alertcity/`

**Por quê:**
- Única fonte com API REST JSON funcional, pública e sem autenticação
- Filtros nativos por geocode (IBGE), doença (`dengue`, `chikungunya`, `zika`), `ew_start` e `ew_end` (semana epidemiológica)
- Dados semanais com defasagem de 1–2 semanas
- Estrutura bem documentada, usada por secretarias estaduais
- Padrão de integração similar ao SISAGUA (já implementado)

**Campos esperados:** `geocode`, `data_iniSE`, `SE`, `casos_est`, `casos`, `nivel`, `Rt`, `notif_accum_year`

**Exemplo de endpoint:**
```
https://info.dengue.mat.br/api/alertcity/?geocode=1200401&disease=dengue&format=json&ew_start=1&ew_end=52&ey_start=2023&ey_end=2023
```
(geocode = código IBGE 7 dígitos, ex: 1200401 = Rio Branco/AC)

---

### `/painel-saude/vacinacao` — Segunda prioridade

**Fonte:** Planilhas SI-PNI (cobertura vacinal anual por município)

**Caminho recomendado:**
1. Download manual ou script de planilha Excel do portal `saude.gov.br/cobertura-vacinal`
2. ETL simples de leitura de `.xlsx` → PostgreSQL
3. Campos disponíveis: município, imunobiológico, doses aplicadas, população-alvo, cobertura %

**Viabilidade:** MEDIA — requer download periódico manual ou scraping de página, não tem API REST.

---

### `/painel-saude/mortalidade` e `/painel-saude/assistencia` — Prioridade mais baixa

**Fontes:** SIM, SINASC, SIH, SIA — todas via FTP DATASUS em formato DBC/DBF

**Bloqueadores:**
- Formato DBC requer biblioteca de conversão não disponível em Node.js/TypeScript nativamente
- Volume de dados alto (arquivos mensais/anuais por UF)
- Defasagem de 1–2 anos para dados consolidados de mortalidade

**Caminho de longo prazo:** pipeline Python/R para conversão DBC→Parquet/CSV + carga via ETL Node.js.

---

## Resumo Executivo

| Critério | Resultado |
|----------|-----------|
| Fontes com API REST JSON funcional | **InfoDengue (Fiocruz)** — única identificada |
| Portal CKAN (opendatasus.saude.gov.br) | Retornou HTML — API CKAN não acessível programaticamente |
| API `apidadosabertos.saude.gov.br` | 12/12 endpoints retornaram HTTP 404 |
| Fontes que exigem conversão DBC/DBF | SIM, SINASC, SIH/SUS, SIA/SUS, SINAN |
| Fontes com planilha estruturada disponível | SI-PNI (cobertura vacinal anual) |
| Próxima subpágina recomendada | `/painel-saude/vigilancia` (InfoDengue) |

---

## Próximos Passos Propostos

1. **Criar job `infodengue-inspecionar.ts`** — testar API InfoDengue para todos os 22 municípios do Acre
2. **Criar job `infodengue-full-postgres.ts`** — carga de casos de dengue/chikungunya/zika por semana epidemiológica
3. **Criar mart `saude_vigilancia_epidemiologica`** — agregações por município, doença e semana
4. **Implementar `/painel-saude/vigilancia`** — mapa de calor + série temporal de casos
5. **(Paralelo)** Avaliar pipeline Python para SIM/SINASC via FTP DATASUS se mortalidade for prioritária
