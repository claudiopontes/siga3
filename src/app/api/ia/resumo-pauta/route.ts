import { NextRequest, NextResponse } from "next/server";
import { chamarAzureOpenAI } from "@/lib/ia/azureOpenAI";
import { instrucaoBaseGabinete } from "@/lib/ia/modelos/baseGabinete";
import { modeloResumoPauta } from "@/lib/ia/modelos/resumoPauta";
import { buscarFontesRelevantes } from "@/lib/ia/fontes/buscarFontesRelevantes";
import { compactarProcessoParaIA } from "@/lib/ia/tokenBudget";
import type { ResumoPautaInput, ResumoPautaOutput } from "@/lib/ia/tipos";

export const runtime = "nodejs";

const LIMITE_PROCESSOS = 30;

export async function POST(req: NextRequest) {
  let body: ResumoPautaInput;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  if (!body?.processos) {
    return NextResponse.json({ error: "Campo 'processos' obrigatório." }, { status: 400 });
  }

  if (!Array.isArray(body.processos)) {
    return NextResponse.json({ error: "Campo 'processos' deve ser um array." }, { status: 400 });
  }

  if (body.processos.length === 0) {
    return NextResponse.json({ error: "A lista de processos não pode estar vazia." }, { status: 400 });
  }

  if (body.processos.length > LIMITE_PROCESSOS) {
    return NextResponse.json(
      { error: `Limite de ${LIMITE_PROCESSOS} processos por chamada excedido. Envie no máximo ${LIMITE_PROCESSOS} processos.` },
      { status: 400 }
    );
  }

  // Compactar processos para reduzir custo com tokens.
  const processosCompactos = body.processos.map(compactarProcessoParaIA);

  // Concatenar campos relevantes para seleção de fontes institucionais.
  const textoParaBusca = processosCompactos
    .map((p) => [p.classe, p.assunto, p.objeto, p.situacao, p.indicacao_voto, ...(p.alertas_varadouro ?? [])].join(" "))
    .join(" ");

  const fontesRelevantes = buscarFontesRelevantes(textoParaBusca, 5);

  const fontesTrecho = fontesRelevantes
    .map((f) => `[${f.titulo}] ${f.resumo}`)
    .join("\n");

  const dadosPauta = JSON.stringify(
    { processos: processosCompactos, contexto_adicional: body.contexto_adicional },
    null,
    2
  );

  const systemPrompt = [
    instrucaoBaseGabinete,
    "",
    "=== ROTINA: RESUMO DE PAUTA ===",
    modeloResumoPauta.instrucaoEspecifica,
    "",
    "=== FONTES INSTITUCIONAIS RELEVANTES ===",
    fontesTrecho,
    "",
    "=== SCHEMA OBRIGATÓRIO DE SAÍDA (JSON) ===",
    modeloResumoPauta.schemaObrigatorio,
  ].join("\n");

  const userPrompt = [
    "Gere o resumo de pauta para os seguintes processos:",
    "",
    dadosPauta,
    "",
    `O campo "aviso_revisao" deve ser exatamente: "${modeloResumoPauta.avisoRevisao}"`,
  ].join("\n");

  let conteudoBruto: string;

  try {
    conteudoBruto = await chamarAzureOpenAI({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      maxCompletionTokens: 12000,
      jsonMode: true,
    });
  } catch (err) {
    console.error("[api/ia/resumo-pauta] erro na chamada Azure:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erro ao chamar o serviço de IA." }, { status: 502 });
  }

  if (!conteudoBruto) {
    return NextResponse.json({ error: "Resposta vazia do serviço de IA." }, { status: 502 });
  }

  let resultado: ResumoPautaOutput;

  try {
    resultado = JSON.parse(conteudoBruto);
  } catch {
    const raw = conteudoBruto.slice(0, 2000);
    console.error("[api/ia/resumo-pauta] JSON inválido na resposta:", raw);
    return NextResponse.json(
      { error: "Resposta da IA não é JSON válido.", raw },
      { status: 502 }
    );
  }

  return NextResponse.json(resultado);
}
