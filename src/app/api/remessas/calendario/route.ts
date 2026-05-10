import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const ano = sp.get("ano") ? Number(sp.get("ano")) : new Date().getFullYear();

  // Retorna todas as remessas mensais ativas do ano, com status de confirmação por mês.
  // Filtros: status='1' (ativa), situacao<>'AA' (exclui remessa anual).
  const sql = `
    SELECT
      f.id_entidade,
      COALESCE(
        dre.nome_entidade,
        de.nome,
        'Entidade ' || f.id_entidade::text
      ) AS nome_entidade,
      COALESCE(dren.nome_ente, dre.nome_ente, de.nome) AS nome_ente,
      f.numero                          AS mes,
      f.prazo_envio,
      f.data_envio,
      f.data_confirmacao,
      f.situacao,
      f.status_publicacao
    FROM dw.fato_remessa_contabil f
    LEFT JOIN dw.dim_remessa_entidade dre ON dre.id_entidade = f.id_entidade
    LEFT JOIN public.dim_entidade de      ON de.id_entidade  = f.id_entidade::bigint
    LEFT JOIN dw.dim_remessa_ente dren    ON dren.id_ente    = f.id_entidade_cjur::numeric
    WHERE f.ano    = $1
      AND f.status = '1'
      AND f.situacao <> 'AA'
    ORDER BY nome_entidade, f.numero
  `;

  try {
    const rows = await dbQuery(sql, [ano]);
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[api/remessas/calendario]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
