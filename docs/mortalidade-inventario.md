# Inventário SIM/SINASC — Mortalidade e Nascidos Vivos

Gerado em: 2026-05-12
UF filtro: AC · Anos: 2024–2026

## Nova fonte — API Dados Abertos Saúde v1

**Base URL:** https://apidadosabertos.saude.gov.br/v1
**Swagger:** https://apidadosabertos.saude.gov.br/v1/#/Vigilância e Meio Ambiente/
**Dicionário SIM 2025:** https://s3.sa-east-1.amazonaws.com/ckan.saude.gov.br/SIM/Dicionario_SIM_2025.pdf

### Endpoint provável

`GET /vigilancia-e-meio-ambiente/sistema-de-informacao-sobre-mortalidade`

Execute `npm run sim:api:inspecionar` para confirmar o endpoint e atualizar este inventário.

## Prioridade do módulo

1. Mortalidade infantil (< 1 ano)
2. Óbitos maternos (TPMORTEOCO 1–4)
3. Óbitos fetais (TIPOBITO = 1)
4. Causas básicas / CID-10
5. Assistência médica / local de ocorrência

## Regra de idade SIM (campo IDADE)

| Código | Unidade | Exemplo |
|--------|---------|---------|
| 1xx    | Minutos | 105 = 5 minutos |
| 2xx    | Horas   | 212 = 12 horas |
| 3xx    | Meses   | 306 = 6 meses |
| 4xx    | Anos    | 445 = 45 anos |
| 5xx    | ≥100    | 502 = 102 anos |
| 9xx    | Ignorado| — |

- `is_obito_infantil` = idade < 365 dias (qualquer unidade < 1 ano)
- `is_obito_neonatal` = idade < 28 dias
- `is_obito_pos_neonatal` = 28–364 dias

## Regra de óbito materno (campo TPMORTEOCO)

| Código | Significado | Alerta |
|--------|-------------|--------|
| 1 | Na gravidez | CRITICO |
| 2 | No parto | CRITICO |
| 3 | No abortamento | CRITICO |
| 4 | Até 42 dias após parto | CRITICO |
| 5 | 43 dias a 1 ano após gestação | ALTO (óbito materno tardio) |
| 8 | Não ocorreu | — |
| 9 | Ignorado | — |

## Regra de óbito fetal

Campo `TIPOBITO`:
- `1` = fetal
- `2` = não fetal

## Taxa de mortalidade infantil

**TMI = (óbitos infantis / nascidos vivos) × 1.000**

Requer dados SINASC como denominador. Enquanto SINASC não estiver disponível:
- `indicador_taxa_disponivel = false`
- `obitos_infantis_sem_denominador = true`
- Alerta `obito_infantil_recente_sem_denominador` (nível ALTO)

## Comandos

```bash
cd etl
npm run postgres:migrate
npm run sim:api:inspecionar
npm run carga-sim-api:postgres
```

## Validação pós-carga

```sql
SELECT fonte_dado, ano_obito, COUNT(*)
FROM dw.fato_sim_obito
GROUP BY fonte_dado, ano_obito
ORDER BY ano_obito DESC;

SELECT COUNT(*) FROM mart.mortalidade_resumo_municipio;
SELECT * FROM mart.mortalidade_resumo_home;
SELECT tipo_alerta, nivel, COUNT(*) FROM mart.mortalidade_alertas GROUP BY tipo_alerta, nivel;
```

---

## Resultado da Inspeção — 2026-05-12

- `/vigilancia-e-meio-ambiente/sistema-de-informacao-sobre-mortalidade`: **INVIAVEL** — HTTP 404
- `/sim/obitos`: **INVIAVEL** — HTTP 404
- `/mortalidade`: **INVIAVEL** — HTTP 404
- `/vigilancia/mortalidade`: **INVIAVEL** — HTTP 404