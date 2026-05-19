/**
 * _inspect-inep-headers.ts
 *
 * Diagnóstico ad-hoc: imprime header de:
 *  - 1 XLSX dentro de etl/data/inep/ideb-escolas/*.zip
 *  - O CSV de escolas dentro de etl/data/inep/censo/*.zip
 *
 * Sem persistência. Roda 1× para descobrir nomes reais das colunas e
 * ajustar os ingestors quando necessário.
 *
 * Uso: cd etl && npx ts-node jobs/_inspect-inep-headers.ts
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as readline from "readline";
import { spawnSync } from "child_process";
import * as XLSX from "xlsx";

function extrair(zipPath: string): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "inep-inspect-"));
  const r = spawnSync("tar", ["-xf", zipPath, "-C", tmp], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return tmp;
}

function listar(dir: string, regex: RegExp): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isFile() && regex.test(e.name)) out.push(f);
    if (e.isDirectory()) out.push(...listar(f, regex));
  }
  return out;
}

async function inspectXlsx(zipPath: string) {
  console.log(`\n══════ XLSX em ${path.basename(zipPath)} ══════`);
  const tmp = extrair(zipPath);
  try {
    const xlsxFiles = listar(tmp, /\.xlsx$/i);
    if (!xlsxFiles.length) { console.log("  (nenhum XLSX)"); return; }
    const wb = XLSX.readFile(xlsxFiles[0], { sheetRows: 15 });
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
    // Procura linha de header (que tenha "SG_UF" ou similar)
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const r = rows[i];
      if (Array.isArray(r) && r.some((c) => typeof c === "string" && /^(SG_UF|UF|SIGLA)$/i.test(c.trim()))) {
        console.log(`  Linha de header (#${i}):`);
        const headers = (r as unknown[]).map((c) => String(c ?? "")).slice(0, 30);
        headers.forEach((h, idx) => console.log(`    [${idx}] "${h}"`));
        console.log(`  Total colunas: ${(r as unknown[]).length}`);
        if (rows[i + 1]) {
          console.log(`  Primeira linha de dados (10 primeiras cols):`);
          (rows[i + 1] as unknown[]).slice(0, 10).forEach((c, idx) => console.log(`    [${idx}] ${JSON.stringify(c)}`));
        }
        return;
      }
    }
    console.log("  ⚠ Linha de header não encontrada nas 15 primeiras.");
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

async function inspectCsv(zipPath: string) {
  console.log(`\n══════ ZIP ${path.basename(zipPath)} ══════`);
  const tmp = extrair(zipPath);
  try {
    const csvs = listar(tmp, /\.csv$/i);
    if (!csvs.length) { console.log("  (nenhum CSV)"); return; }
    console.log(`  ${csvs.length} CSV(s) encontrados:`);
    for (const c of csvs) {
      console.log(`    • ${path.relative(tmp, c)} (${(fs.statSync(c).size / 1024 / 1024).toFixed(1)}MB)`);
    }

    // Para cada CSV, lê só a primeira linha (header) e procura colunas geo
    for (const csv of csvs) {
      console.log(`\n  ── Header de ${path.basename(csv)} ──`);
      const rl = readline.createInterface({
        input: fs.createReadStream(csv, { encoding: "latin1" }),
        crlfDelay: Infinity,
      });
      let primeiro = true;
      let dataLine: string | null = null;
      for await (const line of rl) {
        if (primeiro) {
          const sep = [";", "|", ",", "\t"].sort((a, b) => line.split(b).length - line.split(a).length)[0];
          console.log(`    Separador: "${sep === "\t" ? "\\t" : sep}"`);
          const cols = line.split(sep);
          console.log(`    Total colunas: ${cols.length}`);
          // FOCO: geo
          console.log(`    Colunas com 'lat|long|geo|coord':`);
          const geoIdx: number[] = [];
          cols.forEach((c, idx) => {
            if (/lat|long|geo|coord/i.test(c)) {
              console.log(`      [${idx}] "${c}"`);
              geoIdx.push(idx);
            }
          });
          if (!geoIdx.length) console.log(`      (nenhuma)`);

          // Outras palavras-chave
          console.log(`    Outras keywords (escola|entid|depend|local|porte|situac|endere|cnpj):`);
          cols.forEach((c, idx) => {
            if (/escola|entid|depend|local|porte|situac|endere|cnpj/i.test(c) && !geoIdx.includes(idx)) {
              console.log(`      [${idx}] "${c}"`);
            }
          });
          primeiro = false;
        } else {
          dataLine = line;
          break;
        }
      }
      rl.close();

      if (dataLine) {
        const sep = [";", "|", ",", "\t"].sort((a, b) => dataLine!.split(b).length - dataLine!.split(a).length)[0];
        const dataCols = dataLine.split(sep);
        // Tenta achar linhas com latitude/longitude lendo amostra extra
        console.log(`    Primeiras 5 colunas da linha 1 de dados: ${JSON.stringify(dataCols.slice(0, 5))}`);
      }
    }
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

async function main() {
  const idebDir  = path.resolve(__dirname, "../data/inep/ideb-escolas");
  const censoDir = path.resolve(__dirname, "../data/inep/censo");

  if (fs.existsSync(idebDir)) {
    const idebZips = fs.readdirSync(idebDir).filter((f) => /\.zip$/i.test(f));
    if (idebZips.length) await inspectXlsx(path.join(idebDir, idebZips[0]));
  }
  if (fs.existsSync(censoDir)) {
    const censoZips = fs.readdirSync(censoDir).filter((f) => /\.zip$/i.test(f)).sort();
    for (const z of censoZips) {
      await inspectCsv(path.join(censoDir, z));
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
