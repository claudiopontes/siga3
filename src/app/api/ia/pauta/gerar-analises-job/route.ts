import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/access-control";
import { criarJobAnalisePauta } from "@/lib/ia/jobs/criarJobAnalisePauta";
import { processarJobAnalisePauta } from "@/lib/ia/jobs/processarJobAnalisePauta";
import { buscarJobPorId } from "@/lib/ia/jobs/buscarJobAnalisePauta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sessaoAuth = await getCurrentSession();
  if (!sessaoAuth) {
    return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  }

  let body: { sessaoId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const sessaoId = Number(body.sessaoId);
  if (!body.sessaoId || isNaN(sessaoId)) {
    return NextResponse.json({ error: "Parâmetro sessaoId ausente ou inválido." }, { status: 400 });
  }

  try {
    const { jobId, existente } = await criarJobAnalisePauta({
      sessaoId,
      iniciadoPor: sessaoAuth.username,
    });

    const job = await buscarJobPorId(jobId);

    if (existente) {
      return NextResponse.json({
        jobId,
        sessaoId,
        status: job?.status ?? "executando",
        existente: true,
        mensagem: "Já existe uma geração de análises em andamento para esta pauta.",
      });
    }

    // Disparo assíncrono — não bloqueia a resposta HTTP
    // O processamento ocorre em background no mesmo processo Node.js
    void processarJobAnalisePauta(jobId).catch((err) => {
      console.error(`[gerar-analises-job] Erro no job ${jobId}:`, err instanceof Error ? err.message : err);
    });

    return NextResponse.json({
      jobId,
      sessaoId,
      status: job?.status ?? "pendente",
      existente: false,
      mensagem: "Job criado para geração das análises pendentes da pauta.",
    });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    const mensagem = err instanceof Error ? err.message : "Erro interno.";
    console.error("[api/ia/pauta/gerar-analises-job]", mensagem);
    return NextResponse.json({ error: mensagem }, { status });
  }
}
