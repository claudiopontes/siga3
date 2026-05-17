// Utilitário puro de análise contextual do Assistente Aquiry.
// Sem efeitos colaterais, sem consulta a banco, sem IA — apenas lógica determinística.

import type { ContextoTelaAquiry } from "./tiposContextoAquiry";

export type TipoIntencao =
  | "onde_olhar_primeiro"
  | "explicar_tela"
  | "interpretar_indicadores"
  | "riscos"
  | "orientacao_geral";

export type ResultadoAnaliseAquiry = {
  tipoIntencao: TipoIntencao;
  respostaDeterministica?: string;
  origemDeterministica?: string[];
};

type EntradaAnalise = {
  pergunta: string;
  contextoTela?: ContextoTelaAquiry | null;
  contextoPagina?: {
    tipoPagina?: string;
    titulo?: string;
  } | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  return null;
}

function toStr(v: unknown): string | null {
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  return null;
}

function estaCarregando(dados: Record<string, unknown> | undefined): boolean {
  return dados?.carregando === true;
}

function plural(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

// ── Reconhecimento de intenção por palavras-chave ─────────────────────────────
//
// Ordem importa: o primeiro padrão que casar define a intenção.
// Perguntas testadas:
//   "Onde devo olhar primeiro?"          → onde_olhar_primeiro
//   "O que é mais urgente?"              → onde_olhar_primeiro
//   "Quais pontos merecem atenção?"      → riscos
//   "Quais riscos existem aqui?"         → riscos
//   "Explique esta tela"                 → explicar_tela
//   "Como interpretar esses dados?"      → interpretar_indicadores
//   "O que significam esses números?"    → interpretar_indicadores

const PADROES_INTENCAO: Array<{ tipo: TipoIntencao; regex: RegExp }> = [
  {
    tipo: "onde_olhar_primeiro",
    regex:
      /onde\s+(devo\s+)?olhar|prioridade|priorizar|mais\s+importante|por\s+onde\s+comecar|comecar\s+por|olhar\s+primeiro|foco\s+agora|urgente|urgencia|verificar\s+primeiro|o\s+que\s+e\s+mais\s+urgente|o\s+que\s+merece\s+mais/,
  },
  {
    tipo: "explicar_tela",
    regex:
      /explique|explicar|o\s+que\s+e\s+est[ae]\s+(tela|pagina)|para\s+que\s+serve|como\s+funciona\s+est[ae]/,
  },
  {
    tipo: "interpretar_indicadores",
    regex:
      /indicadores|interpretar|o\s+que\s+significam|o\s+que\s+esses\s+dados|como\s+interpretar|metricas|valores\s+exibidos|o\s+que\s+significa\s+ess[ae]/,
  },
  {
    tipo: "riscos",
    regex: /riscos?|pontos?\s+(que\s+)?merecem|preocupante|critico|alertas?\s+(ativos?|existem|ha)/,
  },
];

function identificarIntencao(pergunta: string): TipoIntencao {
  const texto = normalizar(pergunta);
  for (const { tipo, regex } of PADROES_INTENCAO) {
    if (regex.test(texto)) return tipo;
  }
  return "orientacao_geral";
}

// ── Detecção de tela ──────────────────────────────────────────────────────────

type TelaDetectada = "alertas_gabinete" | "mortalidade" | "outra";

function detectarTela(contextoTela: ContextoTelaAquiry | null | undefined): TelaDetectada {
  const titulo = normalizar(toStr(contextoTela?.titulo) ?? "");
  const dados = contextoTela?.dados;

  if (
    titulo.includes("alertas do gabinete") ||
    dados?.regularidade_municipiosComPendencia !== undefined
  ) {
    return "alertas_gabinete";
  }
  if (titulo.includes("mortalidade") || dados?.totalObitosInfantis !== undefined) {
    return "mortalidade";
  }
  return "outra";
}

// ── Resposta: Alertas do Gabinete ─────────────────────────────────────────────

function gerarRespostaAlertasGabinete(
  intencao: TipoIntencao,
  dados: Record<string, unknown>,
): string | undefined {
  if (estaCarregando(dados)) return undefined;
  if (intencao !== "onde_olhar_primeiro" && intencao !== "riscos") return undefined;

  const munPendencia = toNum(dados.regularidade_municipiosComPendencia);
  const totalPendencias = toNum(dados.regularidade_totalPendencias);
  const maiorNivel = toStr(dados.regularidade_maiorNivelAlerta);
  const processosSensiveis = toNum(dados.processos_sensiveis);
  const prazoVencido = toNum(dados.processos_prazoRegulamentarVencido);
  const mais15Dias = toNum(dados.processos_mais15Dias);
  const saudeCriticos = toNum(dados.saude_totalCriticos);
  const saudeMunCritico = toNum(dados.saude_municipiosRiscoCritico);

  // Verifica se dados processuais chegaram (null = carga não disponível)
  const semDadosProcessuais =
    dados.processos_total === null || dados.processos_total === undefined;

  const itens: string[] = [];

  // Prioridade 1: prazo regulamentar vencido
  if (prazoVencido !== null && prazoVencido > 0) {
    itens.push(
      `• Prazo regulamentar vencido: ${prazoVencido} ${plural(prazoVencido, "processo", "processos")} com tempo de tramitação acima do prazo da classe — verificar com prioridade.`,
    );
  }

  // Prioridade 2: processos sensíveis
  if (processosSensiveis !== null && processosSensiveis > 0) {
    itens.push(
      `• Processos sensíveis: ${processosSensiveis} ${plural(processosSensiveis, "processo", "processos")} de natureza prioritária (cautelares, denúncias, representações, pedidos de vista).`,
    );
  }

  // Prioridade 3: pendências CAUC
  if (munPendencia !== null && munPendencia > 0) {
    const nivelLabel = maiorNivel === "alto" ? ", nível crítico" : "";
    itens.push(
      `• Regularidade CAUC: ${munPendencia} ${plural(munPendencia, "município", "municípios")} com pendências${nivelLabel} — ${totalPendencias ?? "—"} ${plural(totalPendencias ?? 0, "irregularidade", "irregularidades")} no total.`,
    );
  }

  // Prioridade 4: alertas críticos de saúde
  if (saudeCriticos !== null && saudeCriticos > 0) {
    const munStr =
      saudeMunCritico !== null && saudeMunCritico > 0
        ? ` em ${saudeMunCritico} ${plural(saudeMunCritico, "município", "municípios")}`
        : "";
    itens.push(
      `• Saúde Pública: ${saudeCriticos} ${plural(saudeCriticos, "alerta crítico", "alertas críticos")}${munStr} — consulte o Painel de Saúde para detalhamento por área e município.`,
    );
  }

  // Prioridade 5: processos parados há mais de 15 dias
  if (mais15Dias !== null && mais15Dias > 0) {
    itens.push(
      `• Processos sem movimentação há mais de 15 dias: ${mais15Dias} ${plural(mais15Dias, "processo", "processos")} aguardando tramitação.`,
    );
  }

  // Nota sobre dados processuais indisponíveis
  const notaProcessual =
    semDadosProcessuais && itens.length > 0
      ? "\nDados processuais (eProcess TCE-AC) não disponíveis no momento — os cards processuais podem estar sem carga."
      : "";

  if (itens.length === 0 && !semDadosProcessuais) {
    return "Com base nos dados visíveis na tela de Alertas do Gabinete, não há pendências ou alertas críticos ativos neste momento. Recomenda-se verificar periodicamente os painéis específicos de cada área para identificar variações.";
  }

  if (itens.length === 0 && semDadosProcessuais) {
    return "Os dados processuais (eProcess TCE-AC) não estão disponíveis no momento. Verifique os demais painéis — CAUC, Saúde Pública e Social — para identificar pendências ativas.";
  }

  return [
    "Com base nos dados exibidos na tela de Alertas do Gabinete, os pontos que merecem atenção prioritária são:",
    "",
    ...itens,
    notaProcessual,
    "",
    "Esta leitura considera apenas os dados visíveis nos cards da tela atual. Para detalhamento por jurisdicionado, acesse os painéis específicos de cada área.",
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Resposta: Painel de Mortalidade ───────────────────────────────────────────

// Referências orientativas usadas na classificação da TMI.
// Baseadas na literatura de saúde pública (OMS/MS) — não constituem diagnóstico oficial.
const TMI_REFERENCIA_ALTA = 20; // por 1.000 nascidos vivos
const TMI_REFERENCIA_MODERADA = 10;

function classificarTMI(taxa: number): string {
  if (taxa > TMI_REFERENCIA_ALTA) {
    return `${taxa.toFixed(1)}/1.000 NV — acima de ${TMI_REFERENCIA_ALTA}/1.000, patamar de atenção elevada na literatura de saúde pública (referência orientativa)`;
  }
  if (taxa > TMI_REFERENCIA_MODERADA) {
    return `${taxa.toFixed(1)}/1.000 NV — entre ${TMI_REFERENCIA_MODERADA} e ${TMI_REFERENCIA_ALTA}/1.000, patamar de atenção moderada (referência orientativa)`;
  }
  return `${taxa.toFixed(1)}/1.000 NV — abaixo de ${TMI_REFERENCIA_MODERADA}/1.000 (referência orientativa da literatura de saúde pública)`;
}

function gerarRespostaMortalidade(
  intencao: TipoIntencao,
  dados: Record<string, unknown>,
): string | undefined {
  if (estaCarregando(dados)) return undefined;

  const aceita =
    intencao === "interpretar_indicadores" ||
    intencao === "riscos" ||
    intencao === "onde_olhar_primeiro";
  if (!aceita) return undefined;

  const ano = toNum(dados.anoSelecionado);
  const municipio = toStr(dados.municipioFiltrado) ?? "Todos os municípios";
  const nascidosVivos = toNum(dados.totalNascidosVivos);
  const obitosInfantis = toNum(dados.totalObitosInfantis);
  const obitosMaternos = toNum(dados.totalObitosMaternos);
  const taxaTMI = toNum(dados.taxaMortalidadeInfantil);
  const taxaDisponivel = dados.taxaDisponivel === true;
  const totalAlertas = toNum(dados.totalAlertasVisiveis);

  const escopoMunicipio =
    municipio === "Todos os municípios" ? "estado do Acre (todos os municípios)" : `município: ${municipio}`;
  const escopoTexto = ano !== null ? `${ano} — ${escopoMunicipio}` : escopoMunicipio;

  // Modo: onde olhar primeiro (prioriza desvios, não lista todos os KPIs)
  if (intencao === "onde_olhar_primeiro") {
    const itens: string[] = [];

    if (totalAlertas !== null && totalAlertas > 0) {
      itens.push(
        `• ${totalAlertas} ${plural(totalAlertas, "alerta ativo", "alertas ativos")} na seleção atual — verifique os alertas listados na tela, que indicam os maiores desvios identificados pelo sistema.`,
      );
    }

    if (taxaDisponivel && taxaTMI !== null && taxaTMI > TMI_REFERENCIA_MODERADA) {
      itens.push(
        `• Taxa de Mortalidade Infantil de ${taxaTMI.toFixed(1)}/1.000 NV — acima de ${TMI_REFERENCIA_MODERADA}/1.000 (referência orientativa). Analise em conjunto com volume absoluto de óbitos e série histórica.`,
      );
    }

    if (obitosMaternos !== null && obitosMaternos > 0) {
      itens.push(
        `• ${obitosMaternos} ${plural(obitosMaternos, "óbito materno", "óbitos maternos")} — indicador que merece verificação das condições de assistência ao parto e acesso à atenção especializada.`,
      );
    }

    if (itens.length === 0) {
      return [
        `Com base nos dados visíveis no Painel de Mortalidade (${escopoTexto}), não há desvios críticos identificados pelo sistema para esta seleção.`,
        "",
        "Para ampliar a análise, verifique outros anos, municípios individuais e a série histórica disponível no painel.",
      ].join("\n");
    }

    return [
      `Com base nos dados visíveis no Painel de Mortalidade (${escopoTexto}), os pontos que merecem atenção prioritária são:`,
      "",
      ...itens,
      "",
      "Esta leitura usa apenas os dados visíveis na tela. Para aprofundamento, verifique a série histórica, compare municípios e considere a qualidade dos registros no SIM/SINASC.",
    ].join("\n");
  }

  // Modo: interpretar indicadores / riscos (leitura completa dos KPIs disponíveis)
  const partes: string[] = [];

  partes.push(`Período/escopo: ${escopoTexto}.`);

  if (nascidosVivos !== null && obitosInfantis !== null) {
    partes.push(
      `Nascidos vivos: ${nascidosVivos.toLocaleString("pt-BR")} | Óbitos infantis: ${obitosInfantis} — o volume absoluto deve ser considerado junto com a taxa para evitar distorções em municípios pequenos.`,
    );
  }

  if (obitosMaternos !== null && obitosMaternos > 0) {
    partes.push(
      `Óbitos maternos: ${obitosMaternos} — indicador da qualidade da assistência ao parto. Mesmo valores baixos merecem verificação das circunstâncias.`,
    );
  } else if (obitosMaternos === 0) {
    partes.push("Óbitos maternos: nenhum registrado para esta seleção.");
  }

  if (taxaDisponivel && taxaTMI !== null) {
    partes.push(`Taxa de Mortalidade Infantil (TMI): ${classificarTMI(taxaTMI)}.`);
  } else if (!taxaDisponivel) {
    partes.push(
      "Taxa de Mortalidade Infantil: não calculada para esta seleção — denominador insuficiente ou dado ausente no SIM/SINASC. Analise pelo volume absoluto de óbitos.",
    );
  }

  if (totalAlertas !== null && totalAlertas > 0) {
    partes.push(
      `Alertas ativos na seleção atual: ${totalAlertas} — verifique os detalhes listados na tela.`,
    );
  }

  if (partes.length <= 1) {
    return "Os dados de mortalidade ainda não estão disponíveis para esta seleção ou estão sendo carregados. Aguarde o carregamento completo da tela antes de interpretar os indicadores.";
  }

  const orientacao = [
    "Pontos de atenção para o controle externo:",
    "• Subnotificação: municípios menores tendem a subreportar óbitos — dados com baixo denominador exigem cautela na interpretação.",
    "• Variação anual: picos isolados podem refletir episódios específicos; interprete sempre com série histórica antes de concluir sobre tendências.",
    "• A TMI deve ser analisada junto com o volume absoluto de óbitos, o município, a tendência e a qualidade dos registros.",
    "• Não atribua causalidade a partir destes números isoladamente — use como ponto de partida para aprofundamento.",
  ].join("\n");

  return [
    `Com base nos dados exibidos no Painel de Mortalidade (${escopoTexto}):`,
    "",
    ...partes,
    "",
    orientacao,
  ].join("\n");
}

// ── Função principal ──────────────────────────────────────────────────────────

export function analisarIntencaoAquiry(entrada: EntradaAnalise): ResultadoAnaliseAquiry {
  const tipoIntencao = identificarIntencao(entrada.pergunta);
  const tela = detectarTela(entrada.contextoTela);
  const dados = entrada.contextoTela?.dados;

  let respostaDeterministica: string | undefined;

  if (dados !== null && dados !== undefined && typeof dados === "object" && !Array.isArray(dados)) {
    const dadosMap = dados as Record<string, unknown>;
    if (tela === "alertas_gabinete") {
      respostaDeterministica = gerarRespostaAlertasGabinete(tipoIntencao, dadosMap);
    } else if (tela === "mortalidade") {
      respostaDeterministica = gerarRespostaMortalidade(tipoIntencao, dadosMap);
    }
  }

  return {
    tipoIntencao,
    respostaDeterministica,
    origemDeterministica: respostaDeterministica
      ? ["Análise contextual do Varadouro"]
      : undefined,
  };
}
