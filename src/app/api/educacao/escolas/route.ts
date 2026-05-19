import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/educacao/escolas
 *
 * Query params (todos opcionais):
 *   ?edicao=2023               IDEB edição alvo (default: mais recente)
 *   ?municipio=1200401         filtra por código IBGE do município
 *   ?rede=Estadual             rede (Estadual | Municipal | Federal | Privada | Pública)
 *   ?dependencia=Estadual      sinônimo de rede (Censo usa este nome)
 *   ?localizacao=Urbana        Urbana | Rural
 *   ?situacao=Em%20atividade   filtra por situação de funcionamento
 *   ?busca=texto               busca por nome (case-insensitive, sem acentos)
 *   ?somente_com_ideb=1        retorna só escolas com IDEB para a edição
 *
 * Retorna:
 *   - edicoes:    anos disponíveis em dw.fato_inep_ideb_escola
 *   - escolas:    lista de escolas com IDEB AI/AF/EM da edição + metadados Censo
 *   - filtros:    valores distintos (municípios, redes, localizações, situações)
 *   - total:      contagem
 */

const NORMALIZE = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const municipio        = url.searchParams.get("municipio");
    const rede             = url.searchParams.get("rede") ?? url.searchParams.get("dependencia");
    const localizacao      = url.searchParams.get("localizacao");
    const situacao         = url.searchParams.get("situacao");
    const busca            = url.searchParams.get("busca");
    const somenteComIdeb   = url.searchParams.get("somente_com_ideb") === "1";

    // ── 1. Edições disponíveis ──
    const edicoesRows = await dbQuery<{ ano: number }>(`
      SELECT DISTINCT ano FROM dw.fato_inep_ideb_escola
      WHERE sg_uf = 'AC' AND ideb_observado IS NOT NULL
      ORDER BY ano DESC
    `);
    const edicoes = edicoesRows.map((r) => r.ano);
    const edicaoParam = url.searchParams.get("edicao");
    const edicaoSel = edicaoParam && edicoes.includes(parseInt(edicaoParam, 10))
      ? parseInt(edicaoParam, 10)
      : edicoes[0] ?? null;

    // ── 2. Escolas (LEFT JOIN entre dim_escola_inep e fato IDEB) ──
    interface Linha {
      cod_escola: number;
      no_escola: string | null;
      cod_municipio: number | null;
      no_municipio: string | null;
      sg_uf: string | null;
      dependencia: string | null;
      localizacao: string | null;
      porte: string | null;
      etapas_atendidas: string | null;
      situacao: string | null;
      latitude: string | null;
      longitude: string | null;
      endereco: string | null;
      ano_censo: number | null;
      ideb_ai: string | null;
      meta_ai: string | null;
      ideb_af: string | null;
      meta_af: string | null;
      ideb_em: string | null;
      meta_em: string | null;
    }

    const params: unknown[] = ["AC", edicaoSel];
    const where: string[] = ["dim.sg_uf = $1"];
    if (municipio) {
      params.push(parseInt(municipio, 10));
      where.push(`dim.cod_municipio = $${params.length}`);
    }
    if (rede) {
      params.push(rede);
      where.push(`dim.dependencia = $${params.length}`);
    }
    if (localizacao) {
      params.push(localizacao);
      where.push(`dim.localizacao = $${params.length}`);
    }
    if (situacao) {
      params.push(situacao);
      where.push(`dim.situacao = $${params.length}`);
    }
    if (busca) {
      params.push(`%${NORMALIZE(busca)}%`);
      where.push(`lower(unaccent(dim.no_escola)) LIKE $${params.length}`);
    }
    if (somenteComIdeb) {
      where.push(`EXISTS (SELECT 1 FROM dw.fato_inep_ideb_escola f
                          WHERE f.cod_escola = dim.cod_escola AND f.ano = $2)`);
    }

    let sqlEscolas = `
      SELECT
        dim.cod_escola, dim.no_escola, dim.cod_municipio, dim.no_municipio,
        dim.sg_uf, dim.dependencia, dim.localizacao, dim.porte,
        dim.etapas_atendidas, dim.situacao,
        dim.latitude::text AS latitude, dim.longitude::text AS longitude,
        dim.endereco, dim.ano_censo,
        ai.ideb_observado::text AS ideb_ai, ai.ideb_projetado::text AS meta_ai,
        af.ideb_observado::text AS ideb_af, af.ideb_projetado::text AS meta_af,
        em.ideb_observado::text AS ideb_em, em.ideb_projetado::text AS meta_em
      FROM public.dim_escola_inep dim
      LEFT JOIN dw.fato_inep_ideb_escola ai
        ON ai.cod_escola = dim.cod_escola AND ai.etapa = 'AI' AND ai.ano = $2
      LEFT JOIN dw.fato_inep_ideb_escola af
        ON af.cod_escola = dim.cod_escola AND af.etapa = 'AF' AND af.ano = $2
      LEFT JOIN dw.fato_inep_ideb_escola em
        ON em.cod_escola = dim.cod_escola AND em.etapa = 'EM' AND em.ano = $2
      WHERE ${where.join(" AND ")}
      ORDER BY dim.no_escola
      LIMIT 3000
    `;

    let rows: Linha[];
    try {
      rows = await dbQuery<Linha>(sqlEscolas, params);
    } catch {
      // Fallback caso a extensão unaccent não esteja instalada — usa lower simples
      sqlEscolas = sqlEscolas.replace("unaccent(dim.no_escola)", "dim.no_escola");
      rows = await dbQuery<Linha>(sqlEscolas, params);
    }

    const escolas = rows.map((r) => ({
      cod_escola:        r.cod_escola,
      nome:              r.no_escola,
      cod_municipio:     r.cod_municipio,
      no_municipio:      r.no_municipio,
      sg_uf:             r.sg_uf,
      dependencia:       r.dependencia,
      localizacao:       r.localizacao,
      porte:             r.porte,
      etapas_atendidas:  r.etapas_atendidas,
      situacao:          r.situacao,
      latitude:          num(r.latitude),
      longitude:         num(r.longitude),
      endereco:          r.endereco,
      ano_censo:         r.ano_censo,
      edicao_ideb:       edicaoSel,
      ideb_ai: num(r.ideb_ai), meta_ai: num(r.meta_ai),
      ideb_af: num(r.ideb_af), meta_af: num(r.meta_af),
      ideb_em: num(r.ideb_em), meta_em: num(r.meta_em),
      ideb_composite: (() => {
        const vals = [num(r.ideb_ai), num(r.ideb_af), num(r.ideb_em)].filter((x): x is number => x !== null);
        if (!vals.length) return null;
        return vals.reduce((a, b) => a + b, 0) / vals.length;
      })(),
    }));

    // ── 3. Filtros disponíveis (valores distintos) ──
    const [municipios, redes, localizacoes, situacoes] = await Promise.all([
      dbQuery<{ cod_municipio: number; no_municipio: string | null }>(`
        SELECT cod_municipio, MAX(no_municipio) AS no_municipio
        FROM public.dim_escola_inep
        WHERE sg_uf = 'AC' AND cod_municipio IS NOT NULL
        GROUP BY cod_municipio ORDER BY MAX(no_municipio)
      `),
      dbQuery<{ dependencia: string }>(`
        SELECT DISTINCT dependencia FROM public.dim_escola_inep
        WHERE sg_uf = 'AC' AND dependencia IS NOT NULL ORDER BY dependencia
      `),
      dbQuery<{ localizacao: string }>(`
        SELECT DISTINCT localizacao FROM public.dim_escola_inep
        WHERE sg_uf = 'AC' AND localizacao IS NOT NULL ORDER BY localizacao
      `),
      dbQuery<{ situacao: string }>(`
        SELECT DISTINCT situacao FROM public.dim_escola_inep
        WHERE sg_uf = 'AC' AND situacao IS NOT NULL ORDER BY situacao
      `),
    ]);

    return NextResponse.json({
      edicoes,
      edicao: edicaoSel,
      filtros: {
        municipios: municipios.map((m) => ({ cod: m.cod_municipio, nome: m.no_municipio })),
        redes:        redes.map((r) => r.dependencia),
        localizacoes: localizacoes.map((r) => r.localizacao),
        situacoes:    situacoes.map((r) => r.situacao),
      },
      escolas,
      total: escolas.length,
      fonte: "INEP — IDEB Escolas + Censo Escolar (geo)",
    });
  } catch (err) {
    console.error("[api/educacao/escolas]", err);
    return NextResponse.json(
      { edicoes: [], edicao: null, filtros: null, escolas: [], total: 0, erro: (err as Error).message },
      { status: 500 },
    );
  }
}
