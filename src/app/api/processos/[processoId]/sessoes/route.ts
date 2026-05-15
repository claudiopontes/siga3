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
      `SELECT
         i.id, i.sessao_id, i.sequencia, i.situacao,
         i.relator_tratamento, i.nome_relator, i.nome_revisor,
         s.numero AS sessao_numero, s.dt_realizacao,
         s.orgao_julgador, s.tipo AS tipo_sessao
       FROM public.pauta_julgamento_item i
       JOIN public.pauta_julgamento_sessao s ON s.id = i.sessao_id
       WHERE i.processo_id = $1
       ORDER BY s.dt_realizacao DESC`,
      [id],
    );
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[api/processos/sessoes]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erro ao consultar sessões do processo." }, { status: 500 });
  }
}
