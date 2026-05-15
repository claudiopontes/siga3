import { NextRequest, NextResponse } from "next/server";
import { montarRelatorioResumoPauta } from "@/lib/ia/relatorios/montarRelatorioResumoPauta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sessaoId = req.nextUrl.searchParams.get("sessaoId");

  if (!sessaoId || isNaN(Number(sessaoId))) {
    return NextResponse.json({ error: "Parâmetro sessaoId ausente ou inválido." }, { status: 400 });
  }

  try {
    const resultado = await montarRelatorioResumoPauta({ sessaoId });
    return NextResponse.json(resultado);
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    const mensagem = err instanceof Error ? err.message : "Erro ao montar relatório.";
    console.error("[api/ia/relatorio-resumo-pauta]", mensagem);
    return NextResponse.json({ error: mensagem }, { status });
  }
}
