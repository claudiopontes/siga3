import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sessaoId = req.nextUrl.searchParams.get("sessaoId");

  if (!sessaoId || isNaN(Number(sessaoId))) {
    return NextResponse.json({ error: "Parâmetro sessaoId inválido ou ausente." }, { status: 400 });
  }

  try {
    const rows = await dbQuery<{
      id: number;
      sessao_id: number | null;
      sessao_numero: string | null;
      processo_id: number | null;
      numero_processo: string | null;
      situacao: string | null;
      sequencia: number | null;
      relator_id: number | null;
      nome_relator: string | null;
      cargo_relator: string | null;
      titulo_relator: string | null;
      relator_tratamento: string | null;
      revisor_id: number | null;
      nome_revisor: string | null;
      cargo_revisor: string | null;
      titulo_revisor: string | null;
      eletronico: string | null;
      qtde_pron: number | null;
      incluir_interessados: string | null;
      julgado: string | null;
    }>(
      `SELECT
         id, sessao_id, sessao_numero, processo_id, numero_processo,
         situacao, sequencia, relator_id, nome_relator, cargo_relator,
         titulo_relator, relator_tratamento, revisor_id, nome_revisor,
         cargo_revisor, titulo_revisor, eletronico, qtde_pron,
         incluir_interessados, julgado
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
