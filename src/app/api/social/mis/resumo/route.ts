import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const municipio = searchParams.get("municipio") || null;

  try {
    // Competência válida mais recente
    const [compRow] = await dbQuery<{ ano_mes: string }>(`
      SELECT MAX(ano_mes) AS ano_mes
      FROM social.vw_mis_dados_validos
      ${municipio ? "WHERE codigo_ibge_municipio = $1" : ""}
    `, municipio ? [municipio] : []);

    const competencia = compRow?.ano_mes ?? null;

    if (!competencia) {
      return NextResponse.json({
        competencia: null,
        cards: null,
        qualidade: { municipios_com_dados: 0, municipios_zerados: 0, municipios_sem_populacao: 0, data_carga: null },
      });
    }

    // Dados da competência mais recente (agregado ou por município)
    const cardRows = await dbQuery<Record<string, unknown>>(`
      SELECT
        v.codigo_ibge_municipio,
        v.nome_municipio,
        v.ano_mes,
        v.bf_quantidade_familias,
        v.bf_valor_repassado,
        v.bf_valor_medio_familia,
        v.bpc_quantidade_total,
        v.bpc_quantidade_deficiencia,
        v.bpc_quantidade_idoso,
        v.bpc_valor_total,
        v.bpc_valor_deficiencia,
        v.bpc_valor_idoso,
        v.bpc_valor_medio_beneficiario,
        v.pct_bpc_deficiencia,
        v.pct_bpc_idoso,
        v.bf_por_1000_hab,
        v.bpc_por_1000_hab,
        v.populacao_estimada,
        v.var_mensal_bf_qty,
        v.var_mensal_bf_qty_pct,
        v.var_mensal_bf_valor,
        v.var_anual_bf_qty,
        v.var_anual_bf_qty_pct,
        v.var_anual_bf_valor_pct,
        v.var_anual_bpc_qty,
        v.var_anual_bpc_qty_pct,
        v.var_mensal_bpc_qty_pct,
        v.data_carga
      FROM social.vw_mis_variacao v
      WHERE v.ano_mes = $1
        ${municipio ? "AND v.codigo_ibge_municipio = $2" : ""}
      ORDER BY v.nome_municipio
    `, municipio ? [competencia, municipio] : [competencia]);

    // Qualidade dos dados
    const [qual] = await dbQuery<{
      municipios_com_dados: string;
      municipios_zerados: string;
      municipios_sem_populacao: string;
      data_carga: string | null;
    }>(`
      SELECT
        COUNT(*)                                                                    AS municipios_com_dados,
        COUNT(*) FILTER (WHERE COALESCE(bf_quantidade_familias, 0) = 0
                           AND COALESCE(bf_valor_repassado, 0) = 0)                AS municipios_zerados,
        COUNT(*) FILTER (WHERE COALESCE(populacao_estimada, 0) = 0)                AS municipios_sem_populacao,
        MAX(data_carga)::text                                                      AS data_carga
      FROM social.vw_mis_dados_validos
      WHERE ano_mes = $1
    `, [competencia]);

    // Totais agregados para cards (quando não filtrado por município)
    interface TotaisAcc {
      bf_quantidade_familias: number;
      bf_valor_repassado: number;
      bpc_quantidade_total: number;
      bpc_quantidade_deficiencia: number;
      bpc_quantidade_idoso: number;
      bpc_valor_total: number;
      bpc_valor_deficiencia: number;
      bpc_valor_idoso: number;
      populacao_estimada: number;
    }
    const totais = cardRows.reduce<TotaisAcc>((acc, r) => ({
      bf_quantidade_familias:    acc.bf_quantidade_familias    + Number(r.bf_quantidade_familias    ?? 0),
      bf_valor_repassado:        acc.bf_valor_repassado        + Number(r.bf_valor_repassado        ?? 0),
      bpc_quantidade_total:      acc.bpc_quantidade_total      + Number(r.bpc_quantidade_total      ?? 0),
      bpc_quantidade_deficiencia:acc.bpc_quantidade_deficiencia+ Number(r.bpc_quantidade_deficiencia ?? 0),
      bpc_quantidade_idoso:      acc.bpc_quantidade_idoso      + Number(r.bpc_quantidade_idoso      ?? 0),
      bpc_valor_total:           acc.bpc_valor_total           + Number(r.bpc_valor_total           ?? 0),
      bpc_valor_deficiencia:     acc.bpc_valor_deficiencia     + Number(r.bpc_valor_deficiencia     ?? 0),
      bpc_valor_idoso:           acc.bpc_valor_idoso           + Number(r.bpc_valor_idoso           ?? 0),
      populacao_estimada:        acc.populacao_estimada        + Number(r.populacao_estimada        ?? 0),
    }), {
      bf_quantidade_familias: 0, bf_valor_repassado: 0,
      bpc_quantidade_total: 0, bpc_quantidade_deficiencia: 0, bpc_quantidade_idoso: 0,
      bpc_valor_total: 0, bpc_valor_deficiencia: 0, bpc_valor_idoso: 0,
      populacao_estimada: 0,
    });

    const bf_valor_medio = totais.bf_quantidade_familias > 0
      ? totais.bf_valor_repassado / totais.bf_quantidade_familias : null;
    const bpc_valor_medio = totais.bpc_quantidade_total > 0
      ? totais.bpc_valor_total / totais.bpc_quantidade_total : null;
    const bf_por_1000 = totais.populacao_estimada > 0
      ? (totais.bf_quantidade_familias / totais.populacao_estimada * 1000) : null;
    const bpc_por_1000 = totais.populacao_estimada > 0
      ? (totais.bpc_quantidade_total / totais.populacao_estimada * 1000) : null;

    // Variações agregadas — soma absoluta e média percentual
    const comVarMensal = cardRows.filter((r) => r.var_mensal_bf_qty !== null);
    const varMensalBFQty = comVarMensal.length > 0
      ? comVarMensal.reduce((s, r) => s + Number(r.var_mensal_bf_qty ?? 0), 0)
      : null;
    const varMensalBFPct = comVarMensal.length > 0 && totais.bf_quantidade_familias > 0
      ? (() => {
          const qtdAnterior = totais.bf_quantidade_familias - (varMensalBFQty ?? 0);
          return qtdAnterior > 0
            ? Math.round(((varMensalBFQty ?? 0) / qtdAnterior) * 1000) / 10
            : null;
        })()
      : null;

    const comVarAnual = cardRows.filter((r) => r.var_anual_bf_qty_pct !== null);
    const mediaVarAnualBF = comVarAnual.length > 0
      ? comVarAnual.reduce((s, r) => s + Number(r.var_anual_bf_qty_pct ?? 0), 0) / comVarAnual.length
      : null;

    const comVarMensalBPC = cardRows.filter((r) => r.var_mensal_bpc_qty !== null);
    const varMensalBPCQty = comVarMensalBPC.length > 0
      ? comVarMensalBPC.reduce((s, r) => s + Number(r.var_mensal_bpc_qty ?? 0), 0)
      : null;
    const varMensalBPCPct = varMensalBPCQty !== null && totais.bpc_quantidade_total > 0
      ? (() => {
          const qtdAnterior = totais.bpc_quantidade_total - varMensalBPCQty;
          return qtdAnterior > 0
            ? Math.round((varMensalBPCQty / qtdAnterior) * 1000) / 10
            : null;
        })()
      : null;

    const comVarAnualBPC = cardRows.filter((r) => r.var_anual_bpc_qty_pct !== null);
    const mediaVarAnualBPC = comVarAnualBPC.length > 0
      ? comVarAnualBPC.reduce((s, r) => s + Number(r.var_anual_bpc_qty_pct ?? 0), 0) / comVarAnualBPC.length
      : null;

    return NextResponse.json({
      competencia,
      municipios: cardRows,
      totais: {
        ...totais,
        bf_valor_medio_familia: bf_valor_medio,
        bpc_valor_medio_beneficiario: bpc_valor_medio,
        bf_por_1000_hab: bf_por_1000,
        bpc_por_1000_hab: bpc_por_1000,
        pct_bpc_deficiencia: totais.bpc_quantidade_total > 0
          ? (totais.bpc_quantidade_deficiencia / totais.bpc_quantidade_total * 100) : null,
        pct_bpc_idoso: totais.bpc_quantidade_total > 0
          ? (totais.bpc_quantidade_idoso / totais.bpc_quantidade_total * 100) : null,
        var_mensal_bf_qty: varMensalBFQty,
        var_mensal_bf_qty_pct: varMensalBFPct,
        var_mensal_bpc_qty: varMensalBPCQty,
        var_mensal_bpc_qty_pct: varMensalBPCPct,
        media_var_anual_bf_qty_pct: mediaVarAnualBF,
        media_var_anual_bpc_qty_pct: mediaVarAnualBPC,
      },
      qualidade: {
        municipios_com_dados: Number(qual?.municipios_com_dados ?? 0),
        municipios_zerados: Number(qual?.municipios_zerados ?? 0),
        municipios_sem_populacao: Number(qual?.municipios_sem_populacao ?? 0),
        data_carga: qual?.data_carga ?? null,
      },
    });
  } catch (err) {
    console.error("[api/social/mis/resumo]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
