import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const home = searchParams.get("home") === "1";
    const anoParam = searchParams.get("ano");
    const nivel = searchParams.get("nivel");
    const municipio = searchParams.get("municipio");
    const tipoAlerta = searchParams.get("tipo_alerta");
    const ano = anoParam ? parseInt(anoParam, 10) : null;

    if (home) {
      const { rows } = await pool.query(
        `SELECT
          id_alerta, fonte, codigo_municipio_ibge, nome_municipio,
          tipo_alerta, nivel, descricao, valor_observado, valor_referencia,
          prioridade, detalhe_json, atualizado_em
        FROM mart.mortalidade_alertas_home
        ORDER BY prioridade, atualizado_em DESC`
      );
      return NextResponse.json(rows);
    }

    const { rows } = await pool.query(
      `SELECT
        id_alerta, fonte, codigo_municipio_ibge, nome_municipio, ano,
        tipo_alerta, nivel, descricao, valor_observado, valor_referencia,
        detalhe_json, atualizado_em
      FROM mart.mortalidade_alertas
      WHERE ($1::int IS NULL OR ano = $1::int)
        AND ($2::text IS NULL OR nivel = $2)
        AND ($3::text IS NULL OR nome_municipio ILIKE $3)
        AND ($4::text IS NULL OR tipo_alerta = $4)
      ORDER BY
        CASE nivel WHEN 'CRITICO' THEN 1 WHEN 'ALTO' THEN 2 ELSE 3 END,
        ano DESC`,
      [ano, nivel, municipio ? `%${municipio}%` : null, tipoAlerta]
    );

    return NextResponse.json(rows);
  } catch (err) {
    console.error("[api/saude/mortalidade/alertas]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
