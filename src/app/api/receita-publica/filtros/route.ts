import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  let periodos: unknown[] = [];
  let entidades: unknown[] = [];
  let entes: unknown[] = [];

  try {
    periodos = await dbQuery(
      `SELECT DISTINCT ano, mes FROM public.receita_publica_categoria_mensal
       ORDER BY ano DESC, mes DESC`
    );
  } catch {
    periodos = [];
  }

  try {
    entidades = await dbQuery(
      `SELECT id_entidade, id_entidade_cjur, id_ente FROM public.dim_entidade`
    );
  } catch {
    entidades = [];
  }

  try {
    entes = await dbQuery(
      `SELECT id_ente, nome FROM public.dim_ente ORDER BY nome`
    );
  } catch {
    entes = [];
  }

  return NextResponse.json({ periodos, entidades, entes });
}
