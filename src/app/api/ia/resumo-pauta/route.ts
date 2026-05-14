import { NextRequest, NextResponse } from "next/server";
import { executarResumoPauta } from "@/lib/ia/executarResumoPauta";
import type { ResumoPautaInput } from "@/lib/ia/tipos";

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
      { status: 400 },
    );
  }

  try {
    const resultado = await executarResumoPauta(body);
    return NextResponse.json(resultado);
  } catch (err) {
    console.error("[api/ia/resumo-pauta]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erro ao gerar resumo de pauta." }, { status: 502 });
  }
}
