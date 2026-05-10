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
    filtroExtra = `AND c.id_entidade = $${params.length}`;
  } else if (ente && ente !== "all") {
    params.push(Number(ente));
    filtroExtra = `AND dte.id_ente = $${params.length}`;
  }

  const sql = `
    SELECT
      c.ano_remessa,
      c.id_entidade,
      dte.id_ente,
      c.tipo_composicao,
      c.codigo,
      CASE
        WHEN c.tipo_composicao = 'elemento_despesa'
          THEN COALESCE(ae.nome, c.rotulo)
        ELSE c.rotulo
      END AS rotulo,
      c.valor_empenhado_liquido,
      c.valor_liquidado,
      c.valor_pago
    FROM mart.despesa_composicao c
    LEFT JOIN public.dim_entidade dte ON dte.id_entidade = c.id_entidade
    LEFT JOIN public.aux_elemento_despesa ae ON ae.codigo = LPAD(c.codigo, 2, '0')
    WHERE c.ano_remessa BETWEEN $1 AND $2
      AND c.tipo_composicao IN ('categoria_economica', 'elemento_despesa')
    ${filtroExtra}
  `;

  try {
    const rows = await dbQuery(sql, params);
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[api/despesa/composicao]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
