import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const sql = `
    SELECT competencia, ano, mes
      FROM folha.dim_tempo dt
     WHERE EXISTS (
       SELECT 1 FROM folha.fato_contracheque fc WHERE fc.competencia = dt.competencia
     )
     ORDER BY ano DESC, mes DESC
  `;
  try {
    const rows = await dbQuery<{ competencia: string; ano: number; mes: number }>(sql);
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[api/folha/competencias]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
