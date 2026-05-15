import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sessaoId = req.nextUrl.searchParams.get("sessaoId");

  if (!sessaoId || isNaN(Number(sessaoId))) {
    return NextResponse.json({ error: "Parâmetro sessaoId inválido ou ausente." }, { status: 400 });
  }

  try {
    const rows = await dbQuery(
      `SELECT
         id, sessao_id, sessao_numero, processo_id,
         situacao, sequencia,
         relator_id, nome_relator, relator_tratamento,
         revisor_id, nome_revisor,
         eletronico, qtde_pron, advogado, incluir_interessados, julgado,
         numero_processo_fmt, objeto, nome_classe, assunto, nome_1_parte, situacao_funcional,
         nome_orgao
       FROM public.pauta_julgamento_item
       WHERE sessao_id = $1
       ORDER BY sequencia NULLS LAST, id`,
      [Number(sessaoId)],
    );

    return NextResponse.json(rows);
  } catch (err) {
    console.error("[api/pauta-julgamento]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erro ao consultar processos da pauta." }, { status: 500 });
  }
}
