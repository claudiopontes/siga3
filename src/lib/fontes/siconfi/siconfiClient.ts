/**
 * Cliente HTTP para a API pública SICONFI (Tesouro Nacional)
 * Base: https://apidatalake.tesouro.gov.br/ords/siconfi/tt
 *
 * Regras:
 * - Sem autenticação
 * - Máximo 1 requisição por segundo (use sleep entre chamadas em lote)
 * - Fetch com timeout configurável via SICONFI_TIMEOUT_MS
 */

import type {
  SiconfiApiResponse,
  SiconfiEnte,
  SiconfiItemRreo,
  SiconfiItemExtratoEntrega,
  SiconfiConsultaRreoParams,
  SiconfiConsultaExtratoParams,
} from "./tiposSiconfi";

export const SICONFI_BASE_URL = (
  process.env.SICONFI_API_BASE_URL ||
  "https://apidatalake.tesouro.gov.br/ords/siconfi/tt"
).replace(/\/$/, "");

const DEFAULT_TIMEOUT_MS = parseInt(
  process.env.SICONFI_TIMEOUT_MS || "30000",
  10
);

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Monta query string descartando valores nulos/undefined
function buildQueryString(
  params: Record<string, string | number | undefined | null>
): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== ""
  );
  if (entries.length === 0) return "";
  return "?" + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
}

/**
 * Função base de fetch para a API SICONFI.
 * Lança erro com mensagem clara em caso de falha.
 */
export async function fetchSiconfi<T>(
  path: string,
  params?: Record<string, string | number | undefined | null>,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const qs = params ? buildQueryString(params) : "";
  const url = `${SICONFI_BASE_URL}${path}${qs}`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Varadouro-Digital/1.0 (TCE-AC)",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[siconfiClient] Falha de rede em ${path}: ${msg}`);
  }

  if (!resp.ok) {
    throw new Error(
      `[siconfiClient] HTTP ${resp.status} ${resp.statusText} em ${path}`
    );
  }

  try {
    return (await resp.json()) as T;
  } catch {
    throw new Error(`[siconfiClient] Resposta não é JSON válido em ${path}`);
  }
}

/**
 * GET /entes — lista todos os entes da federação cadastrados no SICONFI.
 */
export async function consultarEntesSiconfi(): Promise<
  SiconfiApiResponse<SiconfiEnte>
> {
  return fetchSiconfi<SiconfiApiResponse<SiconfiEnte>>("/entes");
}

/**
 * GET /extrato_entregas — situação de entrega dos demonstrativos de um ente.
 */
export async function consultarExtratoEntregasSiconfi(
  params: SiconfiConsultaExtratoParams
): Promise<SiconfiApiResponse<SiconfiItemExtratoEntrega>> {
  return fetchSiconfi<SiconfiApiResponse<SiconfiItemExtratoEntrega>>(
    "/extrato_entregas",
    {
      id_ente: params.idEnte,
      an_referencia: params.anoReferencia,
    }
  );
}

/**
 * GET /rreo — dados do Relatório Resumido da Execução Orçamentária.
 * Suporta paginação via limit/offset.
 */
export async function consultarRreoSiconfi(
  params: SiconfiConsultaRreoParams,
  limit = 200,
  offset = 0
): Promise<SiconfiApiResponse<SiconfiItemRreo>> {
  return fetchSiconfi<SiconfiApiResponse<SiconfiItemRreo>>("/rreo", {
    an_exercicio: params.anoExercicio,
    nr_periodo: params.periodo,
    co_tipo_demonstrativo: params.tipoDemonstrativo,
    id_ente: params.idEnte,
    no_anexo: params.anexo,
    co_esfera: params.esfera,
    limit,
    offset,
  });
}
