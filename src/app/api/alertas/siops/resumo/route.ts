import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const rows = await dbQuery(`
      SELECT area, fonte, ano, periodo,
             total_alertas, total_criticos, total_altos,
             total_municipios_afetados, atualizado_em
      FROM mart.siops_resumo_home
      ORDER BY ano DESC, periodo DESC
      LIMIT 1
    `, []);
    return NextResponse.json(rows[0] ?? null);
  } catch (err) {
    console.error("[api/alertas/siops/resumo]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
