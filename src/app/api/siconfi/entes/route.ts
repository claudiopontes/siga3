import { NextResponse } from "next/server";
import { consultarEntesSiconfi } from "@/lib/fontes/siconfi/siconfiClient";

export const runtime = "nodejs";

export async function GET() {
  try {
    const data = await consultarEntesSiconfi();
    return NextResponse.json({
      success: true,
      total: data.items.length,
      items: data.items,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Erro ao consultar entes no SICONFI";
    return NextResponse.json({ success: false, error }, { status: 502 });
  }
}
