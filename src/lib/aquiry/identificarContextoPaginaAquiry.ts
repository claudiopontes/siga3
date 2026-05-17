// Utilitário puro: sem imports de framework, sem efeitos colaterais.
// Mapeamento de rota → contexto semântico da página para o Assistente Aquiry.

export type TipoPaginaAquiry =
  | "home"
  | "painel"
  | "processo"
  | "pauta"
  | "fornecedor"
  | "mapa"
  | "seguranca"
  | "calendario"
  | "perfil"
  | "desconhecida";

export type ContextoPaginaAquiry = {
  rota: string;
  tipoPagina: TipoPaginaAquiry;
  titulo: string;
  descricao: string;
  sugestoes: string[];
};

// Subconjunto enviado ao endpoint (sem sugestoes — são apenas UI)
export type ContextoPaginaPayload = Omit<ContextoPaginaAquiry, "sugestoes">;

type Matcher = {
  test: (pathname: string) => boolean;
  contexto: () => Omit<ContextoPaginaAquiry, "rota">;
};

const SUGESTOES_PADRAO = [
  "Onde o gabinete deve olhar primeiro?",
  "Explique esta tela.",
  "Quais informações desta página merecem atenção?",
  "Como posso interpretar estes dados?",
  "Que pontos de risco devo observar?",
];

// Ordem: mais específico primeiro dentro de cada grupo
const MATCHERS: Matcher[] = [
  // ── Home / Dashboard ────────────────────────────────────────────────────────
  {
    test: (p) => p === "/" || p === "",
    contexto: () => ({
      tipoPagina: "home",
      titulo: "Painel Principal",
      descricao:
        "Tela inicial do Varadouro Digital com visão geral dos painéis e alertas do gabinete.",
      sugestoes: [
        "Onde o gabinete deve olhar primeiro?",
        "Quais alertas merecem prioridade?",
        "Como interpretar os indicadores gerais?",
        "Que riscos estão sinalizados no painel?",
        "Como organizar a rotina de análise do gabinete?",
      ],
    }),
  },

  // ── Pautas de julgamento ─────────────────────────────────────────────────
  {
    test: (p) => /^\/pautas-julgamento\/.+/.test(p),
    contexto: () => ({
      tipoPagina: "pauta",
      titulo: "Pauta de Julgamento — Sessão",
      descricao:
        "Detalhamento de uma sessão de julgamento com os processos em pauta.",
      sugestoes: [
        "Como analisar os processos desta pauta?",
        "Quais processos normalmente merecem prioridade na sessão?",
        "Que pontos de atenção observar antes do julgamento?",
        "Como identificar riscos e materialidade nos processos em pauta?",
        "Que informações são essenciais para o gabinete antes da sessão?",
      ],
    }),
  },
  {
    test: (p) => p.startsWith("/pautas-julgamento"),
    contexto: () => ({
      tipoPagina: "pauta",
      titulo: "Pautas de Julgamento",
      descricao:
        "Listagem de sessões de julgamento e seus processos em pauta.",
      sugestoes: [
        "Como analisar uma pauta de julgamento?",
        "Quais processos normalmente merecem prioridade?",
        "Que pontos de atenção observar antes da sessão?",
        "Como identificar riscos e materialidade nos processos?",
        "Como organizar a análise de uma pauta extensa?",
      ],
    }),
  },

  // ── Processos eletrônicos ────────────────────────────────────────────────
  {
    test: (p) => p.includes("/analise-ia"),
    contexto: () => ({
      tipoPagina: "processo",
      titulo: "Análise de Processo — IA",
      descricao:
        "Tela de análise automatizada de processo por inteligência artificial.",
      sugestoes: [
        "Como interpretar esta análise de IA?",
        "Que pontos de risco devo verificar com atenção?",
        "Como validar as sugestões da IA?",
        "Quais informações adicionais aprofundariam a análise?",
        "Como usar esta análise para apoiar o gabinete?",
      ],
    }),
  },
  {
    test: (p) => /^\/eprocessos-ce\/processos\/.+/.test(p),
    contexto: () => ({
      tipoPagina: "processo",
      titulo: "Detalhe de Processo",
      descricao: "Detalhamento de processo eletrônico do TCE-AC.",
      sugestoes: [
        "Como devo analisar este processo?",
        "Quais pontos de risco devo observar?",
        "Que informações são importantes para o gabinete?",
        "Como avaliar materialidade e prazo deste processo?",
        "Que encaminhamento costuma ser adequado para este tipo?",
      ],
    }),
  },
  {
    test: (p) => p.startsWith("/eprocessos-ce"),
    contexto: () => ({
      tipoPagina: "processo",
      titulo: "Processos Eletrônicos",
      descricao:
        "Listagem e acompanhamento de processos eletrônicos do TCE-AC.",
      sugestoes: [
        "Como priorizar a análise dos processos?",
        "Quais indicadores de risco observar na lista?",
        "Como identificar processos com maior materialidade?",
        "Que tipos de alerta merecem atenção imediata?",
        "Como organizar o fluxo de análise do gabinete?",
      ],
    }),
  },

  // ── Credores / Fornecedores ──────────────────────────────────────────────
  {
    test: (p) => p.includes("/credor/"),
    contexto: () => ({
      tipoPagina: "fornecedor",
      titulo: "Detalhe de Credor",
      descricao:
        "Análise detalhada de credor e seus vínculos com empenhos públicos.",
      sugestoes: [
        "Que riscos devo observar neste credor?",
        "Como avaliar concentração de contratos em um fornecedor?",
        "Que indícios sugerem necessidade de análise pelo controle externo?",
        "Como interpretar o histórico de empenhos deste credor?",
        "Quais padrões merecem atenção do gabinete?",
      ],
    }),
  },
  {
    test: (p) => p.startsWith("/pesquisa-credores"),
    contexto: () => ({
      tipoPagina: "fornecedor",
      titulo: "Pesquisa de Credores",
      descricao:
        "Pesquisa e análise de credores e fornecedores públicos.",
      sugestoes: [
        "Que riscos observar em fornecedores públicos?",
        "Como avaliar concentração ou recorrência de fornecedores?",
        "Que indícios sugerem necessidade de análise?",
        "Como usar esta pesquisa no apoio ao controle externo?",
        "Quais padrões de fornecimento merecem atenção?",
      ],
    }),
  },

  // ── Painéis temáticos ────────────────────────────────────────────────────
  {
    test: (p) => p.startsWith("/painel-cauc"),
    contexto: () => ({
      tipoPagina: "painel",
      titulo: "Painel CAUC",
      descricao:
        "Acompanhamento de certidões e regularidade dos jurisdicionados do TCE-AC.",
      sugestoes: [
        "Como interpretar os dados de regularidade do CAUC?",
        "Que irregularidades merecem atenção imediata?",
        "Como avaliar o risco de um jurisdicionado com pendências?",
        "Que ações o gabinete pode adotar diante de pendências?",
        "Como priorizar o acompanhamento de jurisdicionados irregulares?",
      ],
    }),
  },
  {
    test: (p) => p.startsWith("/painel-cobertura-florestal"),
    contexto: () => ({
      tipoPagina: "painel",
      titulo: "Painel de Cobertura Florestal",
      descricao:
        "Monitoramento da cobertura florestal e desmatamento no estado do Acre.",
      sugestoes: [
        "Como interpretar os indicadores de cobertura florestal?",
        "Que dados merecem atenção do controle externo ambiental?",
        "Como avaliar a evolução do desmatamento?",
        "Que riscos ambientais podem ser identificados neste painel?",
        "Como relacionar estes dados com a fiscalização do TCE-AC?",
      ],
    }),
  },
  {
    test: (p) => p.startsWith("/painel-combustivel"),
    contexto: () => ({
      tipoPagina: "painel",
      titulo: "Painel de Combustível",
      descricao:
        "Acompanhamento de gastos com combustível e empenhos relacionados.",
      sugestoes: [
        "Como interpretar os gastos com combustível?",
        "Quais municípios ou entidades merecem atenção?",
        "Como identificar valores atípicos neste painel?",
        "Que riscos o controle externo observa em gastos com combustível?",
        "Como avaliar a materialidade destes gastos?",
      ],
    }),
  },
  {
    test: (p) => p.startsWith("/painel-despesa"),
    contexto: () => ({
      tipoPagina: "painel",
      titulo: "Painel de Despesas",
      descricao:
        "Acompanhamento de despesas e empenhos públicos dos jurisdicionados do TCE-AC.",
      sugestoes: [
        "Como interpretar os dados de despesa?",
        "Quais categorias de despesa merecem atenção?",
        "Como identificar valores ou comportamentos atípicos?",
        "Que riscos o controle externo observa em despesas públicas?",
        "Como avaliar a materialidade das despesas neste painel?",
      ],
    }),
  },
  {
    test: (p) => p.startsWith("/painel-receita-publica"),
    contexto: () => ({
      tipoPagina: "painel",
      titulo: "Painel de Receita Pública",
      descricao:
        "Acompanhamento das receitas públicas dos jurisdicionados do TCE-AC.",
      sugestoes: [
        "Como interpretar os dados de receita pública?",
        "Que indicadores de arrecadação merecem atenção?",
        "Como avaliar a evolução da receita ao longo do tempo?",
        "Que riscos o controle externo observa na receita pública?",
        "Como identificar desvios ou irregularidades na arrecadação?",
      ],
    }),
  },
  {
    test: (p) => p.startsWith("/painel-saude"),
    contexto: () => ({
      tipoPagina: "painel",
      titulo: "Painel de Saúde",
      descricao:
        "Indicadores de saúde pública, orçamento, vacinação, mortalidade e qualidade da água.",
      sugestoes: [
        "Como interpretar os indicadores de saúde?",
        "Quais dados de saúde merecem atenção prioritária?",
        "Como avaliar a execução do orçamento de saúde?",
        "Que riscos o controle externo observa nos dados de saúde pública?",
        "Como relacionar estes indicadores com a fiscalização do TCE-AC?",
      ],
    }),
  },
  {
    test: (p) => p.startsWith("/painel-social"),
    contexto: () => ({
      tipoPagina: "painel",
      titulo: "Painel Social",
      descricao:
        "Acompanhamento de programas sociais, CADUNICO e transferências de renda.",
      sugestoes: [
        "Como interpretar os dados de programas sociais?",
        "Quais indicadores sociais merecem atenção?",
        "Como avaliar a cobertura e regularidade dos programas?",
        "Que riscos o controle externo observa em transferências sociais?",
        "Como identificar inconsistências nos dados de beneficiários?",
      ],
    }),
  },

  // ── Mapa ────────────────────────────────────────────────────────────────
  {
    test: (p) => p.includes("/mapa"),
    contexto: () => ({
      tipoPagina: "mapa",
      titulo: "Mapa de Municípios",
      descricao:
        "Mapa interativo dos municípios do Acre com indicadores por localidade.",
      sugestoes: [
        "Como interpretar os indicadores municipais no mapa?",
        "Quais municípios apresentam maiores riscos ou deficiências?",
        "Como avaliar desigualdades entre municípios?",
        "Que dados municipais merecem atenção do controle externo?",
        "Como usar o mapa para priorizar a fiscalização?",
      ],
    }),
  },

  // ── Remessas ─────────────────────────────────────────────────────────────
  {
    test: (p) => p.startsWith("/remessas"),
    contexto: () => ({
      tipoPagina: "calendario",
      titulo: "Calendário de Remessas",
      descricao:
        "Prazos e calendário de envio de dados pelos jurisdicionados ao TCE-AC.",
      sugestoes: [
        "Como interpretar o calendário de remessas?",
        "Quais jurisdicionados estão com remessas em atraso?",
        "Como acompanhar o cumprimento dos prazos?",
        "Que riscos o atraso de remessas representa para o controle externo?",
        "Como priorizar o acompanhamento de jurisdicionados inadimplentes?",
      ],
    }),
  },

  // ── Calendário ───────────────────────────────────────────────────────────
  {
    test: (p) => p.startsWith("/calendar"),
    contexto: () => ({
      tipoPagina: "calendario",
      titulo: "Calendário",
      descricao: "Calendário de eventos e compromissos do gabinete.",
      sugestoes: [
        "Como organizar os prazos e compromissos do gabinete?",
        "Que eventos merecem atenção prioritária?",
        "Como acompanhar prazos de processos e pautas?",
        "Quais datas são críticas para o controle externo?",
        "Como usar o calendário no planejamento do gabinete?",
      ],
    }),
  },

  // ── Segurança / Administração ─────────────────────────────────────────────
  {
    test: (p) => p.startsWith("/seguranca"),
    contexto: () => ({
      tipoPagina: "seguranca",
      titulo: "Configurações e Segurança",
      descricao:
        "Área de administração do sistema, ETL, configurações e gerenciamento de usuários.",
      sugestoes: [
        "Como funciona o processo de atualização de dados do sistema?",
        "Como acompanhar o status do ETL?",
        "Quais configurações impactam a qualidade dos dados?",
        "Como interpretar logs e status de execução?",
        "Que cuidados são importantes na administração do sistema?",
      ],
    }),
  },

  // ── Perfil ────────────────────────────────────────────────────────────────
  {
    test: (p) => p.startsWith("/profile"),
    contexto: () => ({
      tipoPagina: "perfil",
      titulo: "Perfil do Usuário",
      descricao: "Configurações e informações do usuário.",
      sugestoes: [...SUGESTOES_PADRAO],
    }),
  },
];

// ─── Funções públicas ────────────────────────────────────────────────────────

export function identificarContextoPaginaAquiry(pathname: string): ContextoPaginaAquiry {
  for (const matcher of MATCHERS) {
    if (matcher.test(pathname)) {
      return { rota: pathname, ...matcher.contexto() };
    }
  }

  return {
    rota: pathname,
    tipoPagina: "desconhecida",
    titulo: "Varadouro Digital",
    descricao: "Página do sistema Varadouro Digital.",
    sugestoes: SUGESTOES_PADRAO,
  };
}

export function montarMensagemBoasVindas(contexto: ContextoPaginaAquiry): string {
  switch (contexto.tipoPagina) {
    case "home":
      return "Olá, sou o Assistente Aquiry. Estou no painel principal do Varadouro Digital. Posso ajudar a identificar onde o gabinete deve olhar primeiro, orientar sobre alertas e indicadores, e apoiar a análise de risco e materialidade.";

    case "painel":
      return `Olá, sou o Assistente Aquiry. Estou vendo que você está no ${contexto.titulo}. Posso ajudar a interpretar os indicadores, identificar riscos e sugerir onde o gabinete deve concentrar a atenção. Minha orientação é baseada no tipo de tela — não tenho acesso aos dados específicos exibidos.`;

    case "pauta":
      return "Olá, sou o Assistente Aquiry. Estou vendo que você está em uma tela de pauta de julgamento. Posso orientar sobre como analisar os processos em pauta, identificar riscos e pontos de atenção antes da sessão, com base em orientações metodológicas gerais.";

    case "processo":
      return "Olá, sou o Assistente Aquiry. Estou vendo que você está em uma tela de processos. Posso orientar sobre como analisar processos, avaliar riscos, materialidade e pontos de atenção no controle externo, com base em orientações metodológicas gerais.";

    case "fornecedor":
      return "Olá, sou o Assistente Aquiry. Estou vendo que você está em uma tela de credores ou fornecedores. Posso orientar sobre riscos, concentração de contratos, análise de fornecedores e indícios que merecem atenção do controle externo.";

    case "mapa":
      return "Olá, sou o Assistente Aquiry. Estou vendo que você está no mapa de municípios. Posso ajudar a interpretar indicadores municipais, identificar desigualdades e orientar sobre onde o controle externo deve concentrar a atenção.";

    case "seguranca":
      return "Olá, sou o Assistente Aquiry. Estou vendo que você está em uma área de administração do sistema. Posso orientar sobre o funcionamento do ETL, atualização de dados e boas práticas de gestão do sistema.";

    case "calendario":
      return "Olá, sou o Assistente Aquiry. Estou vendo que você está em uma tela de calendário ou remessas. Posso ajudar a interpretar prazos, acompanhar obrigações dos jurisdicionados e orientar sobre o impacto de atrasos no controle externo.";

    default:
      return "Olá, sou o Assistente Aquiry, a inteligência de apoio ao gabinete no Varadouro Digital. Posso ajudar você a analisar telas, painéis, processos, pautas, alertas e riscos para identificar onde olhar primeiro.";
  }
}
