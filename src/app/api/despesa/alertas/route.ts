import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const anoInicio = sp.get("anoInicio");
  const anoFim = sp.get("anoFim");
  const ente = sp.get("ente");
  const entidade = sp.get("entidade");
  const tipo = sp.get("tipo");

  if (!anoInicio || !anoFim) {
    return NextResponse.json({ error: "Parâmetros anoInicio e anoFim são obrigatórios." }, { status: 400 });
  }

  const params: unknown[] = [Number(anoInicio), Number(anoFim)];
  const filtros: string[] = [];

  if (tipo) {
    params.push(tipo);
    filtros.push(`a.tipo_alerta = $${params.length}`);
  }

  if (entidade && entidade !== "all") {
    params.push(Number(entidade));
    filtros.push(`a.id_entidade = $${params.length}`);
  } else if (ente && ente !== "all") {
    params.push(Number(ente));
    filtros.push(`dte.id_ente = $${params.length}`);
  }

  const filtroExtra = filtros.length > 0 ? `AND ${filtros.join(" AND ")}` : "";

  const sql = `
    SELECT
      a.ano_remessa,
      a.id_entidade,
      dte.id_ente,
      a.tipo_alerta,
      a.nivel,
      a.descricao,
      a.detalhe_json,
      a.valor_referencia AS valor_principal
    FROM mart.despesa_alertas a
    LEFT JOIN public.dim_entidade dte ON dte.id_entidade = a.id_entidade
    WHERE a.ano_remessa BETWEEN $1 AND $2
    ${filtroExtra}
    ORDER BY a.valor_referencia DESC
    LIMIT 10
  `;

  try {
    const rows = await dbQuery(sql, params);
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[api/despesa/alertas]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
