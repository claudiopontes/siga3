import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const municipio        = searchParams.get("municipio") || null;
  const competenciaInicio = searchParams.get("competenciaInicio") || null;
  const competenciaFim   = searchParams.get("competenciaFim") || null;

  try {
    const params: string[] = [];
    const conds: string[]  = [];

    if (municipio) {
      params.push(municipio);
      conds.push(`codigo_ibge_municipio = $${params.length}`);
    }
    if (competenciaInicio) {
      params.push(competenciaInicio);
      conds.push(`ano_mes >= $${params.length}`);
    }
    if (competenciaFim) {
      params.push(competenciaFim);
      conds.push(`ano_mes <= $${params.length}`);
    }

    const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";

    // Se um município específico: retorna linha por linha
    // Se todos: agrega por competência
    let rows: Record<string, unknown>[];

    if (municipio) {
      rows = await dbQuery<Record<string, unknown>>(`
        SELECT
          ano_mes,
          codigo_ibge_municipio,
          nome_municipio,
          bf_quantidade_familias,
          bf_valor_repassado,
          bf_valor_medio_familia,
          bpc_quantidade_total,
          bpc_quantidade_deficiencia,
          bpc_quantidade_idoso,
          bpc_valor_total,
          populacao_estimada,
          bf_por_1000_hab,
          bpc_por_1000_hab
        FROM social.vw_mis_dados_validos
        ${where}
        ORDER BY ano_mes
      `, params);
    } else {
      rows = await dbQuery<Record<string, unknown>>(`
        SELECT
          ano_mes,
          SUM(bf_quantidade_familias)     AS bf_quantidade_familias,
          SUM(bf_valor_repassado)         AS bf_valor_repassado,
          CASE WHEN SUM(bf_quantidade_familias) > 0
            THEN ROUND(SUM(bf_valor_repassado) / SUM(bf_quantidade_familias), 2)
            ELSE NULL
          END                             AS bf_valor_medio_familia,
          SUM(bpc_quantidade_total)       AS bpc_quantidade_total,
          SUM(bpc_quantidade_deficiencia) AS bpc_quantidade_deficiencia,
          SUM(bpc_quantidade_idoso)       AS bpc_quantidade_idoso,
          SUM(bpc_valor_total)            AS bpc_valor_total,
          SUM(populacao_estimada)         AS populacao_estimada,
          CASE WHEN SUM(populacao_estimada) > 0
            THEN ROUND(SUM(bf_quantidade_familias) / SUM(populacao_estimada) * 1000, 2)
            ELSE NULL
          END                             AS bf_por_1000_hab,
          CASE WHEN SUM(populacao_estimada) > 0
            THEN ROUND(SUM(bpc_quantidade_total) / SUM(populacao_estimada) * 1000, 2)
            ELSE NULL
          END                             AS bpc_por_1000_hab
        FROM social.vw_mis_dados_validos
        ${where}
        GROUP BY ano_mes
        ORDER BY ano_mes
      `, params);
    }

    return NextResponse.json(rows);
  } catch (err) {
    console.error("[api/social/mis/serie]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
