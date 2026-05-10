import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp         = req.nextUrl.searchParams;
  const nivel      = sp.get("nivel");
  const municipio  = sp.get("municipio");
  const tipo_alerta = sp.get("tipo_alerta");

  const conditions: string[] = [];
  const params: unknown[]    = [];

  if (nivel) {
    params.push(nivel);
    conditions.push(`nivel = $${params.length}`);
  }
  if (municipio) {
    params.push(`%${municipio}%`);
    conditions.push(`nome_municipio ILIKE $${params.length}`);
  }
  if (tipo_alerta) {
    params.push(tipo_alerta);
    conditions.push(`tipo_alerta = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await dbQuery(
    `SELECT * FROM mart.saude_estrutura_alertas_home ${where}
     ORDER BY prioridade, tipo_alerta, nome_municipio
     LIMIT 30`,
    params
  );

  return NextResponse.json(rows);
}
