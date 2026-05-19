/**
 * ingest-inep-rendimento-municipios.ts
 *
 * Fase 17B — Ingestão das Taxas de Rendimento Escolar (INEP) por município,
 * a partir dos ZIPs locais em etl/data/inep/rendimento/.
 *
 * Header dinamicamente localizado (procura "NU_ANO_CENSO" nas primeiras linhas).
 * Códigos de coluna mapeados:
 *   1_CAT_FUN, _AI, _AF  → Aprovação (Fund total / Anos Iniciais / Anos Finais)
 *   1_CAT_MED            → Aprovação Ensino Médio (total)
 *   2_*                  → Reprovação
 *   3_*                  → Abandono
 *
 * Variáveis de ambiente:
 *   INEP_RENDIMENTO_DIR — diretório dos ZIPs (padrão: ./data/inep/rendimento)
 *   INEP_UF             — filtro de UF (padrão: AC; "ALL" para tudo)
 *
 * Uso: cd etl && npx ts-node jobs/ingest-inep-rendimento-municipios.ts
 */

import "dotenv/config";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createHash } from "crypto";
import { spawnSync } from "child_process";
import * as XLSX from "xlsx";
import { pgQuery, withPgTransaction, closePgPool } from "../connectors/postgres";

const REND_DIR  = process.env.INEP_RENDIMENTO_DIR || path.resolve(__dirname, "../data/inep/rendimento");
const UF_FILTRO = (process.env.INEP_UF || "AC").toUpperCase();
const FILTRAR_UF = UF_FILTRO !== "ALL";

// ---------------------------------------------------------------------------
// Helpers (replicam padrão do ingest-inep-ideb-municipios.ts)
// ---------------------------------------------------------------------------

function extrairZipParaTmp(zipPath: string): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "inep-rend-"));
  const r = spawnSync("tar", ["-xf", zipPath, "-C", tmpDir], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`Falha ao extrair ${zipPath}: ${r.stderr || r.stdout}`);
  return tmpDir;
}

function localizarXlsx(dir: string): string | null {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && /\.xlsx$/i.test(entry.name)) return full;
    if (entry.isDirectory()) {
      const inner = localizarXlsx(full);
      if (inner) return inner;
    }
  }
  return null;
}

function anoDoNome(zipName: string): number | null {
  const m = zipName.match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

function parseNumero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (s === "-" || s === "--" || s === "*" || s === "**") return null;
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function hashLinha(payload: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

// ---------------------------------------------------------------------------
// Mapeamento de colunas
// ---------------------------------------------------------------------------

interface MapaColunas {
  iAno: number; iUf: number; iCodMun: number; iNoMun: number;
  iLocalizacao: number; iDependencia: number;
  // 1=aprovação, 2=reprovação, 3=abandono
  cols: Record<string, number>;  // codigo → coluna
}

function mapearColunas(header: string[]): MapaColunas {
  const idx = new Map<string, number>();
  header.forEach((h, i) => { if (typeof h === "string") idx.set(h.trim().toUpperCase(), i); });

  const cols: Record<string, number> = {};
  for (const codigo of [
    "1_CAT_FUN", "1_CAT_FUN_AI", "1_CAT_FUN_AF", "1_CAT_MED",
    "2_CAT_FUN", "2_CAT_FUN_AI", "2_CAT_FUN_AF", "2_CAT_MED",
    "3_CAT_FUN", "3_CAT_FUN_AI", "3_CAT_FUN_AF", "3_CAT_MED",
  ]) {
    const v = idx.get(codigo);
    if (v !== undefined) cols[codigo] = v;
  }

  return {
    iAno:         idx.get("NU_ANO_CENSO") ?? -1,
    iUf:          idx.get("SG_UF")        ?? -1,
    iCodMun:      idx.get("CO_MUNICIPIO") ?? -1,
    iNoMun:       idx.get("NO_MUNICIPIO") ?? -1,
    iLocalizacao: idx.get("NO_CATEGORIA") ?? -1,
    iDependencia: idx.get("NO_DEPENDENCIA") ?? -1,
    cols,
  };
}

function valorPorCol(row: unknown[], col: number | undefined): number | null {
  return col === undefined ? null : parseNumero(row[col]);
}

// ---------------------------------------------------------------------------
// Processamento
// ---------------------------------------------------------------------------

interface ResultadoArquivo {
  arquivo: string;
  ano: number;
  linhas_lidas: number;
  linhas_filtradas_uf: number;
  raw_inseridas: number;
  raw_tocadas: number;
  dw_inseridas: number;
  erro: string | null;
}

async function processarZip(zipPath: string): Promise<ResultadoArquivo> {
  const arquivo = path.basename(zipPath);
  const ano = anoDoNome(arquivo) ?? 0;
  const r: ResultadoArquivo = {
    arquivo, ano,
    linhas_lidas: 0, linhas_filtradas_uf: 0,
    raw_inseridas: 0, raw_tocadas: 0, dw_inseridas: 0, erro: null,
  };
  if (!ano) { r.erro = "ano não detectado no nome do arquivo"; return r; }

  let tmpDir: string | null = null;
  try {
    tmpDir = extrairZipParaTmp(zipPath);
    const xlsx = localizarXlsx(tmpDir);
    if (!xlsx) { r.erro = "XLSX não encontrado"; return r; }

    const wb = XLSX.readFile(xlsx);
    const sheetName = wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: null });

    let headerRow = -1;
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const row = rows[i];
      if (Array.isArray(row) && row.some((c) => typeof c === "string" && c.trim().toUpperCase() === "NU_ANO_CENSO")) {
        headerRow = i; break;
      }
    }
    if (headerRow < 0) { r.erro = "Cabeçalho NU_ANO_CENSO não localizado"; return r; }

    const header = (rows[headerRow] as unknown[]).map((c) => String(c ?? ""));
    const m = mapearColunas(header);
    if (m.iUf < 0 || m.iCodMun < 0 || m.iLocalizacao < 0 || m.iDependencia < 0) {
      r.erro = `Colunas obrigatórias ausentes (SG_UF=${m.iUf}, CO_MUNICIPIO=${m.iCodMun}, NO_CATEGORIA=${m.iLocalizacao}, NO_DEPENDENCIA=${m.iDependencia})`;
      return r;
    }

    const dataRows: unknown[][] = [];
    for (let i = headerRow + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row)) continue;
      if (row.every((c) => c === null || c === "")) continue;
      dataRows.push(row);
    }
    r.linhas_lidas = dataRows.length;

    await withPgTransaction(async (client) => {
      for (const row of dataRows) {
        const sg_uf = String(row[m.iUf] ?? "").trim();
        if (!sg_uf) continue;
        if (FILTRAR_UF && sg_uf !== UF_FILTRO) continue;

        const codMunRaw = row[m.iCodMun];
        const cod_municipio = typeof codMunRaw === "number" ? codMunRaw : parseInt(String(codMunRaw ?? ""), 10);
        if (!Number.isFinite(cod_municipio)) continue;
        const no_municipio = m.iNoMun >= 0 ? String(row[m.iNoMun] ?? "").trim() : "";
        const localizacao  = String(row[m.iLocalizacao] ?? "").trim() || "Total";
        const dependencia  = String(row[m.iDependencia] ?? "").trim() || "Total";

        r.linhas_filtradas_uf++;

        const payload: Record<string, unknown> = {};
        for (let c = 0; c < header.length; c++) {
          const k = header[c] || `col_${c}`;
          payload[k] = row[c] ?? null;
        }
        const hash = hashLinha(payload);

        const upsert = await client.query<{ id: string; inseriu: boolean }>(`
          INSERT INTO raw.inep_rendimento_municipal_raw
            (arquivo, ano, sg_uf, cod_municipio, no_municipio, localizacao, dependencia,
             payload, hash_registro, coletado_em, atualizado_em)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now(), now())
          ON CONFLICT (ano, cod_municipio, localizacao, dependencia, hash_registro)
          DO UPDATE SET atualizado_em = now(),
                        no_municipio = COALESCE(EXCLUDED.no_municipio, raw.inep_rendimento_municipal_raw.no_municipio)
          RETURNING id, (xmax = 0) AS inseriu
        `, [arquivo, ano, sg_uf, cod_municipio, no_municipio, localizacao, dependencia,
            JSON.stringify(payload), hash]);

        const raw_id = upsert.rows[0]?.id;
        if (upsert.rows[0]?.inseriu) r.raw_inseridas++;
        else                          r.raw_tocadas++;

        const aprov_fund_total = valorPorCol(row, m.cols["1_CAT_FUN"]);
        const aprov_fund_ai    = valorPorCol(row, m.cols["1_CAT_FUN_AI"]);
        const aprov_fund_af    = valorPorCol(row, m.cols["1_CAT_FUN_AF"]);
        const aprov_em_total   = valorPorCol(row, m.cols["1_CAT_MED"]);
        const reprov_fund_total = valorPorCol(row, m.cols["2_CAT_FUN"]);
        const reprov_fund_ai    = valorPorCol(row, m.cols["2_CAT_FUN_AI"]);
        const reprov_fund_af    = valorPorCol(row, m.cols["2_CAT_FUN_AF"]);
        const reprov_em_total   = valorPorCol(row, m.cols["2_CAT_MED"]);
        const abandono_fund_total = valorPorCol(row, m.cols["3_CAT_FUN"]);
        const abandono_fund_ai    = valorPorCol(row, m.cols["3_CAT_FUN_AI"]);
        const abandono_fund_af    = valorPorCol(row, m.cols["3_CAT_FUN_AF"]);
        const abandono_em_total   = valorPorCol(row, m.cols["3_CAT_MED"]);

        // Reconstrói linha da fato
        await client.query(`
          DELETE FROM dw.fato_inep_rendimento_municipal
          WHERE ano = $1 AND cod_municipio = $2 AND localizacao = $3 AND dependencia = $4
        `, [ano, cod_municipio, localizacao, dependencia]);

        await client.query(`
          INSERT INTO dw.fato_inep_rendimento_municipal
            (ano, cod_municipio, sg_uf, no_municipio, localizacao, dependencia,
             aprov_fund_total, aprov_fund_ai, aprov_fund_af, aprov_em_total,
             reprov_fund_total, reprov_fund_ai, reprov_fund_af, reprov_em_total,
             abandono_fund_total, abandono_fund_ai, abandono_fund_af, abandono_em_total,
             raw_id, criado_em, atualizado_em)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19, now(), now())
        `, [ano, cod_municipio, sg_uf, no_municipio, localizacao, dependencia,
            aprov_fund_total, aprov_fund_ai, aprov_fund_af, aprov_em_total,
            reprov_fund_total, reprov_fund_ai, reprov_fund_af, reprov_em_total,
            abandono_fund_total, abandono_fund_ai, abandono_fund_af, abandono_em_total,
            raw_id]);
        r.dw_inseridas++;
      }
    });
  } catch (err) {
    r.erro = (err as Error).message;
  } finally {
    if (tmpDir) { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ } }
  }
  return r;
}

async function main() {
  const inicio = Date.now();
  console.log("[inep-rendimento] Ingestão Taxas de Rendimento Escolar");
  console.log(`  Diretório: ${REND_DIR}`);
  console.log(`  Filtro UF: ${FILTRAR_UF ? UF_FILTRO : "(sem filtro)"}\n`);

  if (!fs.existsSync(REND_DIR)) {
    console.error(`[inep-rendimento] Diretório não existe: ${REND_DIR}`);
    await registrarAuditoria("ERRO", `Diretório não existe: ${REND_DIR}`, 0, Date.now() - inicio);
    process.exit(1);
  }

  const zips = fs.readdirSync(REND_DIR)
    .filter((f) => /\.zip$/i.test(f))
    .filter((f) => /municipios/i.test(f));
  if (!zips.length) {
    console.error(`[inep-rendimento] Nenhum ZIP de municípios encontrado em ${REND_DIR}`);
    await registrarAuditoria("ERRO", `Nenhum ZIP em ${REND_DIR}`, 0, Date.now() - inicio);
    process.exit(1);
  }

  const resultados: ResultadoArquivo[] = [];
  for (const z of zips) {
    process.stdout.write(`  ▸ ${z} … `);
    const r = await processarZip(path.join(REND_DIR, z));
    resultados.push(r);
    if (r.erro) console.log(`FALHA — ${r.erro}`);
    else        console.log(`OK — ano=${r.ano} linhas=${r.linhas_lidas} ${UF_FILTRO}=${r.linhas_filtradas_uf} raw+${r.raw_inseridas}/~${r.raw_tocadas} dw=${r.dw_inseridas}`);
  }

  const totalDw      = resultados.reduce((a, r) => a + r.dw_inseridas, 0);
  const totalArqOk   = resultados.filter((r) => !r.erro).length;
  const totalArqErro = resultados.filter((r) => r.erro).length;
  const status       = totalArqErro === 0 ? "OK" : totalDw > 0 ? "PARCIAL" : "ERRO";
  await registrarAuditoria(
    status,
    `${totalArqOk} arquivo(s) OK · ${totalArqErro} com erro · DW=${totalDw} linhas (UF=${UF_FILTRO})`,
    totalDw,
    Date.now() - inicio,
  );
}

async function registrarAuditoria(status: string, mensagem: string, registros: number, duracaoMs: number) {
  try {
    await pgQuery(
      `INSERT INTO audit.etl_log (modulo, status, mensagem, registros, duracao_ms)
       VALUES ('inep_rendimento_municipios', $1, $2, $3, $4)`,
      [status, mensagem, registros, duracaoMs],
    );
  } catch {
    /* audit.etl_log pode não existir — silencioso */
  }
}

if (require.main === module) {
  main()
    .then(() => closePgPool())
    .catch((err) => {
      console.error("[inep-rendimento] Erro fatal:", (err as Error).message);
      closePgPool().catch(() => void 0);
      process.exit(1);
    });
}
