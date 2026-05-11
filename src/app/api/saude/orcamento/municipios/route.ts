import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

const COLUNA_ALIAS: Record<string, string> = {
  "percentual_aplicado_saude": "s.percentual_aplicado_saude",
  "despesa_total_saude":       "s.despesa_total_saude",
  "total_alertas":             "total_alertas",
  "nome_municipio":            "b.nome_municipio",
  "nivel_risco_orcamento":     "nivel_risco_orcamento",
};

export async function GET(req: NextRequest) {
  const sp           = req.nextUrl.searchParams;
  const municipio    = sp.get("municipio");
  const nivelRisco   = sp.get("nivelRisco");
  const abaixoMinimo = sp.get("abaixoMinimo") === "true";
  const orderByRaw   = sp.get("orderBy") ?? "percentual_aplicado_saude";
  const orderDir     = sp.get("orderDir")?.toUpperCase() === "DESC" ? "DESC" : "ASC";
  const anoP         = sp.get("ano")     ? parseInt(sp.get("ano")!, 10) : null;
  const periodoP     = sp.get("periodo") ?? null;
  const pageSize     = Math.min(Math.max(parseInt(sp.get("pageSize") ?? "50", 10), 1), 200);

  const coluna = COLUNA_ALIAS[orderByRaw] ?? "s.percentual_aplicado_saude";

  const conditions: string[] = [];
  const params: unknown[]    = [anoP, periodoP];

  if (municipio) {
    params.push(`%${municipio}%`);
    conditions.push(`b.nome_municipio ILIKE $${params.length}`);
  }
  if (abaixoMinimo) {
    conditions.push(`s.percentual_aplicado_saude < 15`);
  }

  const whereExtra = conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";

  const havingNivel = nivelRisco
    ? `AND CASE
         WHEN COALESCE(aa.total_criticos, 0) > 0 THEN 'CRITICO'
         WHEN COALESCE(aa.total_altos,    0) > 0 THEN 'ALTO'
         WHEN COALESCE(aa.total_medios,   0) > 0 THEN 'MEDIO'
         ELSE 'BAIXO'
       END = '${nivelRisco.toUpperCase()}'`
    : "";

  try {
    const rows = await dbQuery(
      `WITH periodo_ref AS (
         SELECT DISTINCT ano, periodo
         FROM mart.siops_resumo_municipio
         WHERE ($1::int  IS NULL OR ano     = $1)
           AND ($2::text IS NULL OR periodo = $2)
         ORDER BY ano DESC, periodo DESC
         LIMIT 1
       ),
       alertas_agg AS (
         SELECT
           a.codigo_municipio_ibge,
           COUNT(*)                                      AS total_alertas,
           COUNT(*) FILTER (WHERE a.nivel = 'CRITICO')  AS total_criticos,
           COUNT(*) FILTER (WHERE a.nivel = 'ALTO')     AS total_altos,
           COUNT(*) FILTER (WHERE a.nivel = 'MEDIO')    AS total_medios
         FROM mart.siops_alertas a
         JOIN periodo_ref pr
           ON a.ano = pr.ano
          AND (a.periodo = pr.periodo OR (a.periodo IS NULL AND pr.periodo IS NULL))
         GROUP BY a.codigo_municipio_ibge
       )
       SELECT
         b.codigo_municipio_ibge,
         b.nome_municipio,
         pr.ano,
         pr.periodo,
         s.percentual_aplicado_saude,
         s.despesa_total_saude,
         s.receita_base_calculo,
         s.situacao_envio,
         COALESCE(s.total_indicadores, 0)  AS total_indicadores,
         s.atualizado_em,
         COALESCE(aa.total_alertas,  0)    AS total_alertas,
         COALESCE(aa.total_criticos, 0)    AS total_criticos,
         COALESCE(aa.total_altos,    0)    AS total_altos,
         COALESCE(aa.total_medios,   0)    AS total_medios,
         CASE
           WHEN COALESCE(aa.total_criticos, 0) > 0 THEN 'CRITICO'
           WHEN COALESCE(aa.total_altos,    0) > 0 THEN 'ALTO'
           WHEN COALESCE(aa.total_medios,   0) > 0 THEN 'MEDIO'
           ELSE 'BAIXO'
         END AS nivel_risco_orcamento
       FROM mart.saude_resumo_municipio b
       CROSS JOIN periodo_ref pr
       LEFT JOIN mart.siops_resumo_municipio s
         ON s.codigo_municipio_ibge = b.codigo_municipio_ibge
        AND s.ano = pr.ano
        AND (s.periodo = pr.periodo OR (s.periodo IS NULL AND pr.periodo IS NULL))
       LEFT JOIN alertas_agg aa
         ON aa.codigo_municipio_ibge = b.codigo_municipio_ibge
       WHERE 1=1 ${whereExtra} ${havingNivel}
       ORDER BY ${coluna} ${orderDir} NULLS LAST, b.nome_municipio ASC
       LIMIT ${pageSize}`,
      params
    );
    return NextResponse.json(rows);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
