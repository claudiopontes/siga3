import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

const INDICADORES_VALIDOS = new Set([
  "bf_quantidade_familias",
  "bf_valor_repassado",
  "bpc_quantidade_total",
  "bpc_valor_total",
  "bf_por_1000_hab",
  "bpc_por_1000_hab",
  "bf_valor_medio_familia",
  "bpc_valor_medio_beneficiario",
]);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const competencia = searchParams.get("competencia") || null;
  const indicador   = searchParams.get("indicador") || "bf_quantidade_familias";
  const limit       = Math.min(parseInt(searchParams.get("limit") || "22", 10), 50);

  if (!INDICADORES_VALIDOS.has(indicador)) {
    return NextResponse.json({ error: "Indicador inválido" }, { status: 400 });
  }

  try {
    let competenciaAlvo = competencia;

    if (!competenciaAlvo) {
      const [row] = await dbQuery<{ ano_mes: string }>(
        `SELECT MAX(ano_mes) AS ano_mes FROM social.vw_mis_dados_validos`
      );
      competenciaAlvo = row?.ano_mes ?? null;
    }

    if (!competenciaAlvo) {
      return NextResponse.json([]);
    }

    const rows = await dbQuery<Record<string, unknown>>(`
      SELECT
        codigo_ibge_municipio,
        nome_municipio,
        ano_mes,
        bf_quantidade_familias,
        bf_valor_repassado,
        bf_valor_medio_familia,
        bpc_quantidade_total,
        bpc_valor_total,
        bpc_valor_medio_beneficiario,
        bf_por_1000_hab,
        bpc_por_1000_hab,
        populacao_estimada
      FROM social.vw_mis_dados_validos
      WHERE ano_mes = $1
      ORDER BY ${indicador} DESC NULLS LAST
      LIMIT $2
    `, [competenciaAlvo, limit]);

    return NextResponse.json(rows);
  } catch (err) {
    console.error("[api/social/mis/ranking]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
