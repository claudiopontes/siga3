import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const idEntidade = sp.get("entidade");
  const poder = sp.get("poder");
  const competenciaInicial = sp.get("competenciaInicial");
  const competenciaFinal = sp.get("competenciaFinal");

  const params: unknown[] = [];
  const filtros: string[] = [];

  if (competenciaInicial) {
    params.push(competenciaInicial);
    filtros.push(`fc.competencia >= $${params.length}`);
  }
  if (competenciaFinal) {
    params.push(competenciaFinal);
    filtros.push(`fc.competencia <= $${params.length}`);
  }
  if (idEntidade && idEntidade !== "all") {
    params.push(Number(idEntidade));
    filtros.push(`fc.id_entidade_cjur = $${params.length}`);
  }
  if (poder && poder !== "all") {
    params.push(poder);
    filtros.push(`de.entidade_poder = $${params.length}`);
  }

  const sql = `
    SELECT fc.competencia,
           fc.ano,
           fc.mes,
           SUM(fc.total_vencimentos)::numeric AS total_vencimentos,
           SUM(fc.total_descontos)::numeric   AS total_descontos,
           SUM(fc.total_liquido)::numeric     AS total_liquido,
           COUNT(*)::bigint                   AS qtd_contracheques,
           COUNT(DISTINCT fc.id_cadastro_unico_sicap)::bigint AS qtd_servidores
      FROM folha.fato_contracheque fc
      LEFT JOIN folha.dim_entidade de ON de.id_entidade_cjur = fc.id_entidade_cjur
     ${filtros.length ? `WHERE ${filtros.join(" AND ")}` : ""}
     GROUP BY fc.competencia, fc.ano, fc.mes
     ORDER BY fc.ano, fc.mes
  `;

  try {
    const rows = await dbQuery(sql, params);
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[api/folha/evolucao]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
