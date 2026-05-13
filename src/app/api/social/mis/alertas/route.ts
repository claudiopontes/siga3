import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const rows = await dbQuery<Record<string, unknown>>(`
      SELECT
        ano_mes,
        codigo_ibge_municipio,
        nome_municipio,
        tipo_alerta,
        nivel_alerta,
        indicador_base,
        valor_indicador,
        var_mensal_pct,
        var_anual_pct,
        descricao,
        justificativa
      FROM social.vw_mis_alertas_gabinete
      ORDER BY
        CASE nivel_alerta
          WHEN 'ALTO'  THEN 1
          WHEN 'MEDIO' THEN 2
          WHEN 'BAIXO' THEN 3
          ELSE 4
        END,
        tipo_alerta,
        nome_municipio
    `);

    return NextResponse.json(rows);
  } catch (err) {
    console.error("[api/social/mis/alertas]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
