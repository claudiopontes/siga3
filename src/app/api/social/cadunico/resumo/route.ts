import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const rows = await dbQuery(`
      SELECT
        ano_mes,
        codigo_ibge_municipio,
        nome_municipio,
        sigla_uf,
        familias_cadastradas,
        pessoas_cadastradas,
        familias_pobreza,
        familias_baixa_renda,
        familias_atualizadas,
        familias_desatualizadas,
        taxa_atualizacao_cadastral,
        familias_unipessoais,
        percentual_familias_unipessoais,
        familias_bolsa_familia,
        valor_total_bolsa_familia,
        igdm,
        fonte,
        data_carga
      FROM social.vw_cadunico_resumo_atual
      ORDER BY nome_municipio
    `);
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[api/social/cadunico/resumo]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
