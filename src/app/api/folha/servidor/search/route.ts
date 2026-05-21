import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Busca servidores por nome (LIKE) ou matrícula (LIKE).
 * CPF aberto NÃO é pesquisável (só hash existe no banco — não dá pra LIKE).
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const termo = (sp.get("q") ?? "").trim();
  const competencia = sp.get("competencia");
  const limit = Math.min(Number(sp.get("limit") ?? "30"), 200);

  if (termo.length < 2) {
    return NextResponse.json([]);
  }

  const params: unknown[] = [`%${termo.toUpperCase()}%`];
  let filtroCompetencia = "";
  if (competencia) {
    params.push(competencia);
    filtroCompetencia = `AND EXISTS (
      SELECT 1 FROM folha.fato_contracheque fc
       WHERE fc.id_cadastro_unico_sicap = ds.id_cadastro_unico_sicap
         AND fc.competencia = $2
    )`;
  }
  params.push(limit);

  const sql = `
    SELECT ds.id_cadastro_unico_sicap,
           ds.nome_servidor,
           ds.cpf_mascarado,
           ds.data_nascimento,
           ds.sexo,
           (
             SELECT STRING_AGG(DISTINCT de.entidade_nome, ', ')
               FROM folha.fato_contracheque fc
               LEFT JOIN folha.dim_entidade de ON de.id_entidade_cjur = fc.id_entidade_cjur
              WHERE fc.id_cadastro_unico_sicap = ds.id_cadastro_unico_sicap
                ${competencia ? `AND fc.competencia = $2` : ""}
           ) AS entidades,
           (
             SELECT MAX(fc.matricula)
               FROM folha.fato_contracheque fc
              WHERE fc.id_cadastro_unico_sicap = ds.id_cadastro_unico_sicap
                ${competencia ? `AND fc.competencia = $2` : ""}
           ) AS matricula_amostra
      FROM folha.dim_servidor ds
     WHERE (
             UPPER(ds.nome_servidor) LIKE $1
          OR EXISTS (
               SELECT 1 FROM folha.fato_contracheque fc
                WHERE fc.id_cadastro_unico_sicap = ds.id_cadastro_unico_sicap
                  AND UPPER(fc.matricula) LIKE $1
                  ${competencia ? `AND fc.competencia = $2` : ""}
             )
           )
       ${filtroCompetencia}
     ORDER BY ds.nome_servidor
     LIMIT $${params.length}
  `;

  try {
    const rows = await dbQuery(sql, params);
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[api/folha/servidor/search]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
