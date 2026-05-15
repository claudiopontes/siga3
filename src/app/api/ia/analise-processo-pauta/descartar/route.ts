import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { analiseId?: unknown; motivo?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const analiseId = Number(body.analiseId);
  if (!body.analiseId || isNaN(analiseId)) {
    return NextResponse.json({ error: "Parâmetro analiseId ausente ou inválido." }, { status: 400 });
  }

  const motivo = typeof body.motivo === "string" ? body.motivo.trim().slice(0, 500) : null;

  try {
    interface UpdateRow { id: number }
    const rows = await dbQuery<UpdateRow>(
      `UPDATE public.ia_analise_processo_pauta
       SET descartado      = true,
           descartado_em   = now(),
           motivo_descarte = $2
       WHERE id = $1 AND descartado = false
       RETURNING id`,
      [analiseId, motivo],
    );

    if (!rows.length) {
      return NextResponse.json(
        { error: "Análise não encontrada ou já descartada." },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, analise_id: analiseId });
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : "Erro interno.";
    console.error("[api/ia/analise-processo-pauta/descartar]", mensagem);
    return NextResponse.json({ error: mensagem }, { status: 500 });
  }
}
