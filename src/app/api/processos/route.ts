import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

const POR_PAGINA = 25;

const COLUNAS_ORDENACAO: Record<string, string> = {
  numero_processo_fmt: "sub.numero_processo_fmt",
  nome_classe:         "sub.nome_classe",
  objeto:              "sub.objeto",
  nome_1_parte:        "sub.nome_1_parte",
  relator:             "sub.relator_tratamento",
};

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const busca    = sp.get("busca")?.trim() ?? "";
  const ano      = sp.get("ano")?.trim() ?? "";
  const classe   = sp.get("classe")?.trim() ?? "";
  const situacao = sp.get("situacao")?.trim() ?? "";
  const relator  = sp.get("relator")?.trim() ?? "";
  const sortCol  = sp.get("sort") ?? "numero_processo_fmt";
  const sortDir  = sp.get("dir")?.toUpperCase() === "ASC" ? "ASC" : "DESC";
  const page     = Math.max(1, Number(sp.get("page") ?? "1"));
  const offset   = (page - 1) * POR_PAGINA;

  const orderExpr = `${COLUNAS_ORDENACAO[sortCol] ?? COLUNAS_ORDENACAO.numero_processo_fmt} ${sortDir} NULLS LAST`;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (busca) {
    conditions.push(`(
      i.numero_processo_fmt ILIKE $${idx}
      OR i.nome_1_parte     ILIKE $${idx}
      OR i.nome_relator     ILIKE $${idx}
      OR i.relator_tratamento ILIKE $${idx}
      OR i.objeto           ILIKE $${idx}
    )`);
    params.push(`%${busca}%`);
    idx++;
  }

  if (ano) {
    conditions.push(`EXTRACT(YEAR FROM s.dt_realizacao) = $${idx}`);
    params.push(Number(ano));
    idx++;
  }

  if (classe) {
    conditions.push(`i.nome_classe = $${idx}`);
    params.push(classe);
    idx++;
  }

  if (situacao) {
    conditions.push(`i.situacao_funcional = $${idx}`);
    params.push(situacao);
    idx++;
  }

  if (relator) {
    conditions.push(`COALESCE(i.relator_tratamento, i.nome_relator) = $${idx}`);
    params.push(relator);
    idx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const [rows, countRow] = await Promise.all([
      dbQuery(
        `SELECT *
         FROM (
           SELECT DISTINCT ON (i.processo_id)
             i.processo_id,
             i.numero_processo_fmt, i.objeto, i.nome_classe, i.assunto,
             i.nome_1_parte, i.situacao_funcional, i.nome_orgao,
             i.nome_relator, i.relator_tratamento, i.nome_revisor,
             i.situacao,
             s.dt_realizacao
           FROM public.pauta_julgamento_item i
           JOIN public.pauta_julgamento_sessao s ON s.id = i.sessao_id
           ${where}
           ORDER BY i.processo_id, s.dt_realizacao DESC
         ) sub
         ORDER BY ${orderExpr}
         LIMIT ${POR_PAGINA} OFFSET ${offset}`,
        params,
      ),
      dbQuery(
        `SELECT COUNT(DISTINCT i.processo_id) AS total
         FROM public.pauta_julgamento_item i
         JOIN public.pauta_julgamento_sessao s ON s.id = i.sessao_id
         ${where}`,
        params,
      ),
    ]);

    return NextResponse.json({
      dados: rows,
      total: Number((countRow[0] as { total: string }).total),
      pagina: page,
      porPagina: POR_PAGINA,
    });
  } catch (err) {
    console.error("[api/processos]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erro ao consultar processos." }, { status: 500 });
  }
}
