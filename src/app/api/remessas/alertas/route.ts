import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const ano = sp.get("ano");
  const nivel = sp.get("nivel");
  const tipoAlerta = sp.get("tipo_alerta");
  const idEntidade = sp.get("id_entidade");
  const limitParam = sp.get("limit");
  const limit = limitParam ? Math.min(Math.max(1, Number(limitParam)), 1000) : 20;

  const params: unknown[] = [];
  const filtros: string[] = ["origem = 'CONTABIL'"];

  if (ano) {
    params.push(Number(ano));
    filtros.push(`ano = $${params.length}`);
  }
  if (nivel) {
    params.push(nivel.toUpperCase());
    filtros.push(`nivel = $${params.length}`);
  }
  if (tipoAlerta) {
    params.push(tipoAlerta);
    filtros.push(`tipo_alerta = $${params.length}`);
  }
  if (idEntidade) {
    params.push(Number(idEntidade));
    filtros.push(`id_entidade = $${params.length}`);
  }

  params.push(limit);
  const limitPlaceholder = `$${params.length}`;

  const sql = `
    SELECT
      id_alerta,
      origem,
      id_remessa,
      id_entidade,
      id_entidade_cjur,
      nome_entidade,
      nome_ente,
      ano,
      numero,
      tipo_alerta,
      nivel,
      descricao,
      prazo_envio,
      data_envio,
      data_confirmacao,
      data_processamento,
      dias_atraso,
      situacao,
      status_publicacao,
      detalhe_json,
      atualizado_em
    FROM mart.remessa_alertas
    WHERE ${filtros.join(" AND ")}
    ORDER BY nivel DESC, dias_atraso DESC NULLS LAST, ano DESC
    LIMIT ${limitPlaceholder}
  `;

  try {
    const rows = await dbQuery(sql, params);
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[api/remessas/alertas]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
