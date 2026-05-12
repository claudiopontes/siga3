import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const codigoIbge = searchParams.get("codigo_ibge");

  if (!codigoIbge) {
    return NextResponse.json({ error: "codigo_ibge é obrigatório" }, { status: 400 });
  }

  try {
    const rows = await dbQuery(
      `SELECT id, nome_ente, item_codigo, item_descricao, grupo, situacao, situacao_normalizada
       FROM public.vw_cauc_ac_ultima_situacao
       WHERE codigo_ibge = $1
       ORDER BY item_codigo`,
      [codigoIbge]
    );
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
