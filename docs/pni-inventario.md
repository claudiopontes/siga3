# PNI — Inventário de Fontes de Vacinação

> Última inspeção via CKAN: 2026-05-11 — `npm run pni:inspecionar`
> Última inspeção via URL direta: aguardando configuração de PNI_DIRECT_URLS — `npm run pni:direto:inspecionar`

---

## 1. Fontes testadas

| Fonte | URL | Resultado |
|-------|-----|-----------|
| OpenDataSUS — Portal CKAN | https://opendatasus.saude.gov.br/api/3/action/package_show | **HTML (bloqueado)** — retornou HTTP 200 com HTML em vez de JSON |
| OpenDataSUS — Busca CKAN | https://opendatasus.saude.gov.br/api/3/action/package_search | **HTML (bloqueado)** — mesmo comportamento |
| API Dados Abertos Saúde — PNI | https://apidadosabertos.saude.gov.br/pni/* | **HTTP 404** — endpoint não existe |
| API Dados Abertos Saúde — SIPNI | https://apidadosabertos.saude.gov.br/sipni/* | **HTTP 404** — endpoint não existe |

**Conclusão:** O portal OpenDataSUS está bloqueando requisições automatizadas à API CKAN (retorna HTML em vez de JSON). A API alternativa não expõe PNI/SIPNI.

---

## 2. Dataset PNI 2025 — resultado da inspeção

- **Slug testado:** `doses-aplicadas-pelo-programa-de-nacional-de-imunizacoes-pni-2025`
- **Resultado:** CKAN retornou HTTP 200 com HTML — **bloqueio de bot detectado**
- **Datasets via busca por termos:** 0 resultados (mesma causa — resposta HTML)

O dataset existe no portal (URL conhecida), mas a API CKAN está inacessível programaticamente. O portal provavelmente exige acesso via navegador ou aplica throttling/captcha para scraping automatizado.

---

## 3. Datasets 2024 / 2026

| Ano | Slugs tentados | Resultado |
|-----|---------------|-----------|
| 2024 | `doses-aplicadas-pelo-programa-de-nacional-de-imunizacoes-pni-2024` | CKAN HTML — não acessível via API |
| 2025 | `doses-aplicadas-pelo-programa-de-nacional-de-imunizacoes-pni-2025` | CKAN HTML — não acessível via API |
| 2026 | `doses-aplicadas-pelo-programa-de-nacional-de-imunizacoes-pni-2026` | CKAN HTML — não acessível via API |

---

## 4. Recursos disponíveis por formato

Não foi possível listar os recursos individuais (CSV, JSON, XML, PDF) porque a API CKAN não respondeu com JSON. Os recursos são conhecidos descritivamente pela página pública do dataset, mas precisam ser acessados manualmente.

**Recursos esperados (baseado na descrição pública do dataset):**
- Arquivos mensais CSV/JSON: `Vacinação - Janeiro 2025`, `Vacinação - Fevereiro 2025`, ...
- Dicionário de variáveis em PDF (~60 variáveis)
- Possível datastore CKAN com API REST (a verificar manualmente)

---

## 5. Campos detectados

Não foi possível detectar campos automaticamente nesta execução. Com base na documentação pública do PNI/RNDS, os campos esperados são:

| Campo esperado | Tipo | Relevante para o Varadouro |
|---------------|------|---------------------------|
| `vacina_dataAplicacao` | data | ✓ série temporal |
| `paciente_endereco_coIbgeMunicipio` | string | ✓ join com dim_municipio |
| `paciente_endereco_uf` | string | ✓ filtro por UF |
| `vacina_nome` | string | ✓ imunobiológico |
| `vacina_descricaoDose` | string | ✓ dose |
| `vacina_grupoAtendimento_nome` | string | ✓ grupo/estratégia |
| `paciente_dataNascimento` | data | ✓ faixa etária (derivada) |
| `estabelecimento_valor` | string | ✓ CNES |
| `paciente_racaCor_valor` | string | opcional |
| `sistema_origem` | string | controle de qualidade |

> Fonte: documentação RNDS / SI-PNI DPNI (referência pública, não verificada por acesso direto nesta rodada).

---

## 6. Viabilidade para o Varadouro

**Resultado desta inspeção: BAIXA (bloqueio técnico)**

O bloqueio não significa que os dados não existem — eles existem e estão publicados. Significa que a abordagem de consumo via API CKAN automatizada não funcionou nesta rodada.

| Abordagem | Viabilidade | Motivo |
|-----------|-------------|--------|
| API CKAN automatizada | BAIXA | Portal retornou HTML (bloqueio) |
| API apidadosabertos.saude.gov.br | BAIXA | Endpoints PNI/SIPNI retornam 404 |
| Download manual de CSV mensais | MÉDIA | Exige acesso manual ao portal |
| SIPNI/TABNET cobertura consolidada | MÉDIA | Disponível via download manual |
| e-Gestor APS | MÉDIA | Requer autenticação do gestor |

---

## 7. Limitações

### Bloqueio CKAN
O portal opendatasus.saude.gov.br retornou HTTP 200 com conteúdo HTML para todas as chamadas à API CKAN. Isso indica:
- Cloudflare/WAF bloqueando user-agents sem cookies de sessão, **ou**
- Rate limiting agressivo com fallback para HTML, **ou**
- Alteração na infraestrutura do portal desde a publicação do dataset.

**Workaround possível:** usar `Accept: application/json` com cookies de sessão obtidos via navegador (Playwright/Puppeteer headless), ou tentar horários de menor carga.

### API alternativa sem endpoints PNI
O domínio `apidadosabertos.saude.gov.br` expõe CNES, SISAGUA e outros sistemas, mas **não expõe PNI/SIPNI**. Confirmado com HTTP 404 em todos os paths testados.

### Diferença entre doses aplicadas e cobertura vacinal

| Indicador | Descrição | Denominador |
|-----------|-----------|-------------|
| **Doses aplicadas** | Contagem de registros RNDS | Não exige — é o numerador |
| **Cobertura vacinal (%)** | Proporção vacinada da pop.-alvo | Exige pop.-alvo (IBGE/SIGTAP) |

Os arquivos do PNI/RNDS contêm **registros individuais de doses aplicadas**. Para calcular cobertura percentual, é necessário cruzar com a população-alvo por imunobiológico e faixa etária, disponível no SIGTAP ou em estimativas IBGE. A cobertura consolidada pronta está no SIPNI/TABNET.

---

## 8. Recomendação para próxima etapa

**Opção A — Tentar acesso direto às URLs dos recursos (recomendada):**
Acessar manualmente a página do dataset no portal e copiar as URLs reais dos arquivos CSV/JSON mensais. Testá-las diretamente (fora do fluxo CKAN). Atualizar `PNI_DATASET_SLUG_2025` e rodar `pni:inspecionar` novamente.

**Opção B — SIPNI/TABNET cobertura consolidada:**
O TABNET do DATASUS disponibiliza cobertura vacinal consolidada por município/imunobiológico/ano via download manual (`.csv` ou via TabulaNet). Exige formatação posterior, mas os dados são verificados e já incluem o denominador.

- URL: http://tabnet.datasus.gov.br/cgi/tabcgi.exe?pni/CNV/cpniuf.def
- Filtro: UF=Acre, anos 2024–2026, todos os imunobiológicos

**Opção C — e-Gestor APS:**
Cobertura vacinal por Equipe de Saúde da Família e município, disponível em relatórios do e-Gestor. Requer credenciais de gestor municipal do SUS.

### Para o módulo `/painel-saude/vacinacao` — decisão sobre o tipo de dado:

| Cenário | Dado base | Complexidade |
|---------|-----------|-------------|
| Doses aplicadas (RNDS) | Registros individuais | Alta — volume grande, filtro por UF necessário |
| Cobertura consolidada (TABNET) | Dados agrupados | Baixa — CSV tabular pronto |
| Cobertura calculada (RNDS + IBGE) | Numerador + denominador | Alta — exige dois datasets |

**Recomendação:** iniciar com cobertura consolidada do TABNET (Opção B) para a primeira versão do módulo. Evoluir para doses RNDS/SIPNI quando o acesso ao portal for resolvido.

---

---

## 9. Teste de URLs diretas OpenDataSUS

> Seção preenchida por `npm run pni:direto:inspecionar`.
> Configure as URLs primeiro em `etl/.env` → variável `PNI_DIRECT_URLS`.

### Como obter as URLs diretas

1. Acesse o dataset no portal:
   `https://opendatasus.saude.gov.br/dataset/doses-aplicadas-pelo-programa-de-nacional-de-imunizacoes-pni-2025`
2. Na seção **Recursos**, localize os arquivos mensais (ex: `Vacinação - Janeiro 2025`)
3. Clique com botão direito no link de download → **Copiar endereço do link**
4. Cole em `PNI_DIRECT_URLS` no arquivo `etl/.env` (múltiplas URLs separadas por vírgula)
5. Execute: `cd etl && npm run pni:direto:inspecionar`

### Resultado da inspeção por página de recurso — 2026-05-11

| Item | Valor |
|------|-------|
| URL testada | `https://opendatasus.saude.gov.br/dataset/.../resource/e40da42c-...` |
| Tipo de entrada | Página de recurso CKAN (`/resource/{uuid}`) |
| HTML retornado | ✓ 30.854 bytes — Next.js SPA ("Portal de Dados Abertos do SUS") |
| Links extraídos do HTML | 14 UUIDs (outros recursos do dataset) |
| Candidatos testados via HEAD | 18 URLs (dump, datastore, download) |
| Resultado de todos os HEADs | HTTP 200 + `text/html; charset=utf-8` + `0.0 MB` |
| WAF/CDN detectado | **SIM** — todas as URLs retornaram HTML com 0 bytes |
| URL real do arquivo obtida | **NÃO** — bloqueada pelo WAF |
| Viabilidade | **BAIXA** (bloqueio técnico, não ausência de dado) |

### Diagnóstico técnico do bloqueio

O portal `opendatasus.saude.gov.br` usa uma arquitetura **Next.js SPA com WAF (Cloudflare ou similar)** que:

1. Serve o shell Next.js (`text/html`) para **todas** as requisições automatizadas, independente da URL
2. Retorna HTTP 200 com `content-length: 0` para endpoints de arquivo (`/datastore/dump/`, `/download/`, API CKAN)
3. Não contém os links de download no HTML inicial (página SSR sem dados — carregamento via JS/API)
4. O `__NEXT_DATA__` da página não incluiu `resource.url` (dados carregados dinamicamente no browser)

O arquivo existe e está acessível via navegador (o botão "Baixar" funciona). O bloqueio é só para requisições HTTP automatizadas sem cookies de sessão.

### Como obter a URL real do arquivo (obrigatório para próxima execução)

1. Abra no navegador: `https://opendatasus.saude.gov.br/dataset/doses-aplicadas-pelo-programa-de-nacional-de-imunizacoes-pni-2025/resource/e40da42c-9e96-4447-8d05-57cdf5830f69`
2. **Clique com botão direito no botão "Baixar"** (não clique para baixar — só copie o link)
3. Escolha **"Copiar endereço do link"**
4. A URL será algo como: `https://opendatasus.saude.gov.br/.../download/vacinas-2025-01.zip`
5. Cole em `etl/.env`:
   ```
   PNI_DIRECT_URLS=https://url-real-do-arquivo.zip
   ```
6. Execute novamente: `cd etl && npm run pni:direto:inspecionar`

### Capacidades atuais do job (após esta sessão)

O job `pni-direto-inspecionar.ts` agora suporta:

| Tipo de entrada | Suporte |
|----------------|---------|
| URL direta de CSV | ✓ Completo — HEAD + Range + inspeção |
| URL direta de JSON | ✓ Completo — HEAD + Range + inspeção |
| URL direta de ZIP | ✓ Completo — HEAD + Range + ZIP header + inflateRaw + CSV interno |
| URL de página `/resource/{uuid}` | ✓ Parcial — extrai `__NEXT_DATA__`, hrefs, fallbacks por UUID |
| Portal com WAF (HTML para tudo) | ✓ Detecta e reporta com instruções claras |

### Recomendação após inspeção de página de recurso

**Opção A (preferida):** obter a URL direta do ZIP clicando com botão direito no botão "Baixar" no navegador e testá-la com `pni:direto:inspecionar`. O job saberá inspecionar o ZIP, extrair o CSV interno e detectar os campos.

**Opção B:** usar SIPNI/TABNET para cobertura vacinal consolidada (download manual), que não tem WAF e retorna CSV direto.

---

*Jobs:*
- *`etl/jobs/pni-inspecionar.ts` → `npm run pni:inspecionar` (via API CKAN)*
- *`etl/jobs/pni-direto-inspecionar.ts` → `npm run pni:direto:inspecionar` (via URLs diretas)*

---

## 11. Cobertura Vacinal — Planilhas XLSX (DPNI/DATASUS)

### Diferença entre doses aplicadas e cobertura vacinal

| Conceito | Fonte | Descrição |
|----------|-------|-----------|
| **Doses aplicadas** | API `apidadosabertos.saude.gov.br/v1/vacinacao/doses-aplicadas/pni-{ano}` | Contagem de registros RNDS individuais — **numerador bruto** |
| **Cobertura vacinal (%)** | Planilhas XLSX DPNI | Proporção da população-alvo vacinada — já inclui denominador oficial |

As planilhas de cobertura são a fonte oficial para análise de meta atingida.

### Arquivos disponíveis

| Arquivo | Ano | Tipo | Data Referência | Localização |
|---------|-----|------|-----------------|-------------|
| `Cobertura Vacina 2025.xlsx` | 2025 | FECHADO | 2025-12-31 | `etl/data/pni/cobertura/2025/` |
| `Cobertura Vacina 01-04-2026.xlsx` | 2026 | PARCIAL | 2026-04-01 | `etl/data/pni/cobertura/2026/` |

### Estrutura das planilhas

- **Aba:** Sheet1
- **Intervalo:** A1:BH31 (aproximado)
- **Linha 1:** nomes dos imunobiológicos (repete 3x por bloco)
- **Linha 2:** métricas (`Cobertura Vacinal (%)`, `Numerador`, `Denominador`)
- **Colunas A–F:** dimensões geográficas (Região, UF, Macrorregião, Região de Saúde, Município)
- **Colunas G+:** blocos de 3 colunas por imunobiológico
- **Cobertura:** armazenada como fração decimal (0.965 = 96,5%) → ETL converte para percentual (96.5)
- **Filtro Acre:** apenas linhas com `UF Residência = "AC"` são carregadas

### Controle de versão e status

| Status | Descrição |
|--------|-----------|
| `ATIVO` | Arquivo mais relevante do ano — usado nas marts e alertas principais |
| `SUPERADO` | Versão parcial anterior do mesmo ano, substituída por versão mais recente |
| `RETIFICADO` | Versão fechada substituída por retificação posterior |
| `ERRO` | Falha no processamento — não propagado para DW |

**Regra de vencedor:** FECHADO > PARCIAL; entre PARCIAIS, maior `data_referencia` vence.

### Meta padrão

- **Meta:** 95% de cobertura vacinal
- `abaixo_meta = cobertura_percentual < 95`
- `distancia_meta = cobertura_percentual - 95`

### Regras de alerta por tipo de período

| Tipo | Período | Nível |
|------|---------|-------|
| `pni_cobertura_baixa_fechamento` | FECHADO, cobertura < 95% | CRITICO (<80%) / ALTO (80-95%) |
| `pni_cobertura_baixa_parcial` | PARCIAL, cobertura < 95% | MEDIO — acompanhamento, não conclusivo |
| `pni_cobertura_muito_baixa` | qualquer, cobertura < 50% | CRITICO (FECHADO) / ALTO (PARCIAL) |
| `pni_sem_denominador` | denominador null/0 | MEDIO |

**2026 parcial:** alertas gerados como MEDIO, nunca CRITICO de fechamento. O exercício está em aberto.

### Comandos

```bash
cd etl

# Aplicar schema (primeira vez)
npm run postgres:migrate

# Ingerir planilhas e recalcular marts + consolidado
npm run carga-pni-cobertura:postgres

# Ou etapas separadas:
npm run pni:cobertura:ingest    # lê XLSX → raw → stage → dw
npm run mart:pni-cobertura      # recalcula marts de cobertura
npm run mart:saude-consolidado  # integra ao painel consolidado
```

### Onde colocar novos arquivos

```
etl/data/pni/cobertura/
  2025/
    Cobertura Vacina 2025.xlsx          ← fechado (ano completo)
  2026/
    Cobertura Vacina 01-04-2026.xlsx    ← parcial (referência abr/2026)
    Cobertura Vacina 01-05-2026.xlsx    ← novo parcial (mai/2026) → SUPERADO o anterior
    Cobertura Vacina 2026.xlsx          ← quando fechado → SUPERADO todos os parciais
```

O ETL usa **hash SHA-256** para evitar carga duplicada — o mesmo arquivo pode ser reprocessado com segurança.
