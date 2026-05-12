import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

const ANO_ATUAL = new Date().getFullYear();

interface ContagemRow { nivel: string; total: number; }

export async function GET() {
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

    // Orçamento (SIOPS) — sem filtro de período (periodoSel inicia vazio, traz todos)
    dbQuery<ContagemRow>(`
      SELECT nivel, COUNT(*)::int AS total
      FROM mart.siops_alertas
      WHERE nivel IN ('CRITICO','ALTO')
      GROUP BY nivel
    `),

    // Qualidade da Água (SISAGUA) — sem filtro de período
    dbQuery<ContagemRow>(`
      SELECT nivel, COUNT(*)::int AS total
      FROM mart.saude_alertas
      WHERE fonte = 'SISAGUA' AND nivel IN ('CRITICO','ALTO')
      GROUP BY nivel
    `),

    // Vigilância Epidemiológica (InfoDengue) — filtro inicial: 6 meses (26 semanas), usa tabela home
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
