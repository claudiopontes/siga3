/**
 * siconfi-rgf-full-postgres.ts
 *
 * Carga de SICONFI/RGF via extrato_entregas.
 *
 * NOTA: O endpoint /rgf do DataLake Tesouro Nacional não expõe dados fiscais RGF
 * (retorna HTTP 200 com 0 itens em todas as combinações de parâmetros testadas em mai/2025).
 * Os dados de entrega do RGF estão disponíveis via /extrato_entregas
 * (entregavel="Relatório de Gestão Fiscal", periodicidade=Q, períodos 1/2/3).
 *
 * Fluxo:
 *   Para cada município × ano alvo:
 *   1. GET /extrato_entregas?id_ente=X&an_referencia=Y
 *   2. Filtra entradas com co_entregavel='RGF'
 *   3. DELETE + INSERT idempotente em dw.fato_siconfi_extrato_entregas
 *      (apenas para co_entregavel='RGF', preservando entradas RREO/DCA/etc.)
 *   4. Registra payload bruto em raw.siconfi_extrato_entregas_raw
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

interface ExtratoItem {
  exercicio:        number;
  cod_ibge:         number;
  populacao:        number | null;
  instituicao:      string | null;
  entregavel:       string;
  periodo:          number;
  periodicidade:    string;
  status_relatorio: string | null;
  data_status:      string | null;
  forma_envio:      string | null;
  tipo_relatorio:   string | null;
}

interface ExtratoResponse {
  items:   ExtratoItem[];
  hasMore: boolean;
  count:   number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function derivarCoEntregavel(entregavel: string): string | null {
  const e = entregavel
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (e.includes("relatorio de gestao fiscal") || e === "rgf") return "RGF";
  return null;
}

async function fetchExtrato(
  id_ente: number,
  an_referencia: number,
  retries = 0,
): Promise<ExtratoResponse | null> {
  if (retries >= 3) {
    console.log(`    [siconfi-rgf] Limite de retries atingido — pulando ${id_ente}/${an_referencia}`);
    return null;
  }
  const url = `${BASE_URL}/extrato_entregas?id_ente=${id_ente}&an_referencia=${an_referencia}`;
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
      console.log(`    [siconfi-rgf] [429] Rate limit — aguardando ${wait / 1000}s...`);
      await sleep(wait);
      return fetchExtrato(id_ente, an_referencia, retries + 1);
    }
    if (!resp.ok) {
      console.log(`    [siconfi-rgf] HTTP ${resp.status} para extrato ${id_ente}/${an_referencia}`);
      return null;
    }
    return (await resp.json()) as ExtratoResponse;
  } catch (err) {
    console.log(`    [siconfi-rgf] Erro de rede: ${(err as Error).message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function executarSiconfiRgfFullPostgres(): Promise<void> {
  const inicio = Date.now();
  console.log("[siconfi-rgf:full] Iniciando carga SICONFI/RGF via extrato_entregas...");
  console.log("[siconfi-rgf:full] Fonte: /extrato_entregas (co_entregavel=RGF)");
  console.log(`[siconfi-rgf:full] Exercícios : ${ANOS_RGF.join(", ")}`);
  console.log(`[siconfi-rgf:full] Municípios : ${MUNICIPIOS_ACRE.length}`);

  let totalComRgf   = 0;
  let totalSemRgf   = 0;
  let totalErros    = 0;
  let totalEntregas = 0;

  for (const ano of ANOS_RGF) {
    console.log(`\n[siconfi-rgf:full] ── Exercício ${ano} ──`);

    for (const municipio of MUNICIPIOS_ACRE) {
      await sleep(RATE_LIMIT);

      const extrato = await fetchExtrato(municipio.id_ente, ano);
      if (!extrato) {
        totalErros++;
        continue;
      }

      const rgfItems = extrato.items.filter(
        (item) => derivarCoEntregavel(item.entregavel) === "RGF",
      );

      if (rgfItems.length === 0) {
        totalSemRgf++;
        console.log(`  [siconfi-rgf]   ${municipio.no_municipio}: sem entradas RGF no extrato ${ano}`);
        continue;
      }

      totalComRgf++;
      totalEntregas += rgfItems.length;
      const periodos  = rgfItems.map((i) => i.periodo).join(", ");
      const statuses  = rgfItems.map((i) => i.status_relatorio ?? "null").join(", ");
      console.log(`  [siconfi-rgf] ✓ ${municipio.no_municipio}: ${rgfItems.length} período(s) RGF [${periodos}] status=[${statuses}]`);

      try {
        await withPgTransaction(async (client) => {
          // Payload bruto para auditoria
          await client.query(`
            INSERT INTO raw.siconfi_extrato_entregas_raw
              (id_ente, an_referencia, endpoint, payload)
            VALUES ($1, $2, $3, $4)
          `, [
            municipio.id_ente,
            ano,
            `/extrato_entregas?id_ente=${municipio.id_ente}&an_referencia=${ano}`,
            JSON.stringify(extrato.items),
          ]);

          // DELETE idempotente: apenas entradas RGF deste ente/exercicio
          await client.query(`
            DELETE FROM dw.fato_siconfi_extrato_entregas
            WHERE id_ente = $1 AND exercicio = $2 AND co_entregavel = 'RGF'
          `, [municipio.id_ente, ano]);

          // INSERT entradas RGF
          for (const item of rgfItems) {
            await client.query(`
              INSERT INTO dw.fato_siconfi_extrato_entregas
                (id_ente, no_ente, exercicio, periodo, periodicidade,
                 instituicao, entregavel, co_entregavel,
                 status_relatorio, data_status, forma_envio, tipo_relatorio)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            `, [
              municipio.id_ente,
              municipio.no_municipio,
              item.exercicio     ?? ano,
              item.periodo,
              item.periodicidade ?? "Q",
              item.instituicao   ?? null,
              item.entregavel,
              "RGF",
              item.status_relatorio ?? null,
              item.data_status      ?? null,
              item.forma_envio      ?? null,
              item.tipo_relatorio   ?? null,
            ]);
          }
        });
      } catch (err) {
        totalErros++;
        console.error(`  [siconfi-rgf] ✗ ${municipio.no_municipio}: ${(err as Error).message}`);
      }
    }
  }

  const duracao = Date.now() - inicio;
  console.log(`\n[siconfi-rgf:full] Concluído em ${duracao}ms`);
  console.log(`  Municípios com RGF no extrato : ${totalComRgf}`);
  console.log(`  Municípios sem RGF no extrato : ${totalSemRgf}`);
  console.log(`  Total de entregas RGF         : ${totalEntregas}`);
  console.log(`  Erros                         : ${totalErros}`);

  try {
    await pgQuery(`
      INSERT INTO audit.etl_log (modulo, status, mensagem, registros, duracao_ms)
      VALUES ($1, 'OK', 'Carga SICONFI/RGF via extrato_entregas concluída', $2, $3)
    `, [MODULO, totalEntregas, duracao]);
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
