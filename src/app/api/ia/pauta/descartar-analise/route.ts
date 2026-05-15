import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, getCurrentSession } from "@/lib/auth/access-control";
import { descartarAnalisePauta } from "@/lib/ia/relatorios/descartarAnalisePauta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Autenticação: rejeita não autenticados com 401
  const sessaoAuth = await getCurrentSession();
  if (!sessaoAuth) {
    return NextResponse.json(
      { error: "Autenticação necessária." },
      { status: 401 },
    );
  }

  // Autorização: somente administradores
  const adminSession = await requireAdminSession();
  if (!adminSession) {
    return NextResponse.json(
      { error: "Apenas usuários administradores podem descartar a análise completa da pauta." },
      { status: 403 },
    );
  }

  let body: { sessaoId?: unknown; motivo?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const sessaoId = Number(body.sessaoId);
  if (!body.sessaoId || isNaN(sessaoId)) {
    return NextResponse.json(
      { error: "Parâmetro sessaoId ausente ou inválido." },
      { status: 400 },
    );
  }

  const motivo = typeof body.motivo === "string" ? body.motivo.trim().slice(0, 500) : null;

  try {
    const resultado = await descartarAnalisePauta({
      sessaoId,
      motivo,
      descartadoPor: adminSession.username,
    });

    return NextResponse.json({ success: true, ...resultado });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    const mensagem = err instanceof Error ? err.message : "Erro interno.";
    console.error("[api/ia/pauta/descartar-analise]", mensagem);
    return NextResponse.json({ error: mensagem }, { status });
  }
}
