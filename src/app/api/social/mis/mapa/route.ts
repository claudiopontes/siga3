import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const compInicio = searchParams.get("compInicio") ?? null;
  const compFim    = searchParams.get("compFim")    ?? null;

  try {
    // Determina o intervalo efetivo de competência
    const [rangeRow] = await dbQuery<{ inicio: string; fim: string }>(`
      SELECT
        COALESCE($1, MAX(ano_mes)) AS inicio,
        COALESCE($2, MAX(ano_mes)) AS fim
      FROM social.vw_mis_dados_validos
    `, [compInicio, compFim]);

    const inicio = rangeRow?.inicio ?? null;
    const fim    = rangeRow?.fim    ?? null;

    if (!inicio || !fim) {
      return NextResponse.json([]);
    }

    // Usa apenas o último mês do período selecionado (fim)
    const rows = await dbQuery<{
      codigo_ibge_municipio: string;
      nome_municipio:        string;
      bf_por_1000:           string | null;
      bpc_por_1000:          string | null;
      cobertura_por_1000:    string | null;
      bf_familias:           string | null;
      bpc_beneficiarios:     string | null;
      populacao_estimada:    string | null;
      meses_com_dados:       string;
    }>(`
      SELECT
        codigo_ibge_municipio,
        nome_municipio,
        bf_por_1000_hab                                                       AS bf_por_1000,
        bpc_por_1000_hab                                                      AS bpc_por_1000,
        COALESCE(bf_por_1000_hab, 0) + COALESCE(bpc_por_1000_hab, 0)         AS cobertura_por_1000,
        bf_quantidade_familias                                                AS bf_familias,
        bpc_quantidade_total                                                  AS bpc_beneficiarios,
        populacao_estimada                                                    AS populacao_estimada,
        1::text                                                               AS meses_com_dados
      FROM social.vw_mis_variacao
      WHERE ano_mes = $1
      ORDER BY nome_municipio
    `, [fim]);

    const result = rows.map((r) => ({
      codigo_ibge_municipio: r.codigo_ibge_municipio,
      nome_municipio:        r.nome_municipio,
      bf_por_1000:           Number(r.bf_por_1000    ?? 0),
      bpc_por_1000:          Number(r.bpc_por_1000   ?? 0),
      cobertura_por_1000:    Number(r.cobertura_por_1000 ?? 0),
      bf_familias:           Math.round(Number(r.bf_familias       ?? 0)),
      bpc_beneficiarios:     Math.round(Number(r.bpc_beneficiarios ?? 0)),
      populacao_estimada:    Math.round(Number(r.populacao_estimada ?? 0)),
      meses_com_dados:       Number(r.meses_com_dados),
      periodo: { inicio, fim },
    }));

    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/social/mis/mapa]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
