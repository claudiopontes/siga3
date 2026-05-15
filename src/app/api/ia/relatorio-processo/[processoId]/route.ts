import { NextRequest, NextResponse } from "next/server";
import { executarAnaliseProcessoPauta } from "@/lib/ia/executarAnaliseProcessoPauta";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ processoId: string }> },
) {
  const { processoId } = await params;
  const id = Number(processoId);

  if (isNaN(id)) {
    return new NextResponse("processoId inválido.", { status: 400, headers: { "Content-Type": "text/plain" } });
  }

  try {
    const analise = await executarAnaliseProcessoPauta(id);
    const html = analise.html_relatorio ?? "<p>HTML não disponível.</p>";
    return new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ia/relatorio-processo]", msg);
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Erro</title></head>
<body style="font-family:Arial,sans-serif;padding:40px;color:#7b2020">
<h2>Erro ao gerar análise IA</h2><p>${msg.replace(/&/g,"&amp;").replace(/</g,"&lt;")}</p></body></html>`;
    return new NextResponse(html, { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}
