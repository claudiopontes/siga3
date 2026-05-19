# Roteiro de Demonstração Institucional do Varadouro Digital Aquiry

> Roteiro derivado de [mapa-funcional-varadouro.md](mapa-funcional-varadouro.md) e [plano-evolucao-varadouro.md](plano-evolucao-varadouro.md).
> Destinado a conselheiros, chefes de gabinete, assessores técnicos, equipe de controle externo e equipe de TI/dados do TCE-AC.
> Data de referência: 2026-05-19.

---

## 1. Mensagem central da demonstração

O **Varadouro Digital Aquiry** é uma plataforma de inteligência de apoio aos gabinetes dos conselheiros do TCE-AC. Toda a demonstração deve responder à pergunta-guia:

> **"Onde o gabinete do conselheiro deve olhar primeiro?"**

A apresentação deve reforçar, de forma consistente:

- **Risco** — alertas que indicam exposição imediata (fiscal, sanitária, cadastral, contábil).
- **Materialidade** — concentração de recursos públicos, fornecedores e jurisdicionados.
- **Alertas** — sinalização ativa, priorizada e auditável.
- **Processos** — vínculo direto com o eProcess do TCE-AC.
- **Pautas de julgamento** — preparação executiva da sessão.
- **Fornecedores/credores** — rastreio do recurso público até o beneficiário.
- **Situação dos jurisdicionados** — adimplência, capacidade de pagamento e qualidade dos envios.
- **Qualidade e atualização dos dados** — fontes oficiais, periodicidade visível, ETL auditado.
- **Apoio institucional por IA** — o Assistente Aquiry e a análise IA de processo organizam a leitura técnica, **nunca substituem voto, parecer ou juízo de mérito**.

---

## 2. Público-alvo da demonstração

### 2.1 Conselheiros

- **Enfatizar:** Central de Alertas, Pautas, Análise IA de Processo, Resumo de Pauta, Pesquisa de Credores. A pergunta-guia ("onde olhar primeiro") deve permear toda a fala.
- **Evitar:** detalhes de ETL, schema de banco, código, painéis ainda em maturação.
- **Perguntas que podem surgir:**
  - "A IA pode emitir voto?" — **Não**. Apenas organiza leitura técnica.
  - "Posso filtrar alertas pela minha relatoria?" — Hoje parcialmente; personalização por conselheiro está prevista na Fase 2 do plano de evolução.
  - "Os dados são oficiais?" — Sim, as bases demonstráveis usam fontes oficiais (Tesouro, IBGE, DataSUS, eProcess).

### 2.2 Chefes de gabinete

- **Enfatizar:** ganho de tempo, priorização da rotina, preparação de sessão, rastreabilidade.
- **Evitar:** discussão de bug, dívida técnica, dependências internas.
- **Perguntas que podem surgir:**
  - "Como recebo alerta de algo crítico?" — Hoje via Central de Alertas; notificação ativa está prevista.
  - "Posso exportar o resumo da pauta?" — Exportação executiva está no roadmap.
  - "Quem pode acessar?" — Apenas usuários autorizados via AD com perfil habilitado.

### 2.3 Assessores técnicos

- **Enfatizar:** drilldown por credor, ranking por ente, análise IA com descarte/regeneração, contexto da tela no Aquiry.
- **Evitar:** apresentar painéis ainda dependentes de ingestão manual sem ressalva.
- **Perguntas que podem surgir:**
  - "Posso comparar entes/exercícios?" — Sim, nos painéis Despesa, Receita e SICONFI.
  - "A análise IA pode ser descartada?" — Sim, com regeneração auditada.
  - "Qual a periodicidade dos dados?" — Documentada na matriz do plano de evolução.

### 2.4 Equipe de controle externo

- **Enfatizar:** SICONFI (RREO/RGF/Extrato), CAUC, Remessas, alertas SIOPS/SISAGUA/Vigilância, rastreabilidade até o credor.
- **Evitar:** sugerir que o sistema substitui auditoria de campo.
- **Perguntas que podem surgir:**
  - "Como os critérios de risco são definidos?" — Documentado em `src/data/aquiry/base-conhecimento/projeto/criterios-risco-materialidade.md`.
  - "É possível investigar duplicidades?" — Sim; ver diagnósticos em [docs/fase2a2-diagnostico-duplicatas-sisagua-siconfi.md](../fase2a2-diagnostico-duplicatas-sisagua-siconfi.md).
  - "Auditoria do uso da IA é registrada?" — Sim, somente metadados, em `public.aquiry_evento_uso`.

### 2.5 Equipe de TI / dados

- **Enfatizar:** arquitetura em três camadas, ETL versionado, 62 migrations, Azure OpenAI, autenticação AD, ausência de dados sensíveis na auditoria do Aquiry.
- **Evitar:** detalhe de painéis funcionais; este público quer arquitetura.
- **Perguntas que podem surgir:**
  - "Quais variáveis de ambiente são necessárias?" — Ver [.env.example](../../.env.example).
  - "Como é o controle de concorrência do ETL Admin?" — Advisory lock Postgres por job.
  - "Há CI/CD?" — Ainda não; previsto na Fase 6 do plano de evolução.

---

## 3. Roteiro principal da demonstração (20–30 minutos)

### Etapa 1 — Abertura institucional (1–2 min)

- **Objetivo:** posicionar o sistema como ferramenta de controle externo.
- **Mensagem:** "O Varadouro Digital Aquiry é a plataforma de inteligência do TCE-AC para apoiar os gabinetes na pergunta central: onde o conselheiro deve olhar primeiro? Toda a navegação que veremos responde a essa pergunta."
- **Funcionalidade:** tela de login (sem credenciais expostas).
- **Ação prática:** mostrar a barra de identificação institucional após o login.
- **Cuidado:** não exibir credenciais reais; usar usuário de demonstração com perfil adequado.
- **Transição:** "Vamos começar pela home, que é o ponto de partida do gabinete a cada manhã."

### Etapa 2 — Home / Central de Alertas do Gabinete (3 min)

- **Objetivo:** mostrar a visão única de "onde olhar primeiro".
- **Mensagem:** "Esta tela agrega, em tempo real, os alertas que o gabinete precisa enxergar primeiro. Fiscal, saúde, remessas, estrutura — tudo em um único lugar, com origem rastreável."
- **Funcionalidade:** Home (`/`) com `AlertasGabineteClient`.
- **Ação prática:** percorrer os blocos de alertas, abrir um detalhe e navegar até o painel de origem.
- **Cuidado:** se houver alertas vinculados a base imatura, evitar abri-los.
- **Transição:** "Esses alertas só fazem sentido se conseguirmos investigar materialidade. Vamos ao Painel de Despesa."

### Etapa 3 — Painel de Despesa (3 min)

- **Objetivo:** evidenciar materialidade financeira.
- **Mensagem:** "Aqui o gabinete enxerga a concentração de recursos públicos por ente, entidade e elemento de despesa. Em segundos, identifica onde está o maior volume e a maior variação."
- **Funcionalidade:** `/painel-despesa`.
- **Ação prática:** filtrar ano e ente; mostrar ranking de credores e evolução mensal; abrir composição.
- **Cuidado:** evitar números absolutos sem contexto.
- **Transição:** "O passo natural é seguir o recurso até o beneficiário."

### Etapa 4 — Pesquisa de Credores (3 min)

- **Objetivo:** demonstrar análise por fornecedor/credor.
- **Mensagem:** "O Varadouro permite rastrear o recurso público até o beneficiário final, com enriquecimento de CNPJ e drilldown por ente e ano."
- **Funcionalidade:** `/pesquisa-credores` e `/painel-despesa/credor/[cpfCnpj]`.
- **Ação prática:** buscar um CNPJ relevante, abrir o detalhe e mostrar empenhos por ente/ano.
- **Cuidado:** escolher um credor de demonstração previamente; não expor PJ de pequeno porte sem necessidade institucional.
- **Transição:** "Materialidade só dá quadro completo se cruzarmos com situação fiscal e cadastral. Vamos a SICONFI, CAUC e Remessas."

### Etapa 5 — SICONFI / CAUC / Remessas (4–5 min)

- **Objetivo:** demonstrar situação fiscal, obrigações e envio de dados.
- **Mensagem:** "Aqui o controle externo do TCE-AC dialoga com a base oficial do Tesouro Nacional, com a situação cadastral dos municípios (CAUC) e com o calendário institucional de remessas contábeis."
- **Funcionalidade:** `/painel-siconfi`, `/painel-siconfi/rreo/[municipio]`, `/painel-siconfi/rgf`, `/painel-cauc`, `/remessas/calendario`.
- **Ação prática:**
  1. Abrir SICONFI, mostrar RREO de um município e entregas pendentes.
  2. Abrir CAUC e destacar municípios em alerta com impacto sobre repasses.
  3. Abrir Calendário de Remessas e mostrar atrasos.
- **Cuidado:** dados são oficiais, mas confirme o bimestre/quadrimestre exibido antes da demo.
- **Transição:** "Com risco e situação dos jurisdicionados em vista, vamos à preparação da sessão de julgamento."

### Etapa 6 — Pautas de Julgamento (3 min)

- **Objetivo:** demonstrar preparação para sessão.
- **Mensagem:** "O Varadouro entrega a pauta organizada e contextualizada, deixando o tempo do conselheiro concentrado na análise, não na organização."
- **Funcionalidade:** `/pautas-julgamento` e `/pautas-julgamento/[sessaoId]`.
- **Ação prática:** abrir lista de sessões abertas; entrar em uma sessão; percorrer os processos.
- **Cuidado:** escolher previamente uma sessão de demonstração; não expor dados de processos sensíveis.
- **Transição:** "Para cada processo, o sistema oferece apoio à leitura técnica."

### Etapa 7 — Análise IA de Processo (3 min)

- **Objetivo:** demonstrar apoio à leitura técnica do processo.
- **Mensagem:** "A análise IA organiza a leitura técnica do processo com base nos documentos principais e no contexto da pauta. É cacheada, versionada e descartável. Nunca emite voto ou parecer."
- **Funcionalidade:** dentro de uma sessão, abrir um processo e acionar a análise IA.
- **Ação prática:** mostrar HTML do relatório; demonstrar descarte e regeneração.
- **Cuidado:** **reforçar explicitamente** que a IA não emite voto. Escolher um processo de demonstração com análise já gerada para evitar espera.
- **Transição:** "Em escala de sessão, isso ganha potência."

### Etapa 8 — Resumo de Pauta (2–3 min)

- **Objetivo:** demonstrar visão consolidada da sessão.
- **Mensagem:** "O resumo de pauta entrega uma leitura agregada de toda a sessão, em minutos, com a mesma rastreabilidade."
- **Funcionalidade:** botão de Resumo de Pauta na sessão.
- **Ação prática:** acionar o resumo; mostrar o relatório consolidado em HTML.
- **Cuidado:** reforçar descarte/regeneração; ressaltar que é instrumento de leitura, não de decisão.
- **Transição:** "Sobre todas essas telas, o Aquiry está sempre disponível como copilot."

### Etapa 9 — Assistente Aquiry (3–4 min)

- **Objetivo:** demonstrar o assistente contextual.
- **Mensagem:** "O Aquiry é o copilot institucional do TCE-AC, com base documental versionada, busca externa controlada e auditoria por metadados. Funciona contextualmente: ele sabe em qual tela o gabinete está."
- **Funcionalidade:** botão flutuante do Aquiry em qualquer painel.
- **Ação prática:** abrir o Aquiry em um painel (ex.: SICONFI/RREO) e fazer 2–3 perguntas da lista da seção 6.
- **Cuidado:** **não pedir conclusão jurídica, voto ou afirmação de irregularidade.** Não usar perguntas da seção 7.
- **Transição:** "Para encerrar, recapitulamos o que o Varadouro entrega hoje e o próximo passo."

### Etapa 10 — Encerramento (1–2 min)

- **Objetivo:** reforçar valor institucional e próximos passos.
- **Mensagem:** "O Varadouro consolida, em uma única plataforma, as informações que o gabinete precisa enxergar primeiro, com IA institucional auditada e dados oficiais. Os próximos passos priorizam personalização por conselheiro, automação das bases ainda manuais e ampliação da rastreabilidade da IA."
- **Funcionalidade:** voltar à home (alertas).
- **Ação prática:** mostrar novamente a Central de Alertas e o resumo do que foi visto.
- **Cuidado:** não prometer datas específicas; remeter ao plano de evolução.
- **Transição:** abrir espaço para perguntas.

---

## 4. Funcionalidades que podem ser demonstradas

| Funcionalidade | Por que demonstrar | Valor institucional | Mensagem-chave |
|---|---|---|---|
| Central de Alertas do Gabinete | Único ponto de priorização da rotina | Foco e tempo do gabinete | "Onde o conselheiro deve olhar primeiro" |
| Painel de Despesa | Materialidade visível em segundos | Identificação imediata de concentração | "Materialidade em segundos" |
| Pesquisa de Credores | Rastreio do recurso ao beneficiário | Transparência efetiva | "O recurso público até o beneficiário final" |
| SICONFI (RREO/RGF/Extrato) | Dado oficial do Tesouro Nacional | Alinhamento institucional | "Diálogo direto com a base oficial do Tesouro" |
| CAUC | Risco de bloqueio de transferências | Atuação preventiva | "Municípios em risco de bloqueio" |
| Remessas | Pendência contábil consolidada | Acompanhamento de obrigações | "O envio contábil em uma única tela" |
| Pautas de Julgamento | Preparação executiva da sessão | Eficiência do colegiado | "Sessão preparada antes da sessão" |
| eProcessos | Acesso direto a processos e PDFs | Integração nativa com o eProcess | "Processos do TCE-AC, dentro do Varadouro" |
| Análise IA de Processo | Leitura técnica acelerada e auditável | Organização do tempo de análise | "Apoio à leitura técnica, sem substituir o conselheiro" |
| Resumo de Pauta | Visão consolidada da sessão | Decisão informada | "A sessão em uma página" |
| Assistente Aquiry | Copilot institucional contextual | Inteligência institucional | "Conhece a tela, cita a fonte, registra o uso" |

---

## 5. Funcionalidades que devem ser evitadas na demonstração

| Funcionalidade | Motivo para evitar | Risco de percepção | Condição mínima para futura demonstração |
|---|---|---|---|
| Mapa IDEB | IDEB simulado nos componentes | Publicação de valor oficioso como oficial | Integração INEP oficial com ano de referência exibido |
| Cobertura Florestal | Dados hardcoded em `src/data/desmatamentoAcre.ts` | Divergência com fontes oficiais (INPE) | Integração PRODES/DETER via ETL |
| PNI / Vacinação | Ingestão via XLSX manual; APIs DataSUS instáveis | Indicador desatualizado frente ao período | Automação total ou exibição clara da data da última carga |
| Mortalidade SIM | Ingestão por CSV manual (`DO22OPEN..DO25OPEN.csv`) | Sugerir periodicidade automática inexistente | Migrar para API SIM atual ou exibir ano de referência |
| Social / MIS | XLSX mensal manual | Indicador atrasado frente ao mês corrente | Automatizar coleta SAGI |
| Página `/signup` (template) | **Já removida em 2026-05-19.** Mencionar cadastro induz erro | Indução a erro sobre modelo de acesso | Não citar; reforçar que o acesso é exclusivamente AD |
| Painel Receita Pública (branch atual) | Em estabilização | Demonstrar feature ainda em maturação | Merge concluído e validação operacional |
| Status / Configuração de ETL | Tela administrativa, não institucional | Confundir audiência não técnica | Demonstrar somente para equipe de TI |

---

## 6. Perguntas boas para fazer ao Assistente Aquiry durante a demonstração

| Pergunta | Tela recomendada | Objetivo | Resposta esperada (em termos gerais) |
|---|---|---|---|
| "Onde devo olhar primeiro nesta tela?" | Home / Alertas | Mostrar priorização contextual | Indicação dos blocos de maior risco/materialidade visíveis |
| "Quais alertas parecem mais críticos?" | Home / Alertas | Demonstrar leitura agregada | Citação dos alertas com fonte e ordem de criticidade |
| "Explique este painel para um chefe de gabinete." | Qualquer painel | Mostrar adaptação institucional | Síntese executiva, sem jargão técnico |
| "Quais municípios exigem mais atenção?" | CAUC ou SICONFI | Identificar jurisdicionados críticos | Lista de municípios com base na situação visível na tela |
| "O que este processo indica em termos de risco?" | Detalhe de processo / Análise IA | Apoiar leitura técnica | Síntese dos pontos de risco a partir dos documentos principais |
| "Resuma os principais pontos desta pauta." | Sessão de pauta | Preparação executiva | Resumo agregado da sessão com referência aos processos |
| "Quais informações precisam ser conferidas antes de uma decisão?" | Detalhe de processo | Reforçar revisão humana | Lista de pontos a confirmar; sem conclusão de mérito |
| "Quais bases sustentam este painel?" | Qualquer painel | Demonstrar rastreabilidade | Citação das fontes oficiais e periodicidade |
| "Há alguma inconsistência aparente nestes dados?" | SICONFI ou SISAGUA | Identificar sinal de revisão | Sinalização cuidadosa, sem afirmação de irregularidade |

---

## 7. Perguntas que devem ser evitadas ao Assistente Aquiry

| Pergunta | Motivo de evitar | Forma mais segura de reformular |
|---|---|---|
| "Qual deve ser o voto do conselheiro?" | A IA não emite voto nem juízo de mérito | "Quais pontos técnicos o conselheiro deve revisar antes de decidir?" |
| "Conclua juridicamente este processo." | Conclusão jurídica é privativa do julgador | "Resuma os fatos e documentos principais do processo." |
| "Houve irregularidade aqui?" | Afirmação de irregularidade sem base | "Há indícios técnicos que justifiquem aprofundamento?" |
| "Mostre os dados de educação por município." | Base IDEB hoje é simulada | Evitar a pergunta; reformular para um painel maduro (Despesa, SICONFI) |
| "Analise o painel de cobertura florestal." | Dados hardcoded | Evitar a pergunta até integração oficial |
| "O que o conselheiro X deveria pensar disso politicamente?" | Não cabe opinião política | "Quais são os elementos técnicos relevantes neste tema?" |
| "Liste o CPF e endereço dos beneficiários do CadÚnico." | Dado pessoal sensível sem finalidade institucional clara | "Apresente os agregados municipais do CadÚnico." |
| "A IA pode assinar um relatório oficial?" | Saída IA é apoio, nunca instrumento oficial | "A IA pode preparar uma minuta de leitura técnica para revisão humana?" |

---

## 8. Checklist antes da demonstração

Operacional, na ordem recomendada:

- [ ] **Login** — confirmar acesso com usuário de demonstração com perfil adequado; testar logout/login.
- [ ] **Ambiente** — confirmar URL, branch publicada e versão exibida.
- [ ] **Conexão com banco** — abrir uma rota qualquer (`/painel-despesa`) e confirmar carregamento sem erro.
- [ ] **Últimas cargas** — verificar selo "Última atualização" na sidebar e validar painéis a apresentar.
- [ ] **Azure OpenAI** — fazer uma pergunta de teste ao Aquiry e validar resposta; checar variáveis `AZURE_OPENAI_*` configuradas.
- [ ] **Assistente Aquiry** — abrir o painel do Aquiry, confirmar histórico limpo e contexto reconhecido.
- [ ] **Sessão de pauta** — escolher previamente uma sessão; validar que tem processos e análises geradas.
- [ ] **Processo** — escolher previamente um processo com análise IA já cacheada (evita espera ao vivo).
- [ ] **Credor** — escolher previamente um CNPJ representativo, sem exposição desnecessária de pequeno porte.
- [ ] **Telas imaturas** — checar mentalmente o que **não** abrir (IDEB, Cobertura Florestal, painéis em ressalva).
- [ ] **Filtros** — limpar filtros residuais que poderiam expor dados fora do escopo.
- [ ] **Dados sensíveis** — confirmar que nada de sensível ficará visível indevidamente; preferir filtros agregados.
- [ ] **Rede** — garantir acesso à rede interna do TCE-AC (AD, servidor PDF `172.20.12.105:8090`).
- [ ] **Tempo** — definir versão (5 min ou 20–30 min) conforme público.

---

## 9. Versão curta da apresentação (5 minutos)

1. **Abertura (30 s).** "O Varadouro responde à pergunta: onde o gabinete deve olhar primeiro?"
2. **Alertas do Gabinete (1 min).** Mostrar a home, percorrer 2–3 blocos de alertas.
3. **Despesa e Credor (1 min).** Abrir o painel de despesa, mostrar ranking; abrir detalhe de um credor.
4. **Pauta e Processo (1 min).** Abrir uma sessão; abrir um processo; acionar a análise IA já cacheada.
5. **Assistente Aquiry (1 min).** Em uma tela qualquer, perguntar: "Onde devo olhar primeiro?".
6. **Fechamento (30 s).** "Esse é o ponto de partida: dados oficiais, alertas priorizados e IA institucional auditada."

---

## 10. Versão executiva — fala pronta

### Abertura

> "Bom dia. O Varadouro Digital Aquiry é a plataforma de inteligência do TCE-AC desenvolvida para apoiar o trabalho cotidiano dos gabinetes dos conselheiros. Sua proposta é simples e exigente: organizar, em um único ambiente seguro e auditável, as informações que o gabinete precisa enxergar primeiro — risco, materialidade, processos em julgamento, situação dos jurisdicionados e qualidade dos envios. A plataforma integra bases oficiais, conversa com o eProcess do Tribunal e oferece, em todas as telas, um copilot institucional — o Aquiry — que apoia a leitura técnica do conselheiro, **sem jamais substituir voto, parecer ou juízo de mérito**. Nos próximos minutos, demonstraremos as funcionalidades já maduras, com dados reais, e indicaremos com transparência as áreas que ainda estão em maturação."

### Encerramento

> "O Varadouro entrega hoje, com dados oficiais e rastreáveis, a Central de Alertas do Gabinete, os painéis fiscais (SICONFI, CAUC, Remessas), a visão executiva de despesa e credores, a preparação de pautas de julgamento e o apoio IA à leitura técnica de processos, tudo sob autenticação institucional e auditoria em todas as camadas. Os próximos passos priorizam a personalização por conselheiro, a automação das bases ainda manuais, a ampliação da rastreabilidade da IA e a robustez operacional para uso cotidiano. O Varadouro é, e continuará sendo, uma ferramenta de controle externo. Agradecemos a presença e abrimos espaço para perguntas."

---

## 11. Próximos passos após a demonstração

1. **Coletar feedback dos gabinetes** — registrar percepções, dúvidas e necessidades por conselheiro/chefia de gabinete.
2. **Priorizar alertas por relatoria** — implementar personalização da Central de Alertas conforme área de cada conselheiro.
3. **Integrar dados por conselheiro/gabinete** — criar vínculo entre usuário, gabinete e relatorias para filtragem automática.
4. **Amadurecer painéis frágeis** — IDEB (INEP), Cobertura Florestal (INPE), PNI, SIM e MIS conforme Fases 3 e 5 do plano de evolução.
5. **Ampliar rastreabilidade da IA** — exibir, na própria UI, qual base/fonte sustenta cada parágrafo das respostas do Aquiry e das análises IA.
6. **Melhorar observabilidade das cargas** — exibir, em cada painel, a data/hora da última carga; persistir logs do ETL Admin em `audit.etl_log` e expor na UI.
7. **Criar trilha de auditoria institucional** — painel administrativo de auditoria do Aquiry (consumo, estratégias, descartes), de login e de ações administrativas, conforme Fase 6 do plano de evolução.
8. **Definir cadência de demonstrações periódicas** — apresentações trimestrais para acompanhamento de evolução pelos gabinetes.
9. **Manter este roteiro vivo** — revisar a cada release relevante, removendo itens já maduros das ressalvas e atualizando o checklist.
