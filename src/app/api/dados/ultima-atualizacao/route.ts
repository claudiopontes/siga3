import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const tabelas = [
    "combustivel_mensal",
    "combustivel_empenho_mensal",
    "receita_publica_categoria_mensal",
  ];

  const datas: (string | null)[] = [];

  for (const tabela of tabelas) {
    try {
      const rows = await dbQuery<{ dt: string | null }>(
        `SELECT MAX(atualizado_em) AS dt FROM public.${tabela}`
      );
      datas.push(rows[0]?.dt ?? null);
    } catch {
      // tabela pode não existir — silencioso
      datas.push(null);
    }
  }

  const validas = datas.filter(Boolean) as string[];
  if (validas.length === 0) {
    return NextResponse.json({ ultimaAtualizacao: null });
  }

  const maisRecente = validas.sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime()
  )[0];

  return NextResponse.json({ ultimaAtualizacao: maisRecente ?? null });
}
