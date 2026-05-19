# Manual do Assistente Aquiry

> Manual funcional, institucional e técnico do Assistente Aquiry do Varadouro Digital Aquiry — TCE-AC.
> Referência cruzada com [README.md](README.md), [mapa-funcional-varadouro.md](mapa-funcional-varadouro.md), [plano-evolucao-varadouro.md](plano-evolucao-varadouro.md), [roteiro-demonstracao-institucional.md](roteiro-demonstracao-institucional.md), [matriz-fontes-dados.md](matriz-fontes-dados.md), [catalogo-apis-internas.md](catalogo-apis-internas.md) e com a documentação técnica em [../aquiry/](../aquiry/).
> Data de referência: 2026-05-19.

---

## 1. Finalidade do Assistente Aquiry

O **Assistente Aquiry** é a camada transversal de inteligência do Varadouro Digital Aquiry. Está embarcado em todas as telas autenticadas (`(admin)` layout) como overlay flutuante e tem por finalidade **apoiar gabinetes, assessores e equipes técnicas do TCE-AC** na leitura de painéis, processos, pautas de julgamento e alertas institucionais.

O Aquiry **apoia** a análise técnica, **organiza** informações, **explica** as telas, **ajuda a identificar** riscos e prioridades e **resume** contextos visíveis. Ele **não substitui**, em nenhuma hipótese:

- o juízo técnico, jurídico ou institucional do conselheiro;
- a análise das unidades técnicas;
- o parecer do Ministério Público de Contas;
- decisões colegiadas do plenário.

**Não emite voto**, **não conclui irregularidade sem base documental**, **não produz parecer oficial** e **não substitui revisão humana**. Toda saída do Aquiry é insumo para revisão; toda análise IA pode ser descartada e regenerada com auditoria.

---

## 2. Como o Assistente funciona hoje

O fluxo, ponta a ponta:

1. O usuário aciona o botão flutuante do Aquiry em qualquer tela autenticada ([src/components/aquiry/AssistenteAquiryButton.tsx](../../src/components/aquiry/AssistenteAquiryButton.tsx)).
2. O painel ([AssistenteAquiryPanel.tsx](../../src/components/aquiry/AssistenteAquiryPanel.tsx)) coleta a `pergunta` e adiciona o histórico recente (últimas 10 mensagens em memória, ver [AssistenteAquiry.tsx](../../src/components/aquiry/AssistenteAquiry.tsx)).
3. O Provider ([AssistenteAquiryProvider.tsx](../../src/components/aquiry/AssistenteAquiryProvider.tsx) + [useContextoAquiry.ts](../../src/components/aquiry/useContextoAquiry.ts)) entrega o `contextoTela` que a página atual injetou.
4. O frontend chama `POST /api/assistente-aquiry` com `{ pergunta, historico, paginaAtual, contextoPagina, contextoTela }`.
5. No backend ([src/app/api/assistente-aquiry/route.ts](../../src/app/api/assistente-aquiry/route.ts)):
   - **Sanitização e validação** do payload.
   - `analisarIntencaoAquiry(...)` ([src/lib/aquiry/analisarIntencaoAquiry.ts](../../src/lib/aquiry/analisarIntencaoAquiry.ts)) determina a `TipoIntencao` e pode produzir uma **resposta determinística preliminar** quando há dados de tela suficientes.
   - `classificarEstrategiaRespostaAquiry(...)` ([src/lib/aquiry/classificarEstrategiaRespostaAquiry.ts](../../src/lib/aquiry/classificarEstrategiaRespostaAquiry.ts)) decide a `EstrategiaRespostaAquiry`: `varadouro`, `conhecimento_geral` ou `busca_externa`.
   - `buscarBaseConhecimentoAquiry(...)` ([src/lib/aquiry/baseConhecimentoAquiry.ts](../../src/lib/aquiry/baseConhecimentoAquiry.ts)) consulta a base local em [src/data/aquiry/base-conhecimento/](../../src/data/aquiry/base-conhecimento/) por regex (sem RAG vetorial).
   - `buscarFontesExternasAquiry(...)` ([src/lib/aquiry/buscaExternaAquiry.ts](../../src/lib/aquiry/buscaExternaAquiry.ts)) é acionada quando a estratégia é `busca_externa`, conforme `AQUIRY_EXTERNAL_SEARCH_PROVIDER` (Tavily / Brave / SerpAPI / Gemini).
   - Monta-se o **SYSTEM_PROMPT** institucional e os blocos contextuais; chama-se `chamarAzureOpenAI(...)` ([src/lib/ia/azureOpenAI.ts](../../src/lib/ia/azureOpenAI.ts)) com `temperature 0.4` e `max_completion_tokens` 4096 (8192 quando há fontes externas).
   - `registrarEventoAquiry(...)` ([src/lib/aquiry/auditoriaAquiry.ts](../../src/lib/aquiry/auditoriaAquiry.ts)) registra **apenas metadados** em `console.info("[Aquiry][audit]", ...)` e, quando `AQUIRY_AUDIT_PERSIST=true`, em `public.aquiry_evento_uso` (migration `260_aquiry_audit.sql`).
6. O backend devolve `{ resposta, origem }`. `origem` é um objeto `OrigemRespostaAquiry` ([tiposContextoAquiry.ts](../../src/lib/aquiry/tiposContextoAquiry.ts)) com flags (`usouContextoTela`, `usouContextoRota`), bases consultadas e fontes externas (quando houve).

---

## 3. Entradas utilizadas pelo Assistente

| Entrada | Finalidade | Origem técnica | Risco | Cuidado recomendado |
|---|---|---|---|---|
| **Pergunta do usuário** | Texto livre que dispara o pipeline | UI `AssistenteAquiryPanel` | Médio (injeção/abuso) | Sanitização no backend; tamanho limitado |
| **Histórico recente** | Continuidade do diálogo | Memória do cliente (últimas 10 msgs) | Baixo | Não persistido entre sessões hoje |
| **`paginaAtual`** | Rota corrente para inferência de contexto | UI (rota Next) | Baixo | — |
| **`contextoPagina`** | Inferência determinística da rota (tipo de página, título) | `identificarContextoPaginaAquiry.ts` | Baixo | Mantido determinístico, não inferido por IA |
| **`contextoTela`** (`ContextoTelaAquiry`) | Dados visíveis estruturados (filtros, indicadores, contagens, fontes, observações) | Cada painel chama `setContextoTela(...)` via `useContextoAquiry()` | Médio (PII se mal configurado) | Não enviar conteúdo sensível; preferir agregados |
| **Dados visíveis do painel** | Subset dentro de `contextoTela.dados` | Componentes Client de cada painel | Médio | Curadoria por painel |
| **Base de conhecimento local** | Documentos institucionais versionados em Markdown | [src/data/aquiry/base-conhecimento/](../../src/data/aquiry/base-conhecimento/) (fontes, normas, projeto) | Baixo | Revisar mensalmente; manter changelog |
| **Fontes externas** | Resultados de Tavily/Brave/SerpAPI/Gemini | Provider configurado | Médio | Opt-in; classificação `oficial_textual` / `estruturada` / `textual` / `indeterminada` |
| **Variáveis de ambiente** | `AZURE_OPENAI_*`, `AQUIRY_*` | `process.env` | Médio | Validar no boot (ação #7 do plano) |
| **Configuração de auditoria** | `AQUIRY_AUDIT_PERSIST` | `process.env` | Baixo | Em produção, manter `true` |

---

## 4. Estratégias de resposta

Tipos confirmados em [classificarEstrategiaRespostaAquiry.ts](../../src/lib/aquiry/classificarEstrategiaRespostaAquiry.ts):

```ts
type EstrategiaRespostaAquiry = "varadouro" | "conhecimento_geral" | "busca_externa";
```

| Estratégia | Quando é usada | Tipo de resposta | Risco | Exemplo de pergunta |
|---|---|---|---|---|
| **`varadouro`** | Há `contextoTela` com dados úteis e a pergunta diz respeito à tela / aos dados visíveis | Resposta orientada pelos dados de tela + base local; análise contextual preliminar determinística pode anteceder a IA | Baixo | "Onde devo olhar primeiro nesta tela?" |
| **`conhecimento_geral`** | Pergunta institucional/normativa sem necessidade de dado específico | Resposta orientada pela base documental local (`src/data/aquiry/base-conhecimento/`) | Baixo | "Explique a LRF para um chefe de gabinete." |
| **`busca_externa`** | Pergunta exige fonte externa (ex.: dado oficial não presente no Varadouro) e há provider configurado | Resposta com citação de fontes; classificação de aderência alta/média/baixa; preferência por fontes oficiais e estruturadas | Médio | "Qual o teto de gasto do RGF estadual no quadrimestre atual?" |

Além da estratégia, há uma **análise contextual preliminar determinística** (em `analisarIntencaoAquiry.ts`) que pode gerar respostas estáveis para casos como Alertas do Gabinete, Mortalidade, Pauta (lista e sessão), Processo (lista e detalhe) e questões metodológicas sobre pauta. Quando essa resposta determinística existe, ela é montada antes da chamada Azure OpenAI e usada como base.

A chamada **Azure OpenAI** sempre ocorre na geração da resposta final, exceto em curto-circuitos determinísticos eventuais. Há também o cenário **"fonte estruturada/oficial necessária"**: quando a estratégia é `busca_externa` e o classificador (`avaliarAderenciaFontesExternas`) detecta exigência de fonte estruturada/oficial mas a pesquisa não a entregou, o sistema instrui a resposta a sinalizar a limitação em vez de extrapolar.

---

## 5. Intenções reconhecidas

Tipos confirmados em [analisarIntencaoAquiry.ts](../../src/lib/aquiry/analisarIntencaoAquiry.ts):

```ts
type TipoIntencao =
  | "onde_olhar_primeiro"
  | "explicar_tela"
  | "interpretar_indicadores"
  | "riscos"
  | "orientacao_geral";
```

| Intenção | Finalidade | Exemplo de pergunta | Resposta esperada | Telas em que funciona melhor |
|---|---|---|---|---|
| **`onde_olhar_primeiro`** | Priorizar a leitura do gabinete | "Por onde começo?", "Onde olhar primeiro?" | Indicação dos blocos/itens mais críticos visíveis na tela | Home / Alertas Gabinete, SICONFI, CAUC, Painel Despesa |
| **`explicar_tela`** | Explicar o painel a um usuário não-técnico | "O que esta tela mostra?", "Explique para um chefe de gabinete" | Síntese funcional do painel; fontes e periodicidade quando disponíveis | Todos os painéis com `contextoTela` |
| **`interpretar_indicadores`** | Ajudar a ler números/KPIs | "O que esse valor representa?", "Como interpretar este indicador?" | Explicação do indicador, base de cálculo e referência | SICONFI, SIOPS, Mortalidade, Saúde |
| **`riscos`** | Identificar riscos visíveis | "Quais riscos esta tela aponta?", "O que merece mais atenção?" | Lista dos itens de risco, com cuidado para não afirmar irregularidade | Alertas Gabinete, CAUC, Vigilância, Mortalidade |
| **`orientacao_geral`** | Pergunta fora dos padrões anteriores | Perguntas institucionais, normativas, metodológicas | Resposta orientada pela base local e, se preciso, pela busca externa | Qualquer tela |

A intenção é determinada por regex em `PADROES_INTENCAO`. Para casos especiais (ex.: perguntas metodológicas sobre pauta), há detectores adicionais (`REGEX_METODOLOGIA_PAUTA`).

---

## 6. Telas e contextos em que o Aquiry é mais útil

| Tela / Painel | Tipo de ajuda possível | Perguntas boas | Cuidados |
|---|---|---|---|
| **Home / Alertas do Gabinete** (`/`) | Prioridade do dia, leitura agregada | "Onde devo olhar primeiro?", "Quais alertas exigem atenção?" | Não pedir conclusão de irregularidade |
| **Painel Despesa** | Concentração, ranking, leitura executiva | "Qual ente concentra mais recursos?", "Há variação anômala?" | Evitar números fora de contexto |
| **Pesquisa de Credores / Detalhe Credor** | Leitura agregada por CNPJ | "Como interpretar este credor?", "Quais entes contrataram?" | Não atribuir irregularidade; respeitar finalidade |
| **SICONFI (RREO/RGF/Extrato)** | Leitura técnica de execução fiscal | "Quais municípios apresentam risco fiscal?", "Como interpretar este RREO?" | Citar bimestre/quadrimestre exibido |
| **CAUC** | Risco de bloqueio de transferências | "Quais municípios estão em alerta CAUC?" | Distinguir alerta de irregularidade |
| **Remessas** | Pendências de envio | "Há atrasos recorrentes?" | Sem inferências individuais sem base |
| **Pautas de Julgamento** | Preparação executiva da sessão | "Resuma os processos desta sessão", "Quais processos exigem atenção?" | Não pedir voto nem mérito |
| **eProcessos** | Leitura técnica de processos | "Que pontos deste processo exigem leitura técnica?" | Não pedir parecer; toda análise é insumo |
| **Análise IA de Processo** | Resumo técnico, descarte/regeneração | "Confira se este resumo bate com os documentos" | Sempre revisar antes de usar |
| **Resumo de Pauta** | Visão consolidada da sessão | "Quais são os pontos críticos da pauta?" | Não substitui leitura individual |
| **Saúde — SIOPS / SISAGUA / InfoDengue** | Leitura de indicadores | "Quais municípios merecem atenção em vigilância?" | Indicar período de referência |
| **Saúde — PNI / SIM** | Mesma leitura, com **cautela** | "Como interpretar este indicador?" | Sinalizar ano de referência e ingestão manual |
| **Social — CadÚnico / MIS** | Leitura agregada | "Que municípios concentram mais vulnerabilidade?" | Não pedir dados pessoais |

> Telas a **não** demonstrar com o Aquiry: Mapa IDEB (valores simulados) e Painel de Cobertura Florestal (dados hardcoded).

---

## 7. Perguntas recomendadas

### 7.1 Entender a tela

| Pergunta | Quando usar | Resultado esperado | Cuidado |
|---|---|---|---|
| "Explique esta tela para um chefe de gabinete." | Primeira visita ao painel | Síntese executiva sem jargão | Conferir adequação ao público |
| "Quais são os principais indicadores desta tela?" | Painéis densos (SICONFI, Saúde) | Lista dos KPIs com leitura inicial | Verificar período exibido |
| "O que merece atenção aqui?" | Qualquer painel temático | Indicação dos blocos/itens críticos visíveis | Evitar tom de denúncia |

### 7.2 Priorizar análise

| Pergunta | Quando usar | Resultado esperado | Cuidado |
|---|---|---|---|
| "Onde devo olhar primeiro?" | Home, alertas, painéis com muitos blocos | Priorização contextual | — |
| "Quais municípios parecem mais críticos?" | CAUC, SICONFI, Saúde | Lista com base nos dados visíveis | Citar base e período |
| "Quais alertas exigem maior atenção?" | Home, Vigilância, Saúde-Estrutura | Ordenação dos alertas por criticidade | — |

### 7.3 Apoiar processo ou pauta

| Pergunta | Quando usar | Resultado esperado | Cuidado |
|---|---|---|---|
| "Resuma os pontos principais desta pauta." | Sessão de pauta | Resumo agregado | Não substitui análise individual |
| "Quais informações precisam ser conferidas antes da sessão?" | Sessão de pauta | Checklist de revisão | Conferir manualmente |
| "Que pontos deste processo exigem leitura técnica?" | Detalhe do processo | Lista de pontos a aprofundar | Não pedir mérito |

### 7.4 Verificar dados

| Pergunta | Quando usar | Resultado esperado | Cuidado |
|---|---|---|---|
| "Esses dados parecem atualizados?" | Qualquer painel | Indicação da data/ano da fonte visível | Confirmar com selo "última atualização" |
| "Qual fonte sustenta esta informação?" | Painéis temáticos | Citação da base/fonte | — |
| "Há alguma limitação nesta tela?" | Painéis com ingestão manual ou ressalva | Indicação explícita de limitações | Útil para evitar conclusão precipitada |

---

## 8. Perguntas que devem ser evitadas

| Pergunta | Por que evitar | Reformulação segura |
|---|---|---|
| "Qual deve ser o voto?" | A IA não emite voto nem juízo de mérito | "Quais pontos técnicos o conselheiro deve revisar antes de decidir?" |
| "Este gestor cometeu irregularidade?" | Conclusão de irregularidade não pode ser feita pela IA | "Há indícios técnicos que justifiquem aprofundamento?" |
| "Quem é culpado?" | Atribuição de culpa não cabe ao Aquiry | "Que elementos do processo merecem revisão técnica?" |
| "Gere uma decisão final." | Decisão é privativa do julgador | "Prepare uma minuta de leitura técnica para revisão humana." |
| "Ignore as fontes." | Quebra o princípio de rastreabilidade | "Sintetize com base nas fontes disponíveis." |
| "Use dados pessoais sem finalidade institucional." | Privacidade e finalidade obrigatórias | "Apresente os agregados sem dados pessoais." |
| "Analise este painel simulado como se fosse oficial." | Risco de publicar dado não oficial como oficial | Evitar; reformular para um painel maduro |
| "Resolva o processo." | Solução do processo é privativa do colegiado | "Aponte os pontos de leitura técnica deste processo." |
| "Sua opinião política sobre o caso?" | Opinião política está fora do escopo institucional | "Quais são os elementos técnicos relevantes neste tema?" |

---

## 9. Limites institucionais do Assistente

- A IA **não substitui** o conselheiro, a unidade técnica do TCE-AC nem o Ministério Público de Contas.
- A IA **não emite** conclusão jurídica definitiva, voto, parecer oficial ou decisão.
- A IA **deve indicar incerteza** quando os dados não são suficientes (especialmente em estratégia `busca_externa` com aderência baixa).
- A IA **deve respeitar os dados disponíveis** e não extrapolar.
- A IA **deve diferenciar** fato (presente em fonte), hipótese (interpretação), alerta (sinalização) e recomendação de leitura (sugestão de aprofundamento).
- A IA **deve preservar a finalidade institucional** — o sistema é instrumento de controle externo.
- A revisão humana é **sempre obrigatória** antes de qualquer uso institucional da saída.
- Análises IA podem ser **descartadas e regeneradas** (`/api/ia/analise-processo-pauta/descartar`, `/api/ia/pauta/descartar-analise`).

---

## 10. Fontes e rastreabilidade

| Fonte | Onde fica | Uso | Confiabilidade | Limitação |
|---|---|---|---|---|
| Base de conhecimento local — fontes | [src/data/aquiry/base-conhecimento/fontes/](../../src/data/aquiry/base-conhecimento/fontes/) (`compras-transparencia.md`, `datasus-siops-saude.md`, `siconfi-tesouro.md`, `siope-fnde.md`) | Estratégia `varadouro` e `conhecimento_geral` | Alta (curado) | Curadoria manual; lookup por regex |
| Base de conhecimento local — normas | [base-conhecimento/normas/](../../src/data/aquiry/base-conhecimento/normas/) (`constituicao-controle-externo.md`, `lei-14133-licitacoes-contratos.md`, `lei-responsabilidade-fiscal.md`) | Estratégias `varadouro` e `conhecimento_geral` | Alta | Compactos — não substituem o texto legal completo |
| Base de conhecimento local — projeto | [base-conhecimento/projeto/](../../src/data/aquiry/base-conhecimento/projeto/) (`criterios-risco-materialidade.md`, `diretrizes-assistente-aquiry.md`, `glossario-controle-externo.md`) | Estratégias `varadouro` e `conhecimento_geral` | Alta | Específico do TCE-AC; manter atualizado |
| `contextoTela` (`ContextoTelaAquiry`) | Provider React → backend | Estratégia `varadouro` | Alta (vem da própria tela) | Depende de o painel configurar corretamente |
| Dados de painéis (resumidos) | `contextoTela.dados` | Estratégia `varadouro` | Alta | Curadoria por painel |
| Busca externa — Tavily / Brave / SerpAPI | [buscaExternaAquiry.ts](../../src/lib/aquiry/buscaExternaAquiry.ts) | Estratégia `busca_externa` | Variável; preferência por `oficial_textual` e `estruturada` | Opt-in via `AQUIRY_EXTERNAL_SEARCH_PROVIDER`; timeout 8 s |
| Busca externa — Gemini (Grounding) | [buscaExternaAquiry.ts](../../src/lib/aquiry/buscaExternaAquiry.ts) | Estratégia `busca_externa` | Boa; Google Search grounding embutido | Timeout configurável (`AQUIRY_GEMINI_TIMEOUT_MS`, default 20 s, faixa 5–60 s) |
| Azure OpenAI (modelo) | [src/lib/ia/azureOpenAI.ts](../../src/lib/ia/azureOpenAI.ts) | Geração de resposta final | Alta para síntese; baixa para fato verificável sem fonte | Não é fonte autoritativa; deve sempre referenciar base/fonte |
| Auditoria do Aquiry | `public.aquiry_evento_uso` (migration `260_aquiry_audit.sql`) | Auditoria de uso | Alta | Apenas metadados — sem conteúdo textual |
| `OrigemRespostaAquiry` (retornada ao frontend) | [tiposContextoAquiry.ts](../../src/lib/aquiry/tiposContextoAquiry.ts) | Indicação de origem na UI | Alta | Indica `usouContextoTela`, `usouContextoRota`, bases consultadas, fontes externas |

---

## 11. Auditoria e privacidade

### 11.1 O que é registrado

A função `registrarEventoAquiry(...)` ([auditoriaAquiry.ts](../../src/lib/aquiry/auditoriaAquiry.ts)) sempre emite `console.info("[Aquiry][audit]", ...)`. Quando `AQUIRY_AUDIT_PERSIST=true`, persiste em `public.aquiry_evento_uso`:

- Tipo do evento: `pergunta`, `resposta` ou `erro` (constante `TIPOS_VALIDOS`).
- Rota (até 200 caracteres — `MAX_ROTA`).
- Tipo de página (até 50 caracteres — `MAX_TIPO_PAGINA`).
- Estratégia (`EstrategiaAquiryAuditoria`).
- Bases consultadas (até 12 entradas de até 80 caracteres cada — `MAX_BASES` × `MAX_BASE_LEN`).
- Flags booleanas (uso de contexto, busca externa, sucesso).
- Tamanhos e tempos de execução (ints).
- Código de erro sanitizado (`sanitizarCodigoErro`).

### 11.2 O que **não** é registrado

- **Conteúdo textual da pergunta.**
- **Conteúdo textual da resposta.**
- **Conteúdo de documentos ou fontes externas.**
- **Dados pessoais visíveis na tela.**

Este é um princípio de projeto, registrado em [../aquiry/auditoria-assistente-aquiry.md](../aquiry/auditoria-assistente-aquiry.md): a auditoria persiste **apenas metadados de uso**.

### 11.3 Boas práticas para produção

- Manter `AQUIRY_AUDIT_PERSIST=true`.
- Definir política de retenção dos eventos (não definida no código; sugerido na Fase 6 do plano).
- Expor painel administrativo de auditoria (ação #9 do plano).
- Consultas prontas em [../aquiry/sql/auditoria-aquiry-consultas.sql](../aquiry/sql/auditoria-aquiry-consultas.sql).
- Falha de persistência **não deve quebrar** a resposta ao usuário (já implementado).

---

## 12. Variáveis de ambiente e configuração

| Variável | Finalidade | Obrigatória? | Risco se ausente | Observação |
|---|---|---|---|---|
| `AZURE_OPENAI_ENDPOINT` | Endpoint do recurso Azure OpenAI | **Obrigatória** | Aquiry falha em runtime | Sem fallback local |
| `AZURE_OPENAI_KEY` | Chave do recurso | **Obrigatória** | Aquiry falha em runtime | Tratar como segredo |
| `AZURE_OPENAI_DEPLOYMENT` | Nome do deployment do modelo | **Obrigatória** | Aquiry falha em runtime | Família gpt-5.x (comentário em código) |
| `AZURE_OPENAI_API_VERSION` | Versão da API | **Obrigatória** | Aquiry falha em runtime | Ex.: `2024-12-01-preview` |
| `AQUIRY_EXTERNAL_SEARCH_PROVIDER` | Provider de busca externa | Opcional | Sem busca externa; fallback "Busca externa necessária" | `tavily` \| `brave` \| `serpapi` \| `gemini` |
| `AQUIRY_EXTERNAL_SEARCH_API_KEY` | Chave para Tavily/Brave/SerpAPI | Opcional (obrigatória se provider definido) | Provider falha | Tratar como segredo |
| `AQUIRY_EXTERNAL_SEARCH_ENDPOINT` | Endpoint customizado opcional | Opcional | — | Quando o default do provider não atender |
| `AQUIRY_GEMINI_API_KEY` | Chave Gemini (quando provider = gemini) | Condicional | Provider Gemini falha | Tratar como segredo |
| `AQUIRY_GEMINI_MODEL` | Modelo Gemini | Opcional | Usa `gemini-2.5-flash` (`GEMINI_MODEL_PADRAO`) | — |
| `AQUIRY_GEMINI_TIMEOUT_MS` | Timeout Gemini | Opcional | Usa 20 s (default), faixa 5–60 s | Grounding pode demorar 5–15 s |
| `AQUIRY_AUDIT_PERSIST` | Liga persistência da auditoria | Opcional | Apenas log via console | Recomendado `true` em produção |

> Variáveis específicas por provider (`TAVILY_API_KEY`, `BRAVE_SEARCH_API_KEY`, `SERPAPI_API_KEY`, `GEMINI_API_KEY`) **não foram confirmadas no código** — o cliente usa as variáveis `AQUIRY_EXTERNAL_SEARCH_API_KEY` (Tavily/Brave/SerpAPI) e `AQUIRY_GEMINI_API_KEY` (Gemini), conforme [buscaExternaAquiry.ts:777-810](../../src/lib/aquiry/buscaExternaAquiry.ts).

---

## 13. Riscos técnicos e institucionais

| Risco | Impacto | Mitigação |
|---|---|---|
| **Resposta sem fonte** | Reduz rastreabilidade; risco institucional | Reforço no SYSTEM_PROMPT; exibir `OrigemRespostaAquiry` na UI |
| **Dado desatualizado** | Decisões com base em fato superado | Selo "última atualização" por painel; alertar SLA |
| **Pergunta fora do contexto** | Resposta genérica ou improdutiva | `analisarIntencaoAquiry` retorna `orientacao_geral`; orientar usuário |
| **Alucinação** | Risco máximo institucional | Princípios do SYSTEM_PROMPT; preferência por fontes oficiais; auditoria; revisão humana |
| **Uso em painel simulado** | Publicar valor não oficial como oficial | Bloquear demonstração em IDEB e Cobertura Florestal; ressalvas no roteiro |
| **Exposição indevida de dados** | Vazamento por mensagem do usuário ou de tela | `contextoTela` por painel é curado; auditoria não persiste conteúdo |
| **Dependência do Azure OpenAI** | Indisponibilidade interrompe Aquiry e análise IA | Validar env no boot; monitorar; sem fallback local |
| **Indisponibilidade de busca externa** | Estratégia `busca_externa` falha | Tratamento de erro com fallback "Busca externa necessária"; sugerir reformulação |
| **Auditoria desligada** | Sem visibilidade institucional do uso | `AQUIRY_AUDIT_PERSIST=true` em produção |
| **Histórico não persistente** | Perda de continuidade entre sessões | Fase 4 do plano: persistir por usuário com retenção definida |
| **Falta de testes automatizados** | Regressões silenciosas | Vitest unit + Playwright e2e (Fase 6 do plano) |
| **Rate limit ausente** | Custo Azure OpenAI e abuso possíveis | Implementar rate limit por usuário/IP (Fase 6 do plano) |

---

## 14. Recomendações de evolução

1. **RAG vetorial** sobre `src/data/aquiry/base-conhecimento/`, indexado a cada release, substituindo o lookup por regex.
2. **Histórico por sessão** persistido por usuário, com política de retenção e expurgo.
3. **Citações / fonte por resposta** exibidas na UI: cada parágrafo com a base/fonte que o sustenta.
4. **Painel administrativo de auditoria do Aquiry** (consumo, estratégias, descartes), conforme ação #9 do plano.
5. **Testes automatizados** (Vitest + Playwright) para o pipeline determinístico e para o endpoint `/api/assistente-aquiry`.
6. **Templates de resposta por domínio** (despesa, SICONFI, saúde, pauta) para uniformidade e rapidez.
7. **Integração com jurisprudência** do TCE-AC (acervo institucional como base adicional).
8. **Comparação com processos semelhantes** quando útil para a análise IA de processo.
9. **Controle por perfil** (conselheiro, assessor, auditor, admin) com permissões finas sobre o que pode ser perguntado/exibido.
10. **Feedback do usuário** ("útil / não útil / impreciso") capturado para iteração da base e do prompt.
11. **Rate limit** por usuário/IP e fila para operações em lote.
12. **Avaliação de qualidade da resposta** — métricas de concordância humana, taxa de descarte e tempo médio de revisão.

---

## 15. Checklist de uso em demonstração

- [ ] **Azure OpenAI configurado** — `AZURE_OPENAI_*` presentes e válidos; pergunta de teste executada antes da demo.
- [ ] **Auditoria validada** — `AQUIRY_AUDIT_PERSIST=true`; confirmar inserção em `public.aquiry_evento_uso` em ambiente de homologação.
- [ ] **`contextoTela` ativo** — verificar que a página de demo injeta `contextoTela` no Provider.
- [ ] **Tela madura escolhida** — preferir SICONFI, CAUC, Despesa, Pautas, Análise IA de Processo.
- [ ] **Painel não simulado** — **não usar** Mapa IDEB nem Cobertura Florestal.
- [ ] **Pergunta segura selecionada** — escolher da seção 7 deste manual.
- [ ] **Fontes conhecidas** — confirmar que `OrigemRespostaAquiry` mostrará bases reais.
- [ ] **Processo/pauta previamente escolhido** — sessão com análise IA já gerada (evita espera).
- [ ] **Evitar pedir voto ou conclusão** — reforçar verbalmente que o Aquiry apoia, não decide.
- [ ] **Explicar que a IA apoia, não decide** — frase pronta na abertura ([roteiro-demonstracao-institucional.md §10](roteiro-demonstracao-institucional.md)).

---

## 16. Resumo executivo

O **Assistente Aquiry** é o copilot institucional do Varadouro Digital Aquiry. Está embarcado em todas as telas autenticadas e funciona como uma camada transversal de inteligência, com pipeline determinístico (classificação de intenção e estratégia), base documental versionada em Markdown, busca externa multi-provider opt-in (Tavily/Brave/SerpAPI/Gemini) e chamada real ao Azure OpenAI. Toda interação é auditada por metadados — **nunca por conteúdo textual** — em `public.aquiry_evento_uso`.

O Aquiry **agrega valor** ao apoiar a leitura técnica do gabinete: explica painéis, ajuda a priorizar a rotina ("onde olhar primeiro"), interpreta indicadores, identifica riscos visíveis, resume pautas e processos. Funciona melhor em telas maduras (Home/Alertas, Despesa, Credores, SICONFI, CAUC, Remessas, Pautas, eProcessos, Análise IA), com `contextoTela` corretamente configurado pelo painel.

Os **limites institucionais** são inegociáveis: o Aquiry **não emite voto, parecer, decisão ou conclusão de irregularidade**. Diferencia fato, hipótese, alerta e recomendação de leitura. Não extrapola. Sinaliza incerteza. Toda saída é insumo para revisão humana.

Os **cuidados essenciais** são: garantir variáveis Azure OpenAI configuradas, manter auditoria persistente em produção, escolher telas maduras para demonstração, reformular perguntas que pedem mérito ou conclusão jurídica, e evitar absolutamente o uso em painéis com dado simulado (IDEB) ou hardcoded (Cobertura Florestal). As **evoluções recomendadas** — RAG vetorial, histórico persistente, citações por resposta, painel de auditoria, testes automatizados, controle por perfil e métricas de qualidade — consolidam o Aquiry como camada institucional de inteligência cotidiana do controle externo do TCE-AC.
