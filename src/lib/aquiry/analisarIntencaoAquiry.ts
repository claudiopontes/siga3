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
      /onde\s+(devo\s+)?olhar|prioridade|priorizar|mais\s+importante|por\s+onde\s+comecar|comecar\s+por|olhar\s+primeiro|foco\s+agora|urgente|urgencia|verificar\s+primeiro|o\s+que\s+e\s+mais\s+urgente|o\s+que\s+merece\s+mais|quais\s+processos?\s+(merecem|tem|com)\s+prioridade|antes\s+da\s+sessao|verificar\s+antes/,
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
    regex: /riscos?|pontos?\s+(que\s+)?merecem|preocupante|critico|alertas?\s+(ativos?|existem|ha)|sensivel|sensiveis|pontos?\s+de\s+atencao|algo\s+que\s+impeca|conclusao\s+segura|como\s+analisar/,
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

type TelaDetectada =
  | "alertas_gabinete"
  | "mortalidade"
  | "pauta_lista"
  | "pauta_sessao"
  | "processo_lista"
  | "processo_detalhe"
  | "outra";

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
  if (titulo === "pautas de julgamento" || dados?.totalSessoesFiltradas !== undefined) {
    return "pauta_lista";
  }
  if (titulo.includes("sessao de julgamento") || dados?.sessaoId !== undefined) {
    return "pauta_sessao";
  }
  if (titulo === "processos — listagem" || titulo === "processos - listagem" || dados?.totalGeral !== undefined) {
    return "processo_lista";
  }
  if (titulo.includes("processo — detalhe") || titulo.includes("processo - detalhe") || dados?.processoId !== undefined) {
    return "processo_detalhe";
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

// ── Detecção e resposta: pergunta metodológica sobre pauta ───────────────────
// Aplicável quando o contexto é pauta_lista ou pauta_sessao e o usuário pede um
// roteiro/metodologia para analisar a pauta. Estrutura curta: síntese → dados
// da tela → roteiro → limite.

const REGEX_METODOLOGIA_PAUTA =
  /\bcomo\s+analisar\b|\broteiro\b|\bcomo\s+preparar\b|\bcomo\s+organizar\b|\banalise\s+d[ae]\s+pauta\b|\bpauta\s+de\s+julgamento\b/;

function ehPerguntaMetodologicaPauta(pergunta: string): boolean {
  return REGEX_METODOLOGIA_PAUTA.test(normalizar(pergunta));
}

function gerarRespostaMetodologiaPauta(
  tela: "pauta_lista" | "pauta_sessao",
  dados: Record<string, unknown>,
): string {
  // A — Síntese metodológica curta.
  const sintese =
    "Síntese: analise a pauta por urgência, risco, materialidade e sensibilidade. Comece pela sessão mais próxima, destaque processos em vista, separe casos sensíveis e aprofunde o mérito processo a processo.";

  // B — Aplicando à tela atual (usa apenas o que estiver disponível).
  const aplicacao: string[] = [];
  if (tela === "pauta_lista" && !estaCarregando(dados)) {
    const proximaData = toStr(dados.proximaSessaoData);
    const proximaNumero = toStr(dados.proximaSessaoNumero);
    const proximaOrgao = toStr(dados.proximaSessaoOrgao);
    const totalJulgamento = toNum(dados.totalProcessosEmJulgamento);
    const totalVistas = toNum(dados.totalProcessosEmVistas);
    const totalSessoes = toNum(dados.totalSessoesFiltradas);
    const jobsAtivos = toNum(dados.jobsAnaliseIaAtivos);
    if (proximaData) {
      const labelOrgao = proximaOrgao ? ` (${proximaOrgao})` : "";
      const labelNumero = proximaNumero ? ` ${proximaNumero}` : "";
      aplicacao.push(`• Próxima sessão: ${proximaData}${labelNumero}${labelOrgao}.`);
    }
    if (totalVistas !== null && totalVistas > 0) {
      aplicacao.push(
        `• ${totalVistas} ${plural(totalVistas, "processo em vista", "processos em vista")}.`,
      );
    }
    if (totalJulgamento !== null && totalJulgamento > 0) {
      aplicacao.push(
        `• ${totalJulgamento} ${plural(totalJulgamento, "processo em julgamento", "processos em julgamento")} nas sessões filtradas.`,
      );
    }
    if (totalSessoes !== null) {
      aplicacao.push(
        `• ${totalSessoes} ${plural(totalSessoes, "sessão carregada", "sessões carregadas")} na lista atual.`,
      );
    }
    if (jobsAtivos !== null && jobsAtivos > 0) {
      aplicacao.push(
        `• ${jobsAtivos} ${plural(jobsAtivos, "geração de análise por IA em andamento", "gerações de análise por IA em andamento")}.`,
      );
    }
  } else if (tela === "pauta_sessao" && !estaCarregando(dados)) {
    const numero = toStr(dados.sessaoNumero);
    const data = toStr(dados.dataRealizacao);
    const orgao = toStr(dados.orgaoJulgador);
    const sensiveis = toNum(dados.processosClassesSensiveis);
    const vistas = toNum(dados.processosEmVista);
    const processosCarregados = toNum(dados.processosCarregados);
    if (numero || data || orgao) {
      const labelOrgao = orgao ? ` · ${orgao}` : "";
      aplicacao.push(
        `• Sessão${numero ? ` ${numero}` : ""}${data ? ` — ${data}` : ""}${labelOrgao}.`,
      );
    }
    if (sensiveis !== null && sensiveis > 0) {
      aplicacao.push(
        `• ${sensiveis} ${plural(sensiveis, "processo de classe/objeto sensível", "processos de classe/objeto sensível")}.`,
      );
    }
    if (vistas !== null && vistas > 0) {
      aplicacao.push(
        `• ${vistas} ${plural(vistas, "processo em vista", "processos em vista")}.`,
      );
    }
    if (processosCarregados !== null) {
      aplicacao.push(
        `• ${processosCarregados} ${plural(processosCarregados, "processo carregado", "processos carregados")} na pauta visível.`,
      );
    }
  }

  // C — Roteiro do gabinete (curto).
  const roteiro = [
    "Roteiro do gabinete:",
    "1. abrir a sessão mais próxima;",
    "2. isolar processos em vista;",
    "3. identificar classes/objetos sensíveis (denúncia, representação, cautelar, TCE, recurso);",
    "4. verificar materialidade e impacto;",
    "5. conferir relatório técnico, MPC, voto/decisão quando disponíveis;",
    "6. registrar limitações antes de qualquer conclusão.",
  ].join("\n");

  // D — Limite da leitura.
  const limite =
    "Limite: a leitura usa apenas metadados visíveis da pauta. O assistente não acessou documentos, relatórios técnicos, MPC ou votos.";

  const blocos: string[] = [sintese];
  if (aplicacao.length > 0) {
    blocos.push("", "Aplicando à tela atual:", ...aplicacao);
  }
  blocos.push("", roteiro, "", limite);
  return blocos.join("\n");
}

// ── Resposta: Lista de Pautas ─────────────────────────────────────────────────

function gerarRespostaPautaLista(
  intencao: TipoIntencao,
  dados: Record<string, unknown>,
): string | undefined {
  if (estaCarregando(dados)) return undefined;
  if (
    intencao !== "onde_olhar_primeiro" &&
    intencao !== "explicar_tela" &&
    intencao !== "riscos"
  ) {
    return undefined;
  }
  const totalFiltradas = toNum(dados.totalSessoesFiltradas);
  const totalJulgamento = toNum(dados.totalProcessosEmJulgamento);
  const totalVistas = toNum(dados.totalProcessosEmVistas);
  const proximaData = toStr(dados.proximaSessaoData);
  const proximaNumero = toStr(dados.proximaSessaoNumero);
  const proximaOrgao = toStr(dados.proximaSessaoOrgao);
  const jobsAtivos = toNum(dados.jobsAnaliseIaAtivos);
  const ano = toStr(dados.anoSelecionado);

  const itens: string[] = [];
  if (proximaData) {
    const labelOrgao = proximaOrgao ? ` no ${proximaOrgao}` : "";
    const labelNumero = proximaNumero ? ` (sessão ${proximaNumero})` : "";
    itens.push(
      `• Próxima sessão: ${proximaData}${labelNumero}${labelOrgao}.`,
    );
  }
  if (totalJulgamento !== null && totalJulgamento > 0) {
    itens.push(
      `• ${totalJulgamento} ${plural(totalJulgamento, "processo", "processos")} em julgamento nas sessões filtradas.`,
    );
  }
  if (totalVistas !== null && totalVistas > 0) {
    itens.push(
      `• ${totalVistas} ${plural(totalVistas, "processo", "processos")} em vista — observar prazos e relatoria do revisor.`,
    );
  }
  if (jobsAtivos !== null && jobsAtivos > 0) {
    itens.push(
      `• ${jobsAtivos} ${plural(jobsAtivos, "geração", "gerações")} de análise por IA em andamento — aguarde a finalização para usar o resumo automático da pauta.`,
    );
  }

  if (itens.length === 0) {
    const anoLabel = ano && ano !== "todos" ? ` para ${ano}` : "";
    return `Síntese: ${totalFiltradas ?? 0} ${plural(totalFiltradas ?? 0, "sessão", "sessões")}${anoLabel} sem indicadores que demandem atenção imediata. Abra uma sessão específica para examinar a pauta em detalhe.`;
  }

  // Síntese executiva: próxima sessão → vistas → triagem dos em julgamento.
  const partesSintese: string[] = [];
  if (proximaData) {
    const labelOrgao = proximaOrgao ? ` (${proximaOrgao})` : "";
    const labelNumero = proximaNumero ? ` ${proximaNumero}` : "";
    partesSintese.push(`abra primeiro a Sessão${labelNumero} em ${proximaData}${labelOrgao}`);
  }
  if (totalVistas !== null && totalVistas > 0) {
    partesSintese.push(
      `verifique os ${totalVistas} ${plural(totalVistas, "processo em vista", "processos em vista")}`,
    );
  }
  if (totalJulgamento !== null && totalJulgamento > 0) {
    partesSintese.push(
      `aplique triagem nos ${totalJulgamento} ${plural(totalJulgamento, "processo em julgamento", "processos em julgamento")} por urgência, materialidade e sensibilidade`,
    );
  }
  const sintese = partesSintese.length
    ? `Prioridade: ${partesSintese.join("; depois ")}.`
    : `Síntese: ${totalFiltradas ?? 0} ${plural(totalFiltradas ?? 0, "sessão", "sessões")} carregadas.`;

  return [
    sintese,
    "",
    "Detalhamento:",
    ...itens,
    "",
    "Leitura baseada apenas na lista filtrada na tela. Abra a sessão específica para análise dos processos.",
  ].join("\n");
}

// ── Resposta: Detalhe de Sessão de Pauta ──────────────────────────────────────

function gerarRespostaPautaSessao(
  intencao: TipoIntencao,
  dados: Record<string, unknown>,
): string | undefined {
  if (estaCarregando(dados)) return undefined;
  const aceita =
    intencao === "onde_olhar_primeiro" ||
    intencao === "riscos" ||
    intencao === "explicar_tela";
  if (!aceita) return undefined;

  const numero = toStr(dados.sessaoNumero);
  const data = toStr(dados.dataRealizacao);
  const orgao = toStr(dados.orgaoJulgador);
  const processosCarregados = toNum(dados.processosCarregados);
  const sensiveis = toNum(dados.processosClassesSensiveis);
  const vistas = toNum(dados.processosEmVista);
  const classes = toStr(dados.classesPresentes);
  const relatores = toStr(dados.relatoresPresentes);

  const cabecalho = `Sessão${numero ? ` ${numero}` : ""}${
    data ? ` — ${data}` : ""
  }${orgao ? ` · ${orgao}` : ""}.`;

  // Síntese executiva: sensíveis → vistas → demais.
  const partesSintese: string[] = [];
  if (sensiveis !== null && sensiveis > 0) {
    partesSintese.push(
      `leia primeiro os ${sensiveis} ${plural(sensiveis, "processo de classe/objeto sensível", "processos de classe/objeto sensível")} (denúncia, representação, cautelar, TCE ou recurso)`,
    );
  }
  if (vistas !== null && vistas > 0) {
    partesSintese.push(
      `verifique os ${vistas} ${plural(vistas, "processo em vista", "processos em vista")}`,
    );
  }
  if (processosCarregados !== null && processosCarregados > 0) {
    partesSintese.push(
      `aplique triagem nos demais (${processosCarregados} ${plural(processosCarregados, "processo carregado", "processos carregados")})`,
    );
  }

  const itens: string[] = [];
  if (sensiveis !== null && sensiveis > 0) {
    itens.push(
      `• ${sensiveis} ${plural(sensiveis, "processo", "processos")} de classe/objeto sensível — priorize a leitura.`,
    );
  }
  if (vistas !== null && vistas > 0) {
    itens.push(`• ${vistas} ${plural(vistas, "processo", "processos")} em vista — observar prazos e revisor.`);
  }
  if (processosCarregados !== null) {
    itens.push(`• ${processosCarregados} ${plural(processosCarregados, "processo", "processos")} carregados na pauta visível.`);
  }
  if (classes) itens.push(`• Classes presentes: ${classes}.`);
  if (relatores) itens.push(`• Relatorias presentes: ${relatores}.`);

  if (itens.length === 0) {
    return `${cabecalho}\n\nSíntese: a pauta carregada não traz indicadores sensíveis a partir dos metadados visíveis. Abra o detalhe de cada processo para análise.`;
  }

  const sintese = partesSintese.length
    ? `Prioridade: ${partesSintese.join("; depois ")}.`
    : `Síntese: pauta carregada — abra o detalhe dos processos para análise.`;

  return [
    cabecalho,
    sintese,
    "",
    "Detalhamento:",
    ...itens,
    "",
    "Leitura baseada apenas em metadados de pauta. O assistente não acessou relatórios técnicos, MPC ou documentos. Não substitui análise técnica, voto ou decisão.",
  ].join("\n");
}

// ── Resposta: Listagem de Processos ───────────────────────────────────────────

function gerarRespostaProcessoLista(
  intencao: TipoIntencao,
  dados: Record<string, unknown>,
): string | undefined {
  if (estaCarregando(dados)) return undefined;
  if (
    intencao !== "explicar_tela" &&
    intencao !== "onde_olhar_primeiro" &&
    intencao !== "riscos"
  ) {
    return undefined;
  }

  const totalGeral = toNum(dados.totalGeral);
  const visiveis = toNum(dados.visiveisNaPagina);
  const pagina = toNum(dados.pagina);
  const totalPaginas = toNum(dados.totalPaginas);
  const filtros = toNum(dados.filtrosAtivos);
  const filtroBusca = toStr(dados.filtroBusca);
  const filtroAno = toStr(dados.filtroAno);
  const filtroClasse = toStr(dados.filtroClasse);
  const filtroSituacao = toStr(dados.filtroSituacao);
  const filtroRelator = toStr(dados.filtroRelator);

  const filtrosAtivos: string[] = [];
  if (filtroBusca) filtrosAtivos.push(`busca="${filtroBusca}"`);
  if (filtroAno) filtrosAtivos.push(`ano=${filtroAno}`);
  if (filtroClasse) filtrosAtivos.push(`classe=${filtroClasse}`);
  if (filtroSituacao) filtrosAtivos.push(`situação=${filtroSituacao}`);
  if (filtroRelator) filtrosAtivos.push(`relator=${filtroRelator}`);

  const filtrosLabel =
    filtros !== null && filtros > 0
      ? filtrosAtivos.join(" · ")
      : "sem filtros estruturais (apenas busca textual)";

  const sintese = `Síntese: ${totalGeral ?? 0} ${plural(
    totalGeral ?? 0,
    "processo",
    "processos",
  )} com os filtros atuais — ${filtrosLabel}. Página ${pagina ?? 1}/${totalPaginas ?? 1}, ${visiveis ?? 0} ${plural(
    visiveis ?? 0,
    "linha visível",
    "linhas visíveis",
  )}.`;

  return [
    sintese,
    "",
    "Para análise por processo, abra o detalhe correspondente. Esta tela mostra apenas metadados de listagem.",
  ].join("\n");
}

// ── Resposta: Detalhe de Processo ─────────────────────────────────────────────

function gerarRespostaProcessoDetalhe(
  intencao: TipoIntencao,
  dados: Record<string, unknown>,
): string | undefined {
  if (estaCarregando(dados)) return undefined;
  const aceita =
    intencao === "explicar_tela" ||
    intencao === "interpretar_indicadores" ||
    intencao === "riscos" ||
    intencao === "onde_olhar_primeiro";
  if (!aceita) return undefined;

  const numero = toStr(dados.numero);
  const classe = toStr(dados.classe);
  const objeto = toStr(dados.objeto);
  const orgao = toStr(dados.orgao);
  const relator = toStr(dados.relator);
  const parte = toStr(dados.parte);
  const situacao = toStr(dados.situacao);
  const setor = toStr(dados.setorAtual);
  const qtdArquivos = toNum(dados.qtdArquivos);
  const qtdMov = toNum(dados.qtdMovimentacoes);
  const qtdSessoes = toNum(dados.qtdSessoes);
  const temRel = dados.temRelatorioTecnico === true;
  const temMpc = dados.temParecerMpc === true;
  const temDec = dados.temDecisao === true;
  const sensivel = dados.classeOuObjetoSensivel === true;
  const apensados = toStr(dados.processosApensados);

  const cabecalho: string[] = [];
  if (numero) cabecalho.push(`Processo ${numero}`);
  if (classe) cabecalho.push(`Classe: ${classe}`);
  if (situacao) cabecalho.push(`Situação: ${situacao}`);
  if (orgao) cabecalho.push(`Órgão/jurisdicionado: ${orgao}`);
  if (parte) cabecalho.push(`Parte: ${parte}`);
  if (relator) cabecalho.push(`Relator: ${relator}`);
  if (setor) cabecalho.push(`Setor atual: ${setor}`);

  const atencoes: string[] = [];
  if (sensivel) {
    atencoes.push(
      "• Classe ou objeto sensível (denúncia, representação, cautelar, tomada de contas especial ou recurso) — leitura prioritária.",
    );
  }
  if (objeto) atencoes.push(`• Objeto: ${objeto}.`);
  if (apensados) atencoes.push(`• Há processos apensados (${apensados}) — verifique relação.`);

  const documentos: string[] = [];
  documentos.push(
    `• Documentos: ${qtdArquivos ?? 0} ${plural(qtdArquivos ?? 0, "arquivo", "arquivos")} (Relatório técnico: ${temRel ? "presente" : "ausente"}; Parecer MPC: ${temMpc ? "presente" : "ausente"}; Decisão/Voto/Acórdão: ${temDec ? "presente" : "ausente"}).`,
  );
  documentos.push(
    `• Movimentações: ${qtdMov ?? 0}. Sessões vinculadas: ${qtdSessoes ?? 0}.`,
  );

  const ausencias: string[] = [];
  if (!temRel) ausencias.push("Sem relatório técnico identificado nos documentos da tela.");
  if (!temMpc) ausencias.push("Sem parecer do MPC identificado nos documentos da tela.");
  if (ausencias.length) {
    ausencias.unshift("Dados ausentes que limitam a conclusão:");
  }

  // Síntese executiva: sensibilidade da classe + qual documento ler primeiro.
  const sinteseProx: string[] = [];
  if (sensivel) {
    sinteseProx.push("classe/objeto sensível — leitura prioritária");
  }
  if (temRel) {
    sinteseProx.push("comece pelo relatório técnico");
  } else {
    sinteseProx.push("relatório técnico ausente nesta tela");
  }
  if (temMpc) {
    sinteseProx.push("depois o parecer do MPC");
  } else {
    sinteseProx.push("MPC ausente nesta tela");
  }
  if (temDec) {
    sinteseProx.push("decisão/voto/acórdão já presente — confira se é da relatoria atual");
  }
  const sintese = `Prioridade: ${sinteseProx.join("; ")}.`;

  const partes: string[] = [];
  partes.push(cabecalho.join(" · "));
  partes.push(sintese);
  partes.push("");
  partes.push("Pontos de atenção:");
  partes.push(...(atencoes.length ? atencoes : ["• Sem indicadores sensíveis a partir dos metadados visíveis."]));
  partes.push("");
  partes.push("Documentos disponíveis na tela:");
  partes.push(...documentos);
  if (ausencias.length) {
    partes.push("");
    partes.push(...ausencias);
  }
  partes.push("");
  partes.push(
    "O assistente não leu o conteúdo dos documentos. Não emite voto, parecer conclusivo ou afirmação de irregularidade.",
  );

  return partes.join("\n");
}

// ── Função principal ──────────────────────────────────────────────────────────

export function analisarIntencaoAquiry(entrada: EntradaAnalise): ResultadoAnaliseAquiry {
  const tipoIntencao = identificarIntencao(entrada.pergunta);
  const tela = detectarTela(entrada.contextoTela);
  const dados = entrada.contextoTela?.dados;

  let respostaDeterministica: string | undefined;

  if (dados !== null && dados !== undefined && typeof dados === "object" && !Array.isArray(dados)) {
    const dadosMap = dados as Record<string, unknown>;
    // Pergunta metodológica sobre pauta tem precedência sobre os dispatchers
    // específicos da tela — devolve roteiro curto + aplicação aos dados.
    if (
      (tela === "pauta_lista" || tela === "pauta_sessao") &&
      ehPerguntaMetodologicaPauta(entrada.pergunta)
    ) {
      respostaDeterministica = gerarRespostaMetodologiaPauta(tela, dadosMap);
    } else if (tela === "alertas_gabinete") {
      respostaDeterministica = gerarRespostaAlertasGabinete(tipoIntencao, dadosMap);
    } else if (tela === "mortalidade") {
      respostaDeterministica = gerarRespostaMortalidade(tipoIntencao, dadosMap);
    } else if (tela === "pauta_lista") {
      respostaDeterministica = gerarRespostaPautaLista(tipoIntencao, dadosMap);
    } else if (tela === "pauta_sessao") {
      respostaDeterministica = gerarRespostaPautaSessao(tipoIntencao, dadosMap);
    } else if (tela === "processo_lista") {
      respostaDeterministica = gerarRespostaProcessoLista(tipoIntencao, dadosMap);
    } else if (tela === "processo_detalhe") {
      respostaDeterministica = gerarRespostaProcessoDetalhe(tipoIntencao, dadosMap);
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
