import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  let dados: unknown[] = [];
  let municipios: unknown[] = [];

  try {
    // Tenta com coluna emitente
    dados = await dbQuery(
      `SELECT ano, mes, entidade, emitente, tipo_combustivel, litros, valor_total, qtd_notas
       FROM public.combustivel_mensal ORDER BY ano DESC, mes DESC, entidade`
    );
  } catch {
    // Fallback sem coluna emitente
    try {
      const rows = await dbQuery<{
        ano: number;
        mes: number;
        entidade: string;
        tipo_combustivel: string;
        litros: number;
        valor_total: number;
        qtd_notas: number;
      }>(
        `SELECT ano, mes, entidade, tipo_combustivel, litros, valor_total, qtd_notas
         FROM public.combustivel_mensal ORDER BY ano DESC, mes DESC, entidade`
      );
      dados = rows.map((r) => ({ ...r, emitente: "" }));
    } catch {
      dados = [];
    }
  }

  try {
    municipios = await dbQuery(
      `SELECT codigo, nome, uf_codigo FROM public.aux_dim_municipio
       WHERE uf_codigo = '12' ORDER BY nome`
    );
  } catch {
    municipios = [];
  }

  return NextResponse.json({ dados, municipios });
}
