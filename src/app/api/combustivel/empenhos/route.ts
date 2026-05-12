import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const rows = await dbQuery(
      `SELECT ano, mes, entidade, tipo_combustivel, forma_fornecimento, nome_credor,
              valor_empenho, valor_liquidado, qtd_empenhos, atualizado_em
       FROM public.combustivel_empenho_mensal
       ORDER BY ano DESC, mes DESC, entidade`
    );
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json([]);
  }
}
