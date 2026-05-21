import { NextRequest, NextResponse } from "next/server";
import { chamarAzureOpenAI } from "@/lib/ia/azureOpenAI";
import { analisarIntencaoAquiry } from "@/lib/aquiry/analisarIntencaoAquiry";
import { classificarEstrategiaRespostaAquiry } from "@/lib/aquiry/classificarEstrategiaRespostaAquiry";
import {
  buscarFontesExternasAquiry,
  classificarExigenciaFonteExterna,
  type RespostaBuscaExternaAquiry,
} from "@/lib/aquiry/buscaExternaAquiry";
import { buscarBaseConhecimentoAquiry } from "@/lib/aquiry/baseConhecimentoAquiry";
import {
  registrarEventoAquiry,
  sanitizarCodigoErro,
} from "@/lib/aquiry/auditoriaAquiry";
import type {
  DocumentoBaseAquiry,
  FonteExternaAquiry,
} from "@/lib/aquiry/tiposContextoAquiry";

export const runtime = "nodejs";

const PERGUNTA_MAX_CHARS = 2000;
const HISTORICO_MAX_MSGS = 20;

// Limites de segurança para o contexto real da tela
const CONTEXTO_TELA_MAX_JSON_CHARS = 3000;
const CONTEXTO_TELA_MAX_DADOS_CHAVES = 20;
const CONTEXTO_TELA_MAX_STRING_CHARS = 400;
const CONTEXTO_TELA_MAX_OBSERVACOES = 5;
const CONTEXTO_TELA_MAX_FONTES = 5;

type MensagemHistorico = {
  role: "user" | "assistant";
  content: string;
};

type ContextoPaginaRequisicao = {
  tipoPagina?: string;
  titulo?: string;
  descricao?: string;
  rota?: string;
};

type ContextoTelaRequisicao = {
  titulo?: string;
  descricao?: string;
  dados?: Record<string, unknown>;
  observacoes?: string[];
  fontes?: string[];
};

// Contrato completo — campos futuros reservados mas ignorados nesta fase
type CorpoRequisicao = {
  pergunta: string;
  historico?: MensagemHistorico[];
  paginaAtual?: string;
  contextoPagina?: ContextoPaginaRequisicao;
  contextoTela?: ContextoTelaRequisicao;
  modo?: unknown;
  fontes?: unknown;
};

const ROLES_VALIDOS = new Set(["user", "assistant"]);

const SYSTEM_PROMPT = `Você é o Assistente Aquiry, inteligência de apoio ao gabinete no sistema Varadouro Digital Aquiry do Tribunal de Contas do Estado do Acre (TCE-AC).

Identidade e papel:
- Apoie o gabinete na compreensão de telas, painéis, alertas, processos, pautas, riscos e materialidade.
- Responda de forma institucional, clara, objetiva e útil.
- Nesta fase piloto você pode receber até três tipos de contexto, nesta ordem de confiança:
  1. Análise contextual preliminar: gerada deterministicamente pelo sistema com base nos dados da tela — use como base, não contradiga.
  2. Contexto da tela: resumo dos dados já exibidos na tela, enviado pela própria página.
  3. Contexto de página: inferido apenas da rota do sistema — sem acesso a dados reais.
- Quando o bloco [Base documental do Aquiry] estiver presente, use-o como contexto institucional/metodológico (diretrizes do próprio Aquiry, glossário, critérios de risco/materialidade, resumos orientativos de normas e guias de fontes oficiais). Esses textos são versionados no projeto, **não são norma oficial nem decisão técnica**, e não devem ser apresentados como tal. Para análise formal, recomende sempre validar na fonte original.
- Quando a análise contextual preliminar estiver presente: use-a como ponto de partida. Você pode melhorar a redação, aprofundar a orientação metodológica e contextualizar o controle externo. Não a transforme em conclusão definitiva e não contradiga os dados apresentados.
- Quando contexto real da tela estiver disponível, use-o para orientar respostas mais específicas. Deixe claro que está se baseando nos dados exibidos na tela.
- Nunca afirme ter consultado banco de dados, documentos, processos ou sistemas externos que não tenham sido explicitamente apresentados no contexto.
- Diferencie sempre: dado da tela (o que está visível), inferência (o que se pode deduzir) e orientação geral (metodologia de controle externo).

Restrições absolutas:
- Não invente números, valores, datas, responsáveis, decisões, votos, pareceres ou informações processuais além do que foi apresentado.
- Não gere minuta de voto, parecer conclusivo ou decisão administrativa.
- Não atribua risco específico a partir de dados que não foram apresentados na conversa ou no contexto da tela.
- Não cite acórdãos, normas ou dispositivos legais específicos sem base expressa na pergunta.
- Não finja ter consultado nenhum sistema, documento ou base de dados além do contexto fornecido.

Quando não houver contexto suficiente:
- Deixe claro que está respondendo com orientação geral e metodológica.
- Explique o raciocínio de controle externo aplicável ao tema.
- Não peça ao usuário para "enviar a tela" ou "colar os dados aqui": o sistema já encaminha o contexto disponível automaticamente. Em vez disso, indique qual painel/base/fonte oficial é o próximo passo correto.

Tom e tamanho da resposta:
- Use linguagem executiva, direta, adequada ao gabinete. Frases curtas. Evite preâmbulos.
- Quando a limitação for clara (sem dado na tela, dado externo necessário), seja sucinto: declare a limitação, indique a base correta, dê o roteiro de análise — sem alongar.
- Não encerre com "se quiser, posso..." quando o próximo passo correto for consultar painel, base ou fonte oficial: apenas aponte o caminho.

Formato da resposta (texto plano — o painel NÃO renderiza Markdown):
- Não use Markdown. Nada de asteriscos (** ou *), nada de # para títulos, nada de _ para itálico, nada de crases para código.
- Para destacar uma palavra, escreva-a em CAIXA ALTA com moderação ou apenas reescreva a frase de forma clara.
- Para listas, use o caractere "•" no início (ex.: "• Item ..."). Não use "*", "-" ou "1)" como marcadores Markdown.
- Use parágrafos separados por linha em branco; subtítulos opcionais terminam com ":" (ex.: "Prioridade:", "Roteiro:", "Limite:").

Prioridades ao responder:
1. Onde o gabinete deve olhar primeiro? (risco, materialidade, urgência)
2. Qualidade e confiabilidade dos dados apresentados.
3. Controle externo: legalidade, regularidade, economicidade.
4. Orientação metodológica sobre como interpretar o painel ou a informação.

Estratégia de resposta:
- O sistema classifica cada pergunta em uma de três estratégias e informa qual usar no bloco "[Estratégia de resposta]" enviado junto com a pergunta. Respeite essa estratégia:
  • "varadouro": priorize o contexto da tela e a análise contextual disponíveis. Não invente dados ausentes. Deixe claro quando estiver usando os dados visíveis na tela.
  • "conhecimento_geral": responda como orientação institucional geral (controle externo, gabinete, risco, materialidade, qualidade dos dados, priorização). Deixe claro, quando adequado, que não está usando dado específico do Varadouro.
  • "busca_externa": a pergunta depende de informação atualizada ou fonte externa.
     – Se o sistema enviar um bloco "[Fontes externas encontradas]", use APENAS o que aparece nesse bloco. Não invente datas, normas, municípios, percentuais ou valores que não estejam nas fontes. Diferencie claramente "dado encontrado nas fontes" de "orientação geral metodológica". Não apresente fonte externa como dado interno do Varadouro. Se as fontes forem insuficientes para responder com segurança, diga isso explicitamente.
     – Se NÃO houver bloco "[Fontes externas encontradas]", NÃO finja ter pesquisado. Diga, com franqueza, que esta versão/configuração não realizou busca externa, ofereça orientação geral segura quando possível e recomende validação em fonte oficial.
- Nunca afirme que consultou portal, API, norma vigente, jurisprudência recente ou notícia se não houver evidência expressa de tal consulta no contexto recebido.`;

function validarHistorico(historico: unknown): MensagemHistorico[] {
  if (!Array.isArray(historico)) return [];
  return historico
    .filter(
      (m): m is MensagemHistorico =>
        m !== null &&
        typeof m === "object" &&
        ROLES_VALIDOS.has((m as MensagemHistorico).role) &&
        typeof (m as MensagemHistorico).content === "string" &&
        (m as MensagemHistorico).content.trim().length > 0
    )
    .slice(-HISTORICO_MAX_MSGS);
}

function validarContextoPagina(raw: unknown): ContextoPaginaRequisicao | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  return {
    tipoPagina: typeof obj.tipoPagina === "string" ? obj.tipoPagina.slice(0, 50) : undefined,
    titulo: typeof obj.titulo === "string" ? obj.titulo.slice(0, 100) : undefined,
    descricao: typeof obj.descricao === "string" ? obj.descricao.slice(0, 300) : undefined,
    rota: typeof obj.rota === "string" ? obj.rota.slice(0, 200) : undefined,
  };
}

function sanitizarValorDados(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean" || typeof v === "number") return v;
  if (typeof v === "string") return v.slice(0, CONTEXTO_TELA_MAX_STRING_CHARS);
  if (Array.isArray(v)) return v.slice(0, 10).map(sanitizarValorDados);
  // Objetos aninhados: serializa para string para evitar profundidade excessiva
  try { return String(JSON.stringify(v)).slice(0, CONTEXTO_TELA_MAX_STRING_CHARS); }
  catch { return null; }
}

function validarContextoTela(raw: unknown): ContextoTelaRequisicao | null {
  if (!raw || typeof raw !== "object") return null;

  // Limite de tamanho total antes de processar
  try {
    const tamanho = JSON.stringify(raw).length;
    if (tamanho > CONTEXTO_TELA_MAX_JSON_CHARS) return null;
  } catch {
    return null;
  }

  const obj = raw as Record<string, unknown>;

  const titulo =
    typeof obj.titulo === "string" ? obj.titulo.slice(0, 150) : undefined;
  const descricao =
    typeof obj.descricao === "string" ? obj.descricao.slice(0, 400) : undefined;

  let dados: Record<string, unknown> | undefined;
  if (obj.dados && typeof obj.dados === "object" && !Array.isArray(obj.dados)) {
    const dadosBrutos = obj.dados as Record<string, unknown>;
    const chaves = Object.keys(dadosBrutos).slice(0, CONTEXTO_TELA_MAX_DADOS_CHAVES);
    dados = Object.fromEntries(
      chaves.map((k) => [k.slice(0, 60), sanitizarValorDados(dadosBrutos[k])])
    );
  }

  const observacoes = Array.isArray(obj.observacoes)
    ? obj.observacoes
        .filter((o): o is string => typeof o === "string")
        .slice(0, CONTEXTO_TELA_MAX_OBSERVACOES)
        .map((o) => o.slice(0, 300))
    : undefined;

  const fontes = Array.isArray(obj.fontes)
    ? obj.fontes
        .filter((f): f is string => typeof f === "string")
        .slice(0, CONTEXTO_TELA_MAX_FONTES)
        .map((f) => f.slice(0, 100))
    : undefined;

  if (!titulo && !descricao && !dados && !observacoes) return null;

  return { titulo, descricao, dados, observacoes, fontes };
}

// Remove marcações Markdown que o modelo eventualmente emite — o painel
// renderiza texto plano, então asteriscos/sublinhados/cercas vazariam à vista.
// Mantém o conteúdo, retira apenas a sintaxe de formatação.
function removerMarkdown(texto: string): string {
  if (!texto) return texto;
  let s = texto;
  // ```bloco``` ou ```linguagem\nbloco```
  s = s.replace(/```[a-z]*\n?([\s\S]*?)```/gi, "$1");
  // **negrito** / __negrito__
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = s.replace(/__([^_]+)__/g, "$1");
  // *itálico* / _itálico_  (cuidado: não engolir asteriscos isolados em frases)
  s = s.replace(/(^|[\s(])\*([^*\n]+?)\*(?=[\s).,;:!?]|$)/g, "$1$2");
  s = s.replace(/(^|[\s(])_([^_\n]+?)_(?=[\s).,;:!?]|$)/g, "$1$2");
  // `código inline`
  s = s.replace(/`([^`\n]+)`/g, "$1");
  // Cabeçalhos: "# Título" → "Título"
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  // Marcadores de lista no início da linha: "*", "-" ou "+" → "•"
  s = s.replace(/^(\s*)[*\-+]\s+/gm, "$1• ");
  // Marcadores numerados "1) " mantemos como estão.
  // Espaços excedentes ao final de linha.
  s = s.replace(/[ \t]+$/gm, "");
  return s;
}

function montarBlocoContextoPagina(
  paginaAtual: string | undefined,
  contextoPagina: ContextoPaginaRequisicao | undefined
): string {
  const temContexto = contextoPagina?.titulo || contextoPagina?.tipoPagina || paginaAtual;
  if (!temContexto) return "";

  const linhas: string[] = [
    "[Contexto da tela — inferido da rota, sem acesso aos dados visíveis]",
  ];
  if (contextoPagina?.titulo) linhas.push(`Tela: ${contextoPagina.titulo}`);
  if (contextoPagina?.tipoPagina) linhas.push(`Tipo: ${contextoPagina.tipoPagina}`);
  if (contextoPagina?.descricao) linhas.push(`Descrição: ${contextoPagina.descricao}`);
  const rota = contextoPagina?.rota ?? paginaAtual;
  if (rota) linhas.push(`Rota: ${rota}`);
  linhas.push(
    "Nota: o assistente não tem acesso aos valores, filtros ou registros específicos exibidos nesta tela."
  );

  return linhas.join("\n") + "\n\n";
}

function montarBlocoContextoTela(ctx: ContextoTelaRequisicao): string {
  const linhas: string[] = [
    "[Contexto real da tela — dados já exibidos na tela, enviados pela própria página]",
    "Nota: este contexto representa apenas dados disponíveis na tela atual, sem consulta adicional ao banco.",
  ];

  if (ctx.titulo) linhas.push(`Tela: ${ctx.titulo}`);
  if (ctx.descricao) linhas.push(`Descrição: ${ctx.descricao}`);

  if (ctx.dados && Object.keys(ctx.dados).length > 0) {
    linhas.push("Dados disponíveis na tela:");
    for (const [chave, valor] of Object.entries(ctx.dados)) {
      const valorStr = valor === null || valor === undefined
        ? "(não disponível)"
        : String(valor);
      linhas.push(`  - ${chave}: ${valorStr}`);
    }
  }

  if (ctx.fontes?.length) {
    linhas.push(`Fontes: ${ctx.fontes.join(", ")}`);
  }

  if (ctx.observacoes?.length) {
    linhas.push("Observações:");
    ctx.observacoes.forEach((o) => linhas.push(`  - ${o}`));
  }

  return linhas.join("\n") + "\n\n";
}

export async function POST(req: NextRequest) {
  const inicioRequisicao = Date.now();
  let corpo: CorpoRequisicao;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const {
    pergunta,
    historico,
    paginaAtual,
    contextoPagina: contextoPaginaRaw,
    contextoTela: contextoTelaRaw,
  } = corpo;

  if (!pergunta || typeof pergunta !== "string" || !pergunta.trim()) {
    return NextResponse.json({ error: "Pergunta não informada." }, { status: 400 });
  }

  if (pergunta.length > PERGUNTA_MAX_CHARS) {
    return NextResponse.json(
      { error: `Pergunta muito longa. Limite: ${PERGUNTA_MAX_CHARS} caracteres.` },
      { status: 400 }
    );
  }

  // Auditoria: evento "pergunta" — apenas metadados, sem conteúdo.
  const rotaAudit =
    typeof paginaAtual === "string"
      ? paginaAtual
      : typeof (contextoPaginaRaw as { rota?: unknown })?.rota === "string"
        ? ((contextoPaginaRaw as { rota: string }).rota)
        : undefined;
  const tipoPaginaAudit =
    typeof (contextoPaginaRaw as { tipoPagina?: unknown })?.tipoPagina === "string"
      ? ((contextoPaginaRaw as { tipoPagina: string }).tipoPagina)
      : undefined;
  registrarEventoAquiry({
    tipo: "pergunta",
    timestamp: new Date().toISOString(),
    rota: rotaAudit,
    tipoPagina: tipoPaginaAudit,
    tamanhoPergunta: pergunta.trim().length,
  });

  const historicoValidado = validarHistorico(historico);
  const contextoPagina = validarContextoPagina(contextoPaginaRaw);
  const contextoTela = validarContextoTela(contextoTelaRaw);

  const blocoContextoPagina = montarBlocoContextoPagina(
    typeof paginaAtual === "string" ? paginaAtual : undefined,
    contextoPagina
  );

  const blocoContextoTela = contextoTela ? montarBlocoContextoTela(contextoTela) : "";

  const analise = analisarIntencaoAquiry({
    pergunta: pergunta.trim(),
    contextoTela: contextoTela,
    contextoPagina: contextoPagina ?? undefined,
  });

  let blocoAnalise = "";
  if (analise.respostaDeterministica) {
    blocoAnalise = [
      "[Análise contextual preliminar — gerada deterministicamente pelo sistema com base nos dados visíveis na tela]",
      analise.respostaDeterministica,
      "",
      "Instruções para o assistente:",
      "- Use esta análise como base factual. Não contradiga os dados acima.",
      "- Você pode melhorar a redação, adicionar orientação metodológica de controle externo e contextualizar.",
      "- Não transforme orientações preliminares em conclusões definitivas.",
      "- Deixe claro ao usuário que está usando dados visíveis na tela — não dados consultados em banco.",
      "- Se os dados forem insuficientes para responder com segurança, diga isso explicitamente.",
      "",
    ].join("\n");
  }

  const classificacao = classificarEstrategiaRespostaAquiry({
    pergunta: pergunta.trim(),
    contextoTela,
    contextoPagina: contextoPagina ?? null,
    usouAnaliseContextual: analise.respostaDeterministica !== undefined,
  });

  // Limite de fontes enviadas para a IA (mais agressivo que o limite da busca).
  const MAX_FONTES_PARA_IA = 3;

  let buscaExterna: RespostaBuscaExternaAquiry | null = null;
  if (classificacao.estrategia === "busca_externa") {
    buscaExterna = await buscarFontesExternasAquiry(pergunta.trim());
  }

  // Base documental versionada do Aquiry — consulta determinística por
  // palavras-chave, leve, não substitui contexto da tela nem pesquisa externa.
  const baseDocumental = buscarBaseConhecimentoAquiry(pergunta.trim());
  const usouBaseDocumental = baseDocumental.encontrou && baseDocumental.trechos.length > 0;
  const blocoBaseDocumental = usouBaseDocumental
    ? (() => {
        const linhas: string[] = [
          "[Base documental do Aquiry — material orientativo versionado no projeto, NÃO substitui norma oficial nem decisão técnica]",
          "Use estes trechos como contexto institucional/metodológico. Não os apresente como decisão, voto ou interpretação oficial. Para análise formal, recomende validar na fonte original.",
          "",
        ];
        baseDocumental.trechos.forEach((t, i) => {
          linhas.push(`Documento ${i + 1}: ${t.titulo}`);
          if (t.area) linhas.push(`  Área: ${t.area}`);
          linhas.push(`  Caminho: ${t.caminho}`);
          linhas.push(`  Conteúdo:\n${t.conteudo}`);
          linhas.push("");
        });
        return linhas.join("\n") + "\n";
      })()
    : "";
  const fontesParaIA = (buscaExterna?.resultados ?? []).slice(0, MAX_FONTES_PARA_IA);
  const buscaRealizadaComSucesso =
    buscaExterna?.executada === true && fontesParaIA.length > 0;

  const aderencia = buscaExterna?.aderencia ?? undefined;
  const observacaoAderencia = buscaExterna?.observacaoAderencia ?? undefined;
  const pesquisaSuficiente = buscaExterna?.pesquisaSuficiente ?? undefined;
  const exigeFonteEstruturada = buscaExterna?.exigeFonteEstruturada ?? false;
  const fonteEstruturadaEncontrada = buscaExterna?.fonteEstruturadaEncontrada ?? false;
  const fontesOficiaisEncontradas = buscaExterna?.fontesOficiaisEncontradas ?? false;
  const temFonteEstruturada = fontesParaIA.some((f) => f.tipoFonte === "estruturada");
  const temFonteOficialTextual = fontesParaIA.some(
    (f) => f.tipoFonte === "oficial_textual",
  );
  // Cenário: localizamos oficial aderente mas sem dado estruturado para o
  // recorte fiscal/setorial — IA não deve concluir números.
  const cenarioOficialSemEstruturada =
    buscaRealizadaComSucesso &&
    (aderencia === "alta" || aderencia === "media") &&
    temFonteOficialTextual &&
    !temFonteEstruturada;
  // Cenário: a pesquisa foi feita, mas não atende ao "nível de prova" exigido
  // pela pergunta (faltou fonte oficial e/ou faltou fonte estruturada).
  const pesquisaInsuficiente =
    buscaRealizadaComSucesso && pesquisaSuficiente === false;

  // Orientação de "próxima base correta" específica do setor detectado.
  // Evita citar DataSUS/SIOPS em pergunta de educação, e vice-versa. Quando
  // a busca não foi executada (sem provider configurado), ainda assim deriva
  // o setor da pergunta para manter a orientação coerente.
  const setorBusca =
    buscaExterna?.exigencia?.setor ??
    classificarExigenciaFonteExterna(pergunta.trim()).setor;
  const proximaBaseCorreta = (() => {
    if (setorBusca === "educacao") {
      return "SIOPE/FNDE para execução e aplicação em educação, SICONFI/RREO quando útil para conferência fiscal, e painel interno do Varadouro quando disponível";
    }
    if (setorBusca === "saude") {
      return "DataSUS e SIOPS para saúde, SICONFI/RREO quando útil para conferência fiscal, e painel interno do Varadouro quando disponível";
    }
    if (setorBusca === "fiscal") {
      return "SICONFI/RREO/RGF e Tesouro Nacional, e painel interno do Varadouro quando disponível";
    }
    if (setorBusca === "contratos") {
      return "Compras.gov, Portal da Transparência e painel interno do Varadouro quando disponível";
    }
    // geral ou indefinido: usa fórmula sem nomes setoriais cruzados
    return "a base oficial cabível ao tema e painel interno do Varadouro quando disponível";
  })();

  const blocoFontesExternas = buscaRealizadaComSucesso
    ? (() => {
        const linhas: string[] = [
          "[Fontes externas encontradas — use APENAS o que aparece aqui para afirmar fatos externos]",
          "Notas: o sistema executou uma busca externa controlada e selecionou os resultados abaixo. Não extrapole além do que está aqui. Se as fontes forem insuficientes, diga isso.",
        ];
        if (aderencia) {
          linhas.push(`Aderência das fontes ao recorte da pergunta: ${aderencia}.`);
        }
        if (observacaoAderencia) {
          linhas.push(`Observação sobre aderência: ${observacaoAderencia}`);
        }
        linhas.push(
          `Pesquisa externa suficiente para o recorte: ${pesquisaSuficiente === undefined ? "indefinido" : pesquisaSuficiente ? "sim" : "NÃO"}.`,
        );
        if (exigeFonteEstruturada) {
          linhas.push(
            `Fonte estruturada exigida: sim — fonte estruturada encontrada: ${fonteEstruturadaEncontrada ? "sim" : "NÃO"}.`,
          );
        }
        if (!fontesOficiaisEncontradas) {
          linhas.push("Atenção: nenhuma fonte oficial foi retornada para esta consulta.");
        }
        linhas.push("");
        fontesParaIA.forEach((f, i) => {
          linhas.push(`Fonte ${i + 1}: ${f.titulo}`);
          if (f.fonte) linhas.push(`  Origem: ${f.fonte}`);
          linhas.push(`  URL: ${f.url}`);
          if (f.tipoFonte) linhas.push(`  Tipo: ${f.tipoFonte}`);
          if (f.trecho) linhas.push(`  Trecho: ${f.trecho}`);
          linhas.push("");
        });
        return linhas.join("\n") + "\n";
      })()
    : "";

  const blocoEstrategia = (() => {
    const linhas: string[] = [
      "[Estratégia de resposta — definida pelo sistema]",
      `Estratégia: ${classificacao.estrategia}`,
      `Motivo: ${classificacao.motivo}`,
    ];
    if (classificacao.estrategia === "busca_externa") {
      if (buscaRealizadaComSucesso) {
        if (pesquisaInsuficiente) {
          linhas.push(
            `Orientação: a busca externa foi executada, MAS o conjunto de fontes retornado NÃO atende ao nível de prova exigido pela pergunta (faltou fonte oficial e/ou fonte estruturada — ${proximaBaseCorreta}, em formato de microdados, planilha, API ou consulta tabular). Responda de forma curta e executiva:`,
            "1) Afirme que a pesquisa externa foi realizada, mas NÃO retornou base estruturada oficial suficiente para consolidar o recorte fiscal/setorial pedido.",
            "2) Diga que as fontes encontradas são gerais ou secundárias — NÃO trazem execução por município, percentual aplicado, MDE, Fundeb ou situação de cumprimento.",
            "3) NÃO use portais jornalísticos como base principal. NÃO conclua situação municipal. NÃO classifique municípios como regulares, em risco ou irregulares com base nessas fontes. NÃO apresente dado genérico (CNM, orçamento estadual, notícia) como resposta ao recorte municipal.",
            `4) Indique nominalmente a base correta para a próxima etapa: ${proximaBaseCorreta} — preferindo a consulta/exportação estruturada.`,
            "5) Roteiro curto: ausência de envio, mínimo constitucional, materialidade, inconsistências, evolução.",
            "6) Não invente valores, normas ou municípios. Não encerre com 'se quiser, posso...'.",
          );
        } else if (cenarioOficialSemEstruturada) {
          linhas.push(
            "Orientação: a busca externa localizou fonte OFICIAL aderente (ex.: FNDE/SIOPE, Tesouro/SICONFI, IBGE, TCE/AC), mas os trechos retornados são textuais — sem dados tabulares, valores ou ranking municipal extraídos. Responda de forma curta e executiva:",
            "1) Afirme que foi localizada fonte oficial adequada para a análise.",
            "2) Diga que os resultados retornados NÃO trouxeram dados tabulares/numéricos por município suficientes para consolidar a resposta.",
            "3) NÃO conclua ranking, cumprimento ou descumprimento; NÃO atribua percentuais ou valores que não estejam no trecho.",
            `4) Indique como próxima etapa analítica: consultar/exportar a base estruturada da fonte oficial — ${proximaBaseCorreta}.`,
            "5) Apresente roteiro curto: ausência de envio, mínimo constitucional, materialidade, inconsistências, evolução.",
            "6) Não invente dados. Não encerre com 'se quiser, posso...'.",
          );
        } else if (aderencia === "baixa") {
          linhas.push(
            "Orientação: a busca externa foi executada e há um bloco [Fontes externas encontradas], MAS a aderência das fontes ao recorte da pergunta é BAIXA. Responda de forma curta e executiva:",
            "1) Afirme que a pesquisa externa foi realizada, mas as fontes encontradas NÃO respondem plenamente ao recorte solicitado (ex.: tratam de orçamento estadual agregado ou contexto geral, não de execução municipal específica).",
            "2) NÃO apresente os dados encontrados como resposta direta à pergunta. Use as fontes apenas como contexto limitado.",
            "3) NÃO conclua a situação dos municípios/jurisdicionados a partir dessas fontes.",
            `4) Indique nominalmente quais bases oficiais seriam necessárias: ${proximaBaseCorreta}.`,
            "5) Apresente roteiro curto de análise (ausência de envio, mínimo constitucional, materialidade, inconsistências, evolução).",
            "6) Não invente datas, normas, municípios, percentuais ou valores. Não encerre com 'se quiser, posso...'.",
          );
        } else {
          linhas.push(
            "Orientação: o sistema executou busca externa e o bloco [Fontes externas encontradas] está disponível. Responda de forma curta e executiva, baseando afirmações factuais apenas nas fontes listadas.",
            "1) Sintetize o que as fontes efetivamente trazem para a pergunta.",
            "2) Deixe explícito que está usando fontes externas (não dado interno do Varadouro).",
            "3) Aponte limitações: se as fontes não cobrirem o recorte (ex.: ano específico, município específico), diga isso.",
            "4) Complemente com roteiro analítico curto quando ajudar (ausência de dados, mínimo constitucional, materialidade, inconsistências, evolução).",
            "5) Não invente datas, normas, municípios, percentuais ou valores fora das fontes. Não encerre com 'se quiser, posso...'.",
          );
        }
      } else {
        linhas.push(
          "Orientação: esta versão/configuração do Assistente Aquiry NÃO executou busca externa. Responda de forma curta e executiva:",
          "1) Diga que a tela atual / base interna não contém esse dado.",
          `2) Diga que a análise depende de base setorial específica ou fonte oficial atualizada — cite a fonte cabível: ${proximaBaseCorreta}.`,
          "3) Apresente um roteiro curto de análise (ausência de dados, risco de mínimo constitucional quando aplicável, materialidade, inconsistências, evolução por período).",
          "4) Não invente a situação dos municípios. Não afirme ter consultado fonte externa. Não peça ao usuário para enviar a tela ou colar dados.",
          "5) Não encerre com 'se quiser, posso...': aponte o caminho e encerre.",
        );
      }
    } else if (classificacao.estrategia === "conhecimento_geral") {
      linhas.push(
        "Orientação: responda como orientação institucional geral. Deixe claro, quando adequado, que não está usando dado específico do Varadouro.",
      );
    } else {
      linhas.push(
        "Orientação: priorize o contexto da tela e a análise contextual. Não invente dados ausentes.",
      );
    }
    return linhas.join("\n") + "\n\n";
  })();

  const conteudoUsuario = `${blocoEstrategia}${blocoFontesExternas}${blocoBaseDocumental}${blocoAnalise}${blocoContextoTela}${blocoContextoPagina}${pergunta.trim()}`;

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: SYSTEM_PROMPT },
    ...historicoValidado.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: conteudoUsuario },
  ];

  try {
    // gpt-5.x é família de raciocínio: parte do orçamento de tokens é consumida
    // pela fase interna de thinking, então o limite precisa ser maior do que
    // o tamanho da resposta visível desejada. Quando há bloco de fontes
    // externas, o input também cresce — convém folgar mais.
    const maxTokens = buscaRealizadaComSucesso ? 8192 : 4096;
    const respostaBruta = await chamarAzureOpenAI({
      messages,
      temperature: 0.4,
      maxCompletionTokens: maxTokens,
    });
    // Saneamento defensivo: o painel renderiza texto plano, então qualquer
    // Markdown residual do modelo (** **, ##, ` `, * listas) seria exibido cru.
    const resposta = removerMarkdown(respostaBruta);

    // Presença vs. uso efetivo:
    // - `temContextoTela` indica que o frontend enviou contexto da tela.
    // - `usouContextoTela` (derivado abaixo) só será true quando o contexto
    //   foi efetivamente declarado como base da resposta (ramo "varadouro").
    const temContextoTela = contextoTela !== null;
    const usouContextoRota = blocoContextoPagina.length > 0;
    const usouAnaliseContextual = analise.respostaDeterministica !== undefined;
    const bases: string[] = [];

    if (classificacao.estrategia === "varadouro") {
      if (temContextoTela) bases.push("Contexto da tela atual");
      if (usouContextoRota) bases.push("Contexto da rota");
      if (usouAnaliseContextual) bases.push("Análise contextual do Varadouro");
      if (usouBaseDocumental) bases.push("Base documental do Aquiry");
      bases.push("Orientação geral da IA");
    } else if (classificacao.estrategia === "conhecimento_geral") {
      if (usouContextoRota) bases.push("Contexto da rota");
      if (usouBaseDocumental) bases.push("Base documental do Aquiry");
      bases.push("Orientação geral da IA");
    } else {
      // busca_externa
      if (buscaRealizadaComSucesso) {
        bases.push("Pesquisa externa realizada");
        if (pesquisaSuficiente === false) {
          bases.push("Fonte estruturada necessária");
        }
      } else {
        bases.push("Busca externa necessária");
      }
      if (usouBaseDocumental) bases.push("Base documental do Aquiry");
      bases.push("Orientação geral da IA");
    }

    const usouContextoTela = bases.includes("Contexto da tela atual");
    const usouConhecimentoGeral = bases.includes("Orientação geral da IA");
    const fontesExternas: FonteExternaAquiry[] | undefined = buscaRealizadaComSucesso
      ? fontesParaIA.map((f) => ({
          titulo: f.titulo,
          url: f.url,
          fonte: f.fonte,
          tipoFonte: f.tipoFonte,
        }))
      : undefined;
    const tipoFontesExternas = buscaRealizadaComSucesso
      ? Array.from(
          new Set(
            fontesParaIA
              .map((f) => f.tipoFonte)
              .filter((t): t is NonNullable<typeof t> => Boolean(t)),
          ),
        )
      : undefined;

    const origem = {
      usouContextoTela,
      usouContextoRota,
      usouAnaliseContextual,
      usouConhecimentoGeral,
      requerBuscaExterna: classificacao.requerBuscaExterna,
      usouPesquisaExterna: buscaRealizadaComSucesso,
      fontesExternas,
      aderenciaFontesExternas: buscaRealizadaComSucesso ? aderencia : undefined,
      observacaoAderenciaFontes: buscaRealizadaComSucesso ? observacaoAderencia : undefined,
      tipoFontesExternas,
      pesquisaExternaSuficiente: buscaRealizadaComSucesso ? pesquisaSuficiente : undefined,
      exigeFonteEstruturada: buscaRealizadaComSucesso ? exigeFonteEstruturada : undefined,
      fonteEstruturadaEncontrada: buscaRealizadaComSucesso ? fonteEstruturadaEncontrada : undefined,
      fontesOficiaisEncontradas: buscaRealizadaComSucesso ? fontesOficiaisEncontradas : undefined,
      usouBaseDocumental,
      documentosBase: usouBaseDocumental
        ? (baseDocumental.trechos.map((t) => ({
            titulo: t.titulo,
            area: t.area,
            caminho: t.caminho,
          })) as DocumentoBaseAquiry[])
        : undefined,
      estrategia: classificacao.estrategia,
      bases,
    };

    registrarEventoAquiry({
      tipo: "resposta",
      timestamp: new Date().toISOString(),
      rota: rotaAudit,
      tipoPagina: tipoPaginaAudit,
      estrategia: classificacao.estrategia,
      bases,
      usouContextoTela,
      usouAnaliseContextual,
      usouBaseDocumental,
      usouPesquisaExterna: buscaRealizadaComSucesso,
      pesquisaExternaSuficiente: buscaRealizadaComSucesso ? pesquisaSuficiente : undefined,
      exigeFonteEstruturada: buscaRealizadaComSucesso ? exigeFonteEstruturada : undefined,
      fonteEstruturadaEncontrada: buscaRealizadaComSucesso ? fonteEstruturadaEncontrada : undefined,
      fontesOficiaisEncontradas: buscaRealizadaComSucesso ? fontesOficiaisEncontradas : undefined,
      tamanhoResposta: typeof resposta === "string" ? resposta.length : undefined,
      tempoRespostaMs: Date.now() - inicioRequisicao,
    });

    return NextResponse.json({ resposta, origem });
  } catch (err) {
    console.error("[api/assistente-aquiry]", err instanceof Error ? err.message : err);
    registrarEventoAquiry({
      tipo: "erro",
      timestamp: new Date().toISOString(),
      rota: rotaAudit,
      tipoPagina: tipoPaginaAudit,
      erroCodigo: sanitizarCodigoErro(err instanceof Error ? err.name : "erro"),
      tempoRespostaMs: Date.now() - inicioRequisicao,
    });
    return NextResponse.json(
      { error: "O assistente não está disponível no momento. Tente novamente em instantes." },
      { status: 502 }
    );
  }
}
