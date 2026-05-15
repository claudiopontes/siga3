import { dbQuery, getDb } from "@/lib/db";
import { executarAnaliseProcessoPauta } from "@/lib/ia/executarAnaliseProcessoPauta";
import type { ItemJobAnalisePauta, StatusJobAnalisePauta } from "./tipos";

interface JobRow {
  id: number;
  status: StatusJobAnalisePauta;
  iniciado_em: string | null;
  total_processados: number;
  total_analisados: number;
  total_ja_analisados: number;
  total_erros: number;
}

async function atualizarJob(
  jobId: number,
  campos: Partial<{
    status: StatusJobAnalisePauta;
    iniciado_em: string;
    finalizado_em: string;
    total_processados: number;
    total_analisados: number;
    total_ja_analisados: number;
    total_erros: number;
    mensagem: string | null;
    erro: string | null;
  }>,
): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;

  for (const [col, val] of Object.entries(campos)) {
    sets.push(`${col} = $${idx++}`);
    vals.push(val);
  }

  if (!sets.length) return;
  vals.push(jobId);
  await dbQuery(`UPDATE public.ia_job_analise_pauta SET ${sets.join(", ")} WHERE id = $${idx}`, vals);
}

async function atualizarItem(
  itemId: number,
  campos: Partial<{
    status: string;
    mensagem: string | null;
    erro: string | null;
    iniciado_em: string;
    finalizado_em: string;
  }>,
): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;

  for (const [col, val] of Object.entries(campos)) {
    sets.push(`${col} = $${idx++}`);
    vals.push(val);
  }

  if (!sets.length) return;
  vals.push(itemId);
  await dbQuery(`UPDATE public.ia_job_analise_pauta_item SET ${sets.join(", ")} WHERE id = $${idx}`, vals);
}

export async function processarJobAnalisePauta(jobId: number): Promise<void> {
  // 1. Carregar job
  const jobRows = await dbQuery<JobRow>(
    `SELECT id, status, iniciado_em, total_processados, total_analisados, total_ja_analisados, total_erros
     FROM public.ia_job_analise_pauta WHERE id = $1`,
    [jobId],
  );

  if (!jobRows.length) return;
  const job = jobRows[0];

  // 2. Só processa se estiver pendente ou executando
  if (job.status !== "pendente" && job.status !== "executando") return;

  // 3. Marcar como executando
  await atualizarJob(jobId, {
    status: "executando",
    ...(job.iniciado_em ? {} : { iniciado_em: new Date().toISOString() }),
  });

  // 4. Buscar itens pendentes
  const itensPendentes = await dbQuery<ItemJobAnalisePauta>(
    `SELECT id, processo_id, numero_processo, sequencia, status
     FROM public.ia_job_analise_pauta_item
     WHERE job_id = $1 AND status = 'pendente'
     ORDER BY sequencia NULLS LAST, id`,
    [jobId],
  );

  let totalProcessados = job.total_processados;
  let totalAnalisados = job.total_analisados;
  let totalErros = job.total_erros;

  // 5. Processar sequencialmente
  try {
    for (const item of itensPendentes) {
      await atualizarItem(item.id, {
        status: "analisando",
        iniciado_em: new Date().toISOString(),
      });

      try {
        await executarAnaliseProcessoPauta(item.processo_id);

        await atualizarItem(item.id, {
          status: "analisado",
          mensagem: "Análise gerada com sucesso.",
          finalizado_em: new Date().toISOString(),
        });

        totalAnalisados++;
      } catch (err) {
        const mensagemErro = err instanceof Error ? err.message : String(err);

        await atualizarItem(item.id, {
          status: "erro",
          mensagem: "Falha ao gerar análise.",
          erro: mensagemErro.slice(0, 500),
          finalizado_em: new Date().toISOString(),
        });

        totalErros++;
      }

      totalProcessados++;

      // Atualiza totais no job a cada item processado
      await atualizarJob(jobId, {
        total_processados: totalProcessados,
        total_analisados: totalAnalisados,
        total_erros: totalErros,
      });
    }

    // 6. Finalizar job
    const statusFinal: StatusJobAnalisePauta = totalErros > 0 ? "concluido_com_erros" : "concluido";
    await atualizarJob(jobId, {
      status: statusFinal,
      finalizado_em: new Date().toISOString(),
    });
  } catch (err) {
    // 8. Erro geral inesperado
    const mensagemErro = err instanceof Error ? err.message : String(err);
    await atualizarJob(jobId, {
      status: "erro",
      erro: mensagemErro.slice(0, 500),
      finalizado_em: new Date().toISOString(),
    }).catch(() => null);
  }
}
