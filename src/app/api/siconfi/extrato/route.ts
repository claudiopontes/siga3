import { NextRequest, NextResponse } from "next/server";
import { consultarExtratoEntregasSiconfi } from "@/lib/fontes/siconfi/siconfiClient";

export const runtime = "nodejs";

function parseIntParam(value: string | null, name: string): { value: number } | { error: string } {
  if (!value) return { error: `Parâmetro obrigatório ausente: ${name}` };
  const n = parseInt(value, 10);
  if (isNaN(n)) return { error: `Parâmetro inválido: ${name} deve ser numérico` };
  return { value: n };
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const idEnteResult = parseIntParam(sp.get("idEnte"), "idEnte");
  if ("error" in idEnteResult) {
    return NextResponse.json({ success: false, error: idEnteResult.error }, { status: 400 });
  }

  const anoResult = parseIntParam(sp.get("ano"), "ano");
  if ("error" in anoResult) {
    return NextResponse.json({ success: false, error: anoResult.error }, { status: 400 });
  }

  const idEnte = idEnteResult.value;
  const ano = anoResult.value;

  try {
    const data = await consultarExtratoEntregasSiconfi({ idEnte, anoReferencia: ano });
    return NextResponse.json({
      success: true,
      params: { idEnte, ano },
      total: data.items.length,
      items: data.items,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Erro ao consultar extrato de entregas no SICONFI";
    return NextResponse.json({ success: false, error }, { status: 502 });
  }
}
