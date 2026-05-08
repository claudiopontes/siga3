import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const anoInicio = sp.get("anoInicio");
  const anoFim = sp.get("anoFim");
  const ente = sp.get("ente");
  const entidade = sp.get("entidade");

  if (!anoInicio || !anoFim) {
    return NextResponse.json({ error: "Parâmetros anoInicio e anoFim são obrigatórios." }, { status: 400 });
  }

  const params: unknown[] = [Number(anoInicio), Number(anoFim)];
  let filtroExtra = "";

  if (entidade && entidade !== "all") {
    params.push(Number(entidade));
    filtroExtra = `AND EXISTS (
      SELECT 1 FROM mart.despesa_resumo dr
      LEFT JOIN public.dim_entidade dte2 ON dte2.id_entidade = dr.id_entidade
      WHERE dr.ano_remessa BETWEEN $1 AND $2
        AND dte2.id_entidade = $${params.length}
    )`;
  } else if (ente && ente !== "all") {
    params.push(Number(ente));
    filtroExtra = `AND EXISTS (
      SELECT 1 FROM mart.despesa_resumo dr
      LEFT JOIN public.dim_entidade dte2 ON dte2.id_entidade = dr.id_entidade
      WHERE dr.ano_remessa BETWEEN $1 AND $2
        AND dte2.id_ente = $${params.length}
    )`;
  }

  const sql = `
    SELECT
      r.ano_remessa,
      r.cpf_cnpj_credor,
      r.nome_credor,
      r.valor_empenhado_liquido,
      r.valor_pago,
      r.qtd_empenhos
    FROM mart.despesa_ranking_credores r
    WHERE r.ano_remessa BETWEEN $1 AND $2
    ${filtroExtra}
    ORDER BY r.valor_pago DESC
    LIMIT 10
  `;

  try {
    const rows = await dbQuery(sql, params);
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[api/despesa/ranking-credores]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
