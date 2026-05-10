/**
 * siconfi-rreo-full-postgres.ts
 *
 * Carga de dados SICONFI/RREO para municípios do Acre no PostgreSQL local.
 * Fonte: API DataLake Tesouro Nacional — https://apidatalake.tesouro.gov.br/ords/siconfi/tt
 *
 * Endpoint: GET /rreo
 * Parâmetros:
 *   an_exercicio  — ano do exercício
 *   nr_periodo    — período (1-6 bimestres; ou 1-2 semestral em anos anteriores)
 *   id_municipio  — código IBGE 7 dígitos
 *   no_anexo      — filtro por anexo (opcional, ex: "RREO-Anexo 12")
 *   limit/offset  — paginação (padrão 25, max 200)
 *
 * Resposta: { items: [...], hasMore, limit, offset, count }
 * Campos por item: an_exercicio, nr_periodo, id_municipio, no_municipio,
 *   co_tipo_demonstrativo, no_anexo, co_conta, no_conta, no_coluna, vl_conta
 *
 * Estratégia: por município × período × anexo, DELETE + INSERT idempotente.
 *
 * Variáveis de ambiente:
 *   SICONFI_API_BASE_URL  — base da API
 *   SICONFI_CO_IBGE_UF    — código IBGE da UF (padrão: 12 = Acre)
 *   SICONFI_ANO_INICIO    — primeiro exercício (padrão: 2021)
 *   SICONFI_ANO_FIM       — último exercício (padrão: ano corrente)
 *   SICONFI_TIMEOUT_MS    — timeout por requisição (padrão: 30000)
 *   SICONFI_RATE_LIMIT_MS — intervalo entre requisições (padrão: 1000)
 *   SICONFI_PERIODOS      — períodos por ano separados por vírgula (padrão: "1,2,3,4,5,6")
 *
 * Uso: cd etl && npm run siconfi-rreo:full:postgres
 */

import "dotenv/config";
import { pgQuery, withPgTransaction, closePgPool } from "../connectors/postgres";

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

const MODULO      = "siconfi_rreo_full";
const BASE_URL    = (process.env.SICONFI_API_BASE_URL || "https://apidatalake.tesouro.gov.br/ords/siconfi/tt").replace(/\/$/, "");
const ANO_INICIO  = parseInt(process.env.SICONFI_ANO_INICIO || "2021", 10);
const ANO_FIM     = parseInt(process.env.SICONFI_ANO_FIM    || String(new Date().getFullYear()), 10);
const TIMEOUT_MS  = parseInt(process.env.SICONFI_TIMEOUT_MS     || "30000", 10);
const RATE_LIMIT  = parseInt(process.env.SICONFI_RATE_LIMIT_MS  || "1000",  10);
const PERIODOS    = (process.env.SICONFI_PERIODOS || "1,2,3,4,5,6").split(",").map(Number);

// Municípios do Acre — código IBGE 7 dígitos
const MUNICIPIOS_ACRE: Array<{ id_municipio: number; no_municipio: string }> = [
  { id_municipio: 1200013, no_municipio: "Acrelândia" },
  { id_municipio: 1200054, no_municipio: "Assis Brasil" },
  { id_municipio: 1200104, no_municipio: "Brasiléia" },
  { id_municipio: 1200138, no_municipio: "Bujari" },
  { id_municipio: 1200179, no_municipio: "Capixaba" },
  { id_municipio: 1200203, no_municipio: "Cruzeiro do Sul" },
  { id_municipio: 1200252, no_municipio: "Epitaciolândia" },
  { id_municipio: 1200302, no_municipio: "Feijó" },
  { id_municipio: 1200328, no_municipio: "Jordão" },
  { id_municipio: 1200336, no_municipio: "Mâncio Lima" },
  { id_municipio: 1200344, no_municipio: "Manoel Urbano" },
  { id_municipio: 1200351, no_municipio: "Marechal Thaumaturgo" },
  { id_municipio: 1200385, no_municipio: "Plácido de Castro" },
  { id_municipio: 1200393, no_municipio: "Porto Walter" },
  { id_municipio: 1200401, no_municipio: "Rio Branco" },
  { id_municipio: 1200427, no_municipio: "Rodrigues Alves" },
  { id_municipio: 1200435, no_municipio: "Santa Rosa do Purus" },
  { id_municipio: 1200450, no_municipio: "Senador Guiomard" },
  { id_municipio: 1200500, no_municipio: "Sena Madureira" },
  { id_municipio: 1200609, no_municipio: "Tarauacá" },
  { id_municipio: 1200708, no_municipio: "Xapuri" },
  { id_municipio: 1200807, no_municipio: "Porto Acre" },
];

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface RreoItem {
  an_exercicio:          number;
  nr_periodo:            number;
  id_municipio:          number;
  no_municipio:          string;
  co_tipo_demonstrativo: string;
  no_anexo:              string;
  co_conta:              string;
  no_conta:              string;
  no_coluna:             string;
  vl_conta:              string | number | null;
}

interface RreoResponse {
  items:   RreoItem[];
  hasMore: boolean;
  limit:   number;
  offset:  number;
  count:   number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchRreo(
  an_exercicio: number,
  nr_periodo: number,
  id_municipio: number,
  offset = 0,
): Promise<RreoResponse | null> {
  const url = `${BASE_URL}/rreo?an_exercicio=${an_exercicio}&nr_periodo=${nr_periodo}&id_municipio=${id_municipio}&limit=200&offset=${offset}`;
  try {
    const resp = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "Varadouro-Digital-ETL/1.0 (interno TCE-AC)" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (resp.status === 429) {
      console.log(`    [429] Rate limit — aguardando 60s...`);
      await sleep(60000);
      return fetchRreo(an_exercicio, nr_periodo, id_municipio, offset);
    }
    if (!resp.ok) return null;
    const json = await resp.json() as RreoResponse;
    return json;
  } catch {
    return null;
  }
}

async function fetchAllPages(
  an_exercicio: number,
  nr_periodo: number,
  id_municipio: number,
): Promise<RreoItem[]> {
  const all: RreoItem[] = [];
  let offset = 0;

  while (true) {
    const page = await fetchRreo(an_exercicio, nr_periodo, id_municipio, offset);
    if (!page || !page.items?.length) break;
    all.push(...page.items);
    if (!page.hasMore) break;
    offset += page.items.length;
    await sleep(RATE_LIMIT);
  }
  return all;
}

function parseValor(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return isNaN(v) ? null : v;
  const n = parseFloat(String(v).replace(/,/g, "."));
  return isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function executarSiconfiRreoFullPostgres(): Promise<void> {
  const inicio = Date.now();
  console.log("[siconfi-rreo:full] Iniciando carga SICONFI/RREO...");
  console.log(`[siconfi-rreo:full] Exercícios: ${ANO_INICIO}–${ANO_FIM}, Períodos: ${PERIODOS.join(",")}`);
  console.log(`[siconfi-rreo:full] Municípios: ${MUNICIPIOS_ACRE.length}`);

  let totalRegistros = 0;
  let totalCombinacoes = 0;
  let totalVazias = 0;
  let totalErros = 0;

  for (let ano = ANO_INICIO; ano <= ANO_FIM; ano++) {
    for (const periodo of PERIODOS) {
      console.log(`\n[siconfi-rreo:full] ── Exercício ${ano} / Período ${periodo} ──`);

      for (const municipio of MUNICIPIOS_ACRE) {
        totalCombinacoes++;
        await sleep(RATE_LIMIT);

        const items = await fetchAllPages(ano, periodo, municipio.id_municipio);

        if (items.length === 0) {
          totalVazias++;
          continue;
        }

        try {
          await withPgTransaction(async (client) => {
            // Salva raw (um registro por combinação municipio/periodo)
            await client.query(`
              INSERT INTO raw.siconfi_rreo_raw
                (an_exercicio, nr_periodo, id_municipio, co_tipo_demonstrativo, no_anexo, endpoint, payload)
              VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
              ano,
              periodo,
              municipio.id_municipio,
              items[0]?.co_tipo_demonstrativo ?? "RREO",
              null,
              `/rreo?an_exercicio=${ano}&nr_periodo=${periodo}&id_municipio=${municipio.id_municipio}`,
              JSON.stringify(items),
            ]);

            // Idempotente: remove registros anteriores do mesmo municipio/periodo
            await client.query(`
              DELETE FROM dw.fato_siconfi_rreo
              WHERE an_exercicio = $1 AND nr_periodo = $2 AND id_municipio = $3
            `, [ano, periodo, municipio.id_municipio]);

            // Insere todos os itens
            for (const item of items) {
              await client.query(`
                INSERT INTO dw.fato_siconfi_rreo
                  (an_exercicio, nr_periodo, id_municipio, no_municipio,
                   co_tipo_demonstrativo, no_anexo, coluna, conta, valor)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
              `, [
                item.an_exercicio ?? ano,
                item.nr_periodo   ?? periodo,
                item.id_municipio ?? municipio.id_municipio,
                item.no_municipio ?? municipio.no_municipio,
                item.co_tipo_demonstrativo ?? "RREO",
                item.no_anexo  ?? null,
                item.no_coluna ?? null,
                item.no_conta  ?? item.co_conta ?? null,
                parseValor(item.vl_conta),
              ]);
            }
          });

          totalRegistros += items.length;
          console.log(`  ✓ ${municipio.no_municipio}: ${items.length} registros`);
        } catch (err) {
          totalErros++;
          console.error(`  ✗ ${municipio.no_municipio}: ${(err as Error).message}`);
        }
      }
    }
  }

  const duracao = Date.now() - inicio;
  console.log(`\n[siconfi-rreo:full] Concluído em ${duracao}ms`);
  console.log(`  Combinações verificadas : ${totalCombinacoes}`);
  console.log(`  Com dados               : ${totalCombinacoes - totalVazias - totalErros}`);
  console.log(`  Sem dados (período n/a) : ${totalVazias}`);
  console.log(`  Erros                   : ${totalErros}`);
  console.log(`  Total de registros      : ${totalRegistros}`);

  await pgQuery(`
    INSERT INTO audit.etl_log (modulo, status, mensagem, registros, duracao_ms)
    VALUES ($1, 'OK', 'Carga SICONFI/RREO concluída', $2, $3)
  `, [MODULO, totalRegistros, duracao]);
}

if (require.main === module) {
  executarSiconfiRreoFullPostgres()
    .then(() => closePgPool())
    .catch((err) => {
      console.error("[siconfi-rreo:full] Erro fatal:", (err as Error).message);
      closePgPool().catch(() => void 0);
      process.exit(1);
    });
}
