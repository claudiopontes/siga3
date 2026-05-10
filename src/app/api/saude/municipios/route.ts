import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

const COLUNAS_VALIDAS = new Set([
  "score_risco", "nome_municipio", "total_alertas",
  "percentual_aplicado_saude", "total_ubs_ativas",
]);

export async function GET(req: NextRequest) {
  const sp        = req.nextUrl.searchParams;
  const nivelRisco = sp.get("nivelRisco");
  const municipio  = sp.get("municipio");
  const orderBy    = sp.get("orderBy") ?? "score_risco";
  const orderDir   = sp.get("orderDir")?.toUpperCase() === "ASC" ? "ASC" : "DESC";
  const pageSize   = Math.min(Math.max(parseInt(sp.get("pageSize") ?? "50", 10), 1), 200);

  const coluna = COLUNAS_VALIDAS.has(orderBy) ? orderBy : "score_risco";

  const conditions: string[] = [];
  const params: unknown[]    = [];

  if (nivelRisco) {
    params.push(nivelRisco);
    conditions.push(`nivel_risco = $${params.length}`);
  }
  if (municipio) {
    params.push(`%${municipio}%`);
    conditions.push(`nome_municipio ILIKE $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await dbQuery(
    `SELECT * FROM mart.saude_resumo_municipio
     ${where}
     ORDER BY ${coluna} ${orderDir} NULLS LAST, nome_municipio ASC
     LIMIT ${pageSize}`,
    params
  );

  return NextResponse.json(rows);
}
