import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const anoParam = searchParams.get("ano");
    const municipio = searchParams.get("municipio");
    const ano = anoParam ? parseInt(anoParam, 10) : null;

    const { rows } = await pool.query(
      `SELECT
        codigo_municipio_ibge,
        nome_municipio,
        ano,
        nascidos_vivos,
        obitos_infantis,
        obitos_neonatais,
        obitos_pos_neonatais,
        obitos_maternos,
        obitos_fetais,
        total_obitos,
        taxa_mortalidade_infantil,
        taxa_mortalidade_neonatal,
        taxa_mortalidade_pos_neonatal,
        percentual_baixo_peso,
        percentual_prenatal_insuficiente,
        percentual_cesareo,
        obitos_sem_assistencia_medica,
        obitos_infantis_sem_denominador,
        indicador_taxa_disponivel,
        ano_mais_recente_sim,
        ano_mais_recente_sinasc,
        fonte_dado,
        atualizado_em
      FROM mart.mortalidade_resumo_municipio
      WHERE ($1::int IS NULL OR ano = $1::int)
        AND ($2::text IS NULL OR nome_municipio ILIKE $2)
        AND codigo_municipio_ibge IS NOT NULL
        AND codigo_municipio_ibge NOT IN ('12000', '120000')
        AND nome_municipio NOT SIMILAR TO '[0-9]+'
      ORDER BY nome_municipio`,
      [ano, municipio ? `%${municipio}%` : null]
    );

    return NextResponse.json(rows);
  } catch (err) {
    console.error("[api/saude/mortalidade/municipios]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
