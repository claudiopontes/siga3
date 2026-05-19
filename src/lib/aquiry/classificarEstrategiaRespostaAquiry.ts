// Utilitário puro de classificação da estratégia de resposta do Assistente Aquiry.
// Sem efeitos colaterais, sem IA — apenas lógica determinística por palavras-chave
// e inspeção do contexto disponível.

import type { ContextoTelaAquiry } from "./tiposContextoAquiry";

// Forma estrutural mínima usada aqui — evita acoplar este utilitário ao tipo
// estrito de rota mapeada (TipoPaginaAquiry).
type ContextoPaginaParaClassificacao = {
  tipoPagina?: string;
  titulo?: string;
  descricao?: string;
  rota?: string;
};

export type EstrategiaRespostaAquiry =
  | "varadouro"
  | "conhecimento_geral"
  | "busca_externa";

export type ResultadoClassificacaoEstrategia = {
  estrategia: EstrategiaRespostaAquiry;
  motivo: string;
  requerBuscaExterna: boolean;
};

type EntradaClassificacao = {
  pergunta: string;
  contextoTela?: ContextoTelaAquiry | null;
  contextoPagina?: ContextoPaginaParaClassificacao | null;
  usouAnaliseContextual?: boolean;
};

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// ── Sinais de busca externa ───────────────────────────────────────────────────
// A ordem desta lista é apenas para o motivo retornado; qualquer match marca
// requerBuscaExterna = true.
const TERMOS_BUSCA_EXTERNA: Array<{ termo: string; regex: RegExp }> = [
  { termo: "mais recente", regex: /\bmais\s+recente(s)?\b/ },
  { termo: "atualizado", regex: /\batualizad[ao]s?\b/ },
  { termo: "ultima versao", regex: /\bultim[ao]s?\s+vers[aã]o\b|\bultima\s+versao\b/ },
  { termo: "atual", regex: /\batual(?:mente|izad[ao])?\b/ },
  { termo: "hoje", regex: /\bhoje\b/ },
  { termo: "vigente", regex: /\bvigente(s)?\b/ },
  { termo: "noticia", regex: /\bnoticias?\b/ },
  { termo: "publicado", regex: /\bpublicad[ao]s?\b/ },
  { termo: "portaria", regex: /\bportarias?\b/ },
  { termo: "lei", regex: /\bleis?\b/ },
  { termo: "decreto", regex: /\bdecretos?\b/ },
  { termo: "resolucao", regex: /\bresolu[cç][aã]o(es)?\b/ },
  { termo: "instrucao normativa", regex: /\binstru[cç][aã]o\s+normativa\b/ },
  { termo: "jurisprudencia recente", regex: /\bjurisprudencias?\s+recente(s)?\b/ },
  { termo: "fonte oficial", regex: /\bfontes?\s+oficial(is)?\b/ },
  { termo: "api publica", regex: /\bapi\s+publica\b/ },
  { termo: "DataSUS", regex: /\bdatasus\b/ },
  { termo: "SICONFI", regex: /\bsiconfi\b/ },
  { termo: "CAUC", regex: /\bcauc\b/ },
  { termo: "FNDE", regex: /\bfnde\b/ },
  { termo: "SIOPE", regex: /\bsiope\b/ },
  { termo: "RREO", regex: /\brreo\b/ },
  { termo: "Fundeb", regex: /\bfundeb\b/ },
  { termo: "MDE", regex: /\bmde\b/ },
  { termo: "Tesouro", regex: /\btesouro\b/ },
  { termo: "IBGE", regex: /\bibge\b/ },
  { termo: "INEP", regex: /\binep\b/ },
  { termo: "Compras.gov", regex: /\bcompras\.?\s*gov\b/ },
  { termo: "Portal da Transparência", regex: /\bportal\s+da\s+transparencia\b/ },
  { termo: "TCE", regex: /\btce(?:-?ac)?\b/ },
  { termo: "TCU", regex: /\btcu\b/ },
];

function detectarBuscaExterna(perguntaNormalizada: string): string | null {
  for (const { termo, regex } of TERMOS_BUSCA_EXTERNA) {
    if (regex.test(perguntaNormalizada)) return termo;
  }
  return null;
}

// ── Sinais de menção explícita à tela atual ───────────────────────────────────
const REGEX_MENCAO_TELA =
  /\bnesta\s+tela\b|\bnesta\s+pagina\b|\beste\s+painel\b|\bnesse\s+painel\b|\besses\s+dados\b|\bestes\s+dados\b|\bestes\s+indicadores\b|\besses\s+indicadores\b|\baqui\b/;

// ── Sinais de pergunta sobre prioridade/risco que se beneficiam de contexto ──
const REGEX_INTENCAO_OPERACIONAL =
  /\bonde\s+(devo\s+)?olhar\s+primeiro\b|\bprioridade\b|\bpriorizar\b|\bmais\s+urgente\b|\brisco(s)?\b|\balerta(s)?\b|\bindicador(es)?\b/;

// ── Detecção de pergunta setorial + ano/municípios sem base interna ───────────
// Perguntas como "gastos com educação em 2026 nos municípios do Acre" não têm
// gatilho léxico claro (sem "atualizado", "vigente" etc.), mas exigem base
// específica que a home ou a maioria das telas não fornece.

type SetorDetectado = "educacao" | "saude" | "gastos_despesas" | null;

function detectarSetor(perguntaNormalizada: string): SetorDetectado {
  if (/\beduca[cç][aã]o\b|\bensino\b|\bescolar(es)?\b/.test(perguntaNormalizada)) {
    return "educacao";
  }
  if (/\bsaude\b|\bsus\b|\baten[cç][aã]o\s+(basica|primaria)\b|\bhospital(ar|es)?\b/.test(perguntaNormalizada)) {
    return "saude";
  }
  if (/\bgastos?\b|\bdespesas?\b|\baplic(ou|aram|acao)\b|\binvestimentos?\b/.test(perguntaNormalizada)) {
    return "gastos_despesas";
  }
  return null;
}

function temAnoOuExercicio(perguntaNormalizada: string): boolean {
  // Ano de 4 dígitos (1900–2099) ou expressão "exercício de XXXX".
  return /\b(19|20)\d{2}\b|\bexercicio\b/.test(perguntaNormalizada);
}

function mencionaMunicipios(perguntaNormalizada: string): boolean {
  return /\bmunicipios?\b|\bjurisdicionad[ao]s?\b|\bprefeituras?\b/.test(perguntaNormalizada);
}

function contextoTelaCobreSetor(
  contextoTela: ContextoTelaAquiry | null | undefined,
  setor: SetorDetectado,
): boolean {
  if (!setor || !contextoTela) return false;
  const alvo = normalizar(
    [contextoTela.titulo, contextoTela.descricao, ...(contextoTela.fontes ?? [])]
      .filter((v): v is string => typeof v === "string")
      .join(" "),
  );
  if (!alvo) return false;
  if (setor === "educacao") {
    return /educa[cç][aã]o|ensino|escolar|siope|fundeb|mde/.test(alvo);
  }
  if (setor === "saude") {
    return /saude|sus|hospital|datasus|sim|sinasc|siops/.test(alvo);
  }
  // gastos_despesas é genérico: qualquer painel financeiro/de receita cobre
  return /receita|despesa|gasto|fiscal|orcament|rreo|rgf|siconfi/.test(alvo);
}

function contextoTelaTemDadosUteis(
  contextoTela: ContextoTelaAquiry | null | undefined,
): boolean {
  if (!contextoTela) return false;
  if (contextoTela.dados && typeof contextoTela.dados === "object") {
    const chaves = Object.keys(contextoTela.dados);
    if (chaves.length > 0) return true;
  }
  if (contextoTela.observacoes && contextoTela.observacoes.length > 0) return true;
  if (contextoTela.titulo || contextoTela.descricao) return true;
  return false;
}

export function classificarEstrategiaRespostaAquiry(
  entrada: EntradaClassificacao,
): ResultadoClassificacaoEstrategia {
  const perguntaNormalizada = normalizar(entrada.pergunta ?? "");

  // 1) Busca externa tem precedência: se a pergunta exige dado atualizado ou
  //    fonte externa, mesmo com contexto de tela o Varadouro não substitui.
  const termoExterno = detectarBuscaExterna(perguntaNormalizada);
  if (termoExterno) {
    return {
      estrategia: "busca_externa",
      motivo: `Pergunta depende de fonte externa ou informação atualizada (termo detectado: "${termoExterno}").`,
      requerBuscaExterna: true,
    };
  }

  const temDadosTela = contextoTelaTemDadosUteis(entrada.contextoTela);
  const mencionaTela = REGEX_MENCAO_TELA.test(perguntaNormalizada);
  const intencaoOperacional = REGEX_INTENCAO_OPERACIONAL.test(perguntaNormalizada);

  // 1.b) Pergunta setorial (educação, saúde, gastos) combinada com ano/exercício
  //      ou referência a municípios, quando a tela atual não cobre o setor:
  //      depende de base/fonte específica não disponível na tela.
  const setor = detectarSetor(perguntaNormalizada);
  if (setor) {
    const cobreSetor = contextoTelaCobreSetor(entrada.contextoTela, setor);
    const exigeBaseEspecifica =
      temAnoOuExercicio(perguntaNormalizada) || mencionaMunicipios(perguntaNormalizada);
    if (exigeBaseEspecifica && !cobreSetor) {
      const rotuloSetor =
        setor === "educacao"
          ? "educação"
          : setor === "saude"
            ? "saúde"
            : "gastos/despesas";
      return {
        estrategia: "busca_externa",
        motivo: `Pergunta sobre ${rotuloSetor} com recorte por ano/municípios exige base setorial específica não disponível na tela atual.`,
        requerBuscaExterna: true,
      };
    }
    // Quando a tela cobre o setor, segue para o ramo varadouro abaixo.
  }

  // 2) Varadouro: análise contextual ativa, menção explícita à tela ou intenção
  //    operacional sobre contexto da tela disponível.
  if (entrada.usouAnaliseContextual) {
    return {
      estrategia: "varadouro",
      motivo: "Análise contextual determinística do Varadouro gerada para esta pergunta.",
      requerBuscaExterna: false,
    };
  }

  if (mencionaTela && (temDadosTela || entrada.contextoPagina)) {
    return {
      estrategia: "varadouro",
      motivo: "Pergunta menciona explicitamente a tela/painel atual e há contexto interno disponível.",
      requerBuscaExterna: false,
    };
  }

  if (intencaoOperacional && temDadosTela) {
    return {
      estrategia: "varadouro",
      motivo: "Pergunta sobre prioridade/risco/indicador com dados de tela disponíveis.",
      requerBuscaExterna: false,
    };
  }

  if (temDadosTela && mencionaTela) {
    return {
      estrategia: "varadouro",
      motivo: "Contexto da tela atual cobre a pergunta.",
      requerBuscaExterna: false,
    };
  }

  // 3) Caso padrão: orientação geral institucional.
  return {
    estrategia: "conhecimento_geral",
    motivo: "Pergunta conceitual, metodológica ou sem dependência de contexto específico.",
    requerBuscaExterna: false,
  };
}
