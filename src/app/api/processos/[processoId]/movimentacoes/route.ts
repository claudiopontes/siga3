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
         id, dt_mov, dt_saida,
         grupo_desc, item_fluxo_desc, atividade, fase,
         usuario_login, nome_usuario,
         tipo_documento, id_processo_arquivo
       FROM public.pauta_julgamento_movimentacao
       WHERE processo_id = $1
       ORDER BY dt_mov DESC NULLS LAST, id DESC`,
      [id],
    );
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[api/processos/movimentacoes]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erro ao consultar movimentações." }, { status: 500 });
  }
}
