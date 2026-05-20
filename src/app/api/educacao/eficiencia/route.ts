import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/educacao/eficiencia
 *
 * Painel de eficiência educacional cruzando:
 *   - mart.gasto_aluno_municipio (gasto MDE/Educação por aluno)
 *   - mart.painel_educacao_municipio (IDEB)
 *
 * Retorna:
 *   - kpis estaduais (média gasto, mínimo, máximo, total estado)
 *   - municipios: linha por município com gasto + IDEB + matrículas + razão custo/qualidade
 *   - fonte
 */

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const exercicioParam = parseInt(searchParams.get("exercicio") ?? "", 10);
    const exercicio = Number.isFinite(exercicioParam) ? exercicioParam : new Date().getFullYear();

    // Lista de exercícios disponíveis no mart (para popular o seletor)
    const exerciciosRows = await dbQuery<{ an_exercicio: number }>(
      `SELECT DISTINCT an_exercicio FROM mart.gasto_aluno_municipio WHERE sg_uf = 'AC' ORDER BY an_exercicio DESC`,
    );
    const exercicios = exerciciosRows.map((r) => r.an_exercicio);
    interface Linha {
      cod_municipio: number;
      no_municipio: string | null;
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
      ideb_publico_ai: string | null;
      ideb_publico_af: string | null;
      ideb_publico_em: string | null;
      edicao_ideb: number | null;
    }

    // Linha por município (rede municipal — esfera 'M')
    const rows = await dbQuery<Linha>(`
      SELECT
        g.cod_municipio, g.no_municipio,
        g.an_exercicio, g.nr_periodo,
        g.total_mde::text, g.total_despesa_educacao::text,
        g.total_matriculas_bas,
        g.gasto_aluno_mde::text, g.gasto_aluno_educacao::text,
        g.ano_referencia_tce,
        g.total_despesa_educacao_tce::text,
        g.gasto_aluno_educacao_tce::text,
        g.divergencia_educacao_pct::text,
        m.ideb_publico_ai::text, m.ideb_publico_af::text, m.ideb_publico_em::text,
        m.edicao_ideb
      FROM mart.gasto_aluno_municipio g
      LEFT JOIN mart.painel_educacao_municipio m ON m.cod_municipio = g.cod_municipio
      WHERE g.sg_uf = 'AC'
        AND g.esfera = 'M'
        AND g.an_exercicio = $1
      ORDER BY g.no_municipio
    `, [exercicio]);

    // Linha do estado AC (rede estadual — esfera 'E')
    const [estado] = await dbQuery<{
      total_mde: string | null;
      total_despesa_educacao_tce: string | null;
      total_matriculas_bas: number | null;
      gasto_aluno_mde: string | null;
      gasto_aluno_educacao_tce: string | null;
    }>(`
      SELECT total_mde::text, total_despesa_educacao_tce::text, total_matriculas_bas,
             gasto_aluno_mde::text, gasto_aluno_educacao_tce::text
      FROM mart.gasto_aluno_municipio
      WHERE sg_uf = 'AC' AND esfera = 'E' AND an_exercicio = $1
      LIMIT 1
    `, [exercicio]);

    const municipios = rows.map((r) => {
      const gasto_mde       = num(r.gasto_aluno_mde);
      const gasto_total     = num(r.gasto_aluno_educacao);
      const gasto_tce_aluno = num(r.gasto_aluno_educacao_tce);
      const ideb_ai         = num(r.ideb_publico_ai);
      const ideb_af     = num(r.ideb_publico_af);
      const ideb_em     = num(r.ideb_publico_em);
      const ideb_composite = [ideb_ai, ideb_af, ideb_em]
        .filter((x): x is number => x !== null)
        .reduce((acc, v, _i, arr) => acc + v / arr.length, 0) || null;
      return {
        cod_municipio: r.cod_municipio,
        nome: r.no_municipio,
        an_exercicio: r.an_exercicio,
        nr_periodo:   r.nr_periodo,
        edicao_ideb:  r.edicao_ideb,
        total_mde:                num(r.total_mde),
        total_despesa_educacao:   num(r.total_despesa_educacao),
        total_matriculas:         r.total_matriculas_bas,
        gasto_aluno_mde:          gasto_mde,
        gasto_aluno_educacao:     gasto_total,
        // TCE — Custo Total com Educação (função 12 completa, mesmo exercício do SICONFI)
        ano_referencia_tce:         r.ano_referencia_tce,
        total_despesa_educacao_tce: num(r.total_despesa_educacao_tce),
        gasto_aluno_educacao_tce:   num(r.gasto_aluno_educacao_tce),
        divergencia_educacao_pct:   num(r.divergencia_educacao_pct),
        ideb_ai, ideb_af, ideb_em, ideb_composite,
        // Custo/IDEB (R$ por ponto de IDEB) — proxy de eficiência.
        // Usa Custo Total com Educação do TCE (função 12), pois reflete melhor o
        // gasto real do que o total_mde do SICONFI (subestimado na carga atual).
        custo_por_ponto_ideb: (gasto_tce_aluno !== null && ideb_composite !== null && ideb_composite > 0)
          ? gasto_tce_aluno / ideb_composite
          : null,
      };
    });

    // KPIs
    const gastosMde   = municipios.map((m) => m.gasto_aluno_mde).filter((x): x is number => x !== null && x > 0);
    const totalMdeMun = municipios.reduce((a, m) => a + (m.total_mde ?? 0), 0);
    const totalMatMun = municipios.reduce((a, m) => a + (m.total_matriculas ?? 0), 0);
    const totalMdeEstado = num(estado?.total_mde) ?? 0;
    const totalMatEstado = estado?.total_matriculas_bas ?? 0;

    const kpis = {
      total_municipios: municipios.length,
      municipios_com_dado: gastosMde.length,
      gasto_medio_mde: gastosMde.length ? gastosMde.reduce((a, b) => a + b, 0) / gastosMde.length : null,
      gasto_min_mde:   gastosMde.length ? Math.min(...gastosMde) : null,
      gasto_max_mde:   gastosMde.length ? Math.max(...gastosMde) : null,
      // Totais estaduais = rede municipal (22 prefeituras) + rede estadual (governo AC)
      total_mde_municipal: totalMdeMun,
      total_mde_estadual_gov: totalMdeEstado,
      total_mde_estadual: totalMdeMun + totalMdeEstado,
      total_matriculas_municipal: totalMatMun,
      total_matriculas_estadual_gov: totalMatEstado,
      total_matriculas_estadual: totalMatMun + totalMatEstado,
    };

    return NextResponse.json({
      exercicio,
      exercicios,
      kpis,
      municipios,
      estado: estado ? {
        total_mde:                  num(estado.total_mde),
        total_despesa_educacao_tce: num(estado.total_despesa_educacao_tce),
        total_matriculas:           estado.total_matriculas_bas,
        gasto_aluno_mde:            num(estado.gasto_aluno_mde),
        gasto_aluno_educacao_tce:   num(estado.gasto_aluno_educacao_tce),
      } : null,
      fonte: "SICONFI/RREO Anexo 8 (município + estado) × Censo Escolar (rede municipal/estadual) × TCE-AC fato_empenho (função 12)",
    });
  } catch (err) {
    console.error("[api/educacao/eficiencia]", err);
    return NextResponse.json({ erro: (err as Error).message }, { status: 500 });
  }
}
