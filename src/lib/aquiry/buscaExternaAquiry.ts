// Camada de busca externa controlada do Assistente Aquiry.
// - Configurável por variável de ambiente.
// - Sem dependências novas: usa fetch nativo do runtime do Next.
// - Falha de forma silenciosa para o usuário: retorna executada:false em vez
//   de propagar erro técnico.

export type TipoFonteExterna =
  | "textual"
  | "oficial_textual"
  | "estruturada"
  | "indeterminada";

export type ResultadoBuscaExternaAquiry = {
  titulo: string;
  url: string;
  trecho?: string;
  fonte?: string;
  tipoFonte?: TipoFonteExterna;
};

export type AderenciaFontesAquiry = "alta" | "media" | "baixa";

export type SetorExigencia =
  | "educacao"
  | "saude"
  | "fiscal"
  | "contratos"
  | "geral";

export type ExigenciaFonteExterna = {
  exigeFonteOficial: boolean;
  exigeFonteEstruturada: boolean;
  setor: SetorExigencia;
  dominiosPreferenciais: string[];
  termosObrigatorios: string[];
};

export type RespostaBuscaExternaAquiry = {
  executada: boolean;
  consulta: string;
  resultados: ResultadoBuscaExternaAquiry[];
  erro?: string;
  aderencia?: AderenciaFontesAquiry;
  observacaoAderencia?: string;
  /** Cenário foi suficiente para responder com segurança ao recorte da pergunta */
  pesquisaSuficiente?: boolean;
  /** A pergunta exige fonte estruturada (csv/xlsx/api/microdados) para resposta segura */
  exigeFonteEstruturada?: boolean;
  /** Pelo menos um resultado retornado foi classificado como "estruturada" */
  fonteEstruturadaEncontrada?: boolean;
  /** Pelo menos um resultado retornado foi classificado como oficial (oficial_textual ou estruturada) */
  fontesOficiaisEncontradas?: boolean;
  /** Exigência detectada para a pergunta (usado por route.ts para orientar a IA) */
  exigencia?: ExigenciaFonteExterna;
};

const PERGUNTA_MAX_CHARS = 300;
const MAX_RESULTADOS_BUSCA = 5;
const MAX_TITULO_CHARS = 200;
const MAX_TRECHO_CHARS = 400;
const MAX_URL_CHARS = 500;
const TIMEOUT_MS = 8000;
// Gemini com Grounding (Google Search) é mais lento: executa busca + síntese
// e tipicamente responde em 5–15 s. Mantemos um teto maior, configurável.
const TIMEOUT_GEMINI_MS_PADRAO = 20000;
const TIMEOUT_GEMINI_MS_MIN = 5000;
const TIMEOUT_GEMINI_MS_MAX = 60000;

function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function sanitizarTexto(s: string, max: number): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function extrairFonteDaUrl(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

// Ajusta a consulta para favorecer fontes oficiais quando o assunto for
// reconhecido. Mantém a pergunta original como núcleo da busca e enriquece
// com termos setoriais oficiais quando houver indícios claros do recorte.
function ajustarConsulta(pergunta: string): string {
  const p = normalizar(pergunta);
  const base = pergunta.slice(0, PERGUNTA_MAX_CHARS).trim();
  const escopoAcre = /\bacre\b|\bac\b/.test(p) ? "" : " Acre";
  const temMunicipio = /\bmunicipios?\b|\bprefeituras?\b|\bjurisdicionad/.test(p);

  // EDUCAÇÃO — para recorte municipal/fiscal, restringimos a domínios oficiais
  // setoriais (sem site:gov.br genérico) para evitar matérias jornalísticas.
  if (/educa[cç][aã]o|\bsiope\b|\bfnde\b|\bfundeb\b|\bmde\b|\bensino\b/.test(p)) {
    if (temMunicipio) {
      return `SIOPE FNDE consulta municípios${escopoAcre} MDE Fundeb "aplicação em educação" SICONFI RREO ${base} site:fnde.gov.br OR site:siope.fnde.gov.br OR site:siope.inep.gov.br OR site:siconfi.tesouro.gov.br OR site:tesouro.gov.br`;
    }
    return `${base}${escopoAcre} SIOPE FNDE MDE Fundeb SICONFI site:fnde.gov.br OR site:siope.inep.gov.br OR site:tesouro.gov.br`;
  }

  // SAÚDE
  if (/\bsaude\b|\bdatasus\b|\bsim\b|\bsinasc\b|\bsiops\b/.test(p)) {
    const reforco = temMunicipio
      ? " SIOPS DataSUS \"aplicação em saúde\" \"saúde municipal\" SICONFI RREO"
      : " SIOPS DataSUS Ministério da Saúde";
    return `${base}${escopoAcre}${reforco} site:gov.br OR site:datasus.saude.gov.br OR site:tesouro.gov.br`;
  }

  // FINANÇAS / RREO / RGF / TESOURO
  if (/\bsiconfi\b|\brreo\b|\brgf\b|\btesouro\b/.test(p)) {
    return `${base}${escopoAcre} SICONFI RREO RGF \"Tesouro Nacional\" site:tesouro.gov.br OR site:siconfi.tesouro.gov.br OR site:gov.br`;
  }

  // TCU / JURISPRUDÊNCIA
  if (/\btcu\b|jurisprud|acordao/.test(p)) {
    return `${base} site:tcu.gov.br`;
  }

  // TCE/AC
  if (/\btce[-\s]?ac\b|tribunal\s+de\s+contas.*acre/.test(p)) {
    return `${base} site:tceac.tc.br OR site:tce.ac.gov.br`;
  }

  return base;
}

function pickString(obj: Record<string, unknown>, chave: string): string | undefined {
  const v = obj[chave];
  return typeof v === "string" ? v : undefined;
}

function normalizarItem(raw: unknown): ResultadoBuscaExternaAquiry | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const tituloBruto =
    pickString(obj, "title") ??
    pickString(obj, "titulo") ??
    pickString(obj, "name") ??
    "";
  const urlBruta = pickString(obj, "url") ?? pickString(obj, "link") ?? "";
  const trechoBruto =
    pickString(obj, "content") ??
    pickString(obj, "description") ??
    pickString(obj, "snippet") ??
    pickString(obj, "trecho");
  const titulo = sanitizarTexto(tituloBruto, MAX_TITULO_CHARS);
  const url = urlBruta.trim().slice(0, MAX_URL_CHARS);
  if (!titulo || !url || !/^https?:\/\//i.test(url)) return null;
  return {
    titulo,
    url,
    trecho: trechoBruto ? sanitizarTexto(trechoBruto, MAX_TRECHO_CHARS) : undefined,
    fonte: extrairFonteDaUrl(url),
  };
}

async function buscarTavily(
  consulta: string,
  apiKey: string,
  endpoint: string | undefined,
): Promise<ResultadoBuscaExternaAquiry[]> {
  const url = endpoint || "https://api.tavily.com/search";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query: consulta,
      max_results: MAX_RESULTADOS_BUSCA,
      search_depth: "basic",
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
  const data: unknown = await res.json();
  const items =
    data && typeof data === "object" && Array.isArray((data as { results?: unknown }).results)
      ? ((data as { results: unknown[] }).results)
      : [];
  return items
    .slice(0, MAX_RESULTADOS_BUSCA)
    .map(normalizarItem)
    .filter((r): r is ResultadoBuscaExternaAquiry => r !== null);
}

async function buscarBrave(
  consulta: string,
  apiKey: string,
  endpoint: string | undefined,
): Promise<ResultadoBuscaExternaAquiry[]> {
  const base = endpoint || "https://api.search.brave.com/res/v1/web/search";
  const url = `${base}?q=${encodeURIComponent(consulta)}&count=${MAX_RESULTADOS_BUSCA}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Brave HTTP ${res.status}`);
  const data: unknown = await res.json();
  const web =
    data && typeof data === "object" ? (data as { web?: { results?: unknown } }).web : undefined;
  const items = Array.isArray(web?.results) ? (web!.results as unknown[]) : [];
  return items
    .slice(0, MAX_RESULTADOS_BUSCA)
    .map(normalizarItem)
    .filter((r): r is ResultadoBuscaExternaAquiry => r !== null);
}

async function buscarSerpAPI(
  consulta: string,
  apiKey: string,
  endpoint: string | undefined,
): Promise<ResultadoBuscaExternaAquiry[]> {
  const base = endpoint || "https://serpapi.com/search.json";
  const url = `${base}?engine=google&num=${MAX_RESULTADOS_BUSCA}&hl=pt-BR&gl=br&q=${encodeURIComponent(
    consulta,
  )}&api_key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`SerpAPI HTTP ${res.status}`);
  const data: unknown = await res.json();
  const organic =
    data && typeof data === "object"
      ? (data as { organic_results?: unknown }).organic_results
      : undefined;
  const items = Array.isArray(organic) ? (organic as unknown[]) : [];
  return items
    .slice(0, MAX_RESULTADOS_BUSCA)
    .map(normalizarItem)
    .filter((r): r is ResultadoBuscaExternaAquiry => r !== null);
}

// ── Gemini com Grounding via Google Search ───────────────────────────────────
// Estrutura esperada da resposta:
// candidates[0].groundingMetadata.groundingChunks[].web.{title,uri}
// candidates[0].groundingMetadata.groundingSupports[].segment.text (trechos)

const GEMINI_MODEL_PADRAO = "gemini-2.5-flash";

function extrairTrechosGemini(
  groundingMetadata: Record<string, unknown>,
): Map<number, string> {
  const supports = groundingMetadata.groundingSupports;
  const mapa = new Map<number, string>();
  if (!Array.isArray(supports)) return mapa;
  for (const s of supports) {
    if (!s || typeof s !== "object") continue;
    const obj = s as Record<string, unknown>;
    const indices = obj.groundingChunkIndices;
    const segmento = obj.segment;
    const texto =
      segmento && typeof segmento === "object"
        ? (segmento as Record<string, unknown>).text
        : undefined;
    if (!Array.isArray(indices) || typeof texto !== "string") continue;
    for (const idx of indices) {
      if (typeof idx === "number" && !mapa.has(idx)) {
        mapa.set(idx, texto);
      }
    }
  }
  return mapa;
}

// ── Classificação de exigência da pergunta ───────────────────────────────────
// Define o "nível de prova" que a pergunta requer: se basta orientação geral,
// se exige fonte oficial textual, ou se precisa de fonte estruturada
// (dado tabular, valor, percentual, ranking, cumprimento).

const REGEX_TERMOS_FISCAIS =
  /\bgast[oa]s?\b|\bgastaram\b|\bgastou\b|\bdespesa(s)?\b|\baplic(ou|aram|acao|ar)\b|\bexecu[cç][aã]o\b|\bpercentual\b|\bvalor(es)?\b|\bcumprimento\b|\bminimo\s+constitucional\b|\bdota[cç][aã]o\b|\bor[cç]?amento\b|\brankin?g\b|\brepasse(s)?\b/;

const REGEX_MUNICIPIOS =
  /\bmunicipios?\b|\bprefeituras?\b|\bjurisdicionad/;

export function classificarExigenciaFonteExterna(
  pergunta: string,
): ExigenciaFonteExterna {
  const p = normalizar(pergunta);
  const exigeRecorteMunicipal = REGEX_MUNICIPIOS.test(p);
  const tomFiscal = REGEX_TERMOS_FISCAIS.test(p);

  if (/educa[cç][aã]o|\bsiope\b|\bfnde\b|\bfundeb\b|\bmde\b|\bensino\b/.test(p)) {
    return {
      exigeFonteOficial: true,
      exigeFonteEstruturada: tomFiscal || exigeRecorteMunicipal,
      setor: "educacao",
      dominiosPreferenciais: [
        "fnde.gov.br",
        "siope.fnde.gov.br",
        "siope.inep.gov.br",
        "www.fnde.gov.br",
        "gov.br/fnde",
        "siconfi.tesouro.gov.br",
        "tesouro.gov.br",
        "tesourotransparente.gov.br",
        "inep.gov.br",
      ],
      termosObrigatorios: ["siope", "fnde", "fundeb", "mde"],
    };
  }

  if (/\bsaude\b|\bsiops\b|\bdatasus\b|\bsim\b|\bsinasc\b/.test(p)) {
    return {
      exigeFonteOficial: true,
      exigeFonteEstruturada: tomFiscal || exigeRecorteMunicipal,
      setor: "saude",
      dominiosPreferenciais: [
        "siops.datasus.gov.br",
        "datasus.saude.gov.br",
        "saude.gov.br",
        "siconfi.tesouro.gov.br",
        "tesouro.gov.br",
      ],
      termosObrigatorios: ["siops", "datasus"],
    };
  }

  if (/\bsiconfi\b|\brreo\b|\brgf\b|\btesouro\b/.test(p)) {
    return {
      exigeFonteOficial: true,
      exigeFonteEstruturada: tomFiscal || exigeRecorteMunicipal,
      setor: "fiscal",
      dominiosPreferenciais: [
        "siconfi.tesouro.gov.br",
        "tesouro.gov.br",
        "tesourotransparente.gov.br",
      ],
      termosObrigatorios: ["siconfi", "rreo", "rgf"],
    };
  }

  if (/\bcontratos?\b|licita[cç]/.test(p) || /\bcompras\.?\s*gov\b/.test(p)) {
    return {
      exigeFonteOficial: true,
      exigeFonteEstruturada: tomFiscal,
      setor: "contratos",
      dominiosPreferenciais: ["compras.gov.br", "transparencia.gov.br"],
      termosObrigatorios: ["licitacao", "contrato"],
    };
  }

  return {
    exigeFonteOficial: false,
    exigeFonteEstruturada: false,
    setor: "geral",
    dominiosPreferenciais: [],
    termosObrigatorios: [],
  };
}

// ── Classificação do tipo de fonte externa ───────────────────────────────────
// Diferencia (a) dado estruturado/consultável (csv, xlsx, API, microdados),
// (b) fonte oficial textual (gov.br, fnde.gov.br, tesouro.gov.br, etc.),
// (c) fonte textual genérica (notícia/portal/jornal) e (d) indeterminada.

const DOMINIOS_OFICIAIS = [
  "fnde.gov.br",
  "siope.inep.gov.br",
  "inep.gov.br",
  "tesouro.gov.br",
  "siconfi.tesouro.gov.br",
  "datasus.saude.gov.br",
  "saude.gov.br",
  "ibge.gov.br",
  "tcu.gov.br",
  "tceac.tc.br",
  "tce.ac.gov.br",
  "legis.ac.gov.br",
  "transparencia.gov.br",
  ".gov.br",
  ".leg.br",
  ".jus.br",
];

const SINAIS_ESTRUTURADO = [
  "csv",
  "xlsx",
  "xls",
  "download",
  "api",
  "dados abertos",
  "microdados",
  "planilha",
  "json",
  "base de dados",
  "consulta publica",
  "consulta detalhada",
  "demonstrativo",
  "relatorio resumido",
  "exportar",
  "tabela",
];

const SINAIS_TEXTUAIS = [
  "noticia",
  "jornal",
  "portal",
  "materia",
  "release",
  "artigo",
  "coluna",
  "reportagem",
  "opiniao",
];

const REGEX_ARQUIVO_ESTRUTURADO = /\.(csv|xlsx?|json|parquet|zip)(\?|#|$)/i;

export function classificarTipoFonteExterna(
  r: ResultadoBuscaExternaAquiry,
): TipoFonteExterna {
  const urlLower = r.url.toLowerCase();
  const tituloNorm = normalizar(r.titulo);
  const trechoNorm = normalizar(r.trecho ?? "");
  // Para o Gemini, r.fonte fica undefined (URL é redirect do Vertex); nesse
  // caso o título já costuma ser o domínio real (ex.: "fnde.gov.br").
  const candidatoDominio = (r.fonte ?? r.titulo).toLowerCase();
  const blob = `${tituloNorm} ${trechoNorm}`;

  // 1) Estruturada: extensão de arquivo de dados ou sinais explícitos de
  //    consulta/exportação.
  if (REGEX_ARQUIVO_ESTRUTURADO.test(urlLower)) return "estruturada";
  if (SINAIS_ESTRUTURADO.some((t) => blob.includes(t))) return "estruturada";

  // 2) Oficial textual: domínio gov/leg/jus sem sinal estruturado.
  const ehOficial = DOMINIOS_OFICIAIS.some(
    (d) => candidatoDominio.includes(d) || urlLower.includes(d),
  );
  if (ehOficial) return "oficial_textual";

  // 3) Textual genérica.
  if (SINAIS_TEXTUAIS.some((t) => blob.includes(t))) return "textual";
  if (/\.com\.br|\.com\b|\.net\b|\.org\b/.test(candidatoDominio) &&
    !/\.gov\.br|\.leg\.br|\.jus\.br/.test(candidatoDominio)) {
    return "textual";
  }

  return "indeterminada";
}

// ── Avaliação de aderência das fontes ────────────────────────────────────────
// Verifica se os resultados retornados pelo provider efetivamente cobrem o
// recorte que a pergunta exige. Não avalia veracidade do conteúdo — apenas se
// o conjunto de fontes parece pertinente ao tema/recorte solicitado.

type AvaliacaoAderencia = {
  aderencia: AderenciaFontesAquiry;
  observacao: string;
};

type DescritorSetor = {
  setor: "educacao" | "saude" | "fiscal" | null;
  termosEsperados: string[];
  exigeMunicipio: boolean;
};

function descreverPergunta(pergunta: string): DescritorSetor {
  const p = normalizar(pergunta);
  const exigeMunicipio = /\bmunicipios?\b|\bprefeituras?\b|\bjurisdicionad/.test(p);

  if (/educa[cç][aã]o|\bsiope\b|\bfnde\b|\bfundeb\b|\bmde\b|\bensino\b/.test(p)) {
    const termos = [
      "siope",
      "fnde",
      "mde",
      "fundeb",
      "rreo",
      "siconfi",
      "aplicacao em educacao",
      "aplicacao em ensino",
      "educacao municipal",
      "manutencao e desenvolvimento do ensino",
      "ministerio da educacao",
      "inep",
    ];
    if (exigeMunicipio) termos.push("municipio", "municipios", "prefeitura");
    return { setor: "educacao", termosEsperados: termos, exigeMunicipio };
  }

  if (/\bsaude\b|\bdatasus\b|\bsim\b|\bsinasc\b|\bsiops\b/.test(p)) {
    const termos = [
      "siops",
      "datasus",
      "sim",
      "sinasc",
      "ministerio da saude",
      "atencao basica",
      "rreo",
      "siconfi",
      "aplicacao em saude",
      "saude municipal",
    ];
    if (exigeMunicipio) termos.push("municipio", "municipios", "prefeitura");
    return { setor: "saude", termosEsperados: termos, exigeMunicipio };
  }

  if (/\bsiconfi\b|\brreo\b|\brgf\b|\btesouro\b|gasto|despesa|receita/.test(p)) {
    const termos = [
      "siconfi",
      "rreo",
      "rgf",
      "tesouro nacional",
      "demonstrativo fiscal",
    ];
    if (exigeMunicipio) termos.push("municipio", "municipios", "prefeitura");
    return { setor: "fiscal", termosEsperados: termos, exigeMunicipio };
  }

  return { setor: null, termosEsperados: [], exigeMunicipio: false };
}

function resultadoBateAlgumTermo(
  r: ResultadoBuscaExternaAquiry,
  termos: string[],
): boolean {
  const alvo = normalizar([r.titulo, r.url, r.trecho ?? "", r.fonte ?? ""].join(" "));
  return termos.some((t) => alvo.includes(t));
}

// Sinais de que a fonte trata de orçamento estadual agregado / LOA estadual /
// dotação geral, em vez de execução municipal. Útil para rebaixar aderência
// quando o recorte pedido é municipal.
const TERMOS_ESTADUAL_AGREGADO = [
  "orcamento do estado",
  "orcamento estadual",
  "loa estadual",
  "loa do estado",
  "dotacao do estado",
  "dotacao estadual",
  "governo do estado",
];

function resultadoTrataDeEstadualAgregado(
  r: ResultadoBuscaExternaAquiry,
): boolean {
  const alvo = normalizar([r.titulo, r.trecho ?? ""].join(" "));
  return TERMOS_ESTADUAL_AGREGADO.some((t) => alvo.includes(t));
}

function avaliarAderenciaFontesExternas(
  pergunta: string,
  resultados: ResultadoBuscaExternaAquiry[],
): AvaliacaoAderencia {
  if (resultados.length === 0) {
    return { aderencia: "baixa", observacao: "Nenhuma fonte retornada." };
  }

  const desc = descreverPergunta(pergunta);
  if (desc.setor === null || desc.termosEsperados.length === 0) {
    // Sem vocabulário esperado definido — assume aderência média neutra.
    return {
      aderencia: "media",
      observacao: "Pergunta sem recorte setorial específico para avaliar aderência.",
    };
  }

  const totalAderentes = resultados.filter((r) =>
    resultadoBateAlgumTermo(r, desc.termosEsperados),
  ).length;

  // Se o recorte é municipal e a maioria das fontes trata de orçamento
  // estadual agregado, rebaixamos para "baixa" mesmo que haja termos setoriais
  // — o conjunto não responde ao recorte solicitado.
  if (desc.exigeMunicipio) {
    const totalEstadualAgregado = resultados.filter(
      resultadoTrataDeEstadualAgregado,
    ).length;
    if (totalEstadualAgregado > 0 && totalEstadualAgregado >= resultados.length / 2) {
      return {
        aderencia: "baixa",
        observacao:
          "Fontes tratam predominantemente de orçamento estadual agregado / LOA do Estado, e não da execução municipal específica solicitada.",
      };
    }
  }

  // Quando o recorte é municipal, exigimos também sinais explícitos de
  // município nas fontes. Sem isso, mesmo fontes setoriais ficam em "media".
  let temSinalMunicipal = true;
  if (desc.exigeMunicipio) {
    const termosMunicipio = ["municipio", "municipios", "prefeitura", "siope"];
    temSinalMunicipal = resultados.some((r) =>
      resultadoBateAlgumTermo(r, termosMunicipio),
    );
  }

  // Sinais sobre o tipo das fontes — usados para refinar a observação textual.
  const temEstruturada = resultados.some((r) => r.tipoFonte === "estruturada");
  const temOficialTextual = resultados.some((r) => r.tipoFonte === "oficial_textual");

  if (totalAderentes >= 2 && temSinalMunicipal) {
    if (!temEstruturada && temOficialTextual && desc.setor === "educacao") {
      return {
        aderencia: "alta",
        observacao:
          "Foram encontradas fontes oficiais aderentes do FNDE/SIOPE, mas os trechos retornados não incluem dados tabulares ou valores municipais suficientes para consolidar a situação dos municípios.",
      };
    }
    if (!temEstruturada && temOficialTextual) {
      return {
        aderencia: "alta",
        observacao:
          "Fontes oficiais aderentes localizadas, porém os trechos retornados não trazem dados tabulares para consolidar a resposta.",
      };
    }
    return {
      aderencia: "alta",
      observacao:
        "Maioria das fontes contém termos setoriais e cobre o recorte solicitado.",
    };
  }
  if (totalAderentes >= 1 || temSinalMunicipal) {
    if (!temEstruturada && temOficialTextual && desc.setor === "educacao") {
      return {
        aderencia: "media",
        observacao:
          "Foram encontradas fontes oficiais aderentes do FNDE/SIOPE, mas os trechos retornados não incluem dados tabulares ou valores municipais suficientes para consolidar a situação dos municípios.",
      };
    }
    return {
      aderencia: "media",
      observacao: desc.exigeMunicipio && !temSinalMunicipal
        ? "Fontes setoriais presentes, mas sem recorte municipal explícito."
        : "Cobertura parcial do tema; algumas fontes podem ser tangentes.",
    };
  }
  return {
    aderencia: "baixa",
    observacao:
      desc.exigeMunicipio
        ? "Fontes não tratam de execução/aplicação municipal específica; podem ser orçamento estadual agregado, notícia ou contexto geral."
        : "Fontes não contêm termos setoriais esperados para o recorte da pergunta.",
  };
}

function resolverTimeoutGemini(): number {
  const bruto = process.env.AQUIRY_GEMINI_TIMEOUT_MS?.trim();
  const parsed = bruto ? Number.parseInt(bruto, 10) : NaN;
  if (!Number.isFinite(parsed)) return TIMEOUT_GEMINI_MS_PADRAO;
  return Math.min(TIMEOUT_GEMINI_MS_MAX, Math.max(TIMEOUT_GEMINI_MS_MIN, parsed));
}

async function buscarGemini(
  consulta: string,
  apiKey: string,
  endpoint: string | undefined,
  model: string,
): Promise<ResultadoBuscaExternaAquiry[]> {
  // Endpoint do Generative Language API. Usamos o header x-goog-api-key em vez
  // de colocar a chave na URL para reduzir o risco de vazamento em logs HTTP.
  const url =
    endpoint ||
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const instrucao =
    "Use o Google Search para encontrar fontes atualizadas que ajudem a responder " +
    "à pergunta abaixo. SEMPRE execute a busca, mesmo que o tema pareça recente. " +
    "Quando a pergunta envolver dado fiscal, setorial ou execução pública, " +
    "priorize fontes oficiais brasileiras (.gov.br, .leg.br, .jus.br — em especial " +
    "FNDE/SIOPE/INEP/MEC para educação; SIOPS/DataSUS/Ministério da Saúde para " +
    "saúde; Tesouro Nacional/SICONFI/RREO/RGF para finanças; IBGE; TCU; TCE/AC; " +
    "Portal da Transparência; Diário Oficial; portais estaduais e municipais). " +
    "Quando a pergunta pedir recorte municipal, evite responder com dado estadual " +
    "agregado como se fosse municipal. Use notícia apenas como apoio, nunca como " +
    "fonte principal para dado fiscal ou setorial oficial. Se a fonte oficial não " +
    "cobrir o recorte solicitado, traga as melhores referências disponíveis e " +
    "sinalize a limitação — é melhor trazer referência aproximada do que nenhuma. " +
    "Retorne resposta curta e fundamentada, com referências de fontes.";

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: `${instrucao}\n\nPergunta: ${consulta}` }],
      },
    ],
    tools: [{ google_search: {} }],
  };

  const timeoutGemini = resolverTimeoutGemini();
  const tInicio = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutGemini),
  });
  if (!res.ok) {
    // Log diagnóstico: status + corpo curto, sem expor a chave (header).
    let detalhe = "";
    try {
      detalhe = (await res.text()).slice(0, 400);
    } catch {
      /* ignora */
    }
    console.error(`[aquiry/buscaExterna] Gemini HTTP ${res.status} — ${detalhe}`);
    throw new Error(`Gemini HTTP ${res.status}`);
  }
  const data: unknown = await res.json();

  if (!data || typeof data !== "object") {
    console.info("[aquiry/buscaExterna] Gemini retornou payload vazio.");
    return [];
  }
  const candidates = (data as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    console.info("[aquiry/buscaExterna] Gemini sem 'candidates' na resposta.");
    return [];
  }
  const primeiro = candidates[0];
  if (!primeiro || typeof primeiro !== "object") return [];
  const groundingMetadata = (primeiro as { groundingMetadata?: unknown }).groundingMetadata;
  if (!groundingMetadata || typeof groundingMetadata !== "object") {
    console.info(
      "[aquiry/buscaExterna] Gemini respondeu sem 'groundingMetadata' — Google Search não foi acionado para essa pergunta.",
    );
    return [];
  }

  const meta = groundingMetadata as Record<string, unknown>;
  const chunks = meta.groundingChunks;
  if (!Array.isArray(chunks)) {
    console.info("[aquiry/buscaExterna] Gemini sem 'groundingChunks'.");
    return [];
  }
  console.info(
    `[aquiry/buscaExterna] Gemini respondeu em ${Date.now() - tInicio}ms com ${chunks.length} groundingChunks.`,
  );

  const trechosPorChunk = extrairTrechosGemini(meta);

  const resultados: ResultadoBuscaExternaAquiry[] = [];
  chunks.slice(0, MAX_RESULTADOS_BUSCA).forEach((chunk, idx) => {
    if (!chunk || typeof chunk !== "object") return;
    const web = (chunk as { web?: unknown }).web;
    if (!web || typeof web !== "object") return;
    const w = web as Record<string, unknown>;
    const tituloBruto = typeof w.title === "string" ? w.title : "";
    const urlBruta = typeof w.uri === "string" ? w.uri : "";
    const titulo = sanitizarTexto(tituloBruto, MAX_TITULO_CHARS);
    const urlNorm = urlBruta.trim().slice(0, MAX_URL_CHARS);
    if (!titulo || !/^https?:\/\//i.test(urlNorm)) return;
    const trechoBruto = trechosPorChunk.get(idx);
    // O Gemini retorna URLs via redirect interno (vertexaisearch.cloud.google.com).
    // O hostname desse redirect não diz nada ao usuário — o título já costuma
    // ser o domínio real (ex.: "agazetadoacre.com"). Nesse caso omitimos a
    // fonte para evitar poluição visual.
    const hostname = extrairFonteDaUrl(urlNorm);
    const fonte =
      hostname && hostname.endsWith("vertexaisearch.cloud.google.com")
        ? undefined
        : hostname;
    resultados.push({
      titulo,
      url: urlNorm,
      trecho: trechoBruto ? sanitizarTexto(trechoBruto, MAX_TRECHO_CHARS) : undefined,
      fonte,
    });
  });
  return resultados;
}

export async function buscarFontesExternasAquiry(
  pergunta: string,
): Promise<RespostaBuscaExternaAquiry> {
  const provider = process.env.AQUIRY_EXTERNAL_SEARCH_PROVIDER?.toLowerCase().trim();
  const apiKey = process.env.AQUIRY_EXTERNAL_SEARCH_API_KEY?.trim();
  const geminiKey = process.env.AQUIRY_GEMINI_API_KEY?.trim();
  const endpoint = process.env.AQUIRY_EXTERNAL_SEARCH_ENDPOINT?.trim();
  const consulta = ajustarConsulta(pergunta);

  // Provider Gemini usa AQUIRY_GEMINI_API_KEY; demais providers usam
  // AQUIRY_EXTERNAL_SEARCH_API_KEY. Não há fallback entre as duas — chaves de
  // provedores distintos não devem ser intercambiadas.
  const chaveEfetiva = provider === "gemini" ? geminiKey : apiKey;

  if (!provider || !chaveEfetiva) {
    console.info(
      "[Aquiry] Busca externa não executada: provider ou API key não configurados.",
    );
    return {
      executada: false,
      consulta,
      resultados: [],
      erro: "busca_nao_configurada",
    };
  }

  try {
    let resultados: ResultadoBuscaExternaAquiry[];
    if (provider === "tavily") {
      resultados = await buscarTavily(consulta, chaveEfetiva, endpoint);
    } else if (provider === "brave") {
      resultados = await buscarBrave(consulta, chaveEfetiva, endpoint);
    } else if (provider === "serpapi") {
      resultados = await buscarSerpAPI(consulta, chaveEfetiva, endpoint);
    } else if (provider === "gemini") {
      const model =
        process.env.AQUIRY_GEMINI_MODEL?.trim() || GEMINI_MODEL_PADRAO;
      resultados = await buscarGemini(consulta, chaveEfetiva, endpoint, model);
    } else {
      return {
        executada: false,
        consulta,
        resultados: [],
        erro: `provider_nao_suportado:${provider}`,
      };
    }
    if (resultados.length === 0) {
      console.info(
        `[aquiry/buscaExterna] provider="${provider}" sem resultados após sanitização.`,
      );
      return { executada: false, consulta, resultados: [], erro: "sem_resultados" };
    }
    // Classifica o tipo de cada fonte (textual, oficial_textual, estruturada,
    // indeterminada).
    resultados = resultados.map((r) => ({
      ...r,
      tipoFonte: classificarTipoFonteExterna(r),
    }));

    // Qualificação: quando a pergunta exige fonte oficial e existe pelo menos
    // uma fonte oficial entre os resultados, descartamos as fontes meramente
    // textuais do conjunto que seguirá para a IA. Se não houver NENHUMA fonte
    // oficial, mantemos todas (a aderência/pesquisaSuficiente sinalizarão o
    // problema).
    const exigencia = classificarExigenciaFonteExterna(pergunta);
    const oficiais = resultados.filter(
      (r) => r.tipoFonte === "oficial_textual" || r.tipoFonte === "estruturada",
    );
    const fontesOficiaisEncontradas = oficiais.length > 0;
    const fonteEstruturadaEncontrada = resultados.some(
      (r) => r.tipoFonte === "estruturada",
    );

    if (exigencia.exigeFonteOficial && fontesOficiaisEncontradas) {
      resultados = oficiais;
    }

    const pesquisaSuficiente =
      (!exigencia.exigeFonteOficial || fontesOficiaisEncontradas) &&
      (!exigencia.exigeFonteEstruturada || fonteEstruturadaEncontrada);

    const aval = avaliarAderenciaFontesExternas(pergunta, resultados);
    console.info(
      `[aquiry/buscaExterna] provider="${provider}" retornou ${resultados.length} fonte(s) — aderência: ${aval.aderencia} — suficiente: ${pesquisaSuficiente} (oficial=${fontesOficiaisEncontradas}, estruturada=${fonteEstruturadaEncontrada}).`,
    );
    return {
      executada: true,
      consulta,
      resultados,
      aderencia: aval.aderencia,
      observacaoAderencia: aval.observacao,
      pesquisaSuficiente,
      exigeFonteEstruturada: exigencia.exigeFonteEstruturada,
      fonteEstruturadaEncontrada,
      fontesOficiaisEncontradas,
      exigencia,
    };
  } catch (err) {
    console.error(
      "[aquiry/buscaExterna]",
      err instanceof Error ? err.message : String(err),
    );
    return { executada: false, consulta, resultados: [], erro: "falha_busca" };
  }
}
