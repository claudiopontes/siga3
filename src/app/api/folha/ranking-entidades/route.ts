import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Estatísticas de remuneração líquida por entidade. Substitui o antigo
 * "top N por líquido absoluto", que favorecia entidades grandes.
 *
 * Agregação correta:
 *   1) Soma total_liquido por (entidade, servidor) — junta tipos de folha do
 *      mesmo vínculo (mensal + férias + 13º) e múltiplos vínculos do servidor
 *      na entidade, evitando que aparecesse duplicado.
 *   2) Calcula min/mediana/média/máx sobre a distribuição de líquido por
 *      servidor dentro da entidade.
 *
 * Ordena por mediana decrescente — bom indicador do "salário típico" da
 * entidade, menos sensível a outliers que a média.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const competencia = sp.get("competencia");
  const poder = sp.get("poder");
  const limit = Math.min(Number(sp.get("limit") ?? "30"), 200);
  const ordenar = sp.get("ordenar") ?? "mediana"; // mediana | media | max | qtd

  if (!competencia) {
    return NextResponse.json({ error: "competencia obrigatória" }, { status: 400 });
  }

  const params: unknown[] = [competencia];
  const filtros: string[] = ["fc.competencia = $1"];

  if (poder && poder !== "all") {
    params.push(poder);
    filtros.push(`de.entidade_poder = $${params.length}`);
  }
  params.push(limit);

  const colOrder = ({
    mediana: "mediana",
    media:   "media",
    max:     "maximo",
    qtd:     "qtd_servidores",
  } as Record<string, string>)[ordenar] ?? "mediana";

  const sql = `
    WITH servidor_entidade AS (
      SELECT fc.id_entidade_cjur,
             fc.id_cadastro_unico_sicap,
             SUM(fc.total_liquido) AS liquido_servidor
        FROM folha.fato_contracheque fc
        LEFT JOIN folha.dim_entidade de ON de.id_entidade_cjur = fc.id_entidade_cjur
       WHERE ${filtros.join(" AND ")}
         AND fc.id_cadastro_unico_sicap IS NOT NULL
       GROUP BY fc.id_entidade_cjur, fc.id_cadastro_unico_sicap
    )
    SELECT
      se.id_entidade_cjur,
      de.entidade_nome,
      de.ente_nome,
      de.entidade_poder,
      COUNT(*)::bigint                                                       AS qtd_servidores,
      SUM(se.liquido_servidor)::numeric                                      AS total_liquido,
      MIN(se.liquido_servidor)::numeric                                      AS minimo,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY se.liquido_servidor)::numeric AS mediana,
      AVG(se.liquido_servidor)::numeric                                      AS media,
      MAX(se.liquido_servidor)::numeric                                      AS maximo
    FROM servidor_entidade se
    LEFT JOIN folha.dim_entidade de ON de.id_entidade_cjur = se.id_entidade_cjur
    GROUP BY se.id_entidade_cjur, de.entidade_nome, de.ente_nome, de.entidade_poder
    ORDER BY ${colOrder} DESC NULLS LAST
    LIMIT $${params.length}
  `;

  try {
    const rows = await dbQuery(sql, params);
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[api/folha/ranking-entidades]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
