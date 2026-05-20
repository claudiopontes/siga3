import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/educacao/mapa-acre?edicao=2023
 *
 * Indicadores educacionais consolidados por município do Acre.
 *
 * Retorna:
 *  - edicoes:    lista de anos disponíveis em dw.fato_inep_ideb_municipal
 *  - edicao:     ano selecionado (query ?edicao=YYYY ou o mais recente)
 *  - municipios: dados da edição (rede "Pública") + último rendimento Total/Total
 *  - kpis:       médias estaduais e contagens
 *  - evolucao:   série histórica AC (IDEB médio por etapa, todas as edições)
 *
 * Fonte: dw.fato_inep_ideb_municipal, dw.fato_inep_rendimento_municipal,
 *        mart.painel_educacao_municipio, vw_populacao_ibge_vigente.
 */

const REDE_PUBLICO       = "Pública";
const LOCALIZACAO_TOTAL  = "Total";
const DEPENDENCIA_TOTAL  = "Total";

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function media(vals: Array<number | null>): number | null {
  const validos = vals.filter((v): v is number => v !== null && Number.isFinite(v));
  if (!validos.length) return null;
  return validos.reduce((a, b) => a + b, 0) / validos.length;
}

export async function GET(req: Request) {
  try {
    // ── 1. Edições disponíveis (anos de observação dentro de qualquer edição) ──
    const edicoesRows = await dbQuery<{ ano: number }>(`
      SELECT DISTINCT ano
      FROM dw.fato_inep_ideb_municipal
      WHERE sg_uf = 'AC' AND ideb_observado IS NOT NULL
      ORDER BY ano DESC
    `);
    const edicoes = edicoesRows.map((r) => r.ano);
    if (!edicoes.length) {
      return NextResponse.json({
        edicoes: [], edicao: null, municipios: [],
        kpis: null, evolucao: [], fonte: "INEP", atualizado_em: null,
      });
    }

    // ── 2. Edição selecionada (query ou mais recente) ──
    const url = new URL(req.url);
    const edicaoParam = url.searchParams.get("edicao");
    const edicaoSel = edicaoParam && edicoes.includes(parseInt(edicaoParam, 10))
      ? parseInt(edicaoParam, 10)
      : edicoes[0];

    // ── 2b. Exercício fiscal selecionado (Custo Educação SICONFI/TCE) ──
    const exerciciosFiscaisRows = await dbQuery<{ an_exercicio: number }>(
      `SELECT DISTINCT an_exercicio FROM mart.gasto_aluno_municipio WHERE sg_uf = 'AC' ORDER BY an_exercicio DESC`,
    );
    const exerciciosFiscais = exerciciosFiscaisRows.map((r) => r.an_exercicio);
    const exercicioParam = parseInt(url.searchParams.get("exercicio") ?? "", 10);
    const exercicioSel = exerciciosFiscais.includes(exercicioParam)
      ? exercicioParam
      : (exerciciosFiscais[0] ?? new Date().getFullYear());

    // ── 3. Município × etapa para a edição selecionada (rede Pública) ──
    interface LinhaIdeb {
      cod_municipio: number;
      no_municipio: string | null;
      etapa: string;
      ideb_observado: string | null;
      ideb_projetado: string | null;
    }
    const idebRows = await dbQuery<LinhaIdeb>(`
      SELECT cod_municipio, MAX(no_municipio) AS no_municipio, etapa,
             MAX(ideb_observado) AS ideb_observado,
             MAX(ideb_projetado) AS ideb_projetado
      FROM dw.fato_inep_ideb_municipal
      WHERE sg_uf = 'AC' AND rede = $1 AND ano = $2
      GROUP BY cod_municipio, etapa
    `, [REDE_PUBLICO, edicaoSel]);

    // Indexa por município
    const porMun = new Map<number, {
      ai: number | null; af: number | null; em: number | null;
      meta_ai: number | null; meta_af: number | null; meta_em: number | null;
      nome: string | null;
    }>();
    for (const r of idebRows) {
      const cur = porMun.get(r.cod_municipio) ?? {
        ai: null, af: null, em: null, meta_ai: null, meta_af: null, meta_em: null, nome: r.no_municipio,
      };
      const obs = num(r.ideb_observado);
      const proj = num(r.ideb_projetado);
      if (r.etapa === "AI") { cur.ai = obs; cur.meta_ai = proj; }
      if (r.etapa === "AF") { cur.af = obs; cur.meta_af = proj; }
      if (r.etapa === "EM") { cur.em = obs; cur.meta_em = proj; }
      cur.nome = cur.nome ?? r.no_municipio;
      porMun.set(r.cod_municipio, cur);
    }

    // ── 4. Gasto MDE por Aluno (por município) ──
    interface LinhaGasto {
      cod_municipio: number;
      an_exercicio: number | null;
      nr_periodo: number | null;
      total_mde: string | null;
      total_despesa_educacao: string | null;
      total_matriculas_bas: number | null;
      gasto_aluno_mde: string | null;
      gasto_aluno_educacao: string | null;
      ano_referencia_tce: number | null;
      total_despesa_educacao_tce: string | null;
      gasto_aluno_educacao_tce: string | null;
      divergencia_educacao_pct: string | null;
    }
    let porGasto = new Map<number, LinhaGasto>();
    try {
      const gastoRows = await dbQuery<LinhaGasto>(`
        SELECT cod_municipio, an_exercicio, nr_periodo,
               total_mde::text, total_despesa_educacao::text, total_matriculas_bas,
               gasto_aluno_mde::text, gasto_aluno_educacao::text,
               ano_referencia_tce,
               total_despesa_educacao_tce::text,
               gasto_aluno_educacao_tce::text,
               divergencia_educacao_pct::text
        FROM mart.gasto_aluno_municipio
        WHERE sg_uf = 'AC'
          AND esfera = 'M'
          AND an_exercicio = $1
      `, [exercicioSel]);
      porGasto = new Map(gastoRows.map((g) => [g.cod_municipio, g]));
    } catch {
      porGasto = new Map();
    }

    // ── 5. Distorção Idade-Série mais recente (Total/Total) ──
    interface LinhaDistorcao {
      cod_municipio: number; ano: number;
      dist_fund_total: string | null; dist_fund_ai: string | null;
      dist_fund_af: string | null;    dist_em_total: string | null;
    }
    let porDistorcao = new Map<number, LinhaDistorcao>();
    try {
      const distRows = await dbQuery<LinhaDistorcao>(`
        SELECT DISTINCT ON (cod_municipio)
          cod_municipio, ano,
          dist_fund_total, dist_fund_ai, dist_fund_af, dist_em_total
        FROM dw.fato_inep_distorcao_municipal
        WHERE sg_uf = 'AC' AND localizacao = $1 AND dependencia = $2
        ORDER BY cod_municipio, ano DESC
      `, [LOCALIZACAO_TOTAL, DEPENDENCIA_TOTAL]);
      porDistorcao = new Map(distRows.map((r) => [r.cod_municipio, r]));
    } catch {
      // Tabela ainda não migrada ou vazia — segue sem distorção
      porDistorcao = new Map();
    }

    // ── 5. Rendimento mais recente (Total/Total) ──
    const rendRows = await dbQuery<{
      cod_municipio: number; ano: number;
      aprov_fund_total: string | null; aprov_em_total: string | null;
      reprov_fund_total: string | null; reprov_em_total: string | null;
      abandono_fund_total: string | null; abandono_em_total: string | null;
    }>(`
      SELECT DISTINCT ON (cod_municipio)
        cod_municipio, ano,
        aprov_fund_total, aprov_em_total,
        reprov_fund_total, reprov_em_total,
        abandono_fund_total, abandono_em_total
      FROM dw.fato_inep_rendimento_municipal
      WHERE sg_uf = 'AC' AND localizacao = $1 AND dependencia = $2
      ORDER BY cod_municipio, ano DESC
    `, [LOCALIZACAO_TOTAL, DEPENDENCIA_TOTAL]);
    const porRend = new Map(rendRows.map((r) => [r.cod_municipio, r]));

    // ── 5. População ──
    const popRows = await dbQuery<{ cod_ibge: number; populacao: number }>(`
      SELECT cod_ibge, populacao FROM public.vw_populacao_ibge_vigente WHERE cod_ibge::text LIKE '12%'
    `);
    const porPop = new Map(popRows.map((r) => [r.cod_ibge, r.populacao]));

    // ── 6. Monta lista de municípios ──
    const codigosUnicos = new Set<number>([
      ...idebRows.map((r) => r.cod_municipio),
      ...rendRows.map((r) => r.cod_municipio),
    ]);

    const municipios = [...codigosUnicos].map((cod) => {
      const ideb = porMun.get(cod);
      const rend = porRend.get(cod);
      const dist = porDistorcao.get(cod);
      const gasto = porGasto.get(cod);
      const composite = media([ideb?.ai ?? null, ideb?.af ?? null, ideb?.em ?? null]);
      return {
        codigo_ibge: String(cod),
        nome: ideb?.nome ?? null,
        populacao: porPop.get(cod) ?? null,
        edicao_ideb: edicaoSel,
        ideb_ai: ideb?.ai ?? null,
        ideb_af: ideb?.af ?? null,
        ideb_em: ideb?.em ?? null,
        meta_ai: ideb?.meta_ai ?? null,
        meta_af: ideb?.meta_af ?? null,
        meta_em: ideb?.meta_em ?? null,
        ideb_composite: composite,
        ano_rendimento:        rend?.ano ?? null,
        aprovacao_fund_total:  num(rend?.aprov_fund_total),
        aprovacao_em_total:    num(rend?.aprov_em_total),
        reprovacao_fund_total: num(rend?.reprov_fund_total),
        reprovacao_em_total:   num(rend?.reprov_em_total),
        abandono_fund_total:   num(rend?.abandono_fund_total),
        abandono_em_total:     num(rend?.abandono_em_total),
        ano_distorcao:         dist?.ano ?? null,
        distorcao_fund_total:  num(dist?.dist_fund_total),
        distorcao_fund_ai:     num(dist?.dist_fund_ai),
        distorcao_fund_af:     num(dist?.dist_fund_af),
        distorcao_em_total:    num(dist?.dist_em_total),
        // Eficiência: gasto/aluno (SICONFI)
        gasto_ano_siconfi:     gasto?.an_exercicio ?? null,
        gasto_periodo_siconfi: gasto?.nr_periodo ?? null,
        total_mde:                  num(gasto?.total_mde),
        total_despesa_educacao:     num(gasto?.total_despesa_educacao),
        total_matriculas_censo:     gasto?.total_matriculas_bas ?? null,
        gasto_aluno_mde:            num(gasto?.gasto_aluno_mde),
        gasto_aluno_educacao:       num(gasto?.gasto_aluno_educacao),
        // Eficiência: Custo Total com Educação (TCE — SIPAC, função 12 completa)
        ano_referencia_tce:           gasto?.ano_referencia_tce ?? null,
        total_despesa_educacao_tce:   num(gasto?.total_despesa_educacao_tce),
        gasto_aluno_educacao_tce:     num(gasto?.gasto_aluno_educacao_tce),
        divergencia_educacao_pct:     num(gasto?.divergencia_educacao_pct),
      };
    }).sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? ""));

    // ── 7. KPIs estaduais (média da edição selecionada) ──
    const valAi = municipios.map((m) => m.ideb_ai);
    const valAf = municipios.map((m) => m.ideb_af);
    const valEm = municipios.map((m) => m.ideb_em);
    const valComp = municipios.map((m) => m.ideb_composite);

    const metaAi = municipios.map((m) => m.meta_ai);
    const metaAf = municipios.map((m) => m.meta_af);
    const metaEm = municipios.map((m) => m.meta_em);

    const atingiu = (obs: number | null, meta: number | null) =>
      obs !== null && meta !== null && obs >= meta;

    const totalAtingiuMeta = municipios.filter((m) =>
      atingiu(m.ideb_ai, m.meta_ai) || atingiu(m.ideb_af, m.meta_af) || atingiu(m.ideb_em, m.meta_em),
    ).length;

    const kpis = {
      total_municipios:    municipios.length,
      ideb_medio_ai:       media(valAi),
      ideb_medio_af:       media(valAf),
      ideb_medio_em:       media(valEm),
      ideb_medio_composite: media(valComp),
      meta_medio_ai:       media(metaAi),
      meta_medio_af:       media(metaAf),
      meta_medio_em:       media(metaEm),
      municipios_atingiram_meta: totalAtingiuMeta,
      melhor: municipios.reduce<{ nome: string | null; valor: number } | null>(
        (acc, m) =>
          m.ideb_composite !== null && (!acc || m.ideb_composite > acc.valor)
            ? { nome: m.nome, valor: m.ideb_composite } : acc, null),
      pior: municipios.reduce<{ nome: string | null; valor: number } | null>(
        (acc, m) =>
          m.ideb_composite !== null && (!acc || m.ideb_composite < acc.valor)
            ? { nome: m.nome, valor: m.ideb_composite } : acc, null),
    };

    // ── 8. Evolução estadual (todas as edições, AI/AF/EM médios) ──
    const evolRows = await dbQuery<{
      ano: number; etapa: string; ideb_medio: string;
    }>(`
      SELECT ano, etapa, AVG(ideb_observado)::numeric(10,2) AS ideb_medio
      FROM dw.fato_inep_ideb_municipal
      WHERE sg_uf = 'AC' AND rede = $1 AND ideb_observado IS NOT NULL
      GROUP BY ano, etapa
      ORDER BY ano
    `, [REDE_PUBLICO]);

    const evolucao: Array<{ ano: number; ai: number | null; af: number | null; em: number | null }> = [];
    for (const r of evolRows) {
      let entry = evolucao.find((e) => e.ano === r.ano);
      if (!entry) { entry = { ano: r.ano, ai: null, af: null, em: null }; evolucao.push(entry); }
      const v = num(r.ideb_medio);
      if (r.etapa === "AI") entry.ai = v;
      if (r.etapa === "AF") entry.af = v;
      if (r.etapa === "EM") entry.em = v;
    }

    // ── 9. Agregados Censo (total estadual de matrículas, docentes e escolas com infra crítica) ──
    let censo: {
      total_escolas: number;
      total_matriculas_bas: number | null;
      total_matriculas_inf: number | null;
      total_matriculas_fund: number | null;
      total_matriculas_med: number | null;
      total_docentes_bas: number | null;
      ano_censo: number | null;
      escolas_sem_agua: number;
      escolas_sem_energia: number;
      escolas_sem_internet: number;
    } | null = null;

    try {
      const [c] = await dbQuery<{
        total_escolas: string;
        total_matriculas_bas: string | null;
        total_matriculas_inf: string | null;
        total_matriculas_fund: string | null;
        total_matriculas_med: string | null;
        total_docentes_bas: string | null;
        ano_censo: number | null;
        escolas_sem_agua: string;
        escolas_sem_energia: string;
        escolas_sem_internet: string;
      }>(`
        SELECT
          COUNT(*)::text                                              AS total_escolas,
          SUM(qt_mat_bas)::text                                       AS total_matriculas_bas,
          SUM(qt_mat_inf)::text                                       AS total_matriculas_inf,
          SUM(qt_mat_fund)::text                                      AS total_matriculas_fund,
          SUM(qt_mat_med)::text                                       AS total_matriculas_med,
          SUM(qt_doc_bas)::text                                       AS total_docentes_bas,
          MAX(ano_censo)                                              AS ano_censo,
          COUNT(*) FILTER (WHERE infra_agua_potavel = false)::text    AS escolas_sem_agua,
          COUNT(*) FILTER (WHERE infra_energia_eletrica = false)::text AS escolas_sem_energia,
          COUNT(*) FILTER (WHERE infra_internet = false)::text         AS escolas_sem_internet
        FROM public.dim_escola_inep
        WHERE sg_uf = 'AC'
      `);

      if (c) {
        censo = {
          total_escolas:           parseInt(c.total_escolas, 10),
          total_matriculas_bas:    c.total_matriculas_bas  ? parseInt(c.total_matriculas_bas,  10) : null,
          total_matriculas_inf:    c.total_matriculas_inf  ? parseInt(c.total_matriculas_inf,  10) : null,
          total_matriculas_fund:   c.total_matriculas_fund ? parseInt(c.total_matriculas_fund, 10) : null,
          total_matriculas_med:    c.total_matriculas_med  ? parseInt(c.total_matriculas_med,  10) : null,
          total_docentes_bas:      c.total_docentes_bas    ? parseInt(c.total_docentes_bas,    10) : null,
          ano_censo:               c.ano_censo,
          escolas_sem_agua:        parseInt(c.escolas_sem_agua, 10),
          escolas_sem_energia:     parseInt(c.escolas_sem_energia, 10),
          escolas_sem_internet:    parseInt(c.escolas_sem_internet, 10),
        };
      }
    } catch {
      // tabela ou colunas ainda não migradas — segue sem censo
      censo = null;
    }

    // ── 10. Resposta ──
    const [atual] = await dbQuery<{ atualizado_em: string }>(`
      SELECT MAX(atualizado_em)::text AS atualizado_em FROM mart.painel_educacao_municipio
    `);

    // ── Gasto MDE por aluno (estadual médio) ──
    let gastoAluno: {
      ano_siconfi: number | null;
      periodo_siconfi: number | null;
      gasto_medio_mde_aluno: number | null;
      gasto_medio_educacao_aluno: number | null;
      municipios_com_calculo: number;
    } | null = null;
    try {
      const [g] = await dbQuery<{
        an_exercicio: number | null; nr_periodo: number | null;
        media_mde: string | null; media_edu: string | null; n: string;
      }>(`
        SELECT MAX(an_exercicio) AS an_exercicio,
               MAX(nr_periodo) AS nr_periodo,
               AVG(gasto_aluno_mde)::text AS media_mde,
               AVG(gasto_aluno_educacao)::text AS media_edu,
               COUNT(*) FILTER (WHERE gasto_aluno_mde IS NOT NULL)::text AS n
        FROM mart.gasto_aluno_municipio
        WHERE sg_uf = 'AC' AND esfera = 'M' AND an_exercicio = $1
      `, [exercicioSel]);
      if (g) gastoAluno = {
        ano_siconfi: g.an_exercicio, periodo_siconfi: g.nr_periodo,
        gasto_medio_mde_aluno:      num(g.media_mde),
        gasto_medio_educacao_aluno: num(g.media_edu),
        municipios_com_calculo:     parseInt(g.n, 10),
      };
    } catch { gastoAluno = null; }

    return NextResponse.json({
      edicoes,
      edicao: edicaoSel,
      exercicios_fiscais: exerciciosFiscais,
      exercicio_fiscal: exercicioSel,
      municipios,
      kpis,
      evolucao,
      censo,
      gasto_aluno: gastoAluno,
      atualizado_em: atual?.atualizado_em ?? null,
      fonte: "INEP — IDEB municipal (rede Pública) + Taxas de Rendimento Escolar + Censo Escolar",
      // Mantém alias 'total' para compatibilidade com chamadas antigas
      total: municipios.length,
    });
  } catch (err) {
    console.error("[api/educacao/mapa-acre]", err);
    return NextResponse.json(
      { edicoes: [], edicao: null, municipios: [], kpis: null, evolucao: [], erro: (err as Error).message },
      { status: 500 },
    );
  }
}
