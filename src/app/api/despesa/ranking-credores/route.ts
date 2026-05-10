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

  // Quando há filtro por ente/entidade, consulta fato_empenho diretamente para garantir
  // que apenas os credores daquela entidade/ente sejam retornados.
  let sql: string;

  if (entidade && entidade !== "all") {
    params.push(Number(entidade));
    sql = `
      SELECT
        fe.ano_remessa,
        fe.id_entidade,
        fe.cpf_cnpj_credor,
        COALESCE(cp.nome_exibicao, dc.nome, fe.cpf_cnpj_credor) AS nome_credor,
        SUM(fe.valor_empenhado_liquido)::numeric(19,2) AS valor_empenhado_liquido,
        SUM(fe.valor_pago)::numeric(19,2)             AS valor_pago,
        COUNT(*)::integer                              AS qtd_empenhos
      FROM public.fato_empenho fe
      LEFT JOIN public.dim_credor      dc ON dc.cnpj_cpf         = fe.cpf_cnpj_credor
      LEFT JOIN mart.credor_pesquisa   cp ON cp.cpf_cnpj_credor  = fe.cpf_cnpj_credor
      WHERE fe.ano_remessa BETWEEN $1 AND $2
        AND fe.id_entidade = $3
        AND fe.cpf_cnpj_credor IS NOT NULL
      GROUP BY fe.ano_remessa, fe.id_entidade, fe.cpf_cnpj_credor, cp.nome_exibicao, dc.nome
      ORDER BY valor_pago DESC
      LIMIT 10
    `;
  } else if (ente && ente !== "all") {
    params.push(Number(ente));
    sql = `
      SELECT
        fe.ano_remessa,
        de.id_ente,
        fe.cpf_cnpj_credor,
        COALESCE(cp.nome_exibicao, dc.nome, fe.cpf_cnpj_credor) AS nome_credor,
        SUM(fe.valor_empenhado_liquido)::numeric(19,2) AS valor_empenhado_liquido,
        SUM(fe.valor_pago)::numeric(19,2)             AS valor_pago,
        COUNT(*)::integer                              AS qtd_empenhos
      FROM public.fato_empenho fe
      LEFT JOIN public.dim_credor      dc  ON dc.cnpj_cpf         = fe.cpf_cnpj_credor
      LEFT JOIN public.dim_entidade    de  ON de.id_entidade       = fe.id_entidade::bigint
      LEFT JOIN mart.credor_pesquisa   cp  ON cp.cpf_cnpj_credor   = fe.cpf_cnpj_credor
      WHERE fe.ano_remessa BETWEEN $1 AND $2
        AND de.id_ente = $3
        AND fe.cpf_cnpj_credor IS NOT NULL
      GROUP BY fe.ano_remessa, de.id_ente, fe.cpf_cnpj_credor, cp.nome_exibicao, dc.nome
      ORDER BY valor_pago DESC
      LIMIT 10
    `;
  } else {
    // Sem filtro — usa mart já agregado (global)
    sql = `
      SELECT
        r.ano_remessa,
        r.cpf_cnpj_credor,
        COALESCE(cp.nome_exibicao, r.nome_credor) AS nome_credor,
        r.valor_empenhado_liquido,
        r.valor_pago,
        r.qtd_empenhos
      FROM mart.despesa_ranking_credores r
      LEFT JOIN mart.credor_pesquisa cp ON cp.cpf_cnpj_credor = r.cpf_cnpj_credor
      WHERE r.ano_remessa BETWEEN $1 AND $2
      ORDER BY r.valor_pago DESC
      LIMIT 10
    `;
  }

  try {
    const rows = await dbQuery(sql, params);
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[api/despesa/ranking-credores]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
