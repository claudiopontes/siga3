import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/access-control";
import { dbQuery } from "@/lib/db";
import { buscarJobPorId, buscarJobAtivoAnalisePauta, buscarUltimoJobAnalisePauta } from "@/lib/ia/jobs/buscarJobAnalisePauta";
import type { ItemJobAnalisePauta } from "@/lib/ia/jobs/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sessaoAuth = await getCurrentSession();
  if (!sessaoAuth) {
    return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const jobIdParam = searchParams.get("jobId");
  const sessaoIdParam = searchParams.get("sessaoId");

  if (!jobIdParam && !sessaoIdParam) {
    return NextResponse.json(
      { error: "Informe jobId ou sessaoId." },
      { status: 400 },
    );
  }

  try {
    let job = null;

    if (jobIdParam) {
      const jobId = Number(jobIdParam);
      if (isNaN(jobId)) {
        return NextResponse.json({ error: "jobId inválido." }, { status: 400 });
      }
      job = await buscarJobPorId(jobId);
    } else {
      const sessaoId = Number(sessaoIdParam);
      if (isNaN(sessaoId)) {
        return NextResponse.json({ error: "sessaoId inválido." }, { status: 400 });
      }
      // Prefere job ativo; se não houver, retorna o mais recente
      job = await buscarJobAtivoAnalisePauta(sessaoId) ?? await buscarUltimoJobAnalisePauta(sessaoId);
    }

    if (!job) {
      return NextResponse.json({ job: null, itens: [] });
    }

    const itens = await dbQuery<ItemJobAnalisePauta>(
      `SELECT id, job_id, processo_id, numero_processo, sequencia, status, mensagem, erro, iniciado_em, finalizado_em
       FROM public.ia_job_analise_pauta_item
       WHERE job_id = $1
       ORDER BY sequencia NULLS LAST, id`,
      [job.id],
    );

    return NextResponse.json({ job, itens });
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : "Erro interno.";
    console.error("[api/ia/pauta/gerar-analises-job/status]", mensagem);
    return NextResponse.json({ error: mensagem }, { status: 500 });
  }
}
