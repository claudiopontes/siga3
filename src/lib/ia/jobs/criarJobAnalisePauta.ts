import { getDb } from "@/lib/db";
import { buscarJobAtivoAnalisePauta } from "./buscarJobAnalisePauta";

interface ItemPautaRow {
  processo_id: number;
  numero_processo_fmt: string | null;
  sequencia: number | null;
}

interface AnaliseExistenteRow {
  processo_id: number;
}

interface JobInsertRow {
  id: number;
}

interface ItemInsertRow {
  id: number;
}

export async function criarJobAnalisePauta(params: {
  sessaoId: string | number;
  iniciadoPor?: string | null;
}): Promise<{ jobId: number; existente: boolean }> {
  const sessaoId = Number(params.sessaoId);

  // 1. Verificar job ativo existente
  const ativo = await buscarJobAtivoAnalisePauta(sessaoId);
  if (ativo) {
    return { jobId: ativo.id, existente: true };
  }

  const client = await getDb().connect();
  try {
    await client.query("BEGIN");

    // 2. Verificar se sessão existe
    const sessaoRes = await client.query<{ id: number }>(
      `SELECT id FROM public.pauta_julgamento_sessao WHERE id = $1`,
      [sessaoId],
    );
    if (!sessaoRes.rows.length) {
      await client.query("ROLLBACK");
      throw Object.assign(new Error(`Sessão ${sessaoId} não encontrada.`), { status: 404 });
    }

    // 3. Buscar processos da pauta
    const itensRes = await client.query<ItemPautaRow>(
      `SELECT processo_id, numero_processo_fmt, sequencia
       FROM public.pauta_julgamento_item
       WHERE sessao_id = $1 AND processo_id IS NOT NULL
       ORDER BY sequencia NULLS LAST, id`,
      [sessaoId],
    );
    const itens = itensRes.rows;
    const totalProcessos = itens.length;

    // 4. Verificar quais já possuem análise válida
    const processoIds = itens.map((i) => i.processo_id);
    let jaAnalisados = new Set<number>();

    if (processoIds.length > 0) {
      const analisesRes = await client.query<AnaliseExistenteRow>(
        `SELECT DISTINCT processo_id
         FROM public.ia_analise_processo_pauta
         WHERE processo_id = ANY($1::int[])
           AND descartado = false`,
        [processoIds],
      );
      jaAnalisados = new Set(analisesRes.rows.map((r) => r.processo_id));
    }

    const totalJaAnalisados = jaAnalisados.size;
    const totalPendentes = totalProcessos - totalJaAnalisados;

    // 5. Criar registro do job
    // O índice único parcial (ux_ia_job_analise_pauta_ativo) protege contra race condition
    const jobRes = await client.query<JobInsertRow>(
      `INSERT INTO public.ia_job_analise_pauta
         (sessao_id, status, total_processos, total_pendentes, total_ja_analisados, iniciado_por)
       VALUES ($1, 'pendente', $2, $3, $4, $5)
       RETURNING id`,
      [sessaoId, totalProcessos, totalPendentes, totalJaAnalisados, params.iniciadoPor ?? null],
    );
    const jobId = jobRes.rows[0].id;

    // 6. Criar itens do job
    if (itens.length > 0) {
      const values: unknown[] = [];
      const placeholders: string[] = [];
      itens.forEach((item, idx) => {
        const base = idx * 5;
        placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
        values.push(
          jobId,
          item.processo_id,
          item.numero_processo_fmt ?? null,
          item.sequencia ?? null,
          jaAnalisados.has(item.processo_id) ? "ja_analisado" : "pendente",
        );
      });

      await client.query<ItemInsertRow>(
        `INSERT INTO public.ia_job_analise_pauta_item
           (job_id, processo_id, numero_processo, sequencia, status)
         VALUES ${placeholders.join(", ")}`,
        values,
      );
    }

    await client.query("COMMIT");
    return { jobId, existente: false };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => null);
    throw err;
  } finally {
    client.release();
  }
}
