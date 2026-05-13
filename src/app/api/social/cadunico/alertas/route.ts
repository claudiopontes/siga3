import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tipo = searchParams.get("tipo");

    const params: unknown[] = [];
    let filtroTipo = "";
    if (tipo) {
      params.push(tipo);
      filtroTipo = `WHERE tipo_alerta = $1`;
    }

    const rows = await dbQuery(`
      SELECT
        ano_mes,
        codigo_ibge_municipio,
        nome_municipio,
        sigla_uf,
        tipo_alerta,
        nivel_alerta,
        indicador_base,
        valor_indicador,
        descricao_alerta,
        justificativa_controle_externo,
        fonte,
        data_carga
      FROM social.vw_cadunico_alertas_municipio
      ${filtroTipo}
      ORDER BY
        CASE nivel_alerta
          WHEN 'CRITICO' THEN 1
          WHEN 'ALTO'    THEN 2
          WHEN 'MEDIO'   THEN 3
          ELSE 4
        END,
        nome_municipio
    `, params);

    return NextResponse.json(rows);
  } catch (err) {
    console.error("[api/social/cadunico/alertas]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
