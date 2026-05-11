# PostgreSQL Local — Varadouro Digital ETL

## Objetivo

Este documento descreve como configurar e usar o PostgreSQL local como destino do ETL do Varadouro Digital, em substituição ou complemento ao Supabase.

---

## Como subir o banco local

Requisito: Docker instalado e em execução.

```bash
cd infra/postgres
docker compose -f docker-compose.postgres.yml up -d
```

O banco ficará disponível em `localhost:5432` com as credenciais padrão:
- Usuário: `varadouro`
- Senha: `varadouro_dev`
- Banco: `varadouro_digital`

Para parar:
```bash
docker compose -f docker-compose.postgres.yml down
```

Para remover também os dados (volume):
```bash
docker compose -f docker-compose.postgres.yml down -v
```

---

## Configurar o ETL

Copie o arquivo de exemplo e ajuste conforme necessário:

```bash
cp etl/.env.example etl/.env
```

Para usar o PostgreSQL local (padrão), mantenha `ETL_TARGET=postgres` e configure as variáveis `PG*` ou `DATABASE_URL`.

---

## Aplicar os schemas (migrations)

Com o banco local rodando, execute:

```bash
cd etl
npm run postgres:migrate
```

Isso aplica em ordem os arquivos SQL em `etl/schema/postgres/`:
1. `000_init_varadouro.sql` — schemas base e tabelas de auditoria
2. `010_public_compat.sql` — tabelas compatíveis com o modelo Supabase
3. `020_mart_despesa.sql` — tabelas mart para o Painel de Despesa

---

## Testar a conexão

```bash
cd etl
npm run postgres:check
```

O script verifica:
- Versão do PostgreSQL
- Existência dos schemas: raw, stage, dw, mart, audit
- Existência e contagem das tabelas principais

---

## Migrar dados do Supabase para o PostgreSQL local

Configure as variáveis do Supabase no `etl/.env` e execute:

```bash
cd etl
npm run migrar:supabase-postgres
```

Variáveis de controle:
- `MIGRAR_TABELAS` — tabelas a migrar (padrão: `dim_ente,dim_credor,fato_empenho`)
- `MIGRAR_MODO` — modo de carga (padrão: `truncate_insert`)
- `MIGRAR_BATCH_SIZE` — tamanho do lote de leitura (padrão: `1000`)

---

## Gerar (ou atualizar) as tabelas mart de despesa

Após popular `fato_empenho`, `dim_ente` e `dim_credor`, execute:

```bash
cd etl
npm run mart:despesa
```

Isso popula as tabelas:
- `mart.despesa_resumo`
- `mart.despesa_evolucao_mensal`
- `mart.despesa_ranking_entes`
- `mart.despesa_ranking_credores`
- `mart.despesa_composicao`
- `mart.despesa_alertas`

---

## Carga full a partir das fontes oficiais do TCE

O caminho preferencial de carga é direto das fontes do TCE (SQL Server) para o PostgreSQL local:

```
SQL Server (TCE) → ETL → PostgreSQL local
```

O script `migrar:supabase-postgres` é apenas um fallback legado para situações onde o acesso ao SQL Server não esteja disponível.

### Como executar a carga full

```bash
cd etl
npm run postgres:migrate   # aplica schemas (apenas na primeira vez)
npm run carga-full:postgres  # carrega dimensões + despesa + mart
```

Esse comando executa em sequência:
1. `dimensoes:postgres` — carrega dim_ente, dim_entidade e dim_credor do SQL Server
2. `despesa:full:postgres` — carrega fato_empenho do SQL Server via staging
3. `mart:despesa` — recalcula as tabelas mart.*

### Trocar para o PostgreSQL institucional

Quando a infraestrutura entregar o banco PostgreSQL de homologação/produção, basta alterar no `etl/.env`:

```
DATABASE_URL=postgres://usuario:senha@host-institucional:5432/banco
# ou separadamente:
PGHOST=host-institucional
PGDATABASE=nome_banco
PGUSER=usuario
PGPASSWORD=senha
```

Nenhuma alteração de código é necessária.

---

## Trocar para o banco institucional (produção)

Basta alterar `DATABASE_URL` ou as variáveis `PG*` no `etl/.env` para apontar para o servidor PostgreSQL institucional do TCE-AC. Nenhum código precisa ser alterado.

Para usar SSL:
```
PGSSLMODE=require
```

---

## Observação sobre o frontend

O frontend Next.js (Painel de Despesa e demais painéis) continua usando o Supabase como backend de leitura. A migração para PostgreSQL local é exclusiva do ETL. Quando o banco institucional estiver disponível, o frontend poderá ser adaptado para consumir uma API própria ou Supabase apontando para o PostgreSQL institucional via connection pooler.

---

## Enriquecimento cadastral e marts de credores

O módulo de credores enriquece os documentos (CPF/CNPJ) presentes em `fato_empenho`
com dados cadastrais de fontes internas (SQL Server) e opcionalmente APIs públicas de CNPJ.

### Tabelas geradas

| Tabela | Descrição |
|---|---|
| `dw.dim_credor_enriquecido` | Cadastro enriquecido com nome, município, situação cadastral etc. |
| `audit.credor_enriquecimento_log` | Log de cada operação de enriquecimento |
| `mart.credor_resumo` | Totais por credor (empenhado, pago, qtd entidades...) |
| `mart.credor_evolucao_mensal` | Evolução mês a mês por credor |
| `mart.credor_entidades` | Quais entidades cada credor atendeu |
| `mart.credor_empenhos_relevantes` | Top 500 empenhos por credor |
| `mart.credor_pesquisa` | Tabela desnormalizada com `termo_pesquisa` para busca full-text |

### Fluxo completo de enriquecimento

```bash
cd etl

# 1. Migra schema (cria as tabelas novas)
npm run postgres:migrate

# 2. Prepara lista de credores únicos e identifica tipo (CPF/CNPJ)
npm run credor:enriquecimento:preparar

# 3. (Opcional) Descobre fontes internas no SQL Server
npm run credor:fontes:inspecionar

# 4. (Opcional) Enriquece com base interna — requer CREDOR_INTERNO_TABLE no .env
npm run credor:enriquecer:interno

# 5. (Opcional) Enriquece CNPJs via API pública — requer CNPJ_ENRICH_PROVIDER != none
npm run credor:enriquecer:cnpj

# 6. Reconstrói as marts de credores
npm run mart:credor-despesa

# Ou tudo junto:
npm run credor:enriquecimento
```

### Configurar enriquecimento interno

1. Execute `npm run credor:fontes:inspecionar` para ver as tabelas candidatas.
2. Copie os valores sugeridos para o `.env`:

```env
CREDOR_INTERNO_DATABASE=APC
CREDOR_INTERNO_TABLE=referencias.FORNECEDORES      # exemplo
CREDOR_INTERNO_DOCUMENTO_COLUMN=CPF_CNPJ
CREDOR_INTERNO_NOME_COLUMN=NOME_RAZAO
CREDOR_INTERNO_CIDADE_COLUMN=MUNICIPIO             # opcional
CREDOR_INTERNO_UF_COLUMN=UF                        # opcional
```

3. Execute `npm run credor:enriquecer:interno`.

### Configurar enriquecimento de CNPJ via API

O padrão é `CNPJ_ENRICH_PROVIDER=none` (desativado). Para ativar:

```env
CNPJ_ENRICH_PROVIDER=brasilapi   # ou receitaws
CNPJ_ENRICH_RATE_LIMIT_MS=1000   # intervalo entre requisições (ms)
CNPJ_ENRICH_MAX_PER_RUN=100      # máximo de CNPJs por execução
```

Execute `npm run credor:enriquecer:cnpj`. CPFs nunca são consultados via API.

### Integração com carga-full

O comando `carga-full:postgres` já inclui `credor:enriquecimento:preparar` e `mart:credor-despesa`
na sequência de carga. O enriquecimento interno e CNPJ são opcionais e executados separadamente.

---

## SIOPS — Saúde

**Finalidade:** Monitorar o cumprimento do mínimo constitucional de aplicação em saúde pelos municípios do Acre, detectar atrasos de transmissão e variações atípicas de despesa, com base no SIOPS (Sistema de Informações sobre Orçamentos Públicos em Saúde).

**Periodicidade:** Bimestral (6 bimestres por ano).

**Fonte:** API pública do Ministério da Saúde — configurável via `SIOPS_API_BASE_URL`.

### Tabelas geradas

| Tabela | Descrição |
|---|---|
| `raw.siops_indicadores_raw` | Payload bruto por município/período (auditoria e reprocessamento) |
| `stage.siops_indicadores_stg` | Dados normalizados antes da promoção ao DW |
| `dw.fato_siops_indicador` | Fatos por município/período/indicador |
| `mart.siops_resumo_municipio` | Resumo rápido por município e período |
| `mart.siops_alertas` | Histórico completo de alertas (todos os períodos, todos os níveis) |
| `mart.siops_alertas_home` | Alertas recentes e acionáveis — **usar para a home** (apenas CRITICO/ALTO, período mais recente, máx 30) |
| `mart.siops_resumo_home` | Contador agregado para o card da home (total, críticos, altos, municípios afetados) |

> **Regra de uso:** `siops_alertas` contém o histórico completo para análise. `siops_alertas_home` é o subconjunto filtrado para exibição na tela principal — sem ruído histórico.

### Comandos

```bash
cd etl

# Aplicar schema (apenas na primeira vez ou após atualizar)
npm run postgres:migrate

# Inspecionar endpoints e formato da API SIOPS
npm run siops:inspecionar

# Carga completa (todos os anos configurados, todos os municípios do Acre)
npm run carga-siops:postgres

# Ou separadamente:
npm run siops:full:postgres   # carrega raw + stage + dw
npm run mart:siops            # gera resumo e alertas
```

### Alertas gerados inicialmente

| Tipo | Nível | Aparece na home? | Regra |
|---|---|---|---|
| `siops_aplicacao_saude_baixa` | CRITICO | ✓ | Percentual aplicado < 15% (mínimo municipal — indicador 3.2) |
| `siops_sem_dado_recente` | ALTO | ✓ | Município sem informação no período mais recente carregado |
| `siops_variacao_atipica` | MEDIO/ALTO | Apenas se ALTO | Variação de despesa total em saúde ≥ 50% em relação ao período anterior |
| `siops_dado_incompleto` | MEDIO | ✗ | Menos de 50% da mediana de indicadores dos demais municípios |

### APIs disponíveis

| Endpoint | Lê de | Descrição |
|---|---|---|
| `GET /api/alertas/siops/resumo` | `mart.siops_resumo_home` | Card resumido: totais, críticos, altos, municípios afetados |
| `GET /api/alertas/siops/detalhes` | `mart.siops_alertas_home` | Lista de alertas acionáveis (filtros: `?nivel=CRITICO&municipio=120040`) |

### Configuração no `.env`

```env
SIOPS_API_BASE_URL=https://siops-consulta-publica-api.saude.gov.br
SIOPS_UF=AC
SIOPS_ANO_INICIO=2024
SIOPS_ANO_FIM=2026
SIOPS_TIMEOUT_MS=30000
SIOPS_RATE_LIMIT_MS=500
```

### Limitações conhecidas

- Os nomes dos campos do JSON retornado pela API podem divergir dos mapeados em `siops-full-postgres.ts`. Execute `npm run siops:inspecionar` para verificar o formato real e ajuste a função `normalizarPayload` se necessário.
- Se a API retornar 401/403, pode haver necessidade de autenticação futura. Verificar portal OpenDataSUS e adicionar `SIOPS_API_TOKEN` no `.env`.
- CNPJs de municípios pequenos podem não ter todos os bimestres preenchidos — 404 é tratado silenciosamente como "sem dado nesse período".

---

## Painel da Saúde — camada consolidada

**Finalidade:** Une SIOPS (orçamento/aplicação em saúde) com CNES/UBS (estrutura da rede) em uma visão consolidada por município, com score de risco e alertas unificados. É a base para o futuro Painel da Saúde.

- **SIOPS** = indicadores de orçamento e aplicação do mínimo constitucional em saúde (LC 141/2012)
- **CNES/UBS** = estrutura física da rede de saúde: estabelecimentos, UBS ativas, inativos

### Tabelas

| Tabela | Esquema | Descrição |
|---|---|---|
| `saude_resumo_municipio` | `mart` | Uma linha por município — SIOPS + CNES/UBS + score_risco |
| `saude_alertas` | `mart` | Todos os alertas consolidados (SIOPS + CNES_UBS) |
| `saude_alertas_home` | `mart` | Até 30 alertas CRITICO/ALTO para a home |
| `saude_resumo_home` | `mart` | Totais + municípios por nível de risco |

### Score de risco

| Nível | Pontos | nivel_risco |
|---|---|---|
| CRITICO | 5 pts | CRITICO se score ≥ 10 |
| ALTO | 3 pts | ALTO se score ≥ 5 |
| MEDIO | 1 pt | MEDIO se score ≥ 1 |
| — | 0 | BAIXO |

### Comandos

```bash
# Apenas mart consolidada (requer SIOPS e CNES já carregados)
npm run mart:saude-consolidado

# Carga completa de saúde: SIOPS + CNES/UBS + mart consolidada
npm run carga-saude:postgres

# Migração dos schemas
npm run postgres:migrate
```

### APIs server-side

| Rota | Descrição |
|---|---|
| `GET /api/saude/resumo` | Totais do `mart.saude_resumo_home` |
| `GET /api/saude/municipios` | Lista `mart.saude_resumo_municipio` com filtros e ordenação |
| `GET /api/saude/alertas` | Alertas (param `home=1` para versão home, filtros: `nivel`, `fonte`, `municipio`, `tipo_alerta`) |

Filtros de `/api/saude/municipios`: `nivelRisco`, `municipio`, `orderBy` (score_risco|nome_municipio|total_alertas|percentual_aplicado_saude|total_ubs_ativas), `orderDir`, `pageSize`.

### Resultados da carga inicial (Acre)

- **22** municípios consolidados
- **583** alertas totais (277 CRITICO · 88 ALTO · 218 MEDIO)
- **30** alertas na home
- **21** municípios com score CRITICO · **1** ALTO

---

## CNES/UBS — Estrutura da rede de saúde

**Finalidade:** Monitorar a estrutura da rede de saúde dos municípios do Acre com base no CNES (Cadastro Nacional de Estabelecimentos de Saúde) e UBS (tipo 02 = Centro de Saúde / Unidade Básica de Saúde). Detectar municípios sem UBS ativa, baixa cobertura, estabelecimentos inativos e sem atualização cadastral.

**Fonte:** API REST pública — `https://apidadosabertos.saude.gov.br/cnes`
- CNES: `/estabelecimentos?codigo_uf=12&limit=20&offset={n}` (paginação 20/página)
- UBS: `/estabelecimentos?codigo_uf=12&codigo_tipo_unidade=02&limit=20&offset={n}`
- Atualização diária pelo DATASUS.

### Tabelas

| Tabela | Esquema | Descrição |
|---|---|---|
| `cnes_estabelecimentos_raw` | `raw` | Payload bruto da API (por carga) |
| `ubs_raw` | `raw` | Payload bruto UBS |
| `cnes_estabelecimentos_stg` | `stage` | Dados normalizados para staging |
| `ubs_stg` | `stage` | Dados UBS normalizados |
| `dim_estabelecimento_saude` | `dw` | Dimensão: todos os estabelecimentos |
| `dim_ubs` | `dw` | Dimensão: apenas UBS (tipo 02) |
| `saude_estrutura_municipio` | `mart` | Resumo por município |
| `saude_estrutura_alertas` | `mart` | Todos os alertas gerados |
| `saude_estrutura_alertas_home` | `mart` | Até 30 alertas CRITICO/ALTO para a home |
| `saude_estrutura_resumo_home` | `mart` | Totais para o card da home |

### Comandos

```bash
# Inspecionar API e salvar amostras
npm run cnes-ubs:inspecionar

# Carga completa CNES + UBS
npm run cnes-ubs:full:postgres

# Reconstruir marts (alertas, home)
npm run mart:saude-estrutura

# Carga + mart em sequência
npm run carga-cnes-ubs:postgres
```

### Tipos de alerta

| Tipo | Nível | Aparece na home? | Descrição |
|---|---|---|---|
| `municipio_sem_ubs_ativa` | CRITICO | Sim | Nenhuma UBS ativa no município |
| `baixa_quantidade_ubs` | ALTO | Sim | Apenas 1 UBS ativa |
| `estabelecimentos_inativos` | MEDIO | Não | Estabelecimentos com motivo de desabilitação |
| `estabelecimentos_sem_atualizacao_recente` | MEDIO | Não | Data de atualização >180 dias |

### Variáveis de ambiente

```env
CNES_API_BASE_URL=https://apidadosabertos.saude.gov.br/cnes
CNES_UF=12
CNES_TIMEOUT_MS=30000
CNES_RATE_LIMIT_MS=500
```

### APIs server-side

- `GET /api/alertas/saude-estrutura/resumo` — totais para o card da home
- `GET /api/alertas/saude-estrutura/detalhes?nivel=CRITICO&municipio=Rio+Branco&tipo_alerta=municipio_sem_ubs_ativa` — alertas com filtros opcionais

### Resultados da carga inicial (Acre)

- **2.044** estabelecimentos de saúde carregados
- **284** UBS (tipo 02) carregadas
- **22** municípios com dados
- **64** alertas gerados (22 CRITICO, 0 ALTO, 42 MEDIO)

### Limitações conhecidas

- A API limita a **20 registros por página** — carga completa requer muitas requisições (~103 páginas para CNES).
- O campo `nome_municipio` não é retornado pela API — o nome é derivado do `codigo_municipio` (6 dígitos) via cruzamento futuro com `dim_ente`.
- UBS tipo 02 é a classificação CNES para "Centro de Saúde / Unidade Básica de Saúde". Outros subtipos de UBS podem estar em tipos diferentes (ex: 40 = Unidade Odontológica Móvel).
- Alertas de `municipio_sem_ubs_ativa` para toda a lista do Acre são gerados somente se a tabela `dim_ubs` tiver dados.

---

## SICONFI/RREO — Execução Orçamentária Municipal

**Finalidade:** Monitorar a entrega do Relatório Resumido da Execução Orçamentária (RREO) pelos municípios do Acre ao SICONFI (Tesouro Nacional), detectar municípios sem dado recente, envios incompletos e variações atípicas de despesa.

**Fonte:** API DataLake Tesouro Nacional — `https://apidatalake.tesouro.gov.br/ords/siconfi/tt/rreo`

### Tabelas

| Tabela | Esquema | Descrição |
|---|---|---|
| `siconfi_rreo_raw` | `raw` | Payload bruto por município/período |
| `siconfi_rreo_stg` | `stage` | Dados normalizados (staging) |
| `fato_siconfi_rreo` | `dw` | Fatos RREO: uma linha por município/período/conta/coluna |
| `siconfi_rreo_resumo_municipio` | `mart` | Resumo agregado por município/período |
| `siconfi_rreo_alertas` | `mart` | Todos os alertas gerados |
| `siconfi_rreo_alertas_home` | `mart` | Até 30 alertas CRITICO/ALTO do período mais recente |
| `siconfi_rreo_resumo_home` | `mart` | Uma linha: totais para o card da home |

### Comandos

```bash
# Inspecionar endpoints e formato real da API SICONFI
npm run siconfi-rreo:inspecionar

# Carga completa (RREO todos os municípios do Acre)
npm run siconfi-rreo:full:postgres

# Reconstruir marts (alertas, home)
npm run mart:siconfi-rreo

# Carga completa + mart em sequência
npm run carga-siconfi-rreo:postgres
```

### Tipos de alerta

| Tipo | Nível | Aparece na home? | Descrição |
|---|---|---|---|
| `rreo_sem_dado_recente` | ALTO | Sim | Município sem entrega no período mais recente |
| `rreo_dado_incompleto` | MEDIO | Não | Envio com <10 registros |
| `rreo_variacao_atipica` | MEDIO/ALTO | Se ALTO | Variação >50% nas despesas vs. período anterior |

### Variáveis de ambiente

```env
SICONFI_API_BASE_URL=https://apidatalake.tesouro.gov.br/ords/siconfi/tt
SICONFI_CO_IBGE_UF=12
SICONFI_ANO_INICIO=2021
SICONFI_ANO_FIM=2026
SICONFI_PERIODOS=1,2,3,4,5,6
SICONFI_RATE_LIMIT_MS=1000
```

### APIs server-side

- `GET /api/alertas/siconfi-rreo/resumo` — resumo do período mais recente (uma linha)
- `GET /api/alertas/siconfi-rreo/detalhes?nivel=ALTO&municipio=Xapuri` — alertas da home com filtros opcionais

### Limitações conhecidas

- A API DataLake pode apresentar rate limiting (HTTP 429) em horários de pico. O job aguarda 60s automaticamente e retenta.
- O RREO é entregue por bimestre; municípios pequenos podem não ter todos os períodos preenchidos.
- Os períodos disponíveis variam por exercício (bimestral a partir de 2015 aproximadamente).

---

## Remessas obrigatórias de prestação de contas

Fonte principal: `APC.dbo.REMESSA` (SQL Server)
Destino DW: `dw.fato_remessa_contabil`
Destino Mart: `mart.remessa_alertas`, `mart.remessa_resumo`

### Comandos

```bash
# Inspecionar valores de domínio e tabelas auxiliares
npm run remessas:inspecionar

# Carga completa (remessas + dimensões + mart)
npm run carga-remessas:postgres
```

### Regras de alerta atuais (fase 1)

Baseadas apenas em datas:
- `remessa_nao_enviada_no_prazo` — CRITICO
- `remessa_enviada_com_atraso` — ALTO
- `remessa_sem_confirmacao` — MEDIO
- `remessa_sem_processamento` — MEDIO

SITUACAO, STATUS, STATUS_PUBLICACAO e TIPO_LIBERACAO serão analisados após execução do job `remessas:inspecionar` para conhecer os valores reais.

### Integração futura

A API `/api/remessas/alertas` e `/api/remessas/resumo` já estão disponíveis para integração com a tela "Alertas do Gabinete".

---

## SISAGUA — Qualidade da Água para Consumo Humano

### Propósito

Integra dados do **SISAGUA** (Sistema de Informação de Vigilância da Qualidade da Água para Consumo Humano) do Ministério da Saúde/DATASUS.
Permite monitorar parâmetros de potabilidade da água por município, identificando amostras fora dos padrões (E. coli, coliformes, turbidez, cloro).

### Datasets / Endpoints

| Endpoint | Conteúdo |
|---|---|
| `/sisagua/controle-mensal` | Parâmetros monitorados mensalmente por sistema de abastecimento |
| `/sisagua/vigilancia` | Registros de vigilância sanitária da qualidade da água |
| `/sisagua/fora-padrao` | Amostras com resultados fora dos padrões (endpoint pode não estar disponível) |
| `/sisagua/populacao-abastecida` | Estimativa de população abastecida por município/sistema (opcional) |

### Periodicidade

Os dados são atualizados mensalmente pelo Ministério da Saúde conforme entrega das vigilâncias municipais.
Recomenda-se executar a carga mensalmente ou trimestralmente.

### Tabelas

| Tabela | Schema | Descrição |
|---|---|---|
| `sisagua_raw` | `raw` | Payload bruto JSON de cada registro da API |
| `sisagua_parametros_stg` | `stage` | Parâmetros de qualidade normalizados defensivamente |
| `sisagua_populacao_stg` | `stage` | População abastecida normalizada |
| `fato_sisagua_parametro` | `dw` | Fato analítico de parâmetros de qualidade |
| `fato_sisagua_populacao` | `dw` | Fato analítico de população abastecida |
| `sisagua_resumo_municipio` | `mart` | Uma linha por município com totais de amostras e alertas |
| `sisagua_alertas` | `mart` | Todos os alertas gerados |
| `sisagua_alertas_home` | `mart` | Alertas CRITICO/ALTO para o card da home (máx 30) |
| `sisagua_resumo_home` | `mart` | Totais para o card da home |

As colunas `sisagua_*` foram adicionadas a `mart.saude_resumo_municipio` para consolidação no Painel da Saúde.

### Tipos de alerta

| Tipo | Nível | Aparece na home? | Descrição |
|---|---|---|---|
| `sisagua_ecoli_detectada` | CRITICO | Sim | E. coli detectada fora do padrão |
| `sisagua_coliformes_detectados` | ALTO | Sim | Coliformes totais fora do padrão |
| `sisagua_amostra_fora_padrao` | ALTO | Sim | Amostras fora dos padrões de potabilidade |
| `sisagua_sem_dado_recente` | MEDIO | Não | Município sem dados no SISAGUA |
| `sisagua_baixa_quantidade_amostras` | MEDIO | Não | Volume de amostras abaixo da mediana |

### Comandos

```bash
# Inspecionar endpoints e formato real da API SISAGUA
npm run sisagua:inspecionar

# Carga completa (todos os anos configurados)
npm run sisagua:full:postgres

# Reconstruir marts (alertas, home, resumo)
npm run mart:sisagua

# Carga completa + mart em sequência
npm run carga-sisagua:postgres

# Carga completa de saúde (SIOPS + CNES/UBS + SISAGUA + consolidado)
npm run carga-saude:postgres
```

### Variáveis de ambiente

```env
SISAGUA_API_BASE_URL=https://apidadosabertos.saude.gov.br
SISAGUA_UF=AC
SISAGUA_ANO_INICIO=2024
SISAGUA_ANO_FIM=2026
SISAGUA_TIMEOUT_MS=30000
SISAGUA_RATE_LIMIT_MS=500
# Resource IDs opcionais (descubra com sisagua:inspecionar)
SISAGUA_CONTROLE_MENSAL_RESOURCE_ID=
SISAGUA_VIGILANCIA_RESOURCE_ID=
SISAGUA_FORA_PADRAO_RESOURCE_ID=
SISAGUA_POPULACAO_ABASTECIDA_RESOURCE_ID=
```

### APIs server-side

- `GET /api/alertas/sisagua/resumo` — resumo consolidado (uma linha)
- `GET /api/alertas/sisagua/detalhes?nivel=CRITICO&municipio=Rio+Branco&tipo_alerta=sisagua_ecoli_detectada` — alertas com filtros opcionais

### Limitações conhecidas

- A disponibilidade e o formato dos endpoints da API SISAGUA podem variar. Execute `sisagua:inspecionar` antes da primeira carga para identificar os campos reais.
- Os campos dos registros podem mudar entre versões da API (por isso o mapeamento defensivo com múltiplos candidatos por campo).
- Municípios sem dados no SISAGUA geram alerta `sisagua_sem_dado_recente` (MEDIO).
- O endpoint `fora-padrao` e `populacao-abastecida` podem retornar 404 — o job os ignora graciosamente.

---

## Painel da Saúde — Consolidação

O Painel da Saúde consolida dados de **três fontes** em `mart.saude_resumo_municipio`:

| Fonte | Script de carga | Mart própria |
|---|---|---|
| **SIOPS** — orçamento saúde | `carga-siops:postgres` | `mart.siops_resumo_municipio`, `mart.siops_alertas` |
| **CNES/UBS** — estrutura física | `carga-cnes-ubs:postgres` | `mart.saude_estrutura_municipio`, `mart.saude_estrutura_alertas` |
| **SISAGUA** — qualidade da água | `carga-sisagua:postgres` | `mart.sisagua_resumo_municipio`, `mart.sisagua_alertas` |

O job `mart:saude-consolidado` lê das três fontes e gera:
- `mart.saude_alertas` — todos os alertas unificados
- `mart.saude_alertas_home` — máx 30 alertas CRITICO/ALTO para a home
- `mart.saude_resumo_municipio` — score de risco combinado por município
- `mart.saude_resumo_home` — totais para o card da home
