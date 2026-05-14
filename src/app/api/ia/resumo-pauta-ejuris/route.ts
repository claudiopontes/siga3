import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { normalizarPautaPostgresParaIA } from "@/lib/pauta/normalizarPautaPostgresParaIA";
import { executarResumoPauta } from "@/lib/ia/executarResumoPauta";

export const runtime = "nodejs";

const LIMITE_ITENS = 30;
const SITUACAO_ESPERADA = "PARA JULGAMENTO";

export async function POST(req: NextRequest) {
  // 1. Validar body
  let body: { sessaoId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const sessaoIdRaw = body?.sessaoId;
  if (sessaoIdRaw === undefined || sessaoIdRaw === null) {
    return NextResponse.json({ error: "Campo 'sessaoId' obrigatório." }, { status: 400 });
  }

  const sessaoId = Number(sessaoIdRaw);
  if (!Number.isInteger(sessaoId) || sessaoId <= 0) {
    return NextResponse.json({ error: "Campo 'sessaoId' deve ser um número inteiro positivo." }, { status: 400 });
  }

  // 2. Buscar sessão no PostgreSQL (não no SQL Server)
  let sessoes: Record<string, unknown>[];
  try {
    sessoes = await dbQuery(
      `SELECT id, numero, dt_realizacao, orgao_julgador_id, local_sessao,
              tipo, situacao, numero_publicacao, data_publicacao, tipo_publicacao
       FROM public.pauta_julgamento_sessao
       WHERE id = $1
       LIMIT 1`,
      [sessaoId],
    );
  } catch (err) {
    console.error("[api/ia/resumo-pauta-ejuris] erro ao buscar sessão:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erro ao consultar a sessão." }, { status: 500 });
  }

  if (sessoes.length === 0) {
    return NextResponse.json(
      { error: "Sessão não encontrada. Verifique se o ETL foi executado para esta sessão." },
      { status: 404 },
    );
  }

  const sessao = sessoes[0];

  // 3. Validar situação
  if (sessao.situacao !== SITUACAO_ESPERADA) {
    return NextResponse.json(
      { error: "A sessão informada não está em situação PARA JULGAMENTO e não será processada automaticamente." },
      { status: 400 },
    );
  }

  // 4. Buscar itens da pauta
  let itens: Record<string, unknown>[];
  try {
    itens = await dbQuery(
      `SELECT id, sessao_id, sessao_numero, processo_id, numero_processo,
              situacao, sequencia, relator_id, nome_relator, cargo_relator,
              titulo_relator, relator_tratamento, revisor_id, nome_revisor,
              cargo_revisor, titulo_revisor, eletronico, qtde_pron,
              incluir_interessados, julgado
       FROM public.pauta_julgamento_item
       WHERE sessao_id = $1
       ORDER BY sequencia NULLS LAST, id
       LIMIT $2`,
      [sessaoId, LIMITE_ITENS],
    );
  } catch (err) {
    console.error("[api/ia/resumo-pauta-ejuris] erro ao buscar itens:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erro ao consultar os itens da pauta." }, { status: 500 });
  }

  if (itens.length === 0) {
    return NextResponse.json(
      { error: "Nenhum processo encontrado para esta sessão. Verifique se o ETL foi executado." },
      { status: 404 },
    );
  }

  // 5. Normalizar para o formato de entrada da IA
  const input = normalizarPautaPostgresParaIA({ sessao, itens });

  // 6. Chamar a IA
  try {
    const resultado = await executarResumoPauta(input);
    return NextResponse.json(resultado);
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err);
    console.error("[api/ia/resumo-pauta-ejuris] erro na IA:", mensagem);
    return NextResponse.json({ error: "Erro ao gerar resumo de pauta com IA." }, { status: 502 });
  }
}
