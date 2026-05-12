import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

const ANOS_VALIDOS = new Set(["2024", "2025", "2026", "2027"]);

export async function GET(req: NextRequest) {
  const sp        = req.nextUrl.searchParams;
  const municipio = sp.get("municipio");
  const anoParam  = sp.get("ano");
  const ano       = anoParam && ANOS_VALIDOS.has(anoParam) ? parseInt(anoParam, 10) : null;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (ano) {
    params.push(ano);
    conditions.push(`ano = $${params.length}`);
  }
  if (municipio) {
    params.push(`%${municipio}%`);
    conditions.push(`nome_municipio ILIKE $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await dbQuery(
    `SELECT
       codigo_municipio_ibge,
       nome_municipio,
       ano,
       total_doses,
       doses_ultimo_mes,
       mes_referencia,
       atualizado_em
     FROM mart.pni_resumo_municipio
     ${where}
     ORDER BY total_doses DESC, nome_municipio ASC
     LIMIT 100`,
    params
  );

  return NextResponse.json(rows);
}
