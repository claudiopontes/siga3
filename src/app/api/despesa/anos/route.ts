import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const sql = `
    SELECT DISTINCT ano_remessa AS ano
    FROM mart.despesa_resumo
    WHERE ano_remessa IS NOT NULL
    ORDER BY ano DESC
  `;
  try {
    const rows = await dbQuery<{ ano: number }>(sql);
    return NextResponse.json(rows.map((r) => r.ano));
  } catch (err) {
    console.error("[api/despesa/anos]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
