import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// GET /api/siconfi/rreo/ocorrencias
//
// Agrupa alertas de mart.siconfi_rreo_alertas por tipo_alerta para um período
// específico. Permite ao painel RREO exibir "Principais ocorrências no período"
// sem varredura item a item.
//
// Justificativa de criação:
//   /api/siconfi/rreo/painel    → agrega por município, não expõe tipo_alerta
//   /api/alertas/siconfi-rreo/detalhes → fixo no período mais recente,
//     máx 30 linhas, apenas CRITICO/ALTO, sem GROUP BY tipo_alerta
// ---------------------------------------------------------------------------

interface OcorrenciaRow {
  tipo_alerta:         string;
  municipios_afetados: number;
  alertas_criticos:    number;
  alertas_altos:       number;
  alertas_medios:      number;
  alertas_baixos:      number;
  descricao_exemplo:   string;
}

export async function GET(req: NextRequest) {
  const sp      = req.nextUrl.searchParams;
  const ano     = sp.get("an_exercicio") ? parseInt(sp.get("an_exercicio")!, 10) : null;
  const periodo = sp.get("nr_periodo")   ? parseInt(sp.get("nr_periodo")!,   10) : null;

  if (!ano || isNaN(ano) || !periodo || isNaN(periodo)) {
    return NextResponse.json(
      { error: "Parâmetros an_exercicio e nr_periodo são obrigatórios." },
      { status: 400 }
    );
  }

  const ocorrencias = await dbQuery<OcorrenciaRow>(`
    SELECT
      tipo_alerta,
      COUNT(DISTINCT id_municipio)::int                        AS municipios_afetados,
      COUNT(*) FILTER (WHERE nivel = 'CRITICO')::int           AS alertas_criticos,
      COUNT(*) FILTER (WHERE nivel = 'ALTO')::int              AS alertas_altos,
      COUNT(*) FILTER (WHERE nivel = 'MEDIO')::int             AS alertas_medios,
      COUNT(*) FILTER (WHERE nivel = 'BAIXO')::int             AS alertas_baixos,
      MIN(descricao)                                           AS descricao_exemplo
    FROM mart.siconfi_rreo_alertas
    WHERE an_exercicio = $1 AND nr_periodo = $2
    GROUP BY tipo_alerta
    ORDER BY
      MAX(CASE nivel
        WHEN 'CRITICO' THEN 1
        WHEN 'ALTO'    THEN 2
        WHEN 'MEDIO'   THEN 3
        ELSE 4
      END),
      COUNT(DISTINCT id_municipio) DESC,
      tipo_alerta
  `, [ano, periodo]);

  return NextResponse.json({
    an_exercicio: ano,
    nr_periodo:   periodo,
    ocorrencias,
  });
}
