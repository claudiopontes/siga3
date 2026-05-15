import { NextRequest, NextResponse } from "next/server";
import { executarAnaliseProcessoPauta } from "@/lib/ia/executarAnaliseProcessoPauta";

export const runtime = "nodejs";

// Análise individual de processo por IA — somente acionada por botão do usuário.
export async function POST(req: NextRequest) {
  let processoId: number;

  try {
    const body = await req.json();
    processoId = Number(body?.processoId);
    if (!processoId || isNaN(processoId)) {
      return NextResponse.json({ error: "processoId inválido." }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  try {
    const resultado = await executarAnaliseProcessoPauta(processoId);
    return NextResponse.json(resultado);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ia/analisar-processo-pauta]", msg);
    return NextResponse.json({ error: "Erro ao executar análise IA.", detalhe: msg }, { status: 500 });
  }
}
