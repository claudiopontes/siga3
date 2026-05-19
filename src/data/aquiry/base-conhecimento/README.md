# Base de conhecimento — Assistente Aquiry

Este diretório contém documentos markdown versionados no repositório que servem como base normativa inicial do Assistente Aquiry no Varadouro Digital (TCE-AC).

## Finalidade

Orientar respostas institucionais do Aquiry sobre controle externo, risco, materialidade, fontes oficiais e setores (educação, saúde, fiscal, contratos). É um material orientativo, complementar ao contexto real da tela e à pesquisa externa.

## Limites importantes

- Esta base **não substitui** normas oficiais, decisões, votos ou pareceres técnicos.
- Os textos são **resumos não-exaustivos** com finalidade de apoio. Para análise formal, **valide sempre na fonte original** (Constituição, leis, regulamentos, portais oficiais como FNDE, Tesouro Nacional, Ministério da Saúde).
- O Aquiry usa esta base como contexto adicional, não como autoridade final.

## Organização

- `projeto/` — diretrizes do próprio Assistente Aquiry, critérios de risco/materialidade e glossário.
- `normas/` — resumos não-exaustivos de normas relevantes para o controle externo.
- `fontes/` — guias rápidos sobre bases oficiais (SIOPE/FNDE, SICONFI/Tesouro, DataSUS/SIOPS, Compras/Transparência).

## Frontmatter

Cada documento começa com um cabeçalho YAML simples:

```yaml
---
titulo: <título humano>
tipo: <diretriz | criterio | glossario | norma | fonte>
area: <projeto | educacao | saude | fiscal | contratos | fundamental>
fonte: <origem do conteúdo, se aplicável>
uso: <orientacao | referencia>
confianca: <alta | media | baixa>
---
```

## Manutenção

Mudanças neste diretório devem passar por revisão como qualquer mudança de código. Documentos podem ser refinados ao longo do uso; quando houver alteração relevante de fonte oficial, atualize o texto e a referência.
