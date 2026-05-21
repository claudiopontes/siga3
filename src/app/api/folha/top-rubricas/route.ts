import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Top N rubricas (verba_codigo + descrição) por valor absoluto movimentado
 * na competência. Substitui a antiga "composição por natureza", que dependia
 * do campo livre `verba_natureza` do SICAP e ficava pouco informativa.
 *
 * O sinal/categoria fica explícito no campo `compoe_vencimento` (provento
 * típico quando true; desconto ou base quando false).
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const competencia = sp.get("competencia");
  const idEntidade = sp.get("entidade");
  const poder = sp.get("poder");
  const limit = Math.min(Number(sp.get("limit") ?? "15"), 100);
  const incluirInformativas = ["1", "true", "yes"].includes(
    String(sp.get("incluir_informativas") ?? "").toLowerCase(),
  );

  if (!competencia) {
    return NextResponse.json({ error: "competencia obrigatória" }, { status: 400 });
  }

  const params: unknown[] = [competencia];
  const filtros: string[] = ["fv.competencia = $1"];

  if (idEntidade && idEntidade !== "all") {
    params.push(Number(idEntidade));
    filtros.push(`fv.id_entidade_cjur = $${params.length}`);
  }
  if (poder && poder !== "all") {
    params.push(poder);
    filtros.push(`de.entidade_poder = $${params.length}`);
  }

  // Informativa: não compõe vencimento E é flag de base (IRRF/INSS/FGTS).
  // Por padrão exclui essas verbas — elas inflam o "valor movimentado"
  // sem terem efeito financeiro real no líquido.
  if (!incluirInformativas) {
    filtros.push(`NOT (
      COALESCE(fv.verba_compoe_vencimento_padrao, false) = false
      AND (COALESCE(fv.verba_base_irpf, false)
           OR COALESCE(fv.verba_base_previdencia, false)
           OR COALESCE(fv.verba_base_fgts, false))
    )`);
  }
  params.push(limit);

  const sql = `
    SELECT
      fv.verba_codigo,
      COALESCE(MAX(fv.verba_descricao), '—')                       AS verba_descricao,
      MAX(fv.verba_natureza)                                       AS verba_natureza,
      BOOL_OR(COALESCE(fv.verba_compoe_vencimento_padrao, false))  AS compoe_vencimento,
      BOOL_OR(COALESCE(fv.verba_base_irpf, false))                 AS base_irpf,
      BOOL_OR(COALESCE(fv.verba_base_previdencia, false))          AS base_previdencia,
      BOOL_OR(COALESCE(fv.verba_base_fgts, false))                 AS base_fgts,
      SUM(fv.verba_valor)::numeric                                 AS valor_liquido,
      SUM(ABS(fv.verba_valor))::numeric                            AS valor_absoluto,
      COUNT(*)::bigint                                             AS qtd_ocorrencias,
      COUNT(DISTINCT fv.id_cadastro_unico_sicap)::bigint           AS qtd_servidores
    FROM folha.fato_verba_contracheque fv
    LEFT JOIN folha.dim_entidade de ON de.id_entidade_cjur = fv.id_entidade_cjur
    WHERE ${filtros.join(" AND ")}
    GROUP BY fv.verba_codigo
    ORDER BY valor_absoluto DESC NULLS LAST
    LIMIT $${params.length}
  `;

  try {
    const rows = await dbQuery(sql, params);
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[api/folha/top-rubricas]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
