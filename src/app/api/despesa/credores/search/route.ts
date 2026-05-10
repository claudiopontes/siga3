import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { onlyDigits, normalizeSearchTerm } from "@/lib/credor-utils";

export const runtime = "nodejs";

const ORDER_COLS: Record<string, string> = {
  valor_pago:              "cp.valor_pago",
  valor_empenhado_liquido: "cp.valor_empenhado_liquido",
  nome:                    "cp.nome_exibicao",
  ultimo_empenho:          "cp.ultimo_empenho",
};

const TIPO_VALIDOS = new Set(["CPF", "CNPJ", "DESCONHECIDO", "all"]);

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const q         = (sp.get("q") ?? "").trim();
  const tipo      = sp.get("tipoDocumento") ?? "all";
  const page      = Math.max(1, parseInt(sp.get("page") ?? "1", 10));
  const pageSize  = Math.min(100, Math.max(1, parseInt(sp.get("pageSize") ?? "20", 10)));
  const orderBy   = ORDER_COLS[sp.get("orderBy") ?? "valor_pago"] ?? "cp.valor_pago";
  const orderDir  = sp.get("orderDir") === "asc" ? "ASC" : "DESC";
  const offset    = (page - 1) * pageSize;

  if (tipo !== "all" && !TIPO_VALIDOS.has(tipo)) {
    return NextResponse.json({ error: "tipoDocumento inválido." }, { status: 400 });
  }

  try {
    const params: unknown[] = [];

    // -------------------------------------------------------
    // Cláusula de busca (WHERE dinâmico)
    // -------------------------------------------------------
    const conditions: string[] = [];

    if (q) {
      const digits = onlyDigits(q);
      // Busca numérica: contém os dígitos em cpf_cnpj_credor
      if (digits.length >= 3 && /^\d+$/.test(q.replace(/[\s.\-\/]/g, ""))) {
        params.push(`%${digits}%`);
        conditions.push(`cp.cpf_cnpj_credor LIKE $${params.length}`);
      } else {
        // Busca textual: termo_pesquisa (campo já em lower)
        const term = normalizeSearchTerm(q);
        params.push(`%${term}%`);
        conditions.push(`cp.termo_pesquisa LIKE $${params.length}`);
      }
    }

    if (tipo !== "all") {
      params.push(tipo);
      conditions.push(`cp.tipo_documento = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // -------------------------------------------------------
    // Contagem total
    // -------------------------------------------------------
    const countSql = `
      SELECT count(*)::integer AS total
      FROM mart.credor_pesquisa cp
      ${where}
    `;
    const countRows = await dbQuery<{ total: number }>(countSql, params);
    const total = countRows[0]?.total ?? 0;

    // -------------------------------------------------------
    // Dados paginados
    // -------------------------------------------------------
    params.push(pageSize, offset);
    const dataSql = `
      SELECT
        cp.cpf_cnpj_credor,
        cp.nome_exibicao,
        cp.tipo_documento,
        cp.municipio,
        cp.uf,
        cp.valor_empenhado_liquido,
        cp.valor_liquidado,
        cp.valor_pago,
        cp.valor_a_pagar,
        cp.qtd_empenhos,
        cp.qtd_entidades,
        cp.primeiro_empenho,
        cp.ultimo_empenho,
        cp.fonte_enriquecimento,
        cp.status_consulta
      FROM mart.credor_pesquisa cp
      ${where}
      ORDER BY ${orderBy} ${orderDir} NULLS LAST
      LIMIT $${params.length - 1}
      OFFSET $${params.length}
    `;
    const rows = await dbQuery(dataSql, params);

    return NextResponse.json({
      total,
      page,
      pageSize,
      registros: rows,
    });
  } catch (err) {
    console.error("[api/despesa/credores/search]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erro interno na pesquisa de credores." }, { status: 500 });
  }
}
