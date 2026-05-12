import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const rows = await dbQuery<{
      entidade: string;
      tipo_combustivel: string;
      nome_credor: string;
      forma_fornecimento: string;
      ano: number;
    }>(
      `SELECT DISTINCT entidade, tipo_combustivel, nome_credor, forma_fornecimento, ano
       FROM public.combustivel_empenho_mensal
       ORDER BY entidade`
    );

    const entidadeSet = new Set<string>();
    const tipoSet = new Set<string>();
    const credorSet = new Set<string>();
    const formaSet = new Set<string>();
    const anoSet = new Set<number>();

    for (const row of rows) {
      if (row.entidade) entidadeSet.add(row.entidade);
      if (row.tipo_combustivel) tipoSet.add(row.tipo_combustivel);
      if (row.nome_credor) credorSet.add(row.nome_credor);
      if (row.forma_fornecimento) formaSet.add(row.forma_fornecimento);
      if (row.ano) anoSet.add(Number(row.ano));
    }

    return NextResponse.json({
      entidades: [...entidadeSet].sort((a, b) => a.localeCompare(b, "pt-BR")),
      tipos: [...tipoSet].sort((a, b) => a.localeCompare(b, "pt-BR")),
      credores: [...credorSet].sort((a, b) => a.localeCompare(b, "pt-BR")),
      formas: [...formaSet].sort(),
      anos: [...anoSet].sort((a, b) => a - b),
    });
  } catch {
    return NextResponse.json({
      entidades: [],
      tipos: [],
      credores: [],
      formas: [],
      anos: [],
    });
  }
}
