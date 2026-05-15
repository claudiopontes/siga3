import { dbQuery } from "@/lib/db";
import type { JobAnalisePauta } from "./tipos";

export async function buscarJobAtivoAnalisePauta(
  sessaoId: string | number,
): Promise<JobAnalisePauta | null> {
  const rows = await dbQuery<JobAnalisePauta>(
    `SELECT id, sessao_id, status, total_processos, total_pendentes,
            total_processados, total_analisados, total_ja_analisados, total_erros,
            iniciado_por, criado_em, iniciado_em, finalizado_em, mensagem, erro, cancelado
     FROM public.ia_job_analise_pauta
     WHERE sessao_id = $1
       AND status IN ('pendente', 'executando')
     ORDER BY criado_em DESC
     LIMIT 1`,
    [Number(sessaoId)],
  );
  return rows[0] ?? null;
}

export async function buscarUltimoJobAnalisePauta(
  sessaoId: string | number,
): Promise<JobAnalisePauta | null> {
  const rows = await dbQuery<JobAnalisePauta>(
    `SELECT id, sessao_id, status, total_processos, total_pendentes,
            total_processados, total_analisados, total_ja_analisados, total_erros,
            iniciado_por, criado_em, iniciado_em, finalizado_em, mensagem, erro, cancelado
     FROM public.ia_job_analise_pauta
     WHERE sessao_id = $1
     ORDER BY criado_em DESC
     LIMIT 1`,
    [Number(sessaoId)],
  );
  return rows[0] ?? null;
}

export async function buscarJobPorId(jobId: number): Promise<JobAnalisePauta | null> {
  const rows = await dbQuery<JobAnalisePauta>(
    `SELECT id, sessao_id, status, total_processos, total_pendentes,
            total_processados, total_analisados, total_ja_analisados, total_erros,
            iniciado_por, criado_em, iniciado_em, finalizado_em, mensagem, erro, cancelado
     FROM public.ia_job_analise_pauta
     WHERE id = $1`,
    [jobId],
  );
  return rows[0] ?? null;
}
