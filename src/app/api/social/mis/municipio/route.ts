import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const codMun     = searchParams.get("codMun");
  const competencia = searchParams.get("competencia") || null;

  if (!codMun) {
    return NextResponse.json({ error: "codMun obrigatório" }, { status: 400 });
  }

  try {
    let competenciaAlvo = competencia;

    if (!competenciaAlvo) {
      const [row] = await dbQuery<{ ano_mes: string }>(
        `SELECT MAX(ano_mes) AS ano_mes FROM social.vw_mis_dados_validos WHERE codigo_ibge_municipio = $1`,
        [codMun]
      );
      competenciaAlvo = row?.ano_mes ?? null;
    }

    if (!competenciaAlvo) {
      return NextResponse.json({ error: "Sem dados para este município" }, { status: 404 });
    }

    // Detalhe da competência atual com variações
    const [detalhe] = await dbQuery<Record<string, unknown>>(`
      SELECT *
      FROM social.vw_mis_variacao
      WHERE codigo_ibge_municipio = $1 AND ano_mes = $2
    `, [codMun, competenciaAlvo]);

    // Últimas 24 competências para mini-série histórica
    const historico = await dbQuery<Record<string, unknown>>(`
      SELECT
        ano_mes,
        bf_quantidade_familias,
        bf_valor_repassado,
        bf_valor_medio_familia,
        bpc_quantidade_total,
        bpc_valor_total,
        populacao_estimada,
        bf_por_1000_hab,
        bpc_por_1000_hab
      FROM social.vw_mis_dados_validos
      WHERE codigo_ibge_municipio = $1
      ORDER BY ano_mes DESC
      LIMIT 24
    `, [codMun]);

    return NextResponse.json({
      competencia: competenciaAlvo,
      detalhe: detalhe ?? null,
      historico: historico.reverse(),
    });
  } catch (err) {
    console.error("[api/social/mis/municipio]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
