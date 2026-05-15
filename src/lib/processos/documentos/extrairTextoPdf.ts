// Extrai texto de um PDF servido via HTTP pelo servidor Apache do EPROCESS.
// Usa pdf-parse (Node.js). Não compatível com Edge Runtime.
import pdfParse from "pdf-parse";

const REPOSITORIO_BASE_URL =
  process.env.REPOSITORIO_BASE_URL ?? "http://172.20.12.105:8090";

function numeroPadded(processoId: number): string {
  return String(processoId).padStart(5, "0");
}

export async function extrairTextoPdf(
  processoId: number,
  nmProcArqv: string,
): Promise<string> {
  const pasta = numeroPadded(processoId);
  const nomeEncoded = encodeURIComponent(nmProcArqv);
  const url = `${REPOSITORIO_BASE_URL}/${pasta}/${nomeEncoded}`;

  const resp = await fetch(url, { signal: AbortSignal.timeout(30000) });

  if (!resp.ok) {
    throw new Error(`PDF não encontrado no servidor (HTTP ${resp.status}): ${url}`);
  }

  const buffer = Buffer.from(await resp.arrayBuffer());
  const resultado = await pdfParse(buffer, { max: 50 }); // lê até 50 páginas

  return resultado.text ?? "";
}
