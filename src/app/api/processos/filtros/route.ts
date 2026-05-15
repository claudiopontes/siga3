import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const [anos, classes, situacoes, relatores] = await Promise.all([
      dbQuery(`SELECT DISTINCT EXTRACT(YEAR FROM s.dt_realizacao)::int AS ano
               FROM public.pauta_julgamento_item i
               JOIN public.pauta_julgamento_sessao s ON s.id = i.sessao_id
               WHERE s.dt_realizacao IS NOT NULL
               ORDER BY ano DESC`),
      dbQuery(`SELECT DISTINCT nome_classe
               FROM public.pauta_julgamento_item
               WHERE nome_classe IS NOT NULL
               ORDER BY nome_classe`),
      dbQuery(`SELECT DISTINCT situacao_funcional
               FROM public.pauta_julgamento_item
               WHERE situacao_funcional IS NOT NULL
               ORDER BY situacao_funcional`),
      dbQuery(`SELECT DISTINCT COALESCE(relator_tratamento, nome_relator) AS relator
               FROM public.pauta_julgamento_item
               WHERE COALESCE(relator_tratamento, nome_relator) IS NOT NULL
               ORDER BY relator`),
    ]);

    return NextResponse.json({
      anos: (anos as { ano: number }[]).map((r) => r.ano),
      classes: (classes as { nome_classe: string }[]).map((r) => r.nome_classe),
      situacoes: (situacoes as { situacao_funcional: string }[]).map((r) => r.situacao_funcional),
      relatores: (relatores as { relator: string }[]).map((r) => r.relator),
    });
  } catch (err) {
    console.error("[api/processos/filtros]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erro ao carregar filtros." }, { status: 500 });
  }
}
