import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const sql = `
    SELECT DISTINCT
      de.id_entidade,
      de.id_ente,
      de.nome
    FROM public.dim_entidade de
    INNER JOIN mart.despesa_resumo dr ON dr.id_entidade = de.id_entidade
    WHERE de.inativo = 0
    ORDER BY de.nome
  `;
  try {
    const rows = await dbQuery<{ id_entidade: number; id_ente: number; nome: string }>(sql);
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[api/despesa/entidades]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
