import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

// Converte período (6m | 1a | 2a) em número de semanas epidemiológicas para trás
function periodoParaSemanas(periodo: string): number {
  if (periodo === "6m") return 26;
  if (periodo === "2a") return 104;
  return 52; // padrão: 1 ano
}

export async function GET(req: NextRequest) {
  const sp        = req.nextUrl.searchParams;
  const doenca    = sp.get("doenca");
  const periodo   = sp.get("periodo") ?? "1a";
  const municipio = sp.get("municipio");

  const semanas = periodoParaSemanas(periodo);

  const conditions: string[] = [];
  const params: unknown[]    = [semanas]; // $1 = semanas (sempre)

  if (doenca) {
    params.push(doenca);
    conditions.push(`m.doenca = $${params.length}`);
  }

  if (municipio) {
    params.push(municipio);
    conditions.push(`m.codigo_municipio_ibge = $${params.length}`);
  }

  const where = conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";

  const rows = await dbQuery(
    `WITH casos_periodo AS (
       SELECT
         codigo_municipio_ibge,
         doenca,
         COALESCE(SUM(casos), 0)::int AS casos_periodo
       FROM dw.fato_infodengue_semana
       WHERE to_date(
               ano_epidemiologico::text || lpad(semana_epidemiologica::text, 2, '0'),
               'IYYYIW'
             ) >= (CURRENT_DATE - ($1 * INTERVAL '1 week'))
         AND casos IS NOT NULL
         AND ano_epidemiologico IS NOT NULL
         AND semana_epidemiologica IS NOT NULL
       GROUP BY codigo_municipio_ibge, doenca
     )
     SELECT
       m.*,
       COALESCE(c.casos_periodo, 0) AS casos_periodo
     FROM mart.vigilancia_arboviroses_resumo_municipio m
     LEFT JOIN casos_periodo c
       ON m.codigo_municipio_ibge = c.codigo_municipio_ibge
      AND m.doenca = c.doenca
     WHERE 1=1 ${where}
     ORDER BY m.doenca, c.casos_periodo DESC NULLS LAST, m.nome_municipio`,
    params
  );

  return NextResponse.json(rows);
}
