/**
 * siconfi-rgf-full-postgres.ts
 *
 * Carga de dados SICONFI/RGF para municípios do Acre no PostgreSQL local.
 * Fonte: API DataLake Tesouro Nacional — https://apidatalake.tesouro.gov.br/ords/siconfi/tt
 *
 * Endpoint: GET /rreo?co_tipo_demonstrativo=RGF
 * Parâmetros:
 *   an_exercicio          — ano do exercício
 *   nr_periodo            — período quadrimestral (1, 2 ou 3)
 *   id_ente               — código IBGE 7 dígitos do município
 *   co_tipo_demonstrativo — "RGF"
 *   limit/offset          — paginação (padrão 200)
 *
 * Campos retornados: exercicio, demonstrativo, periodo, periodicidade,
 *   instituicao, cod_ibge, uf, populacao, anexo, esfera, rotulo,
 *   coluna, cod_conta, conta, valor
 *
 * Periodicidade do RGF: Q (quadrimestral) — 3 períodos por ano.
 *
 * Estratégia: por município × período, DELETE + INSERT idempotente.
 *   - Se a API retornar vazio para um período, loga e prossegue.
 *   - Nunca derruba a execução por erro parcial.
 *
 * Variáveis de ambiente:
 *   SICONFI_API_BASE_URL  — base da API
 *   SICONFI_RGF_ANOS      — anos separados por vírgula (padrão: anoAtual-1,anoAtual)
 *   SICONFI_TIMEOUT_MS    — timeout por requisição (padrão: 30000)
 *   SICONFI_RATE_LIMIT_MS — intervalo entre requisições (padrão: 1000)
 *
 * Uso: cd etl && npm run siconfi-rgf:full:postgres
 */

import "dotenv/config";
import { pgQuery, withPgTransaction, closePgPool } from "../connectors/postgres";

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

const MODULO     = "siconfi_rgf_full";
const BASE_URL   = (process.env.SICONFI_API_BASE_URL || "https://apidatalake.tesouro.gov.br/ords/siconfi/tt").replace(/\/$/, "");
const TIMEOUT_MS = parseInt(process.env.SICONFI_TIMEOUT_MS    || "30000", 10);
const RATE_LIMIT = parseInt(process.env.SICONFI_RATE_LIMIT_MS || "1000",  10);

const ANO_ATUAL  = new Date().getFullYear();
const ANOS_RGF: number[] = process.env.SICONFI_RGF_ANOS
  ? process.env.SICONFI_RGF_ANOS.split(",").map(Number).filter((n) => !isNaN(n))
  : [ANO_ATUAL - 1, ANO_ATUAL];

// O RGF é quadrimestral — 3 períodos por ano
const PERIODOS_RGF = [1, 2, 3];

// Municípios do Acre — código IBGE 7 dígitos
const MUNICIPIOS_ACRE: Array<{ id_ente: number; no_municipio: string }> = [
  { id_ente: 1200013, no_municipio: "Acrelândia" },
  { id_ente: 1200054, no_municipio: "Assis Brasil" },
  { id_ente: 1200104, no_municipio: "Brasiléia" },
  { id_ente: 1200138, no_municipio: "Bujari" },
  { id_ente: 1200179, no_municipio: "Capixaba" },
  { id_ente: 1200203, no_municipio: "Cruzeiro do Sul" },
  { id_ente: 1200252, no_municipio: "Epitaciolândia" },
  { id_ente: 1200302, no_municipio: "Feijó" },
  { id_ente: 1200328, no_municipio: "Jordão" },
  { id_ente: 1200336, no_municipio: "Mâncio Lima" },
  { id_ente: 1200344, no_municipio: "Manoel Urbano" },
  { id_ente: 1200351, no_municipio: "Marechal Thaumaturgo" },
  { id_ente: 1200385, no_municipio: "Plácido de Castro" },
  { id_ente: 1200393, no_municipio: "Porto Walter" },
  { id_ente: 1200401, no_municipio: "Rio Branco" },
  { id_ente: 1200427, no_municipio: "Rodrigues Alves" },
  { id_ente: 1200435, no_municipio: "Santa Rosa do Purus" },
  { id_ente: 1200450, no_municipio: "Senador Guiomard" },
  { id_ente: 1200500, no_municipio: "Sena Madureira" },
  { id_ente: 1200609, no_municipio: "Tarauacá" },
  { id_ente: 1200708, no_municipio: "Xapuri" },
  { id_ente: 1200807, no_municipio: "Porto Acre" },
];

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface RgfItem {
  exercicio:      number;
  demonstrativo:  string;
  periodo:        number;
  periodicidade:  string;
  instituicao:    string;
  cod_ibge:       number;
  uf:             string;
  populacao:      number | null;
  anexo:          string;
  esfera:         string;
  rotulo:         string | null;
  coluna:         string;
  cod_conta:      string;
  conta:          string;
  valor:          number | null;
}

interface RgfResponse {
  items:   RgfItem[];
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

function parseValor(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return isNaN(v) ? null : v;
  const n = parseFloat(String(v).replace(/,/g, "."));
  return isNaN(n) ? null : n;
}

async function fetchRgf(
  an_exercicio: number,
  nr_periodo: number,
  id_ente: number,
  offset = 0,
  retries = 0,
): Promise<RgfResponse | null> {
  if (retries >= 3) {
    console.log(`    [siconfi-rgf] [429] Limite de retries atingido — pulando ${an_exercicio}/${nr_periodo}/${id_ente}`);
    return null;
  }
  const url = `${BASE_URL}/rreo?an_exercicio=${an_exercicio}&nr_periodo=${nr_periodo}&id_ente=${id_ente}&co_tipo_demonstrativo=RGF&limit=200&offset=${offset}`;
  try {
    const resp = await fetch(url, {
      headers: {
        Accept:       "application/json",
        "User-Agent": "Varadouro-Digital-ETL/1.0 (interno TCE-AC)",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (resp.status === 429) {
      const wait = 30000 * (retries + 1);
      console.log(`    [siconfi-rgf] [429] Rate limit — aguardando ${wait / 1000}s... (tentativa ${retries + 1}/3)`);
      await sleep(wait);
      return fetchRgf(an_exercicio, nr_periodo, id_ente, offset, retries + 1);
    }
    if (!resp.ok) {
      console.log(`    [siconfi-rgf] HTTP ${resp.status} para ${an_exercicio}/${nr_periodo}/${id_ente}`);
      return null;
    }
    return (await resp.json()) as RgfResponse;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`    [siconfi-rgf] Erro de rede: ${msg}`);
    return null;
  }
}

async function fetchRgfAllPages(
  an_exercicio: number,
  nr_periodo: number,
  id_ente: number,
): Promise<RgfItem[]> {
  const all: RgfItem[] = [];
  let offset = 0;

  while (true) {
    const page = await fetchRgf(an_exercicio, nr_periodo, id_ente, offset);
    if (!page || !page.items?.length) break;
    all.push(...page.items);
    if (!page.hasMore) break;
    offset += page.items.length;
    await sleep(RATE_LIMIT);
  }
  return all;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function executarSiconfiRgfFullPostgres(): Promise<void> {
  const inicio = Date.now();
  console.log("[siconfi-rgf:full] Iniciando carga SICONFI/RGF...");
  console.log(`[siconfi-rgf:full] Exercícios  : ${ANOS_RGF.join(", ")}`);
  console.log(`[siconfi-rgf:full] Períodos RGF: ${PERIODOS_RGF.join(", ")} (quadrimestral)`);
  console.log(`[siconfi-rgf:full] Municípios  : ${MUNICIPIOS_ACRE.length}`);

  let totalRegistros   = 0;
  let totalCombinacoes = 0;
  let totalVazias      = 0;
  let totalErros       = 0;

  for (const ano of ANOS_RGF) {
    for (const periodo of PERIODOS_RGF) {
      console.log(`\n[siconfi-rgf:full] ── Exercício ${ano} / Período ${periodo} ──`);

      for (const municipio of MUNICIPIOS_ACRE) {
        totalCombinacoes++;
        await sleep(RATE_LIMIT);

        const items = await fetchRgfAllPages(ano, periodo, municipio.id_ente);

        if (items.length === 0) {
          totalVazias++;
          // Período ainda não disponível ou não entregue — comportamento esperado
          continue;
        }

        try {
          await withPgTransaction(async (client) => {
            // Salva payload bruto (uma linha por combinação ente/exercicio/periodo)
            await client.query(`
              INSERT INTO raw.siconfi_rgf_raw
                (an_exercicio, nr_periodo, id_ente, no_ente, co_tipo_demonstrativo, endpoint, payload)
              VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
              ano,
              periodo,
              municipio.id_ente,
              municipio.no_municipio,
              items[0]?.demonstrativo ?? "RGF",
              `/rreo?an_exercicio=${ano}&nr_periodo=${periodo}&id_ente=${municipio.id_ente}&co_tipo_demonstrativo=RGF`,
              JSON.stringify(items),
            ]);

            // Idempotente: remove registros anteriores do mesmo ente/exercicio/periodo
            await client.query(`
              DELETE FROM dw.fato_siconfi_rgf
              WHERE an_exercicio = $1 AND nr_periodo = $2 AND id_ente = $3
            `, [ano, periodo, municipio.id_ente]);

            // Insere todos os itens normalizados
            for (const item of items) {
              await client.query(`
                INSERT INTO dw.fato_siconfi_rgf
                  (an_exercicio, nr_periodo, id_ente, no_ente,
                   uf, esfera, periodicidade, populacao,
                   co_tipo_demonstrativo, no_anexo, rotulo,
                   coluna, cod_conta, conta, valor)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
              `, [
                item.exercicio     ?? ano,
                item.periodo       ?? periodo,
                item.cod_ibge      ?? municipio.id_ente,
                item.instituicao   ?? municipio.no_municipio,
                item.uf            ?? null,
                item.esfera        ?? null,
                item.periodicidade ?? "Q",
                item.populacao     ?? null,
                item.demonstrativo ?? "RGF",
                item.anexo         ?? null,
                item.rotulo        ?? null,
                item.coluna        ?? null,
                item.cod_conta     ?? null,
                item.conta         ?? null,
                parseValor(item.valor),
              ]);
            }
          });

          totalRegistros += items.length;
          console.log(`  [siconfi-rgf] ✓ ${municipio.no_municipio}: ${items.length} registros`);
        } catch (err) {
          totalErros++;
          console.error(`  [siconfi-rgf] ✗ ${municipio.no_municipio}: ${(err as Error).message}`);
        }
      }
    }
  }

  const duracao = Date.now() - inicio;
  console.log(`\n[siconfi-rgf:full] Concluído em ${duracao}ms`);
  console.log(`  Combinações verificadas : ${totalCombinacoes}`);
  console.log(`  Com dados               : ${totalCombinacoes - totalVazias - totalErros}`);
  console.log(`  Sem dados (período n/d) : ${totalVazias}`);
  console.log(`  Erros                   : ${totalErros}`);
  console.log(`  Total de registros      : ${totalRegistros}`);

  try {
    await pgQuery(`
      INSERT INTO audit.etl_log (modulo, status, mensagem, registros, duracao_ms)
      VALUES ($1, 'OK', 'Carga SICONFI/RGF concluída', $2, $3)
    `, [MODULO, totalRegistros, duracao]);
  } catch {
    // audit.etl_log pode não existir em ambiente de desenvolvimento
  }
}

if (require.main === module) {
  executarSiconfiRgfFullPostgres()
    .then(() => closePgPool())
    .catch((err) => {
      console.error("[siconfi-rgf:full] Erro fatal:", (err as Error).message);
      closePgPool().catch(() => void 0);
      process.exit(1);
    });
}
