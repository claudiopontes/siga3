import { getDb } from "@/lib/db";

export interface DescartarAnalisePautaResult {
  sessaoId: string | number;
  total_processos_pauta: number;
  total_analises_descartadas: number;
  total_relatorios_descartados: number;
}

export async function descartarAnalisePauta(params: {
  sessaoId: string | number;
  motivo?: string | null;
  descartadoPor?: string | null;
}): Promise<DescartarAnalisePautaResult> {
  const sessaoId = Number(params.sessaoId);
  const motivo = params.motivo ?? null;
  const descartadoPor = params.descartadoPor ?? null;

  const client = await getDb().connect();
  try {
    await client.query("BEGIN");

    // 1. Verificar se a sessão existe
    const sessaoRes = await client.query<{ id: number }>(
      `SELECT id FROM public.pauta_julgamento_sessao WHERE id = $1`,
      [sessaoId],
    );
    if (!sessaoRes.rows.length) {
      await client.query("ROLLBACK");
      throw Object.assign(new Error(`Sessão ${sessaoId} não encontrada.`), { status: 404 });
    }

    // 2. Buscar processo_ids da sessão
    const itensRes = await client.query<{ processo_id: number | null }>(
      `SELECT processo_id FROM public.pauta_julgamento_item
       WHERE sessao_id = $1 AND processo_id IS NOT NULL`,
      [sessaoId],
    );
    const processoIds = itensRes.rows
      .map((r) => r.processo_id)
      .filter((id): id is number => id !== null);

    // 3. Descartar análises individuais dos processos da sessão
    let totalAnalises = 0;
    if (processoIds.length > 0) {
      const analiseRes = await client.query<{ count: string }>(
        `UPDATE public.ia_analise_processo_pauta
         SET descartado      = true,
             descartado_em   = now(),
             descartado_por  = $1,
             motivo_descarte = $2
         WHERE processo_id = ANY($3::int[])
           AND descartado = false
         RETURNING id`,
        [descartadoPor, motivo, processoIds],
      );
      totalAnalises = analiseRes.rowCount ?? 0;
    }

    // 4. Descartar relatórios consolidados da sessão
    const relatorioRes = await client.query<{ count: string }>(
      `UPDATE public.ia_relatorio_resumo_pauta
       SET descartado      = true,
           descartado_em   = now(),
           descartado_por  = $1,
           motivo_descarte = $2
       WHERE sessao_id = $3
         AND descartado = false
       RETURNING id`,
      [descartadoPor, motivo, sessaoId],
    );
    const totalRelatorios = relatorioRes.rowCount ?? 0;

    await client.query("COMMIT");

    return {
      sessaoId,
      total_processos_pauta: processoIds.length,
      total_analises_descartadas: totalAnalises,
      total_relatorios_descartados: totalRelatorios,
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => null);
    throw err;
  } finally {
    client.release();
  }
}
