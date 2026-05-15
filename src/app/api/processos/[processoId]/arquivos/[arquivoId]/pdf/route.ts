import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

// Apache na porta 8090 do servidor 105 serve os PDFs como arquivos estáticos.
// Estrutura: http://{host}:8090/{numero_zero_padded}/{nm_proc_arqv}
const REPOSITORIO_BASE_URL =
  process.env.REPOSITORIO_BASE_URL ?? "http://172.20.12.105:8090";

function numeroPadded(numeroPuro: string): string {
  // Pastas no servidor têm ao menos 5 dígitos com zero-padding (ex: 00001, 150337)
  return numeroPuro.padStart(5, "0");
}


export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ processoId: string; arquivoId: string }> },
) {
  const { processoId, arquivoId } = await params;

  const pId = Number(processoId);
  const aId = Number(arquivoId);
  if (isNaN(pId) || isNaN(aId)) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  let rows: { nm_proc_arqv: string | null }[];
  try {
    rows = await dbQuery(
      `SELECT nm_proc_arqv
       FROM public.pauta_julgamento_arquivo
       WHERE id_proc_arqv = $1 AND processo_id = $2
       LIMIT 1`,
      [aId, pId],
    );
  } catch (err) {
    console.error("[pdf/route] db error", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erro ao consultar banco de dados." }, { status: 500 });
  }

  if (!rows.length) {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }

  const { nm_proc_arqv } = rows[0];

  if (!nm_proc_arqv) {
    return NextResponse.json({ error: "Nome do arquivo não disponível." }, { status: 404 });
  }

  // processo_id já é o ID numérico — corresponde diretamente ao nome da pasta no repositório
  const pasta = numeroPadded(String(pId));
  const nomeEncoded = encodeURIComponent(nm_proc_arqv);
  const url = `${REPOSITORIO_BASE_URL}/${pasta}/${nomeEncoded}`;

  let resp: Response;
  try {
    resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[pdf/route] fetch error", msg, url);
    return NextResponse.json({ error: "Não foi possível acessar o servidor de arquivos.", detalhe: msg }, { status: 502 });
  }

  if (!resp.ok) {
    console.error("[pdf/route] servidor retornou", resp.status, url);
    return NextResponse.json(
      { error: `Arquivo não encontrado no servidor (HTTP ${resp.status}).` },
      { status: resp.status === 404 ? 404 : 502 },
    );
  }

  return new NextResponse(resp.body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nm_proc_arqv}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
