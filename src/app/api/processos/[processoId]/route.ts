import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ processoId: string }> },
) {
  const { processoId } = await params;
  const id = Number(processoId);

  if (isNaN(id)) {
    return NextResponse.json({ error: "processoId inválido." }, { status: 400 });
  }

  try {
    const rows = await dbQuery(
      `SELECT DISTINCT ON (i.processo_id)
         i.processo_id,
         i.numero_processo_fmt, i.objeto, i.nome_classe, i.assunto,
         i.nome_1_parte, i.situacao_funcional, i.nome_orgao,
         i.nome_relator, i.relator_tratamento, i.nome_revisor,
         i.situacao
       FROM public.pauta_julgamento_item i
       JOIN public.pauta_julgamento_sessao s ON s.id = i.sessao_id
       WHERE i.processo_id = $1
       ORDER BY i.processo_id, s.dt_realizacao DESC`,
      [id],
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 });
    }

    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("[api/processos/id]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erro ao consultar processo." }, { status: 500 });
  }
}
