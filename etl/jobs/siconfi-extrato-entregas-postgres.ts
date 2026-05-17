/**
 * siconfi-extrato-entregas-postgres.ts
 *
 * Coleta o extrato oficial de entregas do SICONFI para municípios do Acre
 * e persiste em PostgreSQL.
 *
 * Endpoint: GET /extrato_entregas
 * Parâmetros:
 *   id_ente       — código IBGE 7 dígitos
 *   an_referencia — ano de referência
 *
 * Campos retornados pela API (verificados em produção):
 *   exercicio, cod_ibge, populacao, instituicao, entregavel,
 *   periodo, periodicidade, status_relatorio, data_status,
 *   forma_envio, tipo_relatorio
 *
 * status_relatorio:
 *   HO = Homologado (confirmado pelo Tesouro)
 *   RE = Retificado (corrigido após homologação — dado pode mudar)
 *   null = não entregue
 *
 * Estratégia:
 *   1. INSERT raw (acumulativo — auditoria)
 *   2. DELETE + INSERT dw (idempotente por id_ente + exercicio)
 *   3. Rebuild mart.siconfi_rreo_extrato_entregas por período RREO
 *
 * Variáveis de ambiente:
 *   SICONFI_API_BASE_URL   — base da API (padrão: https://apidatalake...)
 *   SICONFI_TIMEOUT_MS     — timeout por requisição (padrão: 30000)
 *   SICONFI_RATE_LIMIT_MS  — intervalo entre requisições (padrão: 1000)
 *   SICONFI_EXTRATO_ANOS   — anos separados por vírgula (padrão: ano-1,ano)
 *
 * Uso: cd etl && npm run siconfi-extrato:full:postgres
 */

import "dotenv/config";
import { pgQuery, withPgTransaction, closePgPool } from "../connectors/postgres";

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

const MODULO     = "siconfi_extrato_entregas";
const BASE_URL   = (process.env.SICONFI_API_BASE_URL || "https://apidatalake.tesouro.gov.br/ords/siconfi/tt").replace(/\/$/, "");
const TIMEOUT_MS = parseInt(process.env.SICONFI_TIMEOUT_MS    || "30000", 10);
const RATE_LIMIT = parseInt(process.env.SICONFI_RATE_LIMIT_MS || "1000",  10);

const ANO_ATUAL = new Date().getFullYear();
const ANOS_EXTRATO: number[] = process.env.SICONFI_EXTRATO_ANOS
  ? process.env.SICONFI_EXTRATO_ANOS.split(",").map(Number).filter((n) => !isNaN(n))
  : [ANO_ATUAL - 1, ANO_ATUAL];

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
// Tipos — campos reais da API /extrato_entregas
// ---------------------------------------------------------------------------

interface ExtratoItem {
  exercicio:        number;
  cod_ibge:         number;
  populacao:        number | null;
  instituicao:      string | null;
  entregavel:       string;
  periodo:          number;
  periodicidade:    string;          // B, Q, M, A
  status_relatorio: string | null;   // HO, RE, null
  data_status:      string | null;   // ISO 8601 timestamp
  forma_envio:      string | null;   // M, CSV
  tipo_relatorio:   string | null;   // P, null
}

interface ExtratoResponse {
  items:   ExtratoItem[];
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

/** Deriva código curto do entregável a partir do nome por extenso. */
function derivarCoEntregavel(entregavel: string): string | null {
  const e = entregavel.toLowerCase();
  if (e.includes("relatório resumido de execução orçamentária")) return "RREO";
  if (e.includes("relatório de gestão fiscal"))                  return "RGF";
  if (e.includes("balanço anual") || e.includes("dca"))          return "DCA";
  if (e.includes("msc encerramento"))                            return "MSC_ENCERRAMENTO";
  if (e.includes("msc"))                                         return "MSC";
  return null;
}

async function fetchExtrato(
  id_ente: number,
  an_referencia: number,
  retries = 0,
): Promise<ExtratoResponse | null> {
  if (retries >= 3) {
    console.log(`    [429] Limite de retries — pulando ${id_ente}/${an_referencia}`);
    return null;
  }
  const url = `${BASE_URL}/extrato_entregas?id_ente=${id_ente}&an_referencia=${an_referencia}`;
  try {
    const resp = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Varadouro-Digital-ETL/1.0 (interno TCE-AC)",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (resp.status === 429) {
      const wait = 30000 * (retries + 1);
      console.log(`    [429] Rate limit — aguardando ${wait / 1000}s (tentativa ${retries + 1}/3)`);
      await sleep(wait);
      return fetchExtrato(id_ente, an_referencia, retries + 1);
    }
    if (!resp.ok) {
      console.log(`    [${resp.status}] HTTP erro para ${id_ente}/${an_referencia}`);
      return null;
    }
    return (await resp.json()) as ExtratoResponse;
  } catch (err) {
    console.log(`    [ERR] Falha de rede para ${id_ente}/${an_referencia}: ${(err as Error).message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Rebuild mart.siconfi_rreo_extrato_entregas
// Filtra apenas RREO (co_entregavel = 'RREO') e cruza com dados locais.
// situacao_consolidada:
//   ENTREGUE_COM_DADO          — HO/RE + dado local presente
//   ENTREGUE_SEM_DADO_LOCAL    — HO/RE + sem dado local
//   SEM_ENTREGA_COM_DADO_LOCAL — null  + dado local presente
//   SEM_ENTREGA_SEM_DADO       — null  + sem dado local
// ---------------------------------------------------------------------------

async function reconstruirMart(
  periodos: Array<{ exercicio: number; periodo: number }>,
): Promise<number> {
  let total = 0;
  for (const { exercicio, periodo } of periodos) {
    const inserted = await withPgTransaction(async (client) => {
      await client.query(`
        DELETE FROM mart.siconfi_rreo_extrato_entregas
        WHERE an_exercicio = $1 AND nr_periodo = $2
      `, [exercicio, periodo]);

      const res = await client.query(`
        INSERT INTO mart.siconfi_rreo_extrato_entregas
          (id_municipio, no_municipio, an_exercicio, nr_periodo,
           situacao_entrega_oficial, no_situacao_oficial, data_entrega, protocolo,
           forma_envio, tipo_relatorio,
           possui_dado_rreo_carregado, situacao_dado_local, situacao_consolidada,
           atualizado_em)
        SELECT
          f.id_ente,
          f.no_ente,
          f.exercicio,
          f.periodo,
          f.status_relatorio,
          CASE f.status_relatorio
            WHEN 'HO' THEN 'Homologado'
            WHEN 'RE' THEN 'Retificado'
            ELSE           'Não entregue'
          END,
          f.data_status::date,
          NULL::text,
          f.forma_envio,
          f.tipo_relatorio,
          (r.id_municipio IS NOT NULL),
          CASE WHEN r.id_municipio IS NOT NULL THEN 'COM_DADO' ELSE 'SEM_DADO' END,
          CASE
            WHEN f.status_relatorio IN ('HO', 'RE')
              AND r.id_municipio IS NOT NULL THEN 'ENTREGUE_COM_DADO'
            WHEN f.status_relatorio IN ('HO', 'RE')
              AND r.id_municipio IS NULL     THEN 'ENTREGUE_SEM_DADO_LOCAL'
            WHEN f.status_relatorio IS NULL
              AND r.id_municipio IS NOT NULL THEN 'SEM_ENTREGA_COM_DADO_LOCAL'
            ELSE                                  'SEM_ENTREGA_SEM_DADO'
          END,
          NOW()
        FROM dw.fato_siconfi_extrato_entregas f
        LEFT JOIN mart.siconfi_rreo_resumo_municipio r
          ON  r.id_municipio = f.id_ente
          AND r.an_exercicio  = f.exercicio
          AND r.nr_periodo    = f.periodo
        WHERE f.co_entregavel = 'RREO'
          AND f.exercicio = $1
          AND f.periodo   = $2
      `, [exercicio, periodo]);

      return res.rowCount ?? 0;
    });
    total += inserted;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function executarSiconfiExtratoEntregasPostgres(): Promise<void> {
  const inicio = Date.now();
  console.log("[siconfi-extrato] Iniciando carga extrato de entregas SICONFI...");
  console.log(`[siconfi-extrato] Anos: ${ANOS_EXTRATO.join(", ")}`);
  console.log(`[siconfi-extrato] Municípios: ${MUNICIPIOS_ACRE.length}`);

  let totalBrutos       = 0;
  let totalNormalizados = 0;
  let totalErros        = 0;
  let totalRreo         = 0;

  // Períodos RREO identificados — para rebuild da mart
  const periodosRreo = new Set<string>();

  for (const ano of ANOS_EXTRATO) {
    console.log(`\n[siconfi-extrato] ── Ano ${ano} ──`);

    for (const municipio of MUNICIPIOS_ACRE) {
      await sleep(RATE_LIMIT);

      const data = await fetchExtrato(municipio.id_municipio, ano);
      if (!data || data.items.length === 0) {
        console.log(`  - ${municipio.no_municipio}: sem extrato`);
        continue;
      }

      try {
        await withPgTransaction(async (client) => {
          // ── Raw: INSERT acumulativo ──
          await client.query(`
            INSERT INTO raw.siconfi_extrato_entregas_raw
              (id_ente, an_referencia, endpoint, payload)
            VALUES ($1, $2, $3, $4)
          `, [
            municipio.id_municipio,
            ano,
            `/extrato_entregas?id_ente=${municipio.id_municipio}&an_referencia=${ano}`,
            JSON.stringify(data.items),
          ]);
          totalBrutos++;

          // ── DW: DELETE + INSERT idempotente por ente/exercicio ──
          await client.query(`
            DELETE FROM dw.fato_siconfi_extrato_entregas
            WHERE id_ente = $1 AND exercicio = $2
          `, [municipio.id_municipio, ano]);

          for (const item of data.items) {
            const coEntregavel = derivarCoEntregavel(item.entregavel);
            await client.query(`
              INSERT INTO dw.fato_siconfi_extrato_entregas
                (id_ente, no_ente, exercicio, periodo, periodicidade,
                 instituicao, entregavel, co_entregavel,
                 status_relatorio, data_status, forma_envio, tipo_relatorio)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            `, [
              item.cod_ibge,
              municipio.no_municipio,
              item.exercicio,
              item.periodo,
              item.periodicidade,
              item.instituicao,
              item.entregavel,
              coEntregavel,
              item.status_relatorio,
              item.data_status ? new Date(item.data_status) : null,
              item.forma_envio,
              item.tipo_relatorio,
            ]);
            totalNormalizados++;

            if (coEntregavel === "RREO") {
              periodosRreo.add(`${ano}|${item.periodo}`);
              totalRreo++;
            }
          }
        });

        const rreoCount = data.items.filter(
          (i) => derivarCoEntregavel(i.entregavel) === "RREO",
        ).length;
        const hoCount = data.items.filter((i) => i.status_relatorio === "HO").length;
        const reCount = data.items.filter((i) => i.status_relatorio === "RE").length;
        console.log(
          `  ✓ ${municipio.no_municipio}: ${data.items.length} itens` +
          ` (${rreoCount} RREO — HO:${hoCount} RE:${reCount})`,
        );
      } catch (err) {
        totalErros++;
        console.error(`  ✗ ${municipio.no_municipio}: ${(err as Error).message}`);
      }
    }
  }

  // ── Rebuild mart ──
  console.log(`\n[siconfi-extrato] Reconstruindo mart (${periodosRreo.size} períodos RREO)...`);
  const periodosArray = [...periodosRreo].map((k) => {
    const [ano, periodo] = k.split("|").map(Number);
    return { exercicio: ano, periodo };
  });

  const totalMart = await reconstruirMart(periodosArray);
  console.log(`[siconfi-extrato] ✓ mart.siconfi_rreo_extrato_entregas: ${totalMart} linhas`);

  // ── Resumo final ──
  const duracao = Date.now() - inicio;
  console.log(`\n[siconfi-extrato] Concluído em ${Math.round(duracao / 1000)}s`);
  console.log(`  Municípios consultados   : ${MUNICIPIOS_ACRE.length * ANOS_EXTRATO.length}`);
  console.log(`  Exercícios consultados   : ${ANOS_EXTRATO.join(", ")}`);
  console.log(`  Registros brutos (raw)   : ${totalBrutos}`);
  console.log(`  Registros normalizados   : ${totalNormalizados}`);
  console.log(`  Entregas RREO            : ${totalRreo}`);
  console.log(`  Linhas na mart           : ${totalMart}`);
  console.log(`  Erros                    : ${totalErros}`);

  try {
    await pgQuery(`
      INSERT INTO audit.etl_log (modulo, status, mensagem, registros, duracao_ms)
      VALUES ($1, 'OK', 'Carga extrato de entregas SICONFI concluída', $2, $3)
    `, [MODULO, totalNormalizados, duracao]);
  } catch {
    // audit.etl_log pode não existir — não bloqueia
  }
}

if (require.main === module) {
  executarSiconfiExtratoEntregasPostgres()
    .then(() => closePgPool())
    .catch((err) => {
      console.error("[siconfi-extrato] Erro fatal:", (err as Error).message);
      closePgPool().catch(() => void 0);
      process.exit(1);
    });
}
