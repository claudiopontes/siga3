import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const nivel = sp.get("nivel");           // CRITICO | ALTO | null (todos)
  const municipio = sp.get("municipio");   // codigo_municipio_ibge

  try {
    const rows = await dbQuery(`
      SELECT id_alerta, area, fonte, ano, periodo,
             codigo_municipio_ibge, nome_municipio,
             tipo_alerta, nivel, descricao,
             valor_observado, valor_referencia,
             prioridade, detalhe_json, atualizado_em
      FROM mart.siops_alertas_home
      WHERE ($1::text IS NULL OR nivel = $1)
        AND ($2::text IS NULL OR codigo_municipio_ibge = $2)
      ORDER BY prioridade ASC, tipo_alerta ASC, valor_observado ASC NULLS LAST, nome_municipio ASC
    `, [nivel, municipio]);
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[api/alertas/siops/detalhes]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
