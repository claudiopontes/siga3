// Extrai texto de um PDF servido via HTTP pelo servidor Apache do EPROCESS.
// Usa pdf-parse (Node.js). Não compatível com Edge Runtime.
//
// Usa createRequire para carregar pdf-parse fora do sistema de módulos do webpack,
// garantindo que rode em Node.js puro e não seja bundlado.
import { createRequire } from "module";

type PdfParseResult = { text: string };
type PdfParseFn = (buffer: Buffer, opts?: { max?: number }) => Promise<PdfParseResult>;

function carregarPdfParse(): PdfParseFn {
  const nodeRequire = createRequire(import.meta.url);
  const m = nodeRequire("pdf-parse");
  const fn: PdfParseFn = typeof m === "function" ? m : (m.default ?? m);
  if (typeof fn !== "function") {
    throw new Error(
      `pdf-parse não carregado como função (tipo: ${typeof m}). ` +
      `Verifique serverExternalPackages no next.config.ts.`,
    );
  }
  return fn;
}

const REPOSITORIO_BASE_URL =
  process.env.REPOSITORIO_BASE_URL ?? "http://172.20.12.105:8090";

const TAMANHO_MAXIMO_BYTES = 50 * 1024 * 1024; // 50 MB
const MINIMO_CHARS_UTEIS    = 100;

// O Apache 8090 usa apenas o ID numérico como pasta (ex: "141831").
// O campo en_dir do EPROCESS é um caminho interno Oracle ("processos/141831") — não usar aqui.
function pastaNoServidor(processoId: number): string {
  return String(processoId).padStart(5, "0");
}

export class ErroExtracaoPdf extends Error {
  constructor(
    message: string,
    public readonly codigo:
      | "HTTP_ERRO"
      | "NAO_PDF"
      | "TAMANHO_EXCEDIDO"
      | "TEXTO_VAZIO"
      | "PARSE_ERRO",
  ) {
    super(message);
    this.name = "ErroExtracaoPdf";
  }
}

/**
 * Extrai texto de um PDF do repositório EPROCESS (Apache 8090).
 *
 * A pasta no servidor é sempre derivada do processoId numérico.
 * O campo en_dir do banco é um caminho Oracle interno e não se aplica aqui.
 */
export async function extrairTextoPdf(
  processoId: number,
  nmProcArqv: string,
): Promise<string> {
  const pasta = pastaNoServidor(processoId);
  const nomeEncoded = encodeURIComponent(nmProcArqv);
  const url = `${REPOSITORIO_BASE_URL}/${pasta}/${nomeEncoded}`;

  // Mascara o host na log para evitar exposição de IPs internos
  const urlLog = url.replace(/https?:\/\/[^/]+/, "[repositorio]");
  console.log(
    `[extrairTextoPdf] processo=${processoId} pasta="${pasta}" arquivo="${nmProcArqv}" url=${urlLog}`,
  );

  let resp: Response;
  try {
    resp = await fetch(url, { signal: AbortSignal.timeout(30000) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[extrairTextoPdf] Falha na conexão: ${msg} | url=${urlLog}`);
    throw new ErroExtracaoPdf(`Falha ao conectar ao repositório de PDFs: ${msg}`, "HTTP_ERRO");
  }

  const contentType = resp.headers.get("content-type") ?? "";
  console.log(
    `[extrairTextoPdf] HTTP ${resp.status} | content-type: "${contentType}" | url=${urlLog}`,
  );

  if (!resp.ok) {
    throw new ErroExtracaoPdf(
      `HTTP ${resp.status} ao baixar "${nmProcArqv}" (pasta="${pasta}")`,
      "HTTP_ERRO",
    );
  }

  const parecePdf =
    contentType.includes("application/pdf") ||
    contentType.includes("octet-stream") ||
    contentType === "";

  if (!parecePdf) {
    console.warn(
      `[extrairTextoPdf] Content-type inesperado: "${contentType}" para "${nmProcArqv}"`,
    );
  }

  const arrayBuffer = await resp.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const tamanhoKb = (buffer.byteLength / 1024).toFixed(1);
  const primeiros5 = buffer.slice(0, 5).toString("ascii");
  console.log(
    `[extrairTextoPdf] Buffer: ${tamanhoKb} KB | primeiros 5 bytes: "${primeiros5}"`,
  );

  if (buffer.byteLength > TAMANHO_MAXIMO_BYTES) {
    throw new ErroExtracaoPdf(
      `PDF excede ${TAMANHO_MAXIMO_BYTES / 1024 / 1024} MB (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB)`,
      "TAMANHO_EXCEDIDO",
    );
  }

  if (!primeiros5.startsWith("%PDF")) {
    console.error(
      `[extrairTextoPdf] Assinatura inválida: "${primeiros5}" para "${nmProcArqv}"` +
      ` — o servidor pode ter retornado uma página de erro HTML`,
    );
    throw new ErroExtracaoPdf(
      `Arquivo não é PDF válido (assinatura "%PDF" ausente, recebido "${primeiros5}")`,
      "NAO_PDF",
    );
  }

  let texto: string;
  try {
    const pdfParse = carregarPdfParse();
    const resultado = await pdfParse(buffer, { max: 50 });
    texto = resultado.text ?? "";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[extrairTextoPdf] pdf-parse falhou para "${nmProcArqv}": ${msg}`);
    throw new ErroExtracaoPdf(`Erro ao processar PDF: ${msg}`, "PARSE_ERRO");
  }

  const charsUteis = texto.replace(/\s+/g, "").length;
  console.log(
    `[extrairTextoPdf] Texto extraído: ${texto.length} chars totais, ${charsUteis} não-espaço` +
    ` | arquivo="${nmProcArqv}"`,
  );

  if (charsUteis < MINIMO_CHARS_UTEIS) {
    throw new ErroExtracaoPdf(
      `PDF sem texto extraível (${charsUteis} chars úteis). Provável PDF escaneado/imagem — OCR necessário.`,
      "TEXTO_VAZIO",
    );
  }

  return texto;
}
