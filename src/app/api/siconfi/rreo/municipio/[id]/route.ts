import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// GET /api/siconfi/rreo/municipio/[id]
//
// Retorna histórico bimestral + alertas individuais de um município pelo
// id_municipio (código IBGE 7 dígitos), consultando diretamente os marts:
//   mart.siconfi_rreo_resumo_municipio — histórico por período
//   mart.siconfi_rreo_alertas         — todos os alertas (todos os níveis)
//
// Justificativa de criação:
//   /api/alertas/siconfi-rreo/detalhes → apenas CRITICO/ALTO, período mais
//     recente, filtro por nome (sem id_municipio).
//   /api/siconfi/rreo/painel → agregação por período único, sem histórico
//     longitudinal por município.
// ---------------------------------------------------------------------------

interface HistoricoRow {
  an_exercicio: number;
  nr_periodo: number;
  no_municipio: string | null;
  situacao_envio: string | null;
  total_contas: number | null;
  alertas_criticos: number;
  alertas_altos: number;
  alertas_medios: number;
  alertas_baixos: number;
  atualizado_em: string | null;
}

interface AlertaRow {
  id_alerta: number | null;
  an_exercicio: number;
  nr_periodo: number;
  tipo_alerta: string;
  nivel: string;
  descricao: string;
  valor_observado: number | null;
  valor_referencia: number | null;
  atualizado_em: string | null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const idMunicipio = parseInt(id, 10);

  if (isNaN(idMunicipio)) {
    return NextResponse.json(
      { error: "Parâmetro id_municipio inválido — deve ser um número inteiro." },
      { status: 400 }
    );
  }

  // ── 1. Histórico bimestral com alertas agregados ───────────────────────────
  const historico = await dbQuery<HistoricoRow>(`
    WITH alertas_agg AS (
      SELECT
        an_exercicio,
        nr_periodo,
        COUNT(*) FILTER (WHERE nivel = 'CRITICO')::int AS alertas_criticos,
        COUNT(*) FILTER (WHERE nivel = 'ALTO')::int    AS alertas_altos,
        COUNT(*) FILTER (WHERE nivel = 'MEDIO')::int   AS alertas_medios,
        COUNT(*) FILTER (WHERE nivel = 'BAIXO')::int   AS alertas_baixos
      FROM mart.siconfi_rreo_alertas
      WHERE id_municipio = $1
      GROUP BY an_exercicio, nr_periodo
    )
    SELECT
      r.an_exercicio,
      r.nr_periodo,
      r.no_municipio,
      r.situacao_envio,
      r.total_contas,
      r.atualizado_em,
      COALESCE(a.alertas_criticos, 0) AS alertas_criticos,
      COALESCE(a.alertas_altos,    0) AS alertas_altos,
      COALESCE(a.alertas_medios,   0) AS alertas_medios,
      COALESCE(a.alertas_baixos,   0) AS alertas_baixos
    FROM mart.siconfi_rreo_resumo_municipio r
    LEFT JOIN alertas_agg a
      ON  a.an_exercicio = r.an_exercicio
      AND a.nr_periodo   = r.nr_periodo
    WHERE r.id_municipio = $1
    ORDER BY r.an_exercicio DESC, r.nr_periodo DESC
  `, [idMunicipio]);

  // ── 2. Alertas individuais — todos os níveis, todos os períodos ────────────
  const alertas = await dbQuery<AlertaRow>(`
    SELECT
      id_alerta,
      an_exercicio,
      nr_periodo,
      tipo_alerta,
      nivel,
      descricao,
      valor_observado,
      valor_referencia,
      atualizado_em
    FROM mart.siconfi_rreo_alertas
    WHERE id_municipio = $1
    ORDER BY
      an_exercicio DESC,
      nr_periodo   DESC,
      CASE nivel
        WHEN 'CRITICO' THEN 1
        WHEN 'ALTO'    THEN 2
        WHEN 'MEDIO'   THEN 3
        ELSE 4
      END
    LIMIT 200
  `, [idMunicipio]);

  const noMunicipio = historico[0]?.no_municipio ?? null;

  return NextResponse.json({
    id_municipio: idMunicipio,
    no_municipio: noMunicipio,
    historico,
    alertas,
  });
}
