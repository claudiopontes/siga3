import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const municipio = searchParams.get("municipio");
    const codigo = searchParams.get("codigo");
    const filtro = municipio ?? codigo ?? null;

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
          ELSE NULL END AS taxa_mortalidade_infantil
      FROM mart.mortalidade_resumo_municipio
      WHERE ($1::text IS NULL OR nome_municipio ILIKE $1 OR codigo_municipio_ibge = $1)
      GROUP BY ano
      ORDER BY ano`,
      [filtro ? `%${filtro}%` : null]
    );

    return NextResponse.json(rows);
  } catch (err) {
    console.error("[api/saude/mortalidade/serie]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
