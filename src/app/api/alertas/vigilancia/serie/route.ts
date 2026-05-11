import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

function periodoParaSemanas(periodo: string): number {
  if (periodo === "6m") return 26;
  if (periodo === "2a") return 104;
  return 52;
}

export async function GET(req: NextRequest) {
  const sp            = req.nextUrl.searchParams;
  const periodo       = sp.get("periodo")       ?? "1a";
  const municipio     = sp.get("municipio")     ?? null;
  const granularidade = sp.get("granularidade") ?? "semana";

  const semanas = periodoParaSemanas(periodo);

  const params: unknown[] = [semanas];
  const munFilter = municipio
    ? (params.push(municipio), `AND codigo_municipio_ibge = $${params.length}`)
    : "";

  let rows: Record<string, unknown>[];

  if (granularidade === "mes") {
    // Agrega por ano+mês (derivado do início da SE via ISO week)
    rows = await dbQuery(
      `SELECT
         to_char(
           to_date(ano_epidemiologico::text || lpad(semana_epidemiologica::text, 2, '0'), 'IYYYIW'),
           'YYYY-MM'
         )                                                          AS periodo_label,
         doenca,
         COALESCE(SUM(casos), 0)::int                              AS casos
       FROM dw.fato_infodengue_semana
       WHERE to_date(
               ano_epidemiologico::text || lpad(semana_epidemiologica::text, 2, '0'),
               'IYYYIW'
             ) >= (CURRENT_DATE - ($1 * INTERVAL '1 week'))
         AND casos IS NOT NULL
         AND ano_epidemiologico IS NOT NULL
         AND semana_epidemiologica IS NOT NULL
         ${munFilter}
       GROUP BY periodo_label, doenca
       ORDER BY periodo_label, doenca`,
      params
    );
  } else {
    // Agrega por semana epidemiológica
    rows = await dbQuery(
      `SELECT
         ano_epidemiologico::text || '-W' ||
           lpad(semana_epidemiologica::text, 2, '0')               AS periodo_label,
         to_date(
           ano_epidemiologico::text || lpad(semana_epidemiologica::text, 2, '0'),
           'IYYYIW'
         )::text                                                    AS data_inicio,
         doenca,
         COALESCE(SUM(casos), 0)::int                              AS casos
       FROM dw.fato_infodengue_semana
       WHERE to_date(
               ano_epidemiologico::text || lpad(semana_epidemiologica::text, 2, '0'),
               'IYYYIW'
             ) >= (CURRENT_DATE - ($1 * INTERVAL '1 week'))
         AND casos IS NOT NULL
         AND ano_epidemiologico IS NOT NULL
         AND semana_epidemiologica IS NOT NULL
         ${munFilter}
       GROUP BY periodo_label, data_inicio, doenca
       ORDER BY data_inicio, doenca`,
      params
    );
  }

  return NextResponse.json(rows);
}
