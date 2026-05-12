import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

const ANOS_VALIDOS = new Set(["2024", "2025", "2026", "2027"]);

export async function GET(req: NextRequest) {
  const sp       = req.nextUrl.searchParams;
  const anoParam = sp.get("ano");
  const vacina   = sp.get("vacina");

  const ano = anoParam && ANOS_VALIDOS.has(anoParam) ? parseInt(anoParam, 10) : null;

  const conditions: string[] = [];
  const params: unknown[] = [];

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
       imunobiologico,
       ano,
       data_referencia,
       tipo_periodo,
       cobertura_media,
       total_municipios,
       total_municipios_abaixo_meta,
       numerador_total,
       denominador_total,
       atualizado_em
     FROM mart.pni_cobertura_resumo_imunobiologico
     ${where}
     ORDER BY cobertura_media ASC NULLS LAST, imunobiologico ASC
     LIMIT 100`,
    params
  );

  return NextResponse.json(rows);
}
