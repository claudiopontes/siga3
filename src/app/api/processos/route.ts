import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

const POR_PAGINA = 25;

const COLUNAS_ORDENACAO: Record<string, string> = {
  numero_fmt:   "p.numero_fmt",
  nome_classe:  "p.nome_classe",
  objeto:       "p.objeto",
  nome_1_parte: "p.nome_1_parte",
  relator:      "p.nome_relator",
  ano:          "p.ano",
};

export async function GET(req: NextRequest) {
  const sp       = req.nextUrl.searchParams;
  const busca    = sp.get("busca")?.trim() ?? "";
  const ano      = sp.get("ano")?.trim() ?? "";
  const classe   = sp.get("classe")?.trim() ?? "";
  const situacao = sp.get("situacao")?.trim() ?? "";
  const relator  = sp.get("relator")?.trim() ?? "";
  const sortCol  = sp.get("sort") ?? "numero_fmt";
  const sortDir  = sp.get("dir")?.toUpperCase() === "ASC" ? "ASC" : "DESC";
  const page     = Math.max(1, Number(sp.get("page") ?? "1"));
  const offset   = (page - 1) * POR_PAGINA;

  const orderExpr = `${COLUNAS_ORDENACAO[sortCol] ?? COLUNAS_ORDENACAO.numero_fmt} ${sortDir} NULLS LAST`;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (busca) {
    // Remove pontuação do termo de busca para comparar com número sem formatação
    // Ex: "149522" ou "149522/2025" deve encontrar "149.522/2025"
    const buscaSemPontuacao = busca.replace(/[.\-/\s]/g, "");

    conditions.push(`(
      p.numero_fmt  ILIKE $${idx}
      OR p.objeto       ILIKE $${idx}
      OR p.nome_1_parte ILIKE $${idx}
      OR p.nome_relator ILIKE $${idx}
      OR p.partes       ILIKE $${idx}
      OR regexp_replace(p.numero_fmt, '[^0-9]', '', 'g') ILIKE $${idx + 1}
    )`);
    params.push(`%${busca}%`);
    params.push(`%${buscaSemPontuacao}%`);
    idx += 2;
  }

  if (ano) {
    conditions.push(`p.ano = $${idx}`);
    params.push(Number(ano));
    idx++;
  }

  if (classe) {
    conditions.push(`p.nome_classe = $${idx}`);
    params.push(classe);
    idx++;
  }

  if (situacao) {
    conditions.push(`p.situacao = $${idx}`);
    params.push(situacao);
    idx++;
  }

  if (relator) {
    conditions.push(`p.nome_relator = $${idx}`);
    params.push(relator);
    idx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const [rows, countRow] = await Promise.all([
      dbQuery(
        `SELECT
           p.processo_id, p.numero_fmt, p.ano, p.objeto,
           p.nome_classe, p.assunto, p.nome_orgao,
           p.nome_relator, p.nome_1_parte,
           p.situacao, p.nm_status, p.dt_criacao
         FROM public.processo p
         ${where}
         ORDER BY ${orderExpr}
         LIMIT ${POR_PAGINA} OFFSET ${offset}`,
        params,
      ),
      dbQuery(
        `SELECT COUNT(*) AS total FROM public.processo p ${where}`,
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
