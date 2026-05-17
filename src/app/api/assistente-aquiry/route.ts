import { NextRequest, NextResponse } from "next/server";
import { chamarAzureOpenAI } from "@/lib/ia/azureOpenAI";
import { analisarIntencaoAquiry } from "@/lib/aquiry/analisarIntencaoAquiry";

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
- Pergunte ao usuário quais dados concretos estão disponíveis para aprofundar a análise.

Prioridades ao responder:
1. Onde o gabinete deve olhar primeiro? (risco, materialidade, urgência)
2. Qualidade e confiabilidade dos dados apresentados.
3. Controle externo: legalidade, regularidade, economicidade.
4. Orientação metodológica sobre como interpretar o painel ou a informação.`;

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

  const conteudoUsuario = `${blocoAnalise}${blocoContextoTela}${blocoContextoPagina}${pergunta.trim()}`;

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: SYSTEM_PROMPT },
    ...historicoValidado.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: conteudoUsuario },
  ];

  try {
    const resposta = await chamarAzureOpenAI({
      messages,
      temperature: 0.4,
      maxCompletionTokens: 1024,
    });

    const usouContextoTela = contextoTela !== null;
    const usouContextoRota = blocoContextoPagina.length > 0;
    const usouAnaliseContextual = analise.respostaDeterministica !== undefined;
    const bases: string[] = [];
    if (usouContextoTela) bases.push("Contexto da tela atual");
    if (usouContextoRota) bases.push("Contexto da rota");
    if (usouAnaliseContextual) bases.push("Análise contextual do Varadouro");
    bases.push("Orientação geral da IA");

    const origem = {
      usouContextoTela,
      usouContextoRota,
      usouConhecimentoGeral: true,
      usouAnaliseContextual,
      bases,
    };

    return NextResponse.json({ resposta, origem });
  } catch (err) {
    console.error("[api/assistente-aquiry]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "O assistente não está disponível no momento. Tente novamente em instantes." },
      { status: 502 }
    );
  }
}
