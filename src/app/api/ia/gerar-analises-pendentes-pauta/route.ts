// @deprecated — substituído por POST /api/ia/pauta/gerar-analises-job (job assíncrono com polling).
// Manter até remoção confirmada do uso.
import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { executarAnaliseProcessoPauta } from "@/lib/ia/executarAnaliseProcessoPauta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMITE_PADRAO = 5;
const LIMITE_MAXIMO = 30;

interface ItemPauta {
  processo_id: number | null;
  sequencia: number | null;
  numero_processo_fmt: string | null;
}

interface AnaliseExistente {
  processo_id: number;
}

type StatusResultado = "analisado" | "ja_analisado" | "pendente" | "erro";

interface ResultadoProcesso {
  processo_id: number;
  numero_processo: string;
  sequencia: number | null;
  status: StatusResultado;
  mensagem?: string;
  erro?: string;
}

export async function POST(req: NextRequest) {
  let body: { sessaoId?: unknown; limite?: unknown; forcarReprocessamento?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const sessaoId = Number(body.sessaoId);
  if (!body.sessaoId || isNaN(sessaoId)) {
    return NextResponse.json({ error: "Parâmetro sessaoId ausente ou inválido." }, { status: 400 });
  }

  const limite = Math.min(
    Math.max(1, Number(body.limite) || LIMITE_PADRAO),
    LIMITE_MAXIMO,
  );
  const forcarReprocessamento = body.forcarReprocessamento === true;

  try {
    // 1. Itens da pauta com processo_id definido
    const itens = await dbQuery<ItemPauta>(
      `SELECT processo_id, sequencia, numero_processo_fmt
       FROM public.pauta_julgamento_item
       WHERE sessao_id = $1 AND processo_id IS NOT NULL
       ORDER BY sequencia NULLS LAST, id`,
      [sessaoId],
    );

    if (!itens.length) {
      return NextResponse.json({
        sessaoId,
        total_processos: 0,
        total_ja_analisados: 0,
        total_analisados: 0,
        total_pendentes: 0,
        total_erros: 0,
        resultados: [],
      });
    }

    // 2. Análises válidas já existentes — ignora descartadas
    const processoIds = itens.map((i) => i.processo_id as number);
    const analisesExistentes = forcarReprocessamento
      ? []
      : await dbQuery<AnaliseExistente>(
          `SELECT DISTINCT processo_id
           FROM public.ia_analise_processo_pauta
           WHERE processo_id = ANY($1::int[])
             AND descartado = false`,
          [processoIds],
        );

    const jaAnalisados = new Set(analisesExistentes.map((a) => a.processo_id));

    // 3. Processar cada item
    const resultados: ResultadoProcesso[] = [];
    let totalAnalisados = 0;
    let totalJaAnalisados = 0;
    let totalPendentes = 0;
    let totalErros = 0;
    let analisadosNesseRun = 0;

    for (const item of itens) {
      const processoId = item.processo_id as number;
      const numeroProcesso = item.numero_processo_fmt ?? String(processoId);

      if (jaAnalisados.has(processoId)) {
        resultados.push({
          processo_id: processoId,
          numero_processo: numeroProcesso,
          sequencia: item.sequencia,
          status: "ja_analisado",
          mensagem: "Análise IA já existe.",
        });
        totalJaAnalisados++;
        continue;
      }

      // Limite atingido: processo fica pendente para a próxima chamada
      if (analisadosNesseRun >= limite) {
        resultados.push({
          processo_id: processoId,
          numero_processo: numeroProcesso,
          sequencia: item.sequencia,
          status: "pendente",
          mensagem: "Aguardando próxima chamada (limite por execução atingido).",
        });
        totalPendentes++;
        continue;
      }

      try {
        await executarAnaliseProcessoPauta(processoId);
        resultados.push({
          processo_id: processoId,
          numero_processo: numeroProcesso,
          sequencia: item.sequencia,
          status: "analisado",
          mensagem: "Análise gerada com sucesso.",
        });
        totalAnalisados++;
        analisadosNesseRun++;
      } catch (err) {
        const mensagemErro = err instanceof Error ? err.message : String(err);
        resultados.push({
          processo_id: processoId,
          numero_processo: numeroProcesso,
          sequencia: item.sequencia,
          status: "erro",
          mensagem: "Falha ao gerar análise.",
          erro: mensagemErro.slice(0, 300),
        });
        totalErros++;
      }
    }

    return NextResponse.json({
      sessaoId,
      total_processos: itens.length,
      total_ja_analisados: totalJaAnalisados,
      total_analisados: totalAnalisados,
      total_pendentes: totalPendentes,
      total_erros: totalErros,
      resultados,
    });
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : "Erro interno.";
    console.error("[api/ia/gerar-analises-pendentes-pauta]", mensagem);
    return NextResponse.json({ error: mensagem }, { status: 500 });
  }
}
