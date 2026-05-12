import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  let alertas: unknown[] = [];
  let carga: unknown | null = null;

  try {
    alertas = await dbQuery(
      `SELECT * FROM public.vw_alertas_cauc_ac ORDER BY total_pendencias DESC`
    );
  } catch {
    alertas = [];
  }

  try {
    const rows = await dbQuery(
      `SELECT * FROM public.vw_cauc_ultima_carga LIMIT 1`
    );
    carga = rows[0] ?? null;
  } catch {
    carga = null;
  }

  return NextResponse.json({ alertas, carga });
}
