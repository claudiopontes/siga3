import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { tetoConstitucional } from "@/lib/folha/teto-constitucional";

export const runtime = "nodejs";

/**
 * Retorna a contagem de cada tipo de alerta na competência selecionada.
 * Tipos consolidam alertas materializados no ETL + acúmulo de cargos +
 * acima do teto constitucional + variação anormal mês a mês (≥3 meses).
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const competencia = sp.get("competencia");
  const idEntidade = sp.get("entidade");
  const poder = sp.get("poder");

  if (!competencia) {
    return NextResponse.json({ error: "competencia obrigatória" }, { status: 400 });
  }

  const ano = Number(competencia.slice(0, 4));
  const teto = tetoConstitucional(ano);

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

  // 1) Contagem dos alertas materializados (rápida).
  const sqlMaterializados = `
    SELECT
      COUNT(*) FILTER (WHERE fc.alerta_vencimento_negativo)::bigint        AS vencimento_negativo,
      COUNT(*) FILTER (WHERE fc.alerta_desconto_negativo)::bigint          AS desconto_negativo,
      COUNT(*) FILTER (WHERE fc.alerta_desconto_maior_vencimento)::bigint  AS desconto_maior_vencimento,
      COUNT(*) FILTER (WHERE fc.alerta_sem_desconto)::bigint               AS sem_desconto,
      COUNT(*) FILTER (WHERE fc.alerta_cpf_invalido)::bigint               AS cpf_invalido,
      COUNT(*) FILTER (WHERE fc.alerta_cargo_ausente)::bigint              AS cargo_ausente,
      COUNT(*) FILTER (WHERE fc.alerta_lotacao_ausente)::bigint            AS lotacao_ausente
    FROM folha.fato_contracheque fc
    LEFT JOIN folha.dim_entidade de ON de.id_entidade_cjur = fc.id_entidade_cjur
    WHERE ${filtros.join(" AND ")}
  `;

  // 2) Acúmulo de cargos: mesmo cpf_hash com >1 vínculo (id_beneficiario_sicap)
  //    em entidades distintas. Tipos de folha (mensal/férias/13º/complementar)
  //    são ignorados — múltiplos contracheques do mesmo vínculo NÃO contam.
  //    Vínculos na mesma entidade tipicamente indicam transição cadastral,
  //    não acumulação entre empregadores públicos.
  const sqlAcumulo = `
    WITH base AS (
      SELECT fc.cpf_hash
        FROM folha.fato_contracheque fc
        LEFT JOIN folha.dim_entidade de ON de.id_entidade_cjur = fc.id_entidade_cjur
       WHERE ${filtros.join(" AND ")}
         AND fc.cpf_hash IS NOT NULL
         AND fc.id_beneficiario_sicap IS NOT NULL
       GROUP BY fc.cpf_hash
      HAVING COUNT(DISTINCT fc.id_beneficiario_sicap) > 1
         AND COUNT(DISTINCT fc.id_entidade_cjur)      > 1
    )
    SELECT COUNT(*)::bigint AS qtd_servidores_acumulando
      FROM base
  `;

  // 3) Teto constitucional.
  const paramsTeto = [...params, teto];
  const sqlTeto = `
    SELECT COUNT(*)::bigint AS qtd_acima_teto
      FROM folha.fato_contracheque fc
      LEFT JOIN folha.dim_entidade de ON de.id_entidade_cjur = fc.id_entidade_cjur
     WHERE ${filtros.join(" AND ")}
       AND fc.total_liquido > $${paramsTeto.length}
  `;

  // 4) Variação anormal: compara líquido com competência anterior, no mesmo escopo.
  //    Conta servidores cujo líquido variou > 30% para mais ou menos.
  const compAnoMes = competencia.split("-").map(Number);
  let anoAnt = compAnoMes[0];
  let mesAnt = compAnoMes[1] - 1;
  if (mesAnt === 0) { mesAnt = 12; anoAnt -= 1; }
  const compAnt = `${anoAnt}-${String(mesAnt).padStart(2, "0")}`;

  const paramsVar: unknown[] = [competencia, compAnt];
  const filtrosVar: string[] = ["fc.competencia IN ($1, $2)"];
  if (idEntidade && idEntidade !== "all") {
    paramsVar.push(Number(idEntidade));
    filtrosVar.push(`fc.id_entidade_cjur = $${paramsVar.length}`);
  }
  if (poder && poder !== "all") {
    paramsVar.push(poder);
    filtrosVar.push(`de.entidade_poder = $${paramsVar.length}`);
  }

  const sqlVariacao = `
    WITH base AS (
      SELECT fc.cpf_hash, fc.competencia, SUM(fc.total_liquido) AS liquido
        FROM folha.fato_contracheque fc
        LEFT JOIN folha.dim_entidade de ON de.id_entidade_cjur = fc.id_entidade_cjur
       WHERE ${filtrosVar.join(" AND ")} AND fc.cpf_hash IS NOT NULL
       GROUP BY fc.cpf_hash, fc.competencia
    ),
    pivot AS (
      SELECT cpf_hash,
             SUM(CASE WHEN competencia = $1 THEN liquido END) AS atual,
             SUM(CASE WHEN competencia = $2 THEN liquido END) AS anterior
        FROM base
       GROUP BY cpf_hash
    )
    SELECT
      COUNT(*) FILTER (WHERE atual IS NOT NULL AND anterior IS NOT NULL)::bigint AS qtd_com_anterior_referencia,
      COUNT(*) FILTER (
        WHERE atual IS NOT NULL AND anterior IS NOT NULL AND anterior > 0
          AND ABS(atual - anterior) / anterior > 0.3
      )::bigint AS qtd_variacao_anormal
      FROM pivot
  `;

  try {
    const [matRows, acuRows, tetoRows, varRows] = await Promise.all([
      dbQuery<Record<string, string>>(sqlMaterializados, params),
      dbQuery<{ qtd_servidores_acumulando: string }>(sqlAcumulo, params),
      dbQuery<{ qtd_acima_teto: string }>(sqlTeto, paramsTeto),
      dbQuery<{ qtd_variacao_anormal: string; qtd_com_anterior_referencia: string }>(sqlVariacao, paramsVar)
        .catch(() => [{ qtd_variacao_anormal: "0", qtd_com_anterior_referencia: "0" }]),
    ]);

    return NextResponse.json({
      materializados: matRows[0] ?? {},
      acumulo_de_cargos: Number(acuRows[0]?.qtd_servidores_acumulando ?? 0),
      acima_do_teto: Number(tetoRows[0]?.qtd_acima_teto ?? 0),
      variacao_anormal_mes_a_mes: Number(varRows[0]?.qtd_variacao_anormal ?? 0),
      teto_constitucional_aplicado: teto,
      competencia_anterior_comparada: compAnt,
      qtd_servidores_com_referencia_anterior: Number(varRows[0]?.qtd_com_anterior_referencia ?? 0),
    });
  } catch (err) {
    console.error("[api/folha/alertas/contagem]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
