import { NextRequest, NextResponse } from "next/server";
import { consultarRreoSiconfi } from "@/lib/fontes/siconfi/siconfiClient";

export const runtime = "nodejs";

function parseIntParam(
  value: string | null,
  name: string,
  required: true
): { value: number } | { error: string };
function parseIntParam(
  value: string | null,
  name: string,
  required: false,
  fallback: number
): { value: number };
function parseIntParam(
  value: string | null,
  name: string,
  required: boolean,
  fallback?: number
): { value: number } | { error: string } {
  if (!value) {
    if (!required) return { value: fallback! };
    return { error: `Parâmetro obrigatório ausente: ${name}` };
  }
  const n = parseInt(value, 10);
  if (isNaN(n)) return { error: `Parâmetro inválido: ${name} deve ser numérico` };
  return { value: n };
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const idEnteResult = parseIntParam(sp.get("idEnte"), "idEnte", true);
  if ("error" in idEnteResult) {
    return NextResponse.json({ success: false, error: idEnteResult.error }, { status: 400 });
  }

  const anoResult = parseIntParam(sp.get("ano"), "ano", true);
  if ("error" in anoResult) {
    return NextResponse.json({ success: false, error: anoResult.error }, { status: 400 });
  }

  const periodoResult = parseIntParam(sp.get("periodo"), "periodo", true);
  if ("error" in periodoResult) {
    return NextResponse.json({ success: false, error: periodoResult.error }, { status: 400 });
  }

  const limitResult = parseIntParam(sp.get("limit"), "limit", false, 5000);
  if ("error" in limitResult) {
    return NextResponse.json({ success: false, error: limitResult.error }, { status: 400 });
  }

  const offsetResult = parseIntParam(sp.get("offset"), "offset", false, 0);
  if ("error" in offsetResult) {
    return NextResponse.json({ success: false, error: offsetResult.error }, { status: 400 });
  }

  const idEnte = idEnteResult.value;
  const ano = anoResult.value;
  const periodo = periodoResult.value;
  const limit = limitResult.value;
  const offset = offsetResult.value;
  const tipoDemonstrativo = sp.get("tipoDemonstrativo") ?? "RREO";
  const anexo = sp.get("anexo") ?? undefined;
  const esfera = sp.get("esfera") ?? undefined;

  try {
    const data = await consultarRreoSiconfi(
      { idEnte, anoExercicio: ano, periodo, tipoDemonstrativo, anexo, esfera },
      limit,
      offset
    );
    return NextResponse.json({
      success: true,
      params: { idEnte, ano, periodo, tipoDemonstrativo, anexo: anexo ?? null, esfera: esfera ?? null, limit, offset },
      total: data.items.length,
      items: data.items,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Erro ao consultar RREO no SICONFI";
    return NextResponse.json({ success: false, error }, { status: 502 });
  }
}
