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

## 3. Censo Escolar (Fase 17D — adiado)

**Diretório de destino:** `etl/data/inep/censo/` (criar quando necessário)

Não baixar agora. Arquivos têm 300–700 MB; só faz sentido quando o
gabinete pedir métrica de gasto por aluno. A sinopse agregada
(`sinopse_estatistica_censo_escolar_<ano>.zip`) é a alternativa leve.

---

## Checagem rápida

Depois de copiar os arquivos, valide o conteúdo do diretório:

```
etl/data/inep/
├── README.md                        (este arquivo)
├── ideb/
│   ├── divulgacao_anos_iniciais_municipios_2023.zip
│   ├── divulgacao_anos_finais_municipios_2023.zip
│   └── divulgacao_ensino_medio_municipios_2023.zip
└── rendimento/
    └── tx_rend_municipios_2023.zip
```

A Fase 17B (`ingest-inep-ideb.ts` e `ingest-inep-rendimento.ts`) lê
tudo que estiver nestes diretórios — não precisa configurar caminho.
