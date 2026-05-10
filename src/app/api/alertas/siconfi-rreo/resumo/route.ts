import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const rows = await dbQuery(
    `SELECT * FROM mart.siconfi_rreo_resumo_home ORDER BY an_exercicio DESC, nr_periodo DESC LIMIT 1`,
    []
  );
  return NextResponse.json(rows[0] ?? null);
}
