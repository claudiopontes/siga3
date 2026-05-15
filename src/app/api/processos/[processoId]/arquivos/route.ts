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
         id_proc_arqv, nm_tipo_docm, nm_proc_arqv,
         nr_pagn, nr_ordem, data_finalizado,
         ic_documento_assinado, id_fase_instan
       FROM public.pauta_julgamento_arquivo
       WHERE processo_id = $1
       ORDER BY nr_ordem ASC NULLS LAST, id_proc_arqv ASC`,
      [id],
    );
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[api/processos/arquivos]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erro ao consultar arquivos." }, { status: 500 });
  }
}
