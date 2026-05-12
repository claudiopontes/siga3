import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

const ANOS_VALIDOS = new Set(["2024", "2025", "2026", "2027"]);

export async function GET(req: NextRequest) {
  const sp        = req.nextUrl.searchParams;
  const municipio = sp.get("municipio");
  const anoParam  = sp.get("ano");
  const vacina    = sp.get("vacina");
  const ano       = anoParam && ANOS_VALIDOS.has(anoParam) ? parseInt(anoParam, 10) : null;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (municipio) {
    params.push(municipio);
    conditions.push(`codigo_municipio_ibge = $${params.length}`);
  }
  if (ano) {
    params.push(ano);
    conditions.push(`ano = $${params.length}`);
  }
  if (vacina) {
    params.push(vacina);
    conditions.push(`no_imunobiologico = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await dbQuery(
    `SELECT
       codigo_municipio_ibge,
       no_imunobiologico,
       ano,
       mes,
       total_doses
     FROM mart.pni_serie_mensal
     ${where}
     ORDER BY ano ASC, mes ASC
     LIMIT 500`,
    params
  );

  return NextResponse.json(rows);
}
