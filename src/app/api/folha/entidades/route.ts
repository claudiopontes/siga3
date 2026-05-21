import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const competencia = req.nextUrl.searchParams.get("competencia");

  const params: unknown[] = [];
  let filtro = "";
  if (competencia) {
    params.push(competencia);
    filtro = `WHERE EXISTS (
      SELECT 1 FROM folha.fato_contracheque fc
       WHERE fc.id_entidade_cjur = e.id_entidade_cjur
         AND fc.competencia = $1
    )`;
  }

  const sql = `
    SELECT e.id_entidade_cjur,
           e.entidade_nome,
           e.ente_nome,
           e.entidade_poder,
           e.entidade_classificacao_administrativa,
           e.ente_codigo_ibge
      FROM folha.dim_entidade e
      ${filtro}
     ORDER BY e.entidade_nome
  `;
  try {
    const rows = await dbQuery(sql, params);
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[api/folha/entidades]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
