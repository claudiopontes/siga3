/**
 * ingest-inep-ideb-municipios.ts
 *
 * Fase 17B — Ingestão do IDEB municipal a partir dos ZIPs locais em
 * etl/data/inep/ideb/ (download.inep.gov.br está bloqueado pela rede TCE-AC).
 *
 * Cada ZIP contém pasta com .xlsx + .ods + md5.txt. O ingestor:
 *   1. Extrai o ZIP para diretório temporário do SO (via `tar -xf`).
 *   2. Lê o XLSX, identifica o cabeçalho real (linha 9 / 0-indexed).
 *   3. Para cada município no Acre, persiste:
 *      - uma linha em raw.inep_ideb_municipal_raw (payload completo);
 *      - N linhas em dw.fato_inep_ideb_municipal (uma por ano observado:
 *        2005, 2007, 2009, ..., 2023).
 *   4. Identifica edição e etapa pelo nome do arquivo:
 *      - divulgacao_anos_iniciais_*  → etapa = "AI"
 *      - divulgacao_anos_finais_*    → etapa = "AF"
 *      - divulgacao_ensino_medio_*   → etapa = "EM"
 *
 * Variáveis de ambiente:
 *   INEP_IDEB_DIR — diretório dos ZIPs (padrão: ./data/inep/ideb)
 *   INEP_UF       — filtro de UF (padrão: AC; "ALL" para carregar tudo)
 *
 * Uso: cd etl && npx ts-node jobs/ingest-inep-ideb-municipios.ts
 */

import "dotenv/config";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createHash } from "crypto";
import { spawnSync } from "child_process";
import * as XLSX from "xlsx";
import { pgQuery, withPgTransaction, closePgPool } from "../connectors/postgres";

const IDEB_DIR = process.env.INEP_IDEB_DIR || path.resolve(__dirname, "../data/inep/ideb");
const UF_FILTRO = (process.env.INEP_UF || "AC").toUpperCase();
const FILTRAR_UF = UF_FILTRO !== "ALL";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extrairZipParaTmp(zipPath: string): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "inep-ideb-"));
  // `tar -xf` aceita ZIP nativamente em Windows 10+ e Linux/macOS modernos.
  const r = spawnSync("tar", ["-xf", zipPath, "-C", tmpDir], { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`Falha ao extrair ${zipPath}: ${r.stderr || r.stdout}`);
  }
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

interface MetaArquivo {
  edicao: number;
  etapa: "AI" | "AF" | "EM";
}

function metaDoNome(zipName: string): MetaArquivo | null {
  const lower = zipName.toLowerCase();
  const ano = lower.match(/(\d{4})/);
  if (!ano) return null;
  const edicao = parseInt(ano[1], 10);
  if (lower.includes("anos_iniciais")) return { edicao, etapa: "AI" };
  if (lower.includes("anos_finais"))   return { edicao, etapa: "AF" };
  if (lower.includes("ensino_medio"))  return { edicao, etapa: "EM" };
  return null;
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

interface ColunaIdeb {
  ano: number;
  observado:  number | null;
  projetado:  number | null;
  aprovacao:  number | null;
  indicadorP: number | null;
  notaMat:    number | null;
  notaLp:     number | null;
  notaMedia:  number | null;
}

/**
 * Constrói um mapa header→índice e extrai as colunas indexadas por ano.
 * Padrões reais observados:
 *   VL_OBSERVADO_<ano>          → IDEB observado
 *   VL_PROJECAO_<ano>           → meta projetada
 *   VL_INDICADOR_REND_<ano>     → indicador de rendimento (P)
 *   VL_APROVACAO_<ano>_SI_4 / _SF_4 / _EM → taxa consolidada da etapa
 *   VL_NOTA_MAT_<ano>           → SAEB Matemática
 *   VL_NOTA_LP_<ano>            → SAEB Língua Portuguesa
 *   VL_NOTA_MEDIA_<ano>         → SAEB média padronizada
 */
function indexarColunas(header: string[]): {
  iSgUf: number; iCodMun: number; iNoMun: number; iRede: number;
  anosDisponiveis: number[];
  idxPorAno: Map<number, Partial<Record<keyof ColunaIdeb, number>>>;
} {
  const idx = new Map<string, number>();
  header.forEach((h, i) => {
    if (typeof h === "string") idx.set(h.trim().toUpperCase(), i);
  });

  const iSgUf  = idx.get("SG_UF")        ?? -1;
  const iCodMun = idx.get("CO_MUNICIPIO") ?? -1;
  const iNoMun = idx.get("NO_MUNICIPIO") ?? -1;
  const iRede  = idx.get("REDE")         ?? -1;

  const idxPorAno = new Map<number, Partial<Record<keyof ColunaIdeb, number>>>();
  const setarAno = (ano: number, campo: keyof ColunaIdeb, col: number) => {
    const e = idxPorAno.get(ano) ?? {};
    e[campo] = col;
    idxPorAno.set(ano, e);
  };

  // Preferência de aprovação por etapa (ordenada por especificidade)
  const aprovacaoSufixos = ["_SI_4", "_SI", "_SF_4", "_SF", "_EM"];

  for (const [h, col] of idx.entries()) {
    let m: RegExpMatchArray | null;
    m = h.match(/^VL_OBSERVADO_(\d{4})$/);
    if (m) { setarAno(parseInt(m[1], 10), "observado", col); continue; }
    m = h.match(/^VL_PROJECAO_(\d{4})$/);
    if (m) { setarAno(parseInt(m[1], 10), "projetado", col); continue; }
    m = h.match(/^VL_INDICADOR_REND_(\d{4})$/);
    if (m) { setarAno(parseInt(m[1], 10), "indicadorP", col); continue; }
    m = h.match(/^VL_NOTA_MAT_(\d{4})$/);
    if (m) { setarAno(parseInt(m[1], 10), "notaMat", col); continue; }
    m = h.match(/^VL_NOTA_LP_(\d{4})$/);
    if (m) { setarAno(parseInt(m[1], 10), "notaLp", col); continue; }
    m = h.match(/^VL_NOTA_MEDIA_(\d{4})$/);
    if (m) { setarAno(parseInt(m[1], 10), "notaMedia", col); continue; }
    // Aprovação: pega o sufixo mais "consolidado" e mantém só ele
    m = h.match(/^VL_APROVACAO_(\d{4})(_.*)$/);
    if (m) {
      const ano = parseInt(m[1], 10);
      const sufixo = m[2];
      const atual = idxPorAno.get(ano)?.aprovacao;
      if (atual === undefined) {
        // ainda não há aprovação para esse ano
        if (aprovacaoSufixos.includes(sufixo)) setarAno(ano, "aprovacao", col);
      }
      // se já existe, mantém a primeira que casou (preferência inicial)
    }
  }

  const anosDisponiveis = [...idxPorAno.keys()]
    .filter((a) => idxPorAno.get(a)?.observado !== undefined)
    .sort();

  return { iSgUf, iCodMun, iNoMun, iRede, anosDisponiveis, idxPorAno };
}

// ---------------------------------------------------------------------------
// Processamento por ZIP
// ---------------------------------------------------------------------------

interface ResultadoArquivo {
  arquivo: string;
  edicao: number;
  etapa: string;
  linhas_lidas: number;
  linhas_filtradas_uf: number;
  raw_inseridas: number;
  raw_tocadas: number;
  dw_inseridas: number;
  anos_observados: number[];
  erro: string | null;
}

async function processarZip(zipPath: string): Promise<ResultadoArquivo> {
  const arquivo = path.basename(zipPath);
  const meta = metaDoNome(arquivo);
  const r: ResultadoArquivo = {
    arquivo, edicao: meta?.edicao ?? 0, etapa: meta?.etapa ?? "?",
    linhas_lidas: 0, linhas_filtradas_uf: 0,
    raw_inseridas: 0, raw_tocadas: 0, dw_inseridas: 0,
    anos_observados: [], erro: null,
  };

  if (!meta) { r.erro = "nome de arquivo não casou padrão divulgacao_<etapa>_municipios_<ano>"; return r; }

  let tmpDir: string | null = null;
  try {
    tmpDir = extrairZipParaTmp(zipPath);
    const xlsx = localizarXlsx(tmpDir);
    if (!xlsx) { r.erro = "XLSX não encontrado dentro do ZIP"; return r; }

    const wb = XLSX.readFile(xlsx);
    const sheetName = wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: null });

    // Localiza dinâmicamente a linha de cabeçalho real:
    // procura a linha que contém "SG_UF" como string.
    let headerRow = -1;
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const row = rows[i];
      if (Array.isArray(row) && row.some((c) => typeof c === "string" && c.trim().toUpperCase() === "SG_UF")) {
        headerRow = i;
        break;
      }
    }
    if (headerRow < 0) { r.erro = "Cabeçalho SG_UF não localizado"; return r; }

    const header = (rows[headerRow] as unknown[]).map((c) => String(c ?? ""));
    const idx = indexarColunas(header);
    r.anos_observados = idx.anosDisponiveis;

    if (idx.iSgUf < 0 || idx.iCodMun < 0 || idx.iRede < 0) {
      r.erro = `Colunas obrigatórias ausentes no header (SG_UF=${idx.iSgUf}, CO_MUNICIPIO=${idx.iCodMun}, REDE=${idx.iRede})`;
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
        const sg_uf = String(row[idx.iSgUf] ?? "").trim();
        if (!sg_uf) continue;
        if (FILTRAR_UF && sg_uf !== UF_FILTRO) continue;

        const codMunRaw = row[idx.iCodMun];
        const cod_municipio = typeof codMunRaw === "number" ? codMunRaw : parseInt(String(codMunRaw ?? ""), 10);
        if (!Number.isFinite(cod_municipio)) continue;
        const no_municipio = idx.iNoMun >= 0 ? String(row[idx.iNoMun] ?? "").trim() : "";
        const rede = String(row[idx.iRede] ?? "").trim();
        if (!rede) continue;

        r.linhas_filtradas_uf++;

        // Monta payload nominal (mapeia header→valor)
        const payload: Record<string, unknown> = {};
        for (let c = 0; c < header.length; c++) {
          const k = header[c] || `col_${c}`;
          payload[k] = row[c] ?? null;
        }

        const hash = hashLinha(payload);

        const upsert = await client.query<{ id: string; inseriu: boolean }>(`
          INSERT INTO raw.inep_ideb_municipal_raw
            (arquivo, edicao, etapa, sg_uf, cod_municipio, no_municipio, rede,
             payload, hash_registro, coletado_em, atualizado_em)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now(), now())
          ON CONFLICT (edicao, etapa, cod_municipio, rede, hash_registro)
          DO UPDATE SET atualizado_em = now(),
                        no_municipio  = COALESCE(EXCLUDED.no_municipio, raw.inep_ideb_municipal_raw.no_municipio)
          RETURNING id, (xmax = 0) AS inseriu
        `, [arquivo, meta.edicao, meta.etapa, sg_uf, cod_municipio, no_municipio, rede,
            JSON.stringify(payload), hash]);

        const raw_id = upsert.rows[0]?.id;
        if (upsert.rows[0]?.inseriu) r.raw_inseridas++;
        else                          r.raw_tocadas++;

        // Reconstrói as linhas DW desta combinação (uma por ano observado)
        await client.query(`
          DELETE FROM dw.fato_inep_ideb_municipal
          WHERE edicao = $1 AND etapa = $2 AND cod_municipio = $3 AND rede = $4
        `, [meta.edicao, meta.etapa, cod_municipio, rede]);

        for (const ano of idx.anosDisponiveis) {
          const cols = idx.idxPorAno.get(ano)!;
          const observado  = cols.observado  !== undefined ? parseNumero(row[cols.observado])  : null;
          const projetado  = cols.projetado  !== undefined ? parseNumero(row[cols.projetado])  : null;
          const aprovacao  = cols.aprovacao  !== undefined ? parseNumero(row[cols.aprovacao])  : null;
          const indicadorP = cols.indicadorP !== undefined ? parseNumero(row[cols.indicadorP]) : null;
          const notaMat    = cols.notaMat    !== undefined ? parseNumero(row[cols.notaMat])    : null;
          const notaLp     = cols.notaLp     !== undefined ? parseNumero(row[cols.notaLp])     : null;
          const notaMedia  = cols.notaMedia  !== undefined ? parseNumero(row[cols.notaMedia])  : null;

          // Pula ano sem nenhum dado relevante
          if (observado === null && projetado === null && aprovacao === null &&
              indicadorP === null && notaMat === null && notaLp === null && notaMedia === null) {
            continue;
          }

          await client.query(`
            INSERT INTO dw.fato_inep_ideb_municipal
              (edicao, etapa, cod_municipio, sg_uf, no_municipio, rede, ano,
               ideb_observado, ideb_projetado, aprovacao, indicador_rend_p,
               nota_mat_saeb, nota_lp_saeb, nota_media_saeb, raw_id,
               criado_em, atualizado_em)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now(), now())
          `, [meta.edicao, meta.etapa, cod_municipio, sg_uf, no_municipio, rede, ano,
              observado, projetado, aprovacao, indicadorP, notaMat, notaLp, notaMedia, raw_id]);
          r.dw_inseridas++;
        }
      }
    });

  } catch (err) {
    r.erro = (err as Error).message;
  } finally {
    if (tmpDir) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
  return r;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const inicio = Date.now();
  console.log("[inep-ideb] Ingestão IDEB municipal");
  console.log(`  Diretório: ${IDEB_DIR}`);
  console.log(`  Filtro UF: ${FILTRAR_UF ? UF_FILTRO : "(sem filtro)"}\n`);

  if (!fs.existsSync(IDEB_DIR)) {
    console.error(`[inep-ideb] Diretório não existe: ${IDEB_DIR}`);
    await registrarAuditoria("ERRO", `Diretório não existe: ${IDEB_DIR}`, 0, Date.now() - inicio);
    process.exit(1);
  }

  const zips = fs.readdirSync(IDEB_DIR)
    .filter((f) => /\.zip$/i.test(f))
    .filter((f) => /municipios/i.test(f));
  if (!zips.length) {
    console.error(`[inep-ideb] Nenhum ZIP de municípios encontrado em ${IDEB_DIR}`);
    await registrarAuditoria("ERRO", `Nenhum ZIP em ${IDEB_DIR}`, 0, Date.now() - inicio);
    process.exit(1);
  }

  const resultados: ResultadoArquivo[] = [];
  for (const z of zips) {
    const zipPath = path.join(IDEB_DIR, z);
    process.stdout.write(`  ▸ ${z} … `);
    const r = await processarZip(zipPath);
    resultados.push(r);
    if (r.erro) console.log(`FALHA — ${r.erro}`);
    else        console.log(`OK — edicao=${r.edicao} etapa=${r.etapa} linhas=${r.linhas_lidas} ${UF_FILTRO}=${r.linhas_filtradas_uf} raw+${r.raw_inseridas}/~${r.raw_tocadas} dw=${r.dw_inseridas}`);
  }

  console.log("\n══════ Resumo IDEB ══════");
  for (const r of resultados) {
    console.log(`  [${r.etapa} ${r.edicao}] ${r.arquivo}`);
    console.log(`     municípios processados: ${r.linhas_filtradas_uf}`);
    console.log(`     anos observados       : ${r.anos_observados.join(", ") || "—"}`);
    console.log(`     raw inseridas/tocadas : ${r.raw_inseridas}/${r.raw_tocadas}`);
    console.log(`     DW linhas inseridas   : ${r.dw_inseridas}`);
    if (r.erro) console.log(`     ✗ ERRO: ${r.erro}`);
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
       VALUES ('inep_ideb_municipios', $1, $2, $3, $4)`,
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
      console.error("[inep-ideb] Erro fatal:", (err as Error).message);
      closePgPool().catch(() => void 0);
      process.exit(1);
    });
}
