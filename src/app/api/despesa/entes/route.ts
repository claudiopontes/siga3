import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const sql = `
    SELECT DISTINCT
      de.id_ente,
      de.nome AS nome_ente
    FROM public.dim_ente de
    INNER JOIN mart.despesa_resumo dr ON dr.id_entidade IN (
      SELECT id_entidade FROM public.dim_entidade WHERE id_ente = de.id_ente
    )
    ORDER BY de.nome
  `;
  try {
    const rows = await dbQuery<{ id_ente: number; nome_ente: string }>(sql);
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[api/despesa/entes]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
