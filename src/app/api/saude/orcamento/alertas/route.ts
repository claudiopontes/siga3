import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp         = req.nextUrl.searchParams;
  const home       = sp.get("home") === "1";
  const nivel      = sp.get("nivel");
  const municipio  = sp.get("municipio");
  const tipoAlerta = sp.get("tipo_alerta");
  const limite     = Math.min(Math.max(parseInt(sp.get("limit") ?? "50", 10), 1), 500);
  const anoP       = sp.get("ano")     ? parseInt(sp.get("ano")!, 10) : null;
  const periodoP   = sp.get("periodo") ?? null;

  const tabela = home ? "mart.siops_alertas_home" : "mart.siops_alertas";

  const conditions: string[] = [];
  const params: unknown[]    = [];

  if (anoP) {
    params.push(anoP);
    conditions.push(`ano = $${params.length}`);
  }
  if (periodoP) {
    params.push(periodoP);
    conditions.push(`periodo = $${params.length}`);
  }
  if (nivel) {
    params.push(nivel);
    conditions.push(`nivel = $${params.length}`);
  }
  if (municipio) {
    params.push(`%${municipio}%`);
    conditions.push(`nome_municipio ILIKE $${params.length}`);
  }
  if (tipoAlerta) {
    params.push(tipoAlerta);
    conditions.push(`tipo_alerta = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const ordem = home
    ? "ORDER BY prioridade ASC, tipo_alerta ASC, nome_municipio ASC"
    : `ORDER BY CASE nivel
         WHEN 'CRITICO' THEN 0
         WHEN 'ALTO'    THEN 1
         WHEN 'MEDIO'   THEN 2
         ELSE 3
       END ASC, tipo_alerta ASC, nome_municipio ASC`;

  try {
    const rows = await dbQuery(
      `SELECT * FROM ${tabela} ${where} ${ordem} LIMIT ${limite}`,
      params
    );
    return NextResponse.json(rows);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
