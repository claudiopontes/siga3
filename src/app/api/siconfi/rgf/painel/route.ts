import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface PeriodoRow {
  an_exercicio: number;
  nr_periodo:   number;
}

interface MunicipioRgfRow {
  an_exercicio:         number;
  nr_periodo:           number;
  id_municipio:         number;
  no_municipio:         string | null;
  situacao_envio:       string | null;
  total_contas:         number | null;
  alertas_criticos:     number;
  alertas_altos:        number;
  alertas_medios:       number;
  alertas_baixos:       number;
  principal_ocorrencia: string | null;
  atualizado_em:        string | null;
}

// ---------------------------------------------------------------------------
// GET /api/siconfi/rgf/painel
// Params:
//   an_exercicio  — ano (opcional; padrão = mais recente disponível)
//   nr_periodo    — período 1-3 quadrimestral (opcional; padrão = mais recente)
//   municipio     — filtro de nome (ILIKE, opcional)
//   nivel         — CRITICO | ALTO | MEDIO | BAIXO (opcional)
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  // ── 1. Períodos disponíveis ──
  const periodos = await dbQuery<PeriodoRow>(`
    SELECT DISTINCT an_exercicio, nr_periodo
    FROM mart.siconfi_rgf_resumo_municipio
    ORDER BY an_exercicio DESC, nr_periodo DESC
    LIMIT 12
  `);

  // ── 2. Resolver período-alvo ──
  let ano    = sp.get("an_exercicio") ? parseInt(sp.get("an_exercicio")!, 10) : null;
  let periodo = sp.get("nr_periodo")  ? parseInt(sp.get("nr_periodo")!,  10) : null;

  if (!ano || isNaN(ano) || !periodo || isNaN(periodo)) {
    if (periodos.length === 0) {
      return NextResponse.json({
        an_exercicio: null,
        nr_periodo:   null,
        periodos:     [],
        resumo: { total_municipios: 0, com_dado: 0, sem_dado: 0, com_critico: 0, com_alto: 0, com_medio: 0, sem_alerta: 0 },
        municipios:   [],
      });
    }
    ano     = periodos[0].an_exercicio;
    periodo = periodos[0].nr_periodo;
  }

  const municipioFiltro = sp.get("municipio")?.trim() || null;
  const nivelFiltro     = sp.get("nivel")?.toUpperCase() || null;

  // ── 3. Query principal ──
  const params: unknown[] = [ano, periodo];
  let municipioWhere    = "";
  let municipioWhereSem = "";

  if (municipioFiltro) {
    params.push(`%${municipioFiltro}%`);
    municipioWhere    = `AND r.no_municipio ILIKE $${params.length}`;
    municipioWhereSem = `AND al.no_municipio ILIKE $${params.length}`;
  }

  const rows = await dbQuery<MunicipioRgfRow>(`
    WITH alertas_agg AS (
      SELECT
        id_municipio,
        COUNT(*) FILTER (WHERE nivel = 'CRITICO')::int AS alertas_criticos,
        COUNT(*) FILTER (WHERE nivel = 'ALTO')::int    AS alertas_altos,
        COUNT(*) FILTER (WHERE nivel = 'MEDIO')::int   AS alertas_medios,
        COUNT(*) FILTER (WHERE nivel = 'BAIXO')::int   AS alertas_baixos,
        MIN(descricao) AS principal_ocorrencia
      FROM mart.siconfi_rgf_alertas
      WHERE an_exercicio = $1 AND nr_periodo = $2
      GROUP BY id_municipio
    )
    SELECT
      r.an_exercicio,
      r.nr_periodo,
      r.id_municipio,
      r.no_municipio,
      r.situacao_envio,
      r.total_contas,
      r.atualizado_em,
      COALESCE(a.alertas_criticos, 0) AS alertas_criticos,
      COALESCE(a.alertas_altos,    0) AS alertas_altos,
      COALESCE(a.alertas_medios,   0) AS alertas_medios,
      COALESCE(a.alertas_baixos,   0) AS alertas_baixos,
      a.principal_ocorrencia
    FROM mart.siconfi_rgf_resumo_municipio r
    LEFT JOIN alertas_agg a ON r.id_municipio = a.id_municipio
    WHERE r.an_exercicio = $1 AND r.nr_periodo = $2
    ${municipioWhere}

    UNION ALL

    SELECT
      al.an_exercicio,
      al.nr_periodo,
      al.id_municipio,
      al.no_municipio,
      'SEM_DADO'             AS situacao_envio,
      NULL::int              AS total_contas,
      al.atualizado_em,
      COUNT(*)::int          AS alertas_criticos,
      0::int                 AS alertas_altos,
      0::int                 AS alertas_medios,
      0::int                 AS alertas_baixos,
      MIN(al.descricao)      AS principal_ocorrencia
    FROM mart.siconfi_rgf_alertas al
    WHERE al.an_exercicio = $1
      AND al.nr_periodo   = $2
      AND al.tipo_alerta  = 'rgf_sem_dado_recente'
      ${municipioWhereSem}
      AND NOT EXISTS (
        SELECT 1 FROM mart.siconfi_rgf_resumo_municipio r2
        WHERE r2.id_municipio = al.id_municipio
          AND r2.an_exercicio = al.an_exercicio
          AND r2.nr_periodo   = al.nr_periodo
      )
    GROUP BY al.an_exercicio, al.nr_periodo, al.id_municipio, al.no_municipio, al.atualizado_em

    ORDER BY
      alertas_criticos DESC,
      alertas_altos    DESC,
      alertas_medios   DESC,
      alertas_baixos   DESC,
      no_municipio     ASC
  `, params);

  // ── 4. Filtro de nível ──
  let municipios: MunicipioRgfRow[] = rows;
  if (nivelFiltro) {
    municipios = rows.filter((m) => {
      if (nivelFiltro === "CRITICO") return m.alertas_criticos > 0;
      if (nivelFiltro === "ALTO")    return m.alertas_altos    > 0;
      if (nivelFiltro === "MEDIO")   return m.alertas_medios   > 0;
      if (nivelFiltro === "BAIXO")   return m.alertas_baixos   > 0;
      return true;
    });
  }

  // ── 5. Resumo KPI ──
  const resumo = {
    total_municipios: municipios.length,
    com_dado:    municipios.filter((m) => m.situacao_envio === "COM_DADO").length,
    sem_dado:    municipios.filter((m) => m.situacao_envio === "SEM_DADO").length,
    com_critico: municipios.filter((m) => m.alertas_criticos > 0).length,
    com_alto:    municipios.filter((m) => m.alertas_altos    > 0 && m.alertas_criticos === 0).length,
    com_medio:   municipios.filter((m) => m.alertas_medios   > 0 && m.alertas_criticos === 0 && m.alertas_altos === 0).length,
    sem_alerta:  municipios.filter((m) =>
      m.alertas_criticos === 0 && m.alertas_altos === 0 &&
      m.alertas_medios   === 0 && m.alertas_baixos === 0 &&
      m.situacao_envio === "COM_DADO"
    ).length,
  };

  return NextResponse.json({ an_exercicio: ano, nr_periodo: periodo, periodos, resumo, municipios });
}
