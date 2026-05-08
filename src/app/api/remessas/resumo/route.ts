import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const ano = sp.get("ano");

  const sql = `
    SELECT *
    FROM mart.remessa_resumo
    WHERE ($1::integer IS NULL OR ano = $1::integer)
    ORDER BY ano DESC
  `;

  try {
    const rows = await dbQuery(sql, [ano ? Number(ano) : null]);
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[api/remessas/resumo]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
