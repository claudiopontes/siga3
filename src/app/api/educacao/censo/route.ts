import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/educacao/censo
 *
 * Visão analítica do Censo Escolar para escolas EM ATIVIDADE no AC.
 *
 * Query params (opcionais):
 *   ?municipio=1200401      filtra por código IBGE do município
 *   ?dependencia=Estadual   Estadual | Municipal | Federal | Privada
 *   ?localizacao=Urbana     Urbana | Rural
 *
 * Retorna:
 *   - kpis:              totais (escolas ativas, matrículas, docentes, aluno/docente)
 *   - filtros:           valores distintos para popular dropdowns
 *   - por_dependencia:   matrículas e nº escolas por rede
 *   - por_etapa:         matrículas por etapa de ensino
 *   - por_municipio:     matrículas e nº escolas por município (ordenado)
 *   - infraestrutura:    para cada indicador, contagem com/sem/não informado
 *   - precariedade:      top municípios com mais escolas sem água/energia/internet
 */

interface Filtros {
  municipio?: number;
  dependencia?: string;
  localizacao?: string;
}

function buildWhere(f: Filtros, alias = "dim"): { sql: string; params: unknown[] } {
  const where: string[] = [`${alias}.sg_uf = 'AC'`, `${alias}.situacao = 'Em atividade'`];
  const params: unknown[] = [];
  if (f.municipio) {
    params.push(f.municipio);
    where.push(`${alias}.cod_municipio = $${params.length}`);
  }
  if (f.dependencia) {
    params.push(f.dependencia);
    where.push(`${alias}.dependencia = $${params.length}`);
  }
  if (f.localizacao) {
    params.push(f.localizacao);
    where.push(`${alias}.localizacao = $${params.length}`);
  }
  return { sql: where.join(" AND "), params };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const f: Filtros = {
      municipio:   url.searchParams.get("municipio")   ? parseInt(url.searchParams.get("municipio")!, 10) : undefined,
      dependencia: url.searchParams.get("dependencia") ?? undefined,
      localizacao: url.searchParams.get("localizacao") ?? undefined,
    };

    const { sql: whereSql, params } = buildWhere(f);

    // ── 0. Ano do Censo (último microdado INEP processado) ──
    const [anoRow] = await dbQuery<{ ano_censo: number | null }>(`
      SELECT MAX(ano_censo) AS ano_censo FROM public.dim_escola_inep
      WHERE sg_uf = 'AC' AND ano_censo IS NOT NULL
    `);
    const anoCenso = anoRow?.ano_censo ?? null;

    // ── 1. KPIs ──
    const [kpisRow] = await dbQuery<{
      total_escolas: string; total_matriculas: string;
      total_inf: string; total_fund: string; total_med: string;
      total_prof: string; total_eja: string; total_esp: string;
      total_docentes: string;
    }>(`
      SELECT
        COUNT(*)::text                        AS total_escolas,
        COALESCE(SUM(qt_mat_bas), 0)::text    AS total_matriculas,
        COALESCE(SUM(qt_mat_inf), 0)::text    AS total_inf,
        COALESCE(SUM(qt_mat_fund), 0)::text   AS total_fund,
        COALESCE(SUM(qt_mat_med), 0)::text    AS total_med,
        COALESCE(SUM(qt_mat_prof), 0)::text   AS total_prof,
        COALESCE(SUM(qt_mat_eja), 0)::text    AS total_eja,
        COALESCE(SUM(qt_mat_esp), 0)::text    AS total_esp,
        COALESCE(SUM(qt_doc_bas), 0)::text    AS total_docentes
      FROM public.dim_escola_inep dim
      WHERE ${whereSql}
    `, params);

    const totalEscolas    = parseInt(kpisRow?.total_escolas ?? "0", 10);
    const totalMatriculas = parseInt(kpisRow?.total_matriculas ?? "0", 10);
    const totalDocentes   = parseInt(kpisRow?.total_docentes ?? "0", 10);
    const razaoAlunoDocente = totalDocentes > 0 ? totalMatriculas / totalDocentes : null;

    const kpis = {
      total_escolas:     totalEscolas,
      total_matriculas:  totalMatriculas,
      total_docentes:    totalDocentes,
      razao_aluno_docente: razaoAlunoDocente,
      total_inf:  parseInt(kpisRow?.total_inf ?? "0", 10),
      total_fund: parseInt(kpisRow?.total_fund ?? "0", 10),
      total_med:  parseInt(kpisRow?.total_med ?? "0", 10),
      total_prof: parseInt(kpisRow?.total_prof ?? "0", 10),
      total_eja:  parseInt(kpisRow?.total_eja ?? "0", 10),
      total_esp:  parseInt(kpisRow?.total_esp ?? "0", 10),
    };

    // ── 2. Filtros disponíveis ──
    const [municipios, dependencias, localizacoes] = await Promise.all([
      dbQuery<{ cod_municipio: number; no_municipio: string | null }>(`
        SELECT cod_municipio, MAX(no_municipio) AS no_municipio
        FROM public.dim_escola_inep
        WHERE sg_uf = 'AC' AND situacao = 'Em atividade' AND cod_municipio IS NOT NULL
        GROUP BY cod_municipio ORDER BY MAX(no_municipio)
      `),
      dbQuery<{ dependencia: string }>(`
        SELECT DISTINCT dependencia FROM public.dim_escola_inep
        WHERE sg_uf = 'AC' AND situacao = 'Em atividade' AND dependencia IS NOT NULL
        ORDER BY dependencia
      `),
      dbQuery<{ localizacao: string }>(`
        SELECT DISTINCT localizacao FROM public.dim_escola_inep
        WHERE sg_uf = 'AC' AND situacao = 'Em atividade' AND localizacao IS NOT NULL
        ORDER BY localizacao
      `),
    ]);

    // ── 3. Por dependência ──
    const por_dependencia = await dbQuery<{
      dependencia: string | null; n_escolas: string; matriculas: string; docentes: string;
    }>(`
      SELECT dependencia,
             COUNT(*)::text AS n_escolas,
             COALESCE(SUM(qt_mat_bas), 0)::text AS matriculas,
             COALESCE(SUM(qt_doc_bas), 0)::text AS docentes
      FROM public.dim_escola_inep dim
      WHERE ${whereSql}
      GROUP BY dependencia
      ORDER BY 2 DESC
    `, params);

    // ── 4. Por município ──
    const por_municipio = await dbQuery<{
      cod_municipio: number; no_municipio: string | null;
      n_escolas: string; matriculas: string;
      sem_agua: string; sem_energia: string; sem_internet: string;
    }>(`
      SELECT cod_municipio,
             MAX(no_municipio) AS no_municipio,
             COUNT(*)::text                                              AS n_escolas,
             COALESCE(SUM(qt_mat_bas), 0)::text                          AS matriculas,
             COUNT(*) FILTER (WHERE infra_agua_potavel = false)::text     AS sem_agua,
             COUNT(*) FILTER (WHERE infra_energia_eletrica = false)::text AS sem_energia,
             COUNT(*) FILTER (WHERE infra_internet = false)::text         AS sem_internet
      FROM public.dim_escola_inep dim
      WHERE ${whereSql}
      GROUP BY cod_municipio
      ORDER BY matriculas DESC NULLS LAST
    `, params);

    // ── 5. Infraestrutura — contagem por indicador ──
    const infraIndicadores = [
      { col: "infra_agua_potavel",     label: "Água potável" },
      { col: "infra_energia_eletrica", label: "Energia elétrica" },
      { col: "infra_esgoto",           label: "Esgoto" },
      { col: "infra_lixo_coletado",    label: "Coleta de lixo" },
      { col: "infra_internet",         label: "Internet" },
      { col: "infra_internet_alunos",  label: "Internet p/ alunos" },
      { col: "infra_biblioteca",       label: "Biblioteca" },
      { col: "infra_lab_informatica",  label: "Lab. informática" },
      { col: "infra_lab_ciencias",     label: "Lab. ciências" },
      { col: "infra_quadra_esportes",  label: "Quadra esportes" },
      { col: "infra_alimentacao",      label: "Alimentação" },
      { col: "infra_acessibilidade",   label: "Acessibilidade" },
    ];
    const infraestrutura = await Promise.all(infraIndicadores.map(async (ind) => {
      const [r] = await dbQuery<{ com: string; sem: string; ni: string }>(`
        SELECT COUNT(*) FILTER (WHERE ${ind.col} = true)::text  AS com,
               COUNT(*) FILTER (WHERE ${ind.col} = false)::text AS sem,
               COUNT(*) FILTER (WHERE ${ind.col} IS NULL)::text AS ni
        FROM public.dim_escola_inep dim
        WHERE ${whereSql}
      `, params);
      return {
        label: ind.label, col: ind.col,
        com: parseInt(r?.com ?? "0", 10),
        sem: parseInt(r?.sem ?? "0", 10),
        nao_informado: parseInt(r?.ni ?? "0", 10),
      };
    }));

    return NextResponse.json({
      ano_censo: anoCenso,
      kpis,
      filtros: {
        municipios:   municipios.map((m) => ({ cod: m.cod_municipio, nome: m.no_municipio })),
        dependencias: dependencias.map((r) => r.dependencia),
        localizacoes: localizacoes.map((r) => r.localizacao),
      },
      por_dependencia: por_dependencia.map((r) => ({
        dependencia: r.dependencia,
        n_escolas:  parseInt(r.n_escolas, 10),
        matriculas: parseInt(r.matriculas, 10),
        docentes:   parseInt(r.docentes, 10),
      })),
      por_municipio: por_municipio.map((r) => ({
        cod_municipio: r.cod_municipio,
        nome:          r.no_municipio,
        n_escolas:     parseInt(r.n_escolas, 10),
        matriculas:    parseInt(r.matriculas, 10),
        sem_agua:      parseInt(r.sem_agua, 10),
        sem_energia:   parseInt(r.sem_energia, 10),
        sem_internet:  parseInt(r.sem_internet, 10),
      })),
      infraestrutura,
      fonte: "INEP — Censo Escolar (microdado), filtro situação 'Em atividade'",
    });
  } catch (err) {
    console.error("[api/educacao/censo]", err);
    return NextResponse.json({ erro: (err as Error).message }, { status: 500 });
  }
}
