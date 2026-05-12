import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  let municipios: unknown[] = [];
  let entidades: string[] = [];
  let tipos: string[] = [];
  let emitentes: string[] = [];
  let anos: number[] = [];
  let meses: number[] = [];

  try {
    municipios = await dbQuery(
      `SELECT codigo, nome, uf_codigo FROM public.aux_dim_municipio
       WHERE uf_codigo = '12' ORDER BY nome`
    );
  } catch {
    municipios = [];
  }

  try {
    // Tenta com coluna emitente
    const rows = await dbQuery<{
      entidade: string;
      tipo_combustivel: string;
      emitente: string | null;
      ano: number;
      mes: number;
    }>(
      `SELECT DISTINCT entidade, tipo_combustivel, emitente, ano, mes
       FROM public.combustivel_mensal ORDER BY entidade`
    );

    const entidadeSet = new Set<string>();
    const tipoSet = new Set<string>();
    const emitenteSet = new Set<string>();
    const anoSet = new Set<number>();
    const mesSet = new Set<number>();

    for (const row of rows) {
      if (row.entidade) entidadeSet.add(row.entidade);
      if (row.tipo_combustivel) tipoSet.add(row.tipo_combustivel);
      if (row.emitente) emitenteSet.add(row.emitente);
      if (row.ano) anoSet.add(Number(row.ano));
      if (row.mes) mesSet.add(Number(row.mes));
    }

    entidades = [...entidadeSet].sort((a, b) => a.localeCompare(b, "pt-BR"));
    tipos = [...tipoSet].sort((a, b) => a.localeCompare(b, "pt-BR"));
    emitentes = [...emitenteSet].sort((a, b) => a.localeCompare(b, "pt-BR"));
    anos = [...anoSet].sort((a, b) => a - b);
    meses = [...mesSet].sort((a, b) => a - b);
  } catch {
    // Fallback sem coluna emitente
    try {
      const rows = await dbQuery<{
        entidade: string;
        tipo_combustivel: string;
        ano: number;
        mes: number;
      }>(
        `SELECT DISTINCT entidade, tipo_combustivel, ano, mes
         FROM public.combustivel_mensal ORDER BY entidade`
      );
      const entidadeSet = new Set<string>();
      const tipoSet = new Set<string>();
      const anoSet = new Set<number>();
      const mesSet = new Set<number>();
      for (const row of rows) {
        if (row.entidade) entidadeSet.add(row.entidade);
        if (row.tipo_combustivel) tipoSet.add(row.tipo_combustivel);
        if (row.ano) anoSet.add(Number(row.ano));
        if (row.mes) mesSet.add(Number(row.mes));
      }
      entidades = [...entidadeSet].sort((a, b) => a.localeCompare(b, "pt-BR"));
      tipos = [...tipoSet].sort((a, b) => a.localeCompare(b, "pt-BR"));
      anos = [...anoSet].sort((a, b) => a - b);
      meses = [...mesSet].sort((a, b) => a - b);
    } catch {
      // silencioso
    }

    // Tenta emitentes da tabela separada
    try {
      const rows = await dbQuery<{ emitente: string }>(
        `SELECT emitente FROM public.combustivel_emitente ORDER BY emitente`
      );
      emitentes = rows.map((r) => r.emitente).filter(Boolean).sort((a, b) => a.localeCompare(b, "pt-BR"));
    } catch {
      emitentes = [];
    }
  }

  return NextResponse.json({ municipios, entidades, tipos, emitentes, anos, meses });
}
