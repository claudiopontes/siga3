import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const competencia = sp.get("competencia");
  const idEntidade = sp.get("entidade");
  const poder = sp.get("poder");

  if (!competencia) {
    return NextResponse.json({ error: "competencia obrigatória" }, { status: 400 });
  }

  const params: unknown[] = [competencia];
  const filtros: string[] = ["fc.competencia = $1"];

  if (idEntidade && idEntidade !== "all") {
    params.push(Number(idEntidade));
    filtros.push(`fc.id_entidade_cjur = $${params.length}`);
  }
  if (poder && poder !== "all") {
    params.push(poder);
    filtros.push(`de.entidade_poder = $${params.length}`);
  }

  const sql = `
    SELECT
      SUM(fc.total_vencimentos)::numeric            AS total_vencimentos,
      SUM(fc.total_descontos)::numeric              AS total_descontos,
      SUM(fc.total_liquido)::numeric                AS total_liquido,
      SUM(fc.base_irpf)::numeric                    AS base_irpf,
      SUM(fc.base_previdenciaria_segurado)::numeric AS base_prev_segurado,
      SUM(fc.base_previdenciaria_patronal)::numeric AS base_prev_patronal,
      COUNT(*)::bigint                              AS qtd_contracheques,
      COUNT(DISTINCT fc.id_cadastro_unico_sicap)::bigint AS qtd_servidores,
      COUNT(DISTINCT fc.id_entidade_cjur)::bigint   AS qtd_entidades,
      COUNT(*) FILTER (WHERE fc.alerta_vencimento_negativo
                          OR fc.alerta_desconto_negativo
                          OR fc.alerta_desconto_maior_vencimento
                          OR fc.alerta_sem_desconto
                          OR fc.alerta_cpf_invalido
                          OR fc.alerta_cargo_ausente
                          OR fc.alerta_lotacao_ausente)::bigint AS qtd_contracheques_com_alerta
    FROM folha.fato_contracheque fc
    LEFT JOIN folha.dim_entidade de ON de.id_entidade_cjur = fc.id_entidade_cjur
    WHERE ${filtros.join(" AND ")}
  `;

  try {
    const rows = await dbQuery(sql, params);
    return NextResponse.json(rows[0] ?? null);
  } catch (err) {
    console.error("[api/folha/resumo]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
