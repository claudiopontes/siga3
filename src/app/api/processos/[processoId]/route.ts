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
         p.processo_id, p.numero_fmt, p.ano, p.objeto,
         p.nome_classe, p.assunto, p.nome_orgao,
         p.nome_relator, p.nome_1_parte, p.partes,
         p.situacao, p.nm_status, p.processos_apensados,
         p.dt_criacao,
         (
           SELECT m.grupo_desc
           FROM public.pauta_julgamento_movimentacao m
           WHERE m.processo_id = p.processo_id
             AND m.dt_saida IS NULL
             AND m.grupo_desc IS NOT NULL
           ORDER BY m.dt_mov DESC NULLS LAST, m.id DESC
           LIMIT 1
         ) AS setor_atual
       FROM public.processo p
       WHERE p.processo_id = $1`,
      [id],
    );

    if (!rows.length) {
      return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 });
    }

    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("[api/processos/id]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erro ao consultar processo." }, { status: 500 });
  }
}
