/**
 * siconfi-rreo-incremental-postgres.ts
 *
 * Carga incremental de RREO + Extrato de Entregas do SICONFI para municípios do Acre.
 *
 * Fluxo em duas fases:
 *
 * Fase 1 — Extrato (/extrato_entregas): sempre carrega todos os municípios/anos.
 *   Rápido: 22 municípios × 2 anos = 44 requisições.
 *   Detecta quais períodos RREO tiveram data_status alterado desde a última carga.
 *   Usa data_status como watermark: se mudou → entrega nova ou retificação.
 *
 * Fase 2 — RREO (/rreo): carrega apenas os períodos detectados como alterados.
 *   Na primeira execução (DW vazio), carrega todos os períodos entregues (HO/RE).
 *   Retificações (RE): DELETE + INSERT garante que o dado anterior é removido.
 *
 * Marts reconstruídos ao final:
 *   - mart.siconfi_rreo_extrato_entregas   (períodos afetados pelo extrato)
 *   - mart.siconfi_rreo_resumo_municipio   (rebuild completo)
 *   - mart.siconfi_rreo_alertas            (rebuild completo)
 *   - mart.siconfi_rreo_alertas_home       (rebuild completo)
 *   - mart.siconfi_rreo_resumo_home        (rebuild completo)
 *
 * Variáveis de ambiente:
 *   SICONFI_API_BASE_URL   — base da API
 *   SICONFI_TIMEOUT_MS     — timeout por requisição (padrão: 30000)
 *   SICONFI_RATE_LIMIT_MS  — intervalo entre requisições (padrão: 1000)
 *   SICONFI_EXTRATO_ANOS   — anos separados por vírgula (padrão: ano-1,ano)
 *   SICONFI_ANO_INICIO     — ano inicial para fallback de carga full (padrão: 2021)
 *   SICONFI_ANO_FIM        — ano final (padrão: ano corrente)
 *   SICONFI_PERIODOS       — períodos por ano (padrão: "1,2,3,4,5,6")
 *
 * Uso: cd etl && npm run carga-siconfi-rreo:incremental
 */

import "dotenv/config";
import { pgQuery, withPgTransaction, closePgPool } from "../connectors/postgres";
import { executarMartSiconfiRreo } from "./refresh-mart-siconfi-rreo";

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

const BASE_URL   = (process.env.SICONFI_API_BASE_URL || "https://apidatalake.tesouro.gov.br/ords/siconfi/tt").replace(/\/$/, "");
const TIMEOUT_MS = parseInt(process.env.SICONFI_TIMEOUT_MS    || "30000", 10);
const RATE_LIMIT = parseInt(process.env.SICONFI_RATE_LIMIT_MS || "1000",  10);

const ANO_ATUAL = new Date().getFullYear();

const ANOS_EXTRATO: number[] = process.env.SICONFI_EXTRATO_ANOS
  ? process.env.SICONFI_EXTRATO_ANOS.split(",").map(Number).filter((n) => !isNaN(n))
  : [ANO_ATUAL - 1, ANO_ATUAL];

// Usado como fallback de escopo para carga RREO quando não há controle por extrato
const ANO_INICIO = parseInt(process.env.SICONFI_ANO_INICIO || String(ANO_ATUAL - 1), 10);
const ANO_FIM    = parseInt(process.env.SICONFI_ANO_FIM    || String(ANO_ATUAL),     10);
const PERIODOS   = (process.env.SICONFI_PERIODOS || "1,2,3,4,5,6").split(",").map(Number);

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

interface ExtratoItem {
  exercicio:        number;
  cod_ibge:         number;
  populacao:        number | null;
  instituicao:      string | null;
  entregavel:       string;
  periodo:          number;
  periodicidade:    string;
  status_relatorio: string | null;   // HO, RE, null
  data_status:      string | null;
  forma_envio:      string | null;
  tipo_relatorio:   string | null;
}

interface ExtratoResponse {
  items: ExtratoItem[];
  hasMore: boolean;
  count: number;
}

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
  count:   number;
}

interface SnapshotEntry {
  data_status:      string | null;
  status_relatorio: string | null;
}

// chave: "id_ente|exercicio|periodo"
type Snapshot = Map<string, SnapshotEntry>;

interface PeriodoAlterado {
  id_ente:    number;
  no_ente:    string;
  exercicio:  number;
  periodo:    number;
  motivo:     "novo" | "retificado" | "nova_entrega";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function derivarCoEntregavel(entregavel: string): string | null {
  const e = entregavel.toLowerCase();
  if (e.includes("relatório resumido de execução orçamentária")) return "RREO";
  if (e.includes("relatório de gestão fiscal"))                  return "RGF";
  if (e.includes("balanço anual") || e.includes("dca"))          return "DCA";
  if (e.includes("msc encerramento"))                            return "MSC_ENCERRAMENTO";
  if (e.includes("msc"))                                         return "MSC";
  return null;
}

function parseValor(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return isNaN(v) ? null : v;
  const n = parseFloat(String(v).replace(/,/g, "."));
  return isNaN(n) ? null : n;
}

function snapshotKey(id_ente: number, exercicio: number, periodo: number): string {
  return `${id_ente}|${exercicio}|${periodo}`;
}

// ---------------------------------------------------------------------------
// Fase 0 — Snapshot do DW antes de carregar
// Captura data_status atual para detectar mudanças após a carga do extrato.
// ---------------------------------------------------------------------------

async function tirarSnapshot(): Promise<Snapshot> {
  try {
    const rows = await pgQuery<{
      id_ente: number; exercicio: number; periodo: number;
      data_status: string | null; status_relatorio: string | null;
    }>(`
      SELECT id_ente, exercicio, periodo, data_status, status_relatorio
      FROM dw.fato_siconfi_extrato_entregas
      WHERE co_entregavel = 'RREO'
    `);
    const map: Snapshot = new Map();
    for (const r of rows) {
      map.set(snapshotKey(r.id_ente, r.exercicio, r.periodo), {
        data_status: r.data_status,
        status_relatorio: r.status_relatorio,
      });
    }
    return map;
  } catch {
    // Tabela ainda não existe — primeira execução
    return new Map();
  }
}

// ---------------------------------------------------------------------------
// Fase 1 — Carga do extrato (/extrato_entregas)
// Sempre completa (44 req.). Atualiza raw + DW.
// Retorna o novo estado RREO do DW para comparação.
// ---------------------------------------------------------------------------

async function fetchExtrato(id_ente: number, an_referencia: number, retries = 0): Promise<ExtratoResponse | null> {
  if (retries >= 3) return null;
  const url = `${BASE_URL}/extrato_entregas?id_ente=${id_ente}&an_referencia=${an_referencia}`;
  try {
    const resp = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Varadouro-Digital-ETL/1.0 (interno TCE-AC)" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (resp.status === 429) {
      const wait = 30000 * (retries + 1);
      console.log(`    [429] Rate limit — aguardando ${wait / 1000}s`);
      await sleep(wait);
      return fetchExtrato(id_ente, an_referencia, retries + 1);
    }
    if (!resp.ok) return null;
    return (await resp.json()) as ExtratoResponse;
  } catch {
    return null;
  }
}

async function carregarExtrato(): Promise<{ novoEstado: Snapshot; periodosRreo: Set<string> }> {
  console.log(`\n[incremental] ── Fase 1: Extrato (${MUNICIPIOS_ACRE.length * ANOS_EXTRATO.length} consultas) ──`);
  const novoEstado: Snapshot = new Map();
  const periodosRreo = new Set<string>();  // "exercicio|periodo" para mart extrato

  for (const ano of ANOS_EXTRATO) {
    for (const municipio of MUNICIPIOS_ACRE) {
      await sleep(RATE_LIMIT);
      const data = await fetchExtrato(municipio.id_municipio, ano);
      if (!data || data.items.length === 0) continue;

      try {
        await withPgTransaction(async (client) => {
          await client.query(`
            INSERT INTO raw.siconfi_extrato_entregas_raw (id_ente, an_referencia, endpoint, payload)
            VALUES ($1, $2, $3, $4)
          `, [municipio.id_municipio, ano,
              `/extrato_entregas?id_ente=${municipio.id_municipio}&an_referencia=${ano}`,
              JSON.stringify(data.items)]);

          await client.query(`
            DELETE FROM dw.fato_siconfi_extrato_entregas WHERE id_ente = $1 AND exercicio = $2
          `, [municipio.id_municipio, ano]);

          for (const item of data.items) {
            const co = derivarCoEntregavel(item.entregavel);
            await client.query(`
              INSERT INTO dw.fato_siconfi_extrato_entregas
                (id_ente, no_ente, exercicio, periodo, periodicidade,
                 instituicao, entregavel, co_entregavel,
                 status_relatorio, data_status, forma_envio, tipo_relatorio)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            `, [
              item.cod_ibge, municipio.no_municipio, item.exercicio, item.periodo,
              item.periodicidade, item.instituicao, item.entregavel, co,
              item.status_relatorio,
              item.data_status ? new Date(item.data_status) : null,
              item.forma_envio, item.tipo_relatorio,
            ]);

            if (co === "RREO") {
              novoEstado.set(snapshotKey(item.cod_ibge, item.exercicio, item.periodo), {
                data_status: item.data_status,
                status_relatorio: item.status_relatorio,
              });
              periodosRreo.add(`${item.exercicio}|${item.periodo}`);
            }
          }
        });
      } catch (err) {
        console.error(`  ✗ Extrato ${municipio.no_municipio}/${ano}: ${(err as Error).message}`);
      }
    }
  }

  console.log(`  ✓ Extrato carregado — ${novoEstado.size} períodos RREO mapeados`);
  return { novoEstado, periodosRreo };
}

// ---------------------------------------------------------------------------
// Fase 2 — Detecção de alterações
// Compara snapshot anterior com o novo estado do DW.
// ---------------------------------------------------------------------------

function detectarAlteracoes(snapshot: Snapshot, novoEstado: Snapshot): PeriodoAlterado[] {
  const alterados: PeriodoAlterado[] = [];

  for (const [key, novo] of novoEstado) {
    // Só carrega RREO se o período foi entregue (HO ou RE)
    if (!novo.status_relatorio || !["HO", "RE"].includes(novo.status_relatorio)) continue;

    const [id_ente, exercicio, periodo] = key.split("|").map(Number);
    const municipio = MUNICIPIOS_ACRE.find((m) => m.id_municipio === id_ente);
    const no_ente = municipio?.no_municipio ?? `Cód.${id_ente}`;

    const anterior = snapshot.get(key);

    if (!anterior) {
      alterados.push({ id_ente, no_ente, exercicio, periodo, motivo: "novo" });
      continue;
    }

    // data_status mudou → retificação ou nova confirmação
    if (anterior.data_status !== novo.data_status) {
      const motivo = novo.status_relatorio === "RE" ? "retificado" : "nova_entrega";
      alterados.push({ id_ente, no_ente, exercicio, periodo, motivo });
    }
  }

  return alterados;
}

// ---------------------------------------------------------------------------
// Fase 3 — Carga RREO dos períodos alterados
// ---------------------------------------------------------------------------

async function fetchRreo(
  an_exercicio: number, nr_periodo: number, id_municipio: number,
  offset = 0, retries = 0,
): Promise<RreoResponse | null> {
  if (retries >= 3) return null;
  const url = `${BASE_URL}/rreo?an_exercicio=${an_exercicio}&nr_periodo=${nr_periodo}&id_municipio=${id_municipio}&limit=200&offset=${offset}`;
  try {
    const resp = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Varadouro-Digital-ETL/1.0 (interno TCE-AC)" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (resp.status === 429) {
      await sleep(30000 * (retries + 1));
      return fetchRreo(an_exercicio, nr_periodo, id_municipio, offset, retries + 1);
    }
    if (!resp.ok) return null;
    return (await resp.json()) as RreoResponse;
  } catch {
    return null;
  }
}

async function fetchRreoAllPages(
  an_exercicio: number, nr_periodo: number, id_municipio: number,
): Promise<RreoItem[]> {
  const all: RreoItem[] = [];
  let offset = 0;
  while (true) {
    const page = await fetchRreo(an_exercicio, nr_periodo, id_municipio, offset);
    if (!page?.items?.length) break;
    all.push(...page.items);
    if (!page.hasMore) break;
    offset += page.items.length;
    await sleep(RATE_LIMIT);
  }
  return all;
}

async function carregarRreo(periodos: PeriodoAlterado[]): Promise<{
  registros: number; erros: number; periodosCarregados: Set<string>;
}> {
  if (periodos.length === 0) {
    console.log("\n[incremental] ── Fase 3: RREO — nenhum período alterado, pulando ──");
    return { registros: 0, erros: 0, periodosCarregados: new Set() };
  }

  console.log(`\n[incremental] ── Fase 3: RREO (${periodos.length} período(s) alterado(s)) ──`);
  let registros = 0;
  let erros = 0;
  const periodosCarregados = new Set<string>();

  for (const p of periodos) {
    await sleep(RATE_LIMIT);
    const items = await fetchRreoAllPages(p.exercicio, p.periodo, p.id_ente);

    if (items.length === 0) {
      console.log(`  - ${p.no_ente} ${p.exercicio}/${p.periodo}: sem dados RREO`);
      continue;
    }

    try {
      await withPgTransaction(async (client) => {
        // DELETE garante que retificação apaga dado anterior
        await client.query(`
          DELETE FROM dw.fato_siconfi_rreo
          WHERE an_exercicio = $1 AND nr_periodo = $2 AND id_municipio = $3
        `, [p.exercicio, p.periodo, p.id_ente]);

        await client.query(`
          INSERT INTO raw.siconfi_rreo_raw
            (an_exercicio, nr_periodo, id_municipio, co_tipo_demonstrativo, no_anexo, endpoint, payload)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          p.exercicio, p.periodo, p.id_ente,
          items[0]?.co_tipo_demonstrativo ?? "RREO",
          null,
          `/rreo?an_exercicio=${p.exercicio}&nr_periodo=${p.periodo}&id_municipio=${p.id_ente}`,
          JSON.stringify(items),
        ]);

        for (const item of items) {
          await client.query(`
            INSERT INTO dw.fato_siconfi_rreo
              (an_exercicio, nr_periodo, id_municipio, no_municipio,
               co_tipo_demonstrativo, no_anexo, coluna, conta, valor)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          `, [
            item.an_exercicio ?? p.exercicio,
            item.nr_periodo   ?? p.periodo,
            item.id_municipio ?? p.id_ente,
            item.no_municipio ?? p.no_ente,
            item.co_tipo_demonstrativo ?? "RREO",
            item.no_anexo  ?? null,
            item.no_coluna ?? null,
            item.no_conta  ?? item.co_conta ?? null,
            parseValor(item.vl_conta),
          ]);
        }
      });

      registros += items.length;
      periodosCarregados.add(`${p.exercicio}|${p.periodo}`);
      const flag = p.motivo === "retificado" ? " [RE]" : p.motivo === "novo" ? " [NOVO]" : " [HO]";
      console.log(`  ✓ ${p.no_ente} ${p.exercicio}/${p.periodo}${flag}: ${items.length} registros`);
    } catch (err) {
      erros++;
      console.error(`  ✗ ${p.no_ente} ${p.exercicio}/${p.periodo}: ${(err as Error).message}`);
    }
  }

  return { registros, erros, periodosCarregados };
}

// ---------------------------------------------------------------------------
// Fase 4 — Rebuild mart extrato (períodos afetados)
// ---------------------------------------------------------------------------

async function reconstruirMartExtrato(
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
          f.id_ente, f.no_ente, f.exercicio, f.periodo,
          f.status_relatorio,
          CASE f.status_relatorio
            WHEN 'HO' THEN 'Homologado'
            WHEN 'RE' THEN 'Retificado'
            ELSE           'Não entregue'
          END,
          f.data_status::date,
          NULL::text,
          f.forma_envio, f.tipo_relatorio,
          (r.id_municipio IS NOT NULL),
          CASE WHEN r.id_municipio IS NOT NULL THEN 'COM_DADO' ELSE 'SEM_DADO' END,
          CASE
            WHEN f.status_relatorio IN ('HO','RE') AND r.id_municipio IS NOT NULL THEN 'ENTREGUE_COM_DADO'
            WHEN f.status_relatorio IN ('HO','RE') AND r.id_municipio IS NULL     THEN 'ENTREGUE_SEM_DADO_LOCAL'
            WHEN f.status_relatorio IS NULL        AND r.id_municipio IS NOT NULL THEN 'SEM_ENTREGA_COM_DADO_LOCAL'
            ELSE                                                                       'SEM_ENTREGA_SEM_DADO'
          END,
          NOW()
        FROM dw.fato_siconfi_extrato_entregas f
        LEFT JOIN mart.siconfi_rreo_resumo_municipio r
          ON r.id_municipio = f.id_ente AND r.an_exercicio = f.exercicio AND r.nr_periodo = f.periodo
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

export async function executarSiconfiRreoIncremental(): Promise<void> {
  const inicio = Date.now();
  console.log("[incremental] Iniciando carga incremental SICONFI RREO + Extrato...");
  console.log(`[incremental] Anos extrato: ${ANOS_EXTRATO.join(", ")}`);
  console.log(`[incremental] Municípios  : ${MUNICIPIOS_ACRE.length}`);

  // ── Fase 0: Snapshot ──
  console.log("\n[incremental] ── Fase 0: Snapshot do DW atual ──");
  const snapshot = await tirarSnapshot();
  console.log(`  ${snapshot.size} períodos RREO já no DW`);

  // ── Fase 1: Extrato ──
  const { novoEstado, periodosRreo } = await carregarExtrato();

  // ── Fase 2: Detecção ──
  const alterados = detectarAlteracoes(snapshot, novoEstado);
  console.log(`\n[incremental] ── Fase 2: Detecção ──`);
  if (alterados.length === 0) {
    console.log("  Nenhum período RREO alterado — RREO já está atualizado.");
  } else {
    const novos       = alterados.filter((a) => a.motivo === "novo").length;
    const retificados = alterados.filter((a) => a.motivo === "retificado").length;
    const atualizados = alterados.filter((a) => a.motivo === "nova_entrega").length;
    console.log(`  ${alterados.length} período(s) a recarregar:`);
    if (novos)       console.log(`    ${novos} novo(s)`);
    if (retificados) console.log(`    ${retificados} retificado(s) [RE]`);
    if (atualizados) console.log(`    ${atualizados} nova entrega`);
    for (const p of alterados) {
      const flag = p.motivo === "retificado" ? "[RE]" : p.motivo === "novo" ? "[NOVO]" : "[HO]";
      console.log(`    ${flag} ${p.no_ente} ${p.exercicio}/${p.periodo}`);
    }
  }

  // ── Fase 3: RREO ──
  const { registros: rreoRegistros, erros, periodosCarregados } = await carregarRreo(alterados);

  // ── Fase 4: Mart extrato ──
  const periodosExtratoParsed = [...periodosRreo].map((k) => {
    const [exercicio, periodo] = k.split("|").map(Number);
    return { exercicio, periodo };
  });
  console.log(`\n[incremental] ── Fase 4: Mart extrato (${periodosExtratoParsed.length} período(s)) ──`);
  const linhasMartExtrato = await reconstruirMartExtrato(periodosExtratoParsed);
  console.log(`  ✓ mart.siconfi_rreo_extrato_entregas: ${linhasMartExtrato} linhas`);

  // ── Fase 5: Marts RREO (rebuild completo — rápido, em memória) ──
  if (periodosCarregados.size > 0) {
    console.log("\n[incremental] ── Fase 5: Marts RREO (rebuild completo) ──");
    await executarMartSiconfiRreo();
  } else {
    console.log("\n[incremental] ── Fase 5: Marts RREO — sem alterações, pulando ──");
  }

  // ── Resumo ──
  const duracao = Date.now() - inicio;
  console.log(`\n[incremental] Concluído em ${Math.round(duracao / 1000)}s`);
  console.log(`  Períodos no DW (antes)   : ${snapshot.size}`);
  console.log(`  Períodos detectados      : ${alterados.length}`);
  console.log(`  Registros RREO carregados: ${rreoRegistros}`);
  console.log(`  Erros                    : ${erros}`);

  try {
    await pgQuery(`
      INSERT INTO audit.etl_log (modulo, status, mensagem, registros, duracao_ms)
      VALUES ('mart_siconfi_rreo', 'OK', $1, $2, $3)
    `, [
      `Incremental: ${alterados.length} período(s) alterado(s), ${rreoRegistros} registros RREO`,
      rreoRegistros,
      duracao,
    ]);
  } catch {
    // audit.etl_log pode não existir
  }
}

if (require.main === module) {
  executarSiconfiRreoIncremental()
    .then(() => closePgPool())
    .catch((err) => {
      console.error("[incremental] Erro fatal:", (err as Error).message);
      closePgPool().catch(() => void 0);
      process.exit(1);
    });
}
