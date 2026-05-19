---
titulo: DataSUS / SIOPS — Saúde
tipo: fonte
area: saude
fonte: DataSUS (Departamento de Informática do SUS) e SIOPS (Sistema de Informações sobre Orçamentos Públicos em Saúde) — Ministério da Saúde
uso: referencia
confianca: alta
---

# DataSUS / SIOPS — Bases oficiais de saúde

## O que são

- **DataSUS** — conjunto de bases epidemiológicas e operacionais do SUS:
  - **SIM** (Mortalidade), **SINASC** (Nascidos Vivos), **SIH** (Internações), **SIA** (Ambulatorial), **SISAGUA** (Qualidade da Água), **CNES** (Estabelecimentos de Saúde), **SINAN** (Agravos de Notificação), **PNI** (Imunizações), **InfoDengue** (Arboviroses).
- **SIOPS** — base de financiamento e execução em saúde dos entes federados (vinculada ao DataSUS).

## Para que servem

- **Epidemiologia**: mortalidade, nascidos vivos, internações, produção ambulatorial, vigilância, qualidade da água, estrutura da rede, cobertura vacinal.
- **Financiamento**: aplicação mínima em saúde, transferências federais, execução por bloco de financiamento (SIOPS).

## Cautelas importantes
- **Subnotificação**: municípios pequenos tendem a subreportar — desconfie de valores muito baixos sem corroboração.
- **Defasagem**: bases são consolidadas com atraso (meses a anos). O ano corrente costuma ter dados parciais.
- **Comparabilidade**: critérios e tabelas podem mudar entre versões — verifique notas técnicas.
- **Denominador**: taxas em municípios pequenos têm alta variância — combine com volume absoluto.

## Como usar em análise
- Para resposta sobre **aplicação em saúde** por município, use **SIOPS** e cruze com **SICONFI/RREO**.
- Para indicadores epidemiológicos, considere série histórica e qualidade do registro local.
- Não atribua causalidade a partir de dados isolados.
- Combine SIM/SINASC para taxa de mortalidade infantil e materna.
- CNES para análise de estrutura (cobertura, profissionais, equipamentos).

## Referência
- Portais: datasus.saude.gov.br · saude.gov.br · siops.datasus.gov.br
