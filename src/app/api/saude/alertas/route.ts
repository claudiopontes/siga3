import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp         = req.nextUrl.searchParams;
  const home       = sp.get("home") === "1";
  const nivel      = sp.get("nivel");
  const fonte      = sp.get("fonte");
  const municipio  = sp.get("municipio");
  const tipoAlerta = sp.get("tipo_alerta");

  const tabela = home ? "mart.saude_alertas_home" : "mart.saude_alertas";
  const ordem  = home
    ? "ORDER BY prioridade ASC, fonte ASC, tipo_alerta ASC, nome_municipio ASC"
    : "ORDER BY nivel ASC, fonte ASC, tipo_alerta ASC, nome_municipio ASC";

  const conditions: string[] = [];
  const params: unknown[]    = [];

  if (nivel) {
    params.push(nivel);
    conditions.push(`nivel = $${params.length}`);
  }
  if (fonte) {
    params.push(fonte);
    conditions.push(`fonte = $${params.length}`);
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

  const limite = home ? "LIMIT 30" : "LIMIT 2000";

  const rows = await dbQuery(
    `SELECT * FROM ${tabela} ${where} ${ordem} ${limite}`,
    params
  );

  return NextResponse.json(rows);
}
