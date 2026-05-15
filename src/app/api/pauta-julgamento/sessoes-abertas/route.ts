import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

// GET /api/pauta-julgamento/sessoes-abertas
// ?situacao=ENCERRADA  — filtra por situação (opcional)
// ?ano=2024            — filtra por ano de realização (opcional)
// ?busca=123           — filtra por número de sessão (opcional)
export async function GET(req: NextRequest) {
  const situacaoFiltro = req.nextUrl.searchParams.get("situacao");
  const anoFiltro = req.nextUrl.searchParams.get("ano");
  const busca = req.nextUrl.searchParams.get("busca")?.trim();

  const params: unknown[] = [];
  const wheres: string[] = [];

  if (situacaoFiltro) {
    params.push(situacaoFiltro);
    wheres.push(`situacao = $${params.length}`);
  }
  if (anoFiltro && !isNaN(Number(anoFiltro))) {
    params.push(Number(anoFiltro));
    wheres.push(`EXTRACT(YEAR FROM dt_realizacao) = $${params.length}`);
  }
  if (busca) {
    params.push(`%${busca}%`);
    wheres.push(`numero ILIKE $${params.length}`);
  }

  const whereClause = wheres.length > 0 ? `WHERE ${wheres.join(" AND ")}` : "";

  try {
    const rows = await dbQuery(
      `SELECT
         id, numero, dt_realizacao, dt_encerramento,
         orgao_julgador_id, orgao_julgador,
         local_sessao, tipo, situacao,
         numero_publicacao, data_publicacao, tipo_publicacao, arquivo_sessao,
         qtd_julgado, qtd_vistas, qtd_julgamento
       FROM public.pauta_julgamento_sessao
       ${whereClause}
       ORDER BY dt_realizacao DESC`,
      params,
    );

    return NextResponse.json(rows);
  } catch (err) {
    console.error("[api/pauta-julgamento/sessoes-abertas]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erro ao consultar sessões." }, { status: 500 });
  }
}
