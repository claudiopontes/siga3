import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const [competencias, municipios] = await Promise.all([
      dbQuery<{ ano_mes: string }>(
        `SELECT DISTINCT ano_mes FROM social.vw_mis_dados_validos ORDER BY ano_mes`
      ),
      dbQuery<{ codigo_ibge_municipio: string; nome_municipio: string }>(
        `SELECT DISTINCT codigo_ibge_municipio, nome_municipio
         FROM social.vw_mis_dados_validos
         ORDER BY nome_municipio`
      ),
    ]);

    return NextResponse.json({
      competencias: competencias.map((r) => r.ano_mes),
      municipios,
    });
  } catch (err) {
    console.error("[api/social/mis/filtros]", err);
    return NextResponse.json({ competencias: [], municipios: [] });
  }
}
