# Checklist MVP — Assistente Aquiry

Documento institucional de fechamento do MVP do Assistente Aquiry no Varadouro Digital (TCE-AC). Serve para alinhar expectativas antes da demonstração aos gabinetes e para orientar o piloto.

---

## 1. O que o Assistente Aquiry faz hoje

- **Acompanha o usuário em todas as páginas autenticadas** via chat flutuante global (botão no canto inferior direito).
- **Entende a rota atual** e usa o tipo de página inferido para orientar a resposta.
- **Usa contexto real** das telas integradas: Alertas do Gabinete, Painel de Mortalidade, Pautas de Julgamento, Sessões, Listagem e Detalhe de Processos.
- **Responde perguntas operacionais** sobre alertas, mortalidade, pautas e processos com base em metadados visíveis, com síntese executiva curta + detalhamento.
- **Usa base documental normativa** versionada no projeto (diretrizes, glossário, critérios de risco/materialidade, resumos da Constituição/LRF/Lei 14.133/2021 e guias de fontes oficiais).
- **Faz pesquisa externa controlada com Gemini** (Grounding com Google Search) quando a pergunta exige informação atualizada ou fonte oficial.
- **Diferencia "Pesquisa externa realizada" de "Fonte estruturada necessária"** quando o nível de prova exigido (SIOPE/SICONFI/RREO/DataSUS/SIOPS estruturado) não é atendido pelas fontes encontradas.
- **Indica a origem/base da resposta** em linha curta resumida (`Varadouro + IA`, `Pesquisa externa + IA`, `Fonte estruturada necessária + Documental + IA`).
- **Permite iniciar nova conversa** sem recarregar a página, preservando o contexto da tela atual.
- **Registra métricas seguras de uso** (auditoria por console e, opcionalmente, em banco — sempre sem conteúdo de pergunta/resposta).

---

## 2. O que ele ainda NÃO faz

- **Não lê automaticamente PDFs ou conteúdo integral de processos** — apenas metadados visíveis no Varadouro.
- **Não substitui análise técnica, MPC, conselheiro relator ou decisão colegiada**.
- **Não emite voto, minuta conclusiva nem parecer técnico**.
- **Não conclui irregularidade sem base** — só sinaliza pontos de atenção e dados ausentes.
- **Não consulta livremente todas as tabelas do banco** — usa apenas o que cada tela já disponibilizou via `useContextoAquiry`.
- **Não possui RAG vetorial completo** — a base documental é versionada e descoberta por palavras-chave (regex), não por embeddings.
- **Não responde com ranking municipal sem base estruturada** — quando faltar fonte oficial estruturada, declara a limitação e indica a base correta.
- **Não armazena pergunta ou resposta bruta** na auditoria — apenas metadados (rota, estratégia, flags, tamanhos, latência).

---

## 3. Demonstração sugerida (fluxo curto, 5 paradas)

| # | Tela | Pergunta | O que mostrar |
|---|------|----------|----------------|
| A | Home / Alertas do Gabinete | "Onde devo olhar primeiro?" | Estratégia `varadouro`, análise contextual determinística, síntese executiva com priorização (prazo vencido → sensíveis → CAUC → saúde crítica). |
| B | Pautas de Julgamento (lista) | "Como analisar uma pauta de julgamento?" | Resposta metodológica: síntese curta + aplicação aos dados da tela + roteiro do gabinete + limite. |
| C | Detalhe de Sessão | "Quais processos parecem mais sensíveis nesta sessão?" | Sinalização de processos de classe sensível (denúncia, representação, cautelar, TCE, recurso). Não inventa documentos. |
| D | Detalhe de Processo | "Existe algo que impeça uma conclusão segura?" | Declaração explícita de dados ausentes (relatório técnico, MPC). Sem voto. |
| E | Qualquer tela | "Como os municípios do Acre estão em relação aos gastos com educação em 2026?" | Estratégia `busca_externa` com Gemini. Linha Base com `Pesquisa externa + Documental + IA` ou `Fonte estruturada necessária + Documental + IA`. Mostrar bloco **Fontes** expandido. |

### O que destacar durante a demo

- **Linha "Base:" resumida** em cada resposta da IA.
- **Botão "Ver detalhes da base"** que expande bases completas, documentos-base e fontes externas.
- **Bloco "Documentos-base"** quando a base documental for usada (ex.: SIOPE/FNDE em pergunta de educação).
- **Bloco "Fontes" externas** com links clicáveis em nova aba.
- **"Fonte estruturada necessária"** como sinal explícito de cautela.
- **Botão "Nova conversa"** no cabeçalho do painel.

---

## 4. Perguntas boas para demonstração

- "Onde devo olhar primeiro?"
- "Quais riscos merecem prioridade?"
- "Como analisar esta pauta?"
- "Quais processos parecem mais sensíveis?"
- "Existe algo que impeça uma conclusão segura?"
- "Como avaliar risco e materialidade?"
- "Quais fontes oficiais usar para educação municipal?"

---

## 5. Perguntas a evitar na demonstração inicial

- Perguntas que exigem **leitura de PDF integral** (ainda não integrada).
- Perguntas que pedem **voto, minuta conclusiva ou parecer fechado**.
- Perguntas que pedem **ranking municipal sem base estruturada** disponível (ex.: "liste os 5 piores municípios em saúde em 2026"). O Aquiry vai responder com cautela e indicar a base correta — apropriado, mas pode ser interpretado como "ele não sabe".
- Perguntas sobre **dados sigilosos não exibidos na tela**.
- Perguntas **muito amplas e sem contexto** ("o que está acontecendo no Acre?") — preferir perguntas focadas na tela aberta.

---

## 6. Variáveis de ambiente relevantes

**Já existentes no projeto** (não tocar a menos que troquem chaves):

- `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_KEY`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION` — IA principal do Aquiry.
- `DATABASE_URL` (ou `PGHOST`/`PGPORT`/`PGDATABASE`/`PGUSER`/`PGPASSWORD`) — Postgres do projeto.

**Específicas do Aquiry**:

- `AQUIRY_EXTERNAL_SEARCH_PROVIDER=gemini` — ativa pesquisa externa.
- `AQUIRY_GEMINI_API_KEY=` — chave do Google AI Studio (não comitar valor).
- `AQUIRY_GEMINI_MODEL=gemini-2.5-flash` — modelo padrão.
- `AQUIRY_GEMINI_TIMEOUT_MS=20000` — opcional, faixa 5000–60000.
- `AQUIRY_AUDIT_PERSIST=false` — `true` ativa persistência de auditoria em `public.aquiry_evento_uso`.

> **Não incluir valores reais de chave** neste documento, no `.env.example` nem em commits. Os valores ficam apenas em `.env.local` na máquina do operador.

---

## 7. Checklist técnico antes da apresentação

- [ ] `npx tsc --noEmit` limpo.
- [ ] `npx eslint` limpo nos arquivos do Aquiry.
- [ ] `npm run build` rodando localmente, se viável no tempo da demo.
- [ ] **Gemini configurado** (`AQUIRY_EXTERNAL_SEARCH_PROVIDER=gemini` + chave válida + `AQUIRY_GEMINI_MODEL`).
- [ ] **Auditoria opcional testada**: subir com `AQUIRY_AUDIT_PERSIST=true`, fazer 2–3 perguntas, conferir linhas em `public.aquiry_evento_uso`.
- [ ] **Migration 260 aplicada** se for usar persistência em produção/demo.
- [ ] **Botão do Aquiry visível** em todas as páginas autenticadas (canto inferior direito).
- [ ] **Nova conversa** funcionando — reinicia o histórico e mantém o contexto da tela.
- [ ] **Detalhes da base** começam recolhidos; expansor funciona; ícone gira; `aria-expanded` correto.
- [ ] **Pesquisa externa testada** com pergunta que exija dado atualizado (ex.: "Qual a portaria mais recente do FNDE?").
- [ ] **Pauta / Sessão / Processos / Detalhe de Processo** testados, com contexto registrando dados corretos.
- [ ] **Dark mode** preservado em todos os blocos.
- [ ] **Links externos abrem em nova aba** (`target="_blank"` + `rel="noopener noreferrer"`).

---

## 8. Limitações a comunicar aos gabinetes

- As respostas do Aquiry são **apoio à triagem** e à decisão sobre **"onde olhar primeiro"** — **não substituem** análise formal.
- A pesquisa externa pode **não retornar dado estruturado** dependendo da pergunta e do momento do ano. Isso é esperado.
- A linha **"Fonte estruturada necessária" não é erro** — é **sinal de cautela** institucional. Indica que a resposta segura depende de consultar a base oficial (SIOPE/FNDE, SICONFI/RREO, DataSUS/SIOPS) ou painel próprio do Varadouro quando disponível.
- Para **análise formal** (parecer prévio, voto, decisão), **validar sempre a fonte oficial** e o conteúdo dos processos.
- O uso futuro mais profundo (PDF, jurisprudência, dado estruturado por município/exercício) depende de **integração de bases estruturadas e documentos**, planejada para fases pós-MVP.

---

## 9. Próximos passos pós-MVP

- **Integrar base estruturada de Educação** (SIOPE/FNDE) via ETL/Supabase, abrindo painel próprio.
- **Integrar contratos e fornecedores** (Compras.gov / PNCP / portais do ente) com painel de risco.
- **Leitura controlada de documentos processuais** (relatórios técnicos, pareceres MPC) com seleção de trechos e citação obrigatória.
- **RAG vetorial** com normas, acórdãos e documentos institucionais — após volume justificar o investimento.
- **Painel de métricas do Aquiry** com base nas consultas SQL já versionadas em [`docs/aquiry/sql/auditoria-aquiry-consultas.sql`](sql/auditoria-aquiry-consultas.sql).
- **Feedback estruturado dos gabinetes** (formulário curto pós-uso) para guiar refinamentos de prompt, base documental e novas integrações.

---

## Referências cruzadas

- [Roteiro de testes do Assistente Aquiry](roteiro-testes-assistente-aquiry.md)
- [Auditoria do Assistente Aquiry](auditoria-assistente-aquiry.md)
- [Consultas SQL operacionais](sql/auditoria-aquiry-consultas.sql)
- [Base documental versionada](../../src/data/aquiry/base-conhecimento/README.md)
