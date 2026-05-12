import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

const ANOS_VALIDOS = new Set(["2024", "2025", "2026", "2027"]);

export async function GET(req: NextRequest) {
  const sp        = req.nextUrl.searchParams;
  const municipio = sp.get("municipio");
  const anoParam  = sp.get("ano");
  const vacina    = sp.get("vacina");

  const ano = anoParam && ANOS_VALIDOS.has(anoParam) ? parseInt(anoParam, 10) : null;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (municipio) {
    params.push(`%${municipio}%`);
    conditions.push(`nome_municipio ILIKE $${params.length}`);
  }
  if (ano) {
    params.push(ano);
    conditions.push(`ano = $${params.length}`);
  }
  if (vacina) {
    params.push(`%${vacina}%`);
    conditions.push(`imunobiologico ILIKE $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await dbQuery(
    `SELECT
       codigo_municipio_ibge,
       nome_municipio,
       uf,
       ano,
       data_referencia,
       tipo_periodo,
       status_arquivo,
       imunobiologico,
       cobertura_percentual,
       numerador,
       denominador,
       meta_percentual,
       abaixo_meta
     FROM mart.pni_cobertura_evolucao
     ${where}
     ORDER BY ano ASC, data_referencia ASC, nome_municipio ASC, imunobiologico ASC
     LIMIT 1000`,
    params
  );

  return NextResponse.json(rows);
}
