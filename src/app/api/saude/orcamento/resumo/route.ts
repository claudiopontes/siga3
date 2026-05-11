import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp       = req.nextUrl.searchParams;
  const anoP     = sp.get("ano")     ? parseInt(sp.get("ano")!, 10) : null;
  const periodoP = sp.get("periodo") ?? null;

  try {
    const rows = await dbQuery(
      // periodo_ref: quando ano/periodo são fornecidos, usa diretamente em siops_resumo_municipio
      // (que contém todos os períodos). Caso contrário, usa o mais recente.
      // totais de alertas calculados de siops_alertas para funcionar com qualquer período.
      `WITH periodo_ref AS (
         SELECT DISTINCT ano, periodo
         FROM mart.siops_resumo_municipio
         WHERE ($1::int  IS NULL OR ano     = $1)
           AND ($2::text IS NULL OR periodo = $2)
         ORDER BY ano DESC, periodo DESC
         LIMIT 1
       ),
       metricas AS (
         SELECT
           COUNT(m.codigo_municipio_ibge) FILTER (
             WHERE m.percentual_aplicado_saude < 15
               AND m.percentual_aplicado_saude IS NOT NULL
           )                                           AS abaixo_minimo,
           ROUND(AVG(m.percentual_aplicado_saude), 2)  AS media_percentual,
           MIN(m.percentual_aplicado_saude)             AS menor_percentual,
           MAX(m.percentual_aplicado_saude)             AS maior_percentual
         FROM mart.siops_resumo_municipio m
         JOIN periodo_ref pr
           ON m.ano = pr.ano
          AND (m.periodo = pr.periodo OR (m.periodo IS NULL AND pr.periodo IS NULL))
       ),
       alertas_totais AS (
         SELECT
           COUNT(*)                                      AS total_alertas,
           COUNT(*) FILTER (WHERE nivel = 'CRITICO')     AS total_criticos,
           COUNT(*) FILTER (WHERE nivel = 'ALTO')        AS total_altos,
           COUNT(*) FILTER (WHERE nivel = 'MEDIO')       AS total_medios,
           COUNT(DISTINCT codigo_municipio_ibge)         AS total_municipios_afetados
         FROM mart.siops_alertas a
         JOIN periodo_ref pr
           ON a.ano = pr.ano
          AND (a.periodo = pr.periodo OR (a.periodo IS NULL AND pr.periodo IS NULL))
       ),
       total_ref AS (
         SELECT COUNT(*) AS total_municipios FROM mart.saude_resumo_municipio
       )
       SELECT
         pr.ano,
         pr.periodo,
         at.total_alertas,
         at.total_criticos,
         at.total_altos,
         at.total_medios,
         at.total_municipios_afetados,
         tr.total_municipios,
         mt.abaixo_minimo,
         mt.media_percentual,
         mt.menor_percentual,
         mt.maior_percentual
       FROM periodo_ref pr, metricas mt, alertas_totais at, total_ref tr`,
      [anoP, periodoP]
    );
    return NextResponse.json(rows[0] ?? null);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
