# Roteiro de testes — Assistente Aquiry (MVP de demonstração)

Documento interno para validação do Assistente Aquiry antes da apresentação aos gabinetes do TCE-AC. Cobre cenários de uso, checklist visual, checklist de segurança e critérios de aprovação do MVP.

## Como usar este roteiro

1. Abra o Varadouro Digital com sessão válida.
2. Em cada seção, navegue para a tela indicada, abra o Assistente Aquiry (botão flutuante inferior direito) e dispare as perguntas listadas.
3. Para cada pergunta, confira o **resultado esperado**, a **linha "Base"** e os blocos **"Documentos-base"** / **"Fontes"** quando aplicáveis.
4. Anote desvios no campo "Observações" ao final de cada cenário.

---

## A. Home / Página principal

Tela: `/` (dashboard inicial / alertas do gabinete).

### Perguntas
1. "Onde devo olhar primeiro?"
2. "Quais alertas merecem prioridade?"
3. "Como os municípios do estado do Acre estão em relação aos gastos com educação em 2026?"
4. "O que significa quando a resposta diz 'Fonte estruturada necessária'?"

### Resultados esperados

| # | Estratégia | Base esperada | Comportamento |
|---|------------|----------------|----------------|
| 1 | `varadouro` | `Contexto da tela atual · Contexto da rota · Análise contextual do Varadouro · Orientação geral da IA` (variável conforme dados carregados) | Resposta destaca os alertas visíveis, priorizando prazo regulamentar vencido, processos sensíveis, CAUC, saúde crítica. Não inventa dados ausentes. |
| 2 | `varadouro` | igual ao item 1 | Mesma lógica, foco em risco/urgência. |
| 3 | `busca_externa` | `Pesquisa externa realizada · Fonte estruturada necessária · Base documental do Aquiry · Orientação geral da IA` | Aquiry deve declarar que a base interna não contém o recorte municipal de 2026; pesquisa externa pode trazer fnde.gov.br/tesouro.gov.br como fontes oficiais textuais; sem dado tabular, não conclui ranking nem cumprimento; indica SIOPE/FNDE como base correta. |
| 4 | `conhecimento_geral` | `Contexto da rota · Base documental do Aquiry · Orientação geral da IA` | Resposta institucional explicando o significado: a busca externa foi feita, mas o nível de prova exigido pela pergunta (dado estruturado) não foi atingido. |

### Observações
> _Preencher durante o teste._

---

## B. Alertas do Gabinete

Tela: `/alertas-gabinete` (ou onde o componente `AlertasGabineteClient` for renderizado).

### Perguntas
1. "Onde devo olhar primeiro?"
2. "Quais riscos merecem prioridade?"
3. "O que é mais urgente aqui?"

### Resultados esperados
- Estratégia `varadouro` em todas as três.
- Base inclui `Contexto da tela atual` (cards de regularidade, processos, saúde, social) e `Análise contextual do Varadouro` (resposta determinística pré-formatada).
- Priorização: prazo regulamentar vencido → processos sensíveis → pendências CAUC (com nível) → alertas críticos de saúde → processos sem movimentação há mais de 15 dias.
- Notas obrigatórias: aviso quando dados processuais do eProcess não estão disponíveis; linha de fechamento informando que a leitura considera apenas dados visíveis na tela.
- **Não** inventa números nem cita municípios específicos não listados.

### Observações
> _Preencher durante o teste._

---

## C. Painel de Mortalidade

Tela: painel de mortalidade infantil/materna (componente `MortalidadeClient`).

### Perguntas
1. "Como interpretar estes indicadores?"
2. "Quais pontos merecem verificação pelo gabinete?"
3. "Há risco neste painel?"

### Resultados esperados
- Estratégia `varadouro` quando há contexto de tela; `conhecimento_geral` se a pergunta for puramente conceitual.
- Análise contextual deve trazer: período/escopo, nascidos vivos, óbitos infantis, óbitos maternos, taxa de mortalidade infantil (TMI) classificada (alta/moderada/baixa).
- **Não** afirma causalidade.
- **Não** atribui diagnóstico epidemiológico definitivo.
- Destaca: subnotificação em municípios pequenos, variação anual com episódios isolados, necessidade de série histórica, qualidade dos registros no SIM/SINASC.
- Quando há base documental, pode incluir `Base documental do Aquiry` com `fontes/datasus-siops-saude.md`.

### Observações
> _Preencher durante o teste._

---

## D. Perguntas conceituais

Disparáveis de qualquer tela.

### Perguntas
1. "O que é controle externo concomitante?"
2. "Como avaliar risco e materialidade?"
3. "O que o gabinete deve observar em contratos públicos?"

### Resultados esperados

| # | Estratégia | Base esperada | Documentos-base esperados |
|---|------------|----------------|----------------------------|
| 1 | `conhecimento_geral` | `Contexto da rota · Base documental do Aquiry · Orientação geral da IA` | `normas/constituicao-controle-externo.md`, `projeto/glossario-controle-externo.md` |
| 2 | `conhecimento_geral` | igual | `projeto/criterios-risco-materialidade.md` |
| 3 | `conhecimento_geral` | igual | `normas/lei-14133-licitacoes-contratos.md`, `fontes/compras-transparencia.md` |

- Tom institucional e objetivo.
- Não afirma que consultou dados internos.
- Recomenda validação na fonte oficial para análise formal.

### Observações
> _Preencher durante o teste._

---

## E. Busca externa

Perguntas que devem disparar `busca_externa`:

1. "Qual a norma vigente sobre prestação de contas?"
2. "Existe dado atualizado no DataSUS?"
3. "Quais fontes oficiais consultar sobre SIOPE/FNDE?"

### Resultados esperados
- Estratégia `busca_externa` em todas.
- Pesquisa externa executada (Gemini) — Base contém `Pesquisa externa realizada`.
- Bloco **Fontes** discreto, com links em nova aba (`target="_blank"`, `rel="noopener noreferrer"`).
- Quando a pergunta exigir dado **estruturado** e a busca trouxer só fontes textuais, base inclui `Fonte estruturada necessária`. A resposta indica explicitamente: "a próxima etapa é consultar/exportar a base estruturada do SIOPE/FNDE" (ou base equivalente ao setor).
- Documentos-base podem aparecer se a regra de descoberta casar (ex.: pergunta 3 carrega `fontes/siope-fnde.md`).

### Observações
> _Preencher durante o teste._

---

## F. Pautas e Processos

### F.1 Lista de Pautas (`/pautas-julgamento` ou equivalente)

Perguntas:
1. "O que devo olhar primeiro nesta lista de pautas?"
2. "Há sessões com geração de IA em andamento?"

Resultados esperados:
- Estratégia `varadouro`.
- Base inclui `Contexto da tela atual` + `Análise contextual do Varadouro`.
- Resposta destaca **próxima sessão** (data, número, órgão), totais de processos em julgamento/vista, e jobs de análise IA ativos quando houver.
- Não afirma irregularidade nem cita processos específicos não listados.

### F.2 Detalhe de Sessão de Pauta

Perguntas:
1. "O que devo olhar primeiro nesta pauta?"
2. "Quais processos parecem mais sensíveis?"
3. "Existe algo que impeça uma conclusão segura?"

Resultados esperados:
- Estratégia `varadouro` com `Análise contextual do Varadouro`.
- Identifica processos de classe/objeto sensível (denúncia, representação, cautelar, TCE, recurso) a partir dos metadados visíveis.
- Identifica processos em vista.
- Lista classes e relatorias presentes na pauta.
- **Não emite voto** nem conclusão decisória.
- Nota explícita: "o assistente não acessou relatórios técnicos, MPC ou documentos".

### F.3 Listagem de Processos

Perguntas:
1. "Resume o que está nesta tela."
2. "Quais filtros estão ativos?"

Resultados esperados:
- Resposta determinística com total geral, página, filtros ativos.
- Não conclui nada sobre processos individuais.
- Orienta abrir o detalhe correspondente.

### F.4 Detalhe de Processo

Perguntas:
1. "Quais pontos de atenção deste processo?"
2. "Como o gabinete deve analisar este processo?"
3. "Existe algo que impeça uma conclusão segura?"

Resultados esperados:
- Estratégia `varadouro` com cabeçalho do processo (número, classe, situação, órgão, parte, relator, setor atual).
- Sinaliza se classe/objeto é sensível.
- Lista contadores: arquivos, movimentações, sessões vinculadas; indica presença/ausência de relatório técnico, parecer MPC e decisão.
- Declara **explicitamente** os dados ausentes que limitam a conclusão (ex.: "sem relatório técnico identificado nos documentos da tela").
- Fechamento padrão: "O assistente não leu o conteúdo dos documentos. Não emite voto, parecer conclusivo ou afirmação de irregularidade."

### F.5 Limites comuns às telas F.1–F.4

- [ ] Não inventa documentos, valores, percentuais ou responsáveis.
- [ ] Não emite voto ou minuta conclusiva.
- [ ] Não afirma irregularidade sem base expressa na tela.
- [ ] Identifica corretamente classe/objeto sensível (denúncia, representação, cautelar, TCE, recurso, pedido de vista).
- [ ] Indica limitações quando não houver relatório técnico, MPC ou documentos categorizados.
- [ ] Sempre orientado à pergunta "onde olhar primeiro?".

---

## G. Cenários degradados / falha

Para reproduzir, alterar `.env.local` temporariamente.

| Cenário | Como reproduzir | Comportamento esperado |
|---------|------------------|--------------------------|
| Provider de busca não configurado | Remover `AQUIRY_EXTERNAL_SEARCH_PROVIDER` | Pergunta `busca_externa` retorna `Base: Busca externa necessária · Orientação geral da IA`. Resposta declara honestamente que esta versão não realizou busca externa. Log `[Aquiry] Busca externa não executada: provider ou API key não configurados.`. |
| Chave Gemini inválida | Trocar `AQUIRY_GEMINI_API_KEY` | Log `[aquiry/buscaExterna] Gemini HTTP 4xx`. Frontend retorna ao caminho de "Busca externa necessária" sem expor erro técnico. |
| Timeout do Gemini | Reduzir `AQUIRY_GEMINI_TIMEOUT_MS=5000` e perguntar algo complexo | Log `aborted due to timeout`. Resposta degrada sem quebrar a UI. |
| Azure OpenAI vazio (`finish_reason=length`) | Reduzir `maxTokens` programaticamente (apenas teste local) | Frontend mostra mensagem genérica de erro; log do servidor inclui `finish_reason` e `usage`. |

---

## 📊 Métricas esperadas (auditoria de uso)

Toda interação com `/api/assistente-aquiry` gera logs estruturados no terminal do servidor com prefixo `[Aquiry][audit]`. **Nenhum conteúdo de pergunta ou resposta é registrado** — apenas metadados.

### Formato

Cada linha de auditoria é um JSON na forma:

```json
[Aquiry][audit] {"tipo":"resposta","timestamp":"2026-05-18T14:23:11.412Z","rota":"/pautas-julgamento","tipoPagina":"pauta","estrategia":"varadouro","bases":["Contexto da tela atual","Análise contextual do Varadouro","Base documental do Aquiry","Orientação geral da IA"],"usouContextoTela":true,"usouAnaliseContextual":true,"usouBaseDocumental":true,"usouPesquisaExterna":false,"tamanhoResposta":842,"tempoRespostaMs":4231}
```

### Eventos esperados por cenário

| Cenário | Eventos | Campos-chave |
|---------|---------|--------------|
| Pergunta enviada | `pergunta` | `rota`, `tipoPagina`, `tamanhoPergunta` |
| Resposta com `varadouro` (tela de alertas, pauta, processo) | `pergunta` + `resposta` | `estrategia=varadouro`, `usouContextoTela=true`, `usouAnaliseContextual=true` (quando aplicável), `bases` incluem "Contexto da tela atual" |
| Resposta `conhecimento_geral` (pergunta conceitual) | `pergunta` + `resposta` | `estrategia=conhecimento_geral`, `usouBaseDocumental` pode ser `true` |
| Resposta `busca_externa` com Gemini configurado | `pergunta` + `resposta` | `estrategia=busca_externa`, `usouPesquisaExterna=true`, `pesquisaExternaSuficiente=true|false`, `bases` incluem "Pesquisa externa realizada" |
| Resposta `busca_externa` sem fonte estruturada | `pergunta` + `resposta` | `usouPesquisaExterna=true`, `pesquisaExternaSuficiente=false`, `exigeFonteEstruturada=true`, `fonteEstruturadaEncontrada=false`, `bases` incluem "Fonte estruturada necessária" |
| Provider externo não configurado | `pergunta` + `resposta` | `estrategia=busca_externa`, `usouPesquisaExterna=false`, `bases` incluem "Busca externa necessária" |
| Falha de provider externo (HTTP 4xx/timeout) | `pergunta` + `resposta` | `usouPesquisaExterna=false` (caiu no fallback); o erro do provider é logado separadamente em `[aquiry/buscaExterna]` |
| Falha na IA principal (Azure) | `pergunta` + `erro` | `erroCodigo` sanitizado (ex.: `error`, `typeerror`), `tempoRespostaMs` |

### O que NÃO deve aparecer nos logs de auditoria

- [ ] Conteúdo da pergunta ou da resposta.
- [ ] Stack trace ou mensagens livres de erro.
- [ ] API keys (Azure, Gemini, Tavily etc.).
- [ ] Fontes externas completas (URLs, títulos, trechos).
- [ ] Documentos da base documental.
- [ ] Payloads brutos do Gemini ou Azure OpenAI.

### Persistência opcional

Quando `AQUIRY_AUDIT_PERSIST=true`, os mesmos eventos são gravados em `public.aquiry_evento_uso` (migration `260_aquiry_audit.sql`). Sem a variável, mantém-se apenas o `console.info`. Falha de persistência **não interfere na resposta** ao usuário.

Detalhes (campos armazenados, campos NÃO armazenados, consultas úteis e governança LGPD): ver [`auditoria-assistente-aquiry.md`](auditoria-assistente-aquiry.md).

---

## ✅ Checklist visual

- [ ] Botão flutuante visível no canto inferior direito, não invasivo.
- [ ] Painel **não cobre** o cabeçalho/topbar do sistema.
- [ ] Responsivo em telas menores (largura mínima ~360px funcional).
- [ ] Linha `Base:` visível e legível em fonte pequena.
- [ ] Bloco **Documentos-base** discreto (uppercase tracking, sem links).
- [ ] Bloco **Fontes** discreto, com hostname à direita quando útil (sem mostrar `vertexaisearch.cloud.google.com`).
- [ ] Links externos abrem em **nova aba** com `rel="noopener noreferrer"`.
- [ ] **Dark mode** preservado em todos os blocos.
- [ ] Mensagens longas com `whitespace-pre-wrap` (quebra de linha preservada).
- [ ] Sugestões iniciais aparecem apenas na primeira interação.

---

## 🔒 Checklist de segurança

- [ ] Nenhuma API key (Azure, Gemini, Tavily etc.) aparece em logs do **navegador**.
- [ ] Stack trace **não** vaza ao frontend — erros aparecem como mensagem genérica ("O assistente não está disponível no momento.").
- [ ] Aquiry **não diz** que pesquisou quando `usouPesquisaExterna === false`.
- [ ] Aquiry **não diz** que consultou Varadouro/banco/processo quando o contexto não foi enviado.
- [ ] Aquiry **não inventa** processos, valores, responsáveis, percentuais, datas ou normas.
- [ ] Aquiry diferencia claramente: dado interno, fonte oficial textual, fonte estruturada, fonte secundária (notícia), base documental e orientação geral.
- [ ] Endpoint `/api/assistente-aquiry/diagnostico-busca` **não existe** mais (foi removido após a Fase 7).
- [ ] Quando `pesquisaExternaSuficiente === false`, a resposta orienta para a base oficial cabível ao setor detectado (educação → SIOPE/FNDE, saúde → DataSUS/SIOPS, fiscal → SICONFI/RREO; **não cruzar setores**).

---

## 🎯 Critérios de aprovação do MVP

Marque cada item após validação em pelo menos três cenários distintos:

- [ ] **Resposta útil em tela contextual**: na home e em painéis específicos, o Aquiry traz uma síntese acionável sem inventar dados.
- [ ] **Reconhece quando faltam dados**: declara honestamente "não há base interna para X" em vez de inventar.
- [ ] **Usa base documental**: para perguntas conceituais e institucionais, a base versionada do projeto aparece na linha "Base" e em "Documentos-base".
- [ ] **Usa pesquisa externa com transparência**: quando ativada, exibe `Pesquisa externa realizada` + bloco de fontes; quando insuficiente, exibe `Fonte estruturada necessária`.
- [ ] **Evita conclusões indevidas**: não classifica municípios em regular/risco/irregular sem dado estruturado; não emite minuta de voto/parecer.
- [ ] **Ajuda o gabinete a decidir onde olhar primeiro**: prioriza risco × materialidade × urgência × impacto social com base nos dados visíveis.
- [ ] **UX coesa**: identidade visual (logo, subtítulo "Inteligência de apoio ao gabinete"), responsividade e dark mode preservados.
- [ ] **Não há regressões** nos demais painéis do Varadouro durante o uso do Aquiry (chat flutua e não interfere em outras interações).

---

## Notas para a apresentação

- Demonstrar pelo menos um cenário por categoria (A–E).
- Mostrar uma situação **com base documental** e uma **com pesquisa externa** para ilustrar a diferença de origem.
- Mostrar um cenário onde o Aquiry **se recusa a concluir** por falta de dado estruturado — esse é um diferencial institucional.
- Não usar perguntas que provoquem alucinação para "testar" em público; o objetivo da apresentação é demonstrar utilidade e prudência, não estressar limites.

---

## Próximos passos sugeridos (pós-MVP)

- Integração com base estruturada (SIOPE/FNDE, SICONFI/RREO) via ETL ou API.
- Painel próprio de educação dentro do Varadouro.
- Refinamento contínuo da base documental conforme uso dos gabinetes.
- Avaliação de RAG vetorial quando o volume de documentos justificar.
- Métricas de uso (perguntas mais frequentes, estratégias acionadas, taxa de "busca externa necessária").
