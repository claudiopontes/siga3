import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

const ANO_ATUAL = new Date().getFullYear();

interface ContagemRow { nivel: string; total: number; }
interface PeriodoRow  { ano: number; periodo: string; }

export async function GET() {
  // SIOPS: descobre o período mais recente (mesmo comportamento do OrcamentoSaudeClient)
  const periodos = await dbQuery<PeriodoRow>(
    `SELECT ano, periodo FROM mart.siops_alertas
     ORDER BY ano DESC, periodo DESC LIMIT 1`
  ).catch(() => [] as PeriodoRow[]);

  const periodoRecente = periodos[0] ?? null;

  const [pni, mortalidade, siops, sisagua, infodengue, cnes] = await Promise.all([
    // Vacinação (PNI_COBERTURA) — filtro inicial: ano atual (mesmo padrão do VacinacaoClient)
    dbQuery<ContagemRow>(`
      SELECT nivel, COUNT(*)::int AS total
      FROM mart.pni_cobertura_alertas
      WHERE ano = $1 AND nivel IN ('CRITICO','ALTO')
      GROUP BY nivel
    `, [ANO_ATUAL]),

    // Mortalidade (SIM_SINASC) — filtro inicial: 2025 (mesmo padrão do MortalidadeClient)
    dbQuery<ContagemRow>(`
      SELECT nivel, COUNT(*)::int AS total
      FROM mart.mortalidade_alertas
      WHERE ano = 2025 AND nivel IN ('CRITICO','ALTO')
      GROUP BY nivel
    `),

    // Orçamento (SIOPS) — período mais recente disponível (mesmo comportamento do OrcamentoSaudeClient)
    periodoRecente
      ? dbQuery<ContagemRow>(`
          SELECT nivel, COUNT(*)::int AS total
          FROM mart.siops_alertas
          WHERE ano = $1 AND periodo = $2 AND nivel IN ('CRITICO','ALTO')
          GROUP BY nivel
        `, [periodoRecente.ano, periodoRecente.periodo])
      : Promise.resolve([] as ContagemRow[]),

    // Qualidade da Água (SISAGUA) — sem filtro de período
    dbQuery<ContagemRow>(`
      SELECT nivel, COUNT(*)::int AS total
      FROM mart.saude_alertas
      WHERE fonte = 'SISAGUA' AND nivel IN ('CRITICO','ALTO')
      GROUP BY nivel
    `),

    // Vigilância Epidemiológica (InfoDengue) — tabela home já filtrada pelos alertas recentes
    dbQuery<ContagemRow>(`
      SELECT nivel, COUNT(*)::int AS total
      FROM mart.vigilancia_arboviroses_alertas_home
      WHERE nivel IN ('CRITICO','ALTO')
      GROUP BY nivel
    `),

    // Estrutura da Rede (CNES/UBS) — sem filtro de período
    dbQuery<ContagemRow>(`
      SELECT nivel, COUNT(*)::int AS total
      FROM mart.saude_alertas
      WHERE fonte = 'CNES_UBS' AND nivel IN ('CRITICO','ALTO')
      GROUP BY nivel
    `),
  ]);

  function somar(rows: ContagemRow[]) {
    return rows.reduce(
      (acc, r) => {
        if (r.nivel === "CRITICO") acc.criticos += r.total;
        if (r.nivel === "ALTO")    acc.altos    += r.total;
        return acc;
      },
      { criticos: 0, altos: 0 }
    );
  }

  return NextResponse.json({
    PNI_COBERTURA: somar(pni),
    SIM_SINASC:    somar(mortalidade),
    SIOPS:         somar(siops),
    SISAGUA:       somar(sisagua),
    INFODENGUE:    somar(infodengue),
    CNES_UBS:      somar(cnes),
  });
}
