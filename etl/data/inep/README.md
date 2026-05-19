# INEP — Arquivos brutos para ingestão (Fase 17B)

`download.inep.gov.br` está bloqueado pela rede do TCE-AC. Os arquivos abaixo
devem ser baixados manualmente (de uma rede sem bloqueio) e colocados nos
caminhos indicados. O job de ingestão da Fase 17B lê do disco local — não
acessa o INEP em runtime.

## 1. IDEB — Resultados por município

**Diretório de destino:** `etl/data/inep/ideb/`

O INEP publica o IDEB municipal em **três arquivos ZIP separados por etapa**.
Cada ZIP contém o XLSX da etapa (ou planilhas auxiliares).

**Onde baixar (navegador):**

1. Abrir https://www.gov.br/inep/pt-br/areas-de-atuacao/pesquisas-estatisticas-e-indicadores/ideb/resultados
2. Edição **2023** — baixar os três arquivos "Municípios" (Anos Iniciais, Anos Finais, Ensino Médio).

**URLs diretas — Edição 2023 (padrão real do INEP):**

| Etapa | URL |
|-------|-----|
| Anos Iniciais (1º ao 5º ano) | `https://download.inep.gov.br/ideb/resultados/divulgacao_anos_iniciais_municipios_2023.zip` |
| Anos Finais (6º ao 9º ano)   | `https://download.inep.gov.br/ideb/resultados/divulgacao_anos_finais_municipios_2023.zip` |
| Ensino Médio                 | `https://download.inep.gov.br/ideb/resultados/divulgacao_ensino_medio_municipios_2023.zip` |

**Salvar mantendo o nome original em** `etl/data/inep/ideb/`:

```
etl/data/inep/ideb/divulgacao_anos_iniciais_municipios_2023.zip
etl/data/inep/ideb/divulgacao_anos_finais_municipios_2023.zip
etl/data/inep/ideb/divulgacao_ensino_medio_municipios_2023.zip
```

O ingestor da Fase 17B abre cada ZIP, lê o XLSX interno e filtra UF=AC.
A etapa é inferida do nome do arquivo (`anos_iniciais` | `anos_finais` | `ensino_medio`).

**Edições históricas (opcional, para série temporal):**

Mesmo padrão, trocando o ano. Edições bienais: 2021, 2019, 2017, 2015, 2013, 2011, 2009, 2007, 2005. Exemplo:

- `https://download.inep.gov.br/ideb/resultados/divulgacao_anos_iniciais_municipios_2021.zip`
- `https://download.inep.gov.br/ideb/resultados/divulgacao_anos_finais_municipios_2021.zip`
- `https://download.inep.gov.br/ideb/resultados/divulgacao_ensino_medio_municipios_2021.zip`

> Comece pela edição 2023 (3 arquivos). Histórico pode entrar depois sem
> mudar código — o ingestor processa qualquer ZIP que encontrar no diretório.

## 2. Taxas de Rendimento Escolar (anual)

**Diretório de destino:** `etl/data/inep/rendimento/`

**Onde baixar (navegador):**

1. Abrir https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/indicadores-educacionais/taxas-de-rendimento-escolar
2. Baixar o arquivo do ano mais recente disponível (geralmente um ZIP com CSVs por município/UF)

**Nome esperado pelo ingestor:**
- `tx_rend_municipios_2023.zip`  (ou o ano que estiver disponível)

**Histórico (opcional):**
- `tx_rend_municipios_2022.zip`
- `tx_rend_municipios_2021.zip`

## 3. IDEB por ESCOLA (Fase 17D)

**Diretório de destino:** `etl/data/inep/ideb-escolas/`

Mesmo padrão do IDEB municipal, mas 3 ZIPs com dados granulares por escola.

**URLs diretas — Edição 2023:**

| Etapa | URL |
|-------|-----|
| Anos Iniciais | `https://download.inep.gov.br/ideb/resultados/divulgacao_anos_iniciais_escolas_2023.zip` |
| Anos Finais   | `https://download.inep.gov.br/ideb/resultados/divulgacao_anos_finais_escolas_2023.zip` |
| Ensino Médio  | `https://download.inep.gov.br/ideb/resultados/divulgacao_ensino_medio_escolas_2023.zip` |

**Salvar mantendo o nome original em** `etl/data/inep/ideb-escolas/`.

O ingestor abre cada ZIP, lê o XLSX interno, filtra UF=AC (~500–800 escolas) e
persiste em `raw.inep_ideb_escolas_raw` + `dw.fato_inep_ideb_escola`.

## 4. Censo Escolar — APENAS para coordenadas (lat/lng) das escolas

**Diretório de destino:** `etl/data/inep/censo/`

**Atenção**: o arquivo tem ~600 MB. Baixe **uma única vez** — o ingestor
extrai apenas o CSV `escolas.csv` interno (~50 MB), filtra AC (~600–800 linhas)
e popula `public.dim_escola_inep` com nome, dependência, localização e
coordenadas. O microdado bruto NÃO é persistido no banco.

### ⚠ Atenção sobre coordenadas

A partir do **Censo 2022**, o INEP **removeu** latitude/longitude do microdado
unificado (confirmamos inspecionando 2022 e 2023). Para resolver:

1. **Microdados Censo (INEP)** — `microdados_censo_escolar_*.zip` →
   trazem nome, dependência, localização, situação, etc., mas **sem geo**.

2. **Base dos Dados** — arquivo curado complementar que **traz lat/lng**:
   ```
   br_bd_diretorios_brasil_escola.csv.gz
   ```
   Origem: https://basedosdados.org/ (dataset `br_inep_censo_escolar`).

O job `inep-base-dos-dados-geo:ingest` lê esse `.csv.gz`, filtra AC, faz
`UPSERT COALESCE` em `dim_escola_inep` — **só atualiza latitude/longitude**,
preservando metadados vindos do microdado.

**Como obter os arquivos:**

| Arquivo | Origem | Destino |
|---------|--------|---------|
| `microdados_censo_escolar_2022.zip` | https://download.inep.gov.br/dados_abertos/ | `etl/data/inep/censo/` |
| `microdados_censo_escolar_2023.zip` | https://download.inep.gov.br/dados_abertos/ | `etl/data/inep/censo/` |
| `br_bd_diretorios_brasil_escola.csv.gz` | basedosdados.org → tabela `br_inep_censo_escolar.diretorios_brasil_escola` → "Download" | `etl/data/inep/censo/` |

**Ordem de execução** (independentes — qualquer ordem funciona, mas a sugerida abaixo é a mais econômica):

```
npm run inep-censo-geo:ingest             # popula metadados (microdados INEP)
npm run inep-base-dos-dados-geo:ingest    # popula geo (Base dos Dados)
npm run inep-ideb-escolas:ingest          # popula IDEB por escola
```

Quando edições novas saírem, basta substituir/adicionar arquivos nessa pasta.

---

## Checagem rápida

Depois de copiar os arquivos, valide o conteúdo do diretório:

```
etl/data/inep/
├── README.md                        (este arquivo)
├── ideb/                            (IDEB por município)
│   ├── divulgacao_anos_iniciais_municipios_2023.zip
│   ├── divulgacao_anos_finais_municipios_2023.zip
│   └── divulgacao_ensino_medio_municipios_2023.zip
├── ideb-escolas/                    (IDEB por escola — Fase 17D)
│   ├── divulgacao_anos_iniciais_escolas_2023.zip
│   ├── divulgacao_anos_finais_escolas_2023.zip
│   └── divulgacao_ensino_medio_escolas_2023.zip
├── rendimento/
│   └── tx_rend_municipios_2024.zip
└── censo/                           (apenas para lat/lng das escolas)
    └── microdados_censo_escolar_2023.zip
```

A Fase 17B (`ingest-inep-ideb.ts` e `ingest-inep-rendimento.ts`) lê
tudo que estiver nestes diretórios — não precisa configurar caminho.
