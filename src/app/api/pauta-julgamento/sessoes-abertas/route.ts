import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

// GET /api/pauta-julgamento/sessoes-abertas?situacao=PARA+JULGAMENTO
// Sem ?situacao retorna todas as sessões ordenadas por data decrescente.
export async function GET(req: NextRequest) {
  const situacaoFiltro = req.nextUrl.searchParams.get("situacao");

  try {
    const rows = await dbQuery<{
      id: number;
      numero: string | null;
      dt_realizacao: string | null;
      orgao_julgador_id: number | null;
      local_sessao: string | null;
      tipo: string | null;
      situacao: string | null;
      numero_publicacao: string | null;
      data_publicacao: string | null;
      tipo_publicacao: string | null;
      arquivo_sessao: string | null;
    }>(
      situacaoFiltro
        ? `SELECT
             id, numero, dt_realizacao, orgao_julgador_id, local_sessao,
             tipo, situacao, numero_publicacao, data_publicacao, tipo_publicacao, arquivo_sessao
           FROM public.pauta_julgamento_sessao
           WHERE situacao = $1
           ORDER BY dt_realizacao DESC`
        : `SELECT
             id, numero, dt_realizacao, orgao_julgador_id, local_sessao,
             tipo, situacao, numero_publicacao, data_publicacao, tipo_publicacao, arquivo_sessao
           FROM public.pauta_julgamento_sessao
           ORDER BY dt_realizacao DESC`,
      situacaoFiltro ? [situacaoFiltro] : [],
    );

    return NextResponse.json(rows);
  } catch (err) {
    console.error("[api/pauta-julgamento/sessoes-abertas]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erro ao consultar sessões." }, { status: 500 });
  }
}
