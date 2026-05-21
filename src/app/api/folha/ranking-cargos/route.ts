import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const competencia = sp.get("competencia");
  const idEntidade = sp.get("entidade");
  const poder = sp.get("poder");
  const limit = Math.min(Number(sp.get("limit") ?? "20"), 200);

  if (!competencia) {
    return NextResponse.json({ error: "competencia obrigatória" }, { status: 400 });
  }

  const params: unknown[] = [competencia];
  const filtros: string[] = ["fc.competencia = $1"];

  if (idEntidade && idEntidade !== "all") {
    params.push(Number(idEntidade));
    filtros.push(`fc.id_entidade_cjur = $${params.length}`);
  }
  if (poder && poder !== "all") {
    params.push(poder);
    filtros.push(`de.entidade_poder = $${params.length}`);
  }
  params.push(limit);

  const sql = `
    SELECT fc.id_cargo_sicap,
           dc.cargo_nome,
           dc.cargo_codigo,
           SUM(fc.total_liquido)::numeric AS total_liquido,
           AVG(fc.total_liquido)::numeric AS media_liquido,
           COUNT(*)::bigint               AS qtd_contracheques,
           COUNT(DISTINCT fc.id_cadastro_unico_sicap)::bigint AS qtd_servidores
      FROM folha.fato_contracheque fc
      LEFT JOIN folha.dim_cargo dc    ON dc.id_cargo_sicap   = fc.id_cargo_sicap
      LEFT JOIN folha.dim_entidade de ON de.id_entidade_cjur = fc.id_entidade_cjur
     WHERE ${filtros.join(" AND ")}
       AND fc.id_cargo_sicap IS NOT NULL
     GROUP BY fc.id_cargo_sicap, dc.cargo_nome, dc.cargo_codigo
     ORDER BY total_liquido DESC NULLS LAST
     LIMIT $${params.length}
  `;

  try {
    const rows = await dbQuery(sql, params);
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[api/folha/ranking-cargos]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
