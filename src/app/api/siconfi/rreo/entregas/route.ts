import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// GET /api/siconfi/rreo/entregas
//
// Retorna visão de entregas RREO por município e período.
//
// Modo EXTRATO_OFICIAL: quando mart.siconfi_rreo_extrato_entregas tiver dados
//   para o período selecionado, enriquece a resposta com os campos do extrato
//   oficial do SICONFI (situacao_entrega_oficial, data_entrega, etc.).
//
// Modo PRESENCA_DADOS_LOCAL: fallback quando extrato ainda não foi coletado.
//   Usa apenas presença de dados em mart.siconfi_rreo_resumo_municipio.
//
// Justificativa de criação:
//   /api/siconfi/rreo/painel — sem filtro `situacao`, sem `percentual_com_dado`;
//     para períodos históricos perde municípios SEM_DADO.
//   /api/alertas/siconfi-rreo/detalhes — fixo no período mais recente.
// ---------------------------------------------------------------------------

type OrigemSituacao = "EXTRATO_OFICIAL" | "PRESENCA_DADOS_LOCAL";

interface PeriodoRow  { an_exercicio: number; nr_periodo: number; }
interface ItemEntrega {
  id_municipio:    number;
  no_municipio:    string | null;
  an_exercicio:    number;
  nr_periodo:      number;
  situacao_envio:  string;
  total_contas:    number | null;
  alertas_criticos: number;
  alertas_altos:    number;
  alertas_medios:   number;
  alertas_baixos:   number;
  atualizado_em:   string | null;
  // Campos do extrato oficial (preenchidos quando origem_situacao = EXTRATO_OFICIAL)
  situacao_entrega_oficial:   string | null;
  no_situacao_oficial:        string | null;
  data_entrega:               string | null;
  protocolo:                  string | null;
  possui_dado_rreo_carregado: boolean | null;
  situacao_consolidada:       string | null;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  // ── 1. Períodos disponíveis ───────────────────────────────────────────────
  const periodos = await dbQuery<PeriodoRow>(`
    SELECT DISTINCT an_exercicio, nr_periodo
    FROM mart.siconfi_rreo_resumo_municipio
    ORDER BY an_exercicio DESC, nr_periodo DESC
    LIMIT 24
  `);

  if (periodos.length === 0) {
    return NextResponse.json({
      an_exercicio:    null,
      nr_periodo:      null,
      periodos:        [],
      origem_situacao: "PRESENCA_DADOS_LOCAL" as OrigemSituacao,
      resumo: { total_municipios: 0, com_dado: 0, sem_dado: 0, percentual_com_dado: 0 },
      items:  [],
    });
  }

  // ── 2. Período-alvo ───────────────────────────────────────────────────────
  let ano     = sp.get("an_exercicio") ? parseInt(sp.get("an_exercicio")!, 10) : null;
  let periodo = sp.get("nr_periodo")   ? parseInt(sp.get("nr_periodo")!,   10) : null;

  if (!ano || isNaN(ano) || !periodo || isNaN(periodo)) {
    ano     = periodos[0].an_exercicio;
    periodo = periodos[0].nr_periodo;
  }

  // ── 3. Filtros opcionais ──────────────────────────────────────────────────
  const municipioFiltro = sp.get("municipio")?.trim() || null;
  const situacaoFiltro  = sp.get("situacao")?.toUpperCase() || null;

  const params: unknown[] = [ano, periodo];
  let municipioWhere = "";
  if (municipioFiltro) {
    params.push(`%${municipioFiltro}%`);
    municipioWhere = `AND u.no_municipio ILIKE $${params.length}`;
  }

  // ── 4. Detectar se extrato oficial está disponível para o período ─────────
  let origemSituacao: OrigemSituacao = "PRESENCA_DADOS_LOCAL";
  try {
    const check = await dbQuery<{ total: number }>(`
      SELECT COUNT(*)::int AS total
      FROM mart.siconfi_rreo_extrato_entregas
      WHERE an_exercicio = $1 AND nr_periodo = $2
    `, [ano, periodo]);
    if ((check[0]?.total ?? 0) > 0) origemSituacao = "EXTRATO_OFICIAL";
  } catch {
    // Tabela ainda não existe (migração pendente) — fallback silencioso
  }

  // ── 5. Query principal ────────────────────────────────────────────────────
  //
  // universo: todos os municípios que já apareceram na mart em qualquer período.
  // LEFT JOIN para o período selecionado: ausência → SEM_DADO.
  // Quando origemSituacao = EXTRATO_OFICIAL: adiciona JOIN com extrato.
  //
  const extratoJoin = origemSituacao === "EXTRATO_OFICIAL"
    ? `LEFT JOIN mart.siconfi_rreo_extrato_entregas e
         ON  e.id_municipio = u.id_municipio
         AND e.an_exercicio  = $1
         AND e.nr_periodo    = $2`
    : "";

  const extratoCols = origemSituacao === "EXTRATO_OFICIAL"
    ? `, e.situacao_entrega_oficial
       , e.no_situacao_oficial
       , e.data_entrega::text      AS data_entrega
       , e.protocolo
       , e.possui_dado_rreo_carregado
       , e.situacao_consolidada`
    : `, NULL::text    AS situacao_entrega_oficial
       , NULL::text    AS no_situacao_oficial
       , NULL::text    AS data_entrega
       , NULL::text    AS protocolo
       , NULL::boolean AS possui_dado_rreo_carregado
       , NULL::text    AS situacao_consolidada`;

  const items = await dbQuery<ItemEntrega>(`
    WITH universo AS (
      SELECT DISTINCT ON (id_municipio)
        id_municipio,
        no_municipio
      FROM mart.siconfi_rreo_resumo_municipio
      ORDER BY id_municipio, an_exercicio DESC, nr_periodo DESC
    ),
    alertas_agg AS (
      SELECT
        id_municipio,
        COUNT(*) FILTER (WHERE nivel = 'CRITICO')::int AS alertas_criticos,
        COUNT(*) FILTER (WHERE nivel = 'ALTO')::int    AS alertas_altos,
        COUNT(*) FILTER (WHERE nivel = 'MEDIO')::int   AS alertas_medios,
        COUNT(*) FILTER (WHERE nivel = 'BAIXO')::int   AS alertas_baixos
      FROM mart.siconfi_rreo_alertas
      WHERE an_exercicio = $1 AND nr_periodo = $2
      GROUP BY id_municipio
    )
    SELECT
      u.id_municipio,
      u.no_municipio,
      $1::int                                            AS an_exercicio,
      $2::int                                            AS nr_periodo,
      COALESCE(r.situacao_envio, 'SEM_DADO')             AS situacao_envio,
      r.total_contas,
      COALESCE(a.alertas_criticos, 0)                    AS alertas_criticos,
      COALESCE(a.alertas_altos,    0)                    AS alertas_altos,
      COALESCE(a.alertas_medios,   0)                    AS alertas_medios,
      COALESCE(a.alertas_baixos,   0)                    AS alertas_baixos,
      r.atualizado_em
      ${extratoCols}
    FROM universo u
    LEFT JOIN mart.siconfi_rreo_resumo_municipio r
      ON  r.id_municipio  = u.id_municipio
      AND r.an_exercicio  = $1
      AND r.nr_periodo    = $2
    LEFT JOIN alertas_agg a ON a.id_municipio = u.id_municipio
    ${extratoJoin}
    WHERE 1=1 ${municipioWhere}
    ORDER BY
      CASE COALESCE(r.situacao_envio, 'SEM_DADO')
        WHEN 'SEM_DADO' THEN 0 ELSE 1
      END,
      COALESCE(a.alertas_criticos, 0) DESC,
      COALESCE(a.alertas_altos,    0) DESC,
      COALESCE(a.alertas_medios,   0) DESC,
      u.no_municipio ASC
  `, params);

  // ── 6. Filtro de situação (pós-query, max 22 itens) ───────────────────────
  const itemsFiltrados = situacaoFiltro
    ? items.filter((i) => i.situacao_envio === situacaoFiltro)
    : items;

  // ── 7. Resumo ─────────────────────────────────────────────────────────────
  const totalMunicipios  = itemsFiltrados.length;
  const comDado          = itemsFiltrados.filter((i) => i.situacao_envio === "COM_DADO").length;
  const semDado          = itemsFiltrados.filter((i) => i.situacao_envio === "SEM_DADO").length;
  const percentualComDado = totalMunicipios > 0
    ? Math.round((comDado / totalMunicipios) * 1000) / 10
    : 0;

  return NextResponse.json({
    an_exercicio:    ano,
    nr_periodo:      periodo,
    periodos,
    origem_situacao: origemSituacao,
    resumo: { total_municipios: totalMunicipios, com_dado: comDado, sem_dado: semDado, percentual_com_dado: percentualComDado },
    items:  itemsFiltrados,
  });
}
