import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const [anos, classes, situacoes, relatores] = await Promise.all([
      dbQuery(`SELECT DISTINCT ano FROM public.processo
               WHERE ano IS NOT NULL ORDER BY ano DESC`),
      dbQuery(`SELECT DISTINCT nome_classe FROM public.processo
               WHERE nome_classe IS NOT NULL ORDER BY nome_classe`),
      dbQuery(`SELECT DISTINCT situacao FROM public.processo
               WHERE situacao IS NOT NULL ORDER BY situacao`),
      dbQuery(`SELECT DISTINCT nome_relator AS relator FROM public.processo
               WHERE nome_relator IS NOT NULL ORDER BY relator`),
    ]);

    return NextResponse.json({
      anos:      (anos      as { ano: number }[]).map((r) => r.ano),
      classes:   (classes   as { nome_classe: string }[]).map((r) => r.nome_classe),
      situacoes: (situacoes as { situacao: string }[]).map((r) => r.situacao),
      relatores: (relatores as { relator: string }[]).map((r) => r.relator),
    });
  } catch (err) {
    console.error("[api/processos/filtros]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erro ao carregar filtros." }, { status: 500 });
  }
}
