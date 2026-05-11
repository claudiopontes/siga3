import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const rows = await dbQuery(
    `SELECT * FROM mart.vigilancia_arboviroses_resumo_home ORDER BY atualizado_em DESC LIMIT 1`,
    []
  );
  return NextResponse.json(rows[0] ?? null);
}
