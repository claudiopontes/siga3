import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const nivel     = sp.get("nivel");
  const municipio = sp.get("municipio");

  const conditions: string[] = [];
  const params: unknown[]    = [];

  if (nivel) {
    params.push(nivel);
    conditions.push(`nivel = $${params.length}`);
  }
  if (municipio) {
    params.push(`%${municipio}%`);
    conditions.push(`no_municipio ILIKE $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await dbQuery(
    `SELECT * FROM mart.siconfi_rreo_alertas_home ${where} ORDER BY prioridade, tipo_alerta, no_municipio LIMIT 100`,
    params
  );

  return NextResponse.json(rows);
}
