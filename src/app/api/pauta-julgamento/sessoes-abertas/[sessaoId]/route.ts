import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessaoId: string }> },
) {
  const { sessaoId } = await params;
  const id = Number(sessaoId);

  if (isNaN(id)) {
    return NextResponse.json({ error: "sessaoId inválido." }, { status: 400 });
  }

  try {
    const rows = await dbQuery(
      `SELECT
         id, numero, dt_realizacao, dt_encerramento,
         orgao_julgador, local_sessao, tipo, situacao,
         numero_publicacao, data_publicacao,
         qtd_julgado, qtd_vistas, qtd_julgamento
       FROM public.pauta_julgamento_sessao
       WHERE id = $1`,
      [id],
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Sessão não encontrada." }, { status: 404 });
    }

    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("[api/pauta-julgamento/sessoes-abertas/id]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erro ao consultar sessão." }, { status: 500 });
  }
}
