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
    filtroExtra = `AND e.id_entidade = $${params.length}`;
  } else if (ente && ente !== "all") {
    params.push(Number(ente));
    filtroExtra = `AND dte.id_ente = $${params.length}`;
  }

  const sql = `
    SELECT
      e.ano_remessa,
      e.id_entidade,
      dte.id_ente,
      e.mes_empenho,
      e.valor_empenhado_liquido,
      e.valor_liquidado,
      e.valor_pago
    FROM mart.despesa_evolucao_mensal e
    LEFT JOIN public.dim_entidade dte ON dte.id_entidade = e.id_entidade
    WHERE e.ano_remessa BETWEEN $1 AND $2
    ${filtroExtra}
    ORDER BY e.mes_empenho ASC
  `;

  try {
    const rows = await dbQuery(sql, params);
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[api/despesa/evolucao]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
