import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { relatorioId?: unknown; motivo?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const relatorioId = Number(body.relatorioId);
  if (!body.relatorioId || isNaN(relatorioId)) {
    return NextResponse.json({ error: "Parâmetro relatorioId ausente ou inválido." }, { status: 400 });
  }

  const motivo = typeof body.motivo === "string" ? body.motivo.trim().slice(0, 500) : null;

  try {
    interface UpdateRow { id: number }
    const rows = await dbQuery<UpdateRow>(
      `UPDATE public.ia_relatorio_resumo_pauta
       SET descartado      = true,
           descartado_em   = now(),
           motivo_descarte = $2
       WHERE id = $1 AND descartado = false
       RETURNING id`,
      [relatorioId, motivo],
    );

    if (!rows.length) {
      return NextResponse.json(
        { error: "Relatório não encontrado ou já descartado." },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, relatorio_id: relatorioId });
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : "Erro interno.";
    console.error("[api/ia/relatorio-resumo-pauta/descartar]", mensagem);
    return NextResponse.json({ error: mensagem }, { status: 500 });
  }
}
