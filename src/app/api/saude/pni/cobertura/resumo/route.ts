import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const rows = await dbQuery(`SELECT * FROM mart.pni_cobertura_resumo_home LIMIT 1`);
  return NextResponse.json(rows[0] ?? null);
}
