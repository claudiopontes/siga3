import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const anoParam = searchParams.get("ano");
    const ano = anoParam ? parseInt(anoParam, 10) : null;

    const { rows } = await pool.query(
      `SELECT
        ano,
        SUM(nascidos_vivos)::int AS nascidos_vivos,
        SUM(obitos_infantis)::int AS obitos_infantis,
        SUM(obitos_maternos)::int AS obitos_maternos,
        SUM(obitos_fetais)::int AS obitos_fetais,
        SUM(total_obitos)::int AS total_obitos,
        CASE WHEN SUM(nascidos_vivos) > 0
          THEN ROUND(SUM(obitos_infantis)::numeric / SUM(nascidos_vivos) * 1000, 1)
          ELSE NULL END AS taxa_mortalidade_infantil,
        BOOL_OR(indicador_taxa_disponivel) AS indicador_taxa_disponivel,
        MAX(fonte_dado) AS fonte_dado,
        MAX(ano_mais_recente_sim) AS ano_mais_recente_sim,
        MAX(ano_mais_recente_sinasc) AS ano_mais_recente_sinasc
      FROM mart.mortalidade_resumo_municipio
      WHERE ($1::int IS NULL OR ano = $1::int)
      GROUP BY ano
      ORDER BY ano DESC
      LIMIT 1`,
      [ano]
    );

    if (rows.length === 0) {
      return NextResponse.json(null);
    }

    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("[api/saude/mortalidade/resumo]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
