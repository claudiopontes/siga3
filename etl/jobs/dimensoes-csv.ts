/**
 * ETL - Carga de dimensoes auxiliares via CSV
 * Fontes esperadas:
 *  - Dim Ente
 *  - Dim Entidade
 *  - Dim Municipios
 *  - Dim Uf
 */

import "dotenv/config";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getSupabase } from "../connectors/supabase";

type CsvRow = Record<string, string>;
type DimTable = "aux_dim_uf" | "aux_dim_municipio" | "aux_dim_ente" | "aux_dim_entidade";

type UfRow = {
  codigo: string;
  sigla: string | null;
  nome: string;
  dados: Record<string, string>;
  atualizado_em: string;
};

type MunicipioRow = {
  codigo: string;
  nome: string;
  uf_codigo: string | null;
  dados: Record<string, string>;
  atualizado_em: string;
};

type EnteRow = {
  codigo: string;
  nome: string;
  dados: Record<string, string>;
  atualizado_em: string;
};

type EntidadeRow = {
  codigo: string;
  nome: string;
  ente_codigo: string | null;
  municipio_codigo: string | null;
  uf_codigo: string | null;
  dados: Record<string, string>;
  atualizado_em: string;
};

const MODULO = "dimensoes_csv";
const supabase = getSupabase();

const DEFAULT_DIR = path.resolve(__dirname, "../data/dimensoes");

const FILES = {
  uf:
    process.env.DIM_UF_CSV ??
    path.join(DEFAULT_DIR, "dim_uf.csv"),
  municipio:
    process.env.DIM_MUNICIPIO_CSV ??
    path.join(DEFAULT_DIR, "dim_municipios.csv"),
  ente:
    process.env.DIM_ENTE_CSV ??
    path.join(DEFAULT_DIR, "dim_ente.csv"),
  entidade:
    process.env.DIM_ENTIDADE_CSV ??
    path.join(DEFAULT_DIR, "dim_entidade.csv"),
};
const DRY_RUN = process.argv.includes("--dry-run");
const AUTO_BOOTSTRAP_FROM_SUPABASE = (process.env.DIM_AUTO_BOOTSTRAP_FROM_SUPABASE ?? "true").toLowerCase() !== "false";

function normalizarHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function lerConteudoComFallback(filePath: string): { content: string; encoding: "utf8" | "latin1" } {
  const buffer = readFileSync(filePath);
  const utf8 = buffer.toString("utf8");
  if (!utf8.includes("\uFFFD")) {
    return { content: utf8, encoding: "utf8" };
  }
  return { content: buffer.toString("latin1"), encoding: "latin1" };
}

function detectDelimiter(firstLine: string): string {
  const options = [";", ",", "\t", "|"];
  let best = ",";
  let bestCount = -1;
  for (const option of options) {
    const count = firstLine.split(option).length;
    if (count > bestCount) {
      bestCount = count;
      best = option;
    }
  }
  return best;
}

function parseCsv(content: string): string[][] {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const firstLine = normalized.split("\n")[0] ?? "";
  const delimiter = detectDelimiter(firstLine);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    const nextChar = normalized[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(field.trim());
      field = "";
      continue;
    }

    if (!inQuotes && char === "\n") {
      row.push(field.trim());
      if (row.some((item) => item.length > 0)) {
        rows.push(row);
      }
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    if (row.some((item) => item.length > 0)) rows.push(row);
  }

  return rows;
}

function loadCsv(filePath: string): { rows: CsvRow[]; delimiter: string; encoding: "utf8" | "latin1" } {
  if (!existsSync(filePath)) {
    throw new Error(`Arquivo CSV nao encontrado: ${filePath}`);
  }
  const { content, encoding } = lerConteudoComFallback(filePath);
  const matrix = parseCsv(content);
  if (matrix.length < 2) return { rows: [], delimiter: ",", encoding };

  const headers = matrix[0].map(normalizarHeader);
  const delimiter = detectDelimiter(content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")[0] ?? "");
  const rows = matrix.slice(1).map((line) => {
    const row: CsvRow = {};
    headers.forEach((header, index) => {
      row[header] = line[index]?.trim() ?? "";
    });
    return row;
  });
  return { rows, delimiter, encoding };
}

async function selectAll<T extends Record<string, unknown>>(table: string, columns: string): Promise<T[]> {
  const out: T[] = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order("codigo", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(`Erro ao consultar ${table} no Supabase: ${error.message}`);
    }

    const batch = (data ?? []) as unknown as T[];
    out.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return out;
}

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",;\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function writeCsvFile(filePath: string, headers: string[], rows: Record<string, unknown>[]): void {
  const content = [headers.join(";")]
    .concat(rows.map((row) => headers.map((h) => escapeCsvValue(row[h])).join(";")))
    .join("\n")
    .concat("\n");
  writeFileSync(filePath, content, "utf8");
}

function requiredFilePaths(): string[] {
  return [FILES.uf, FILES.municipio, FILES.ente, FILES.entidade];
}

function missingCsvPaths(): string[] {
  return requiredFilePaths().filter((p) => !existsSync(p));
}

async function bootstrapCsvFromSupabase(): Promise<void> {
  mkdirSync(DEFAULT_DIR, { recursive: true });

  const [ufRows, municipioRows, enteRows, entidadeRows] = await Promise.all([
    selectAll<Record<string, unknown>>("aux_dim_uf", "codigo,sigla,nome"),
    selectAll<Record<string, unknown>>("aux_dim_municipio", "codigo,nome,uf_codigo"),
    selectAll<Record<string, unknown>>("aux_dim_ente", "codigo,nome"),
    selectAll<Record<string, unknown>>("aux_dim_entidade", "codigo,nome,ente_codigo,municipio_codigo,uf_codigo"),
  ]);

  const total = ufRows.length + municipioRows.length + enteRows.length + entidadeRows.length;
  if (total === 0) {
    throw new Error(
      "Bootstrap automatico de CSV falhou: tabelas aux_dim_* estao vazias no Supabase e nao ha CSV local.",
    );
  }

  writeCsvFile(FILES.uf, ["codigo", "sigla", "nome"], ufRows);
  writeCsvFile(FILES.municipio, ["codigo", "nome", "uf_codigo"], municipioRows);
  writeCsvFile(FILES.ente, ["codigo", "nome"], enteRows);
  writeCsvFile(FILES.entidade, ["codigo", "nome", "ente_codigo", "municipio_codigo", "uf_codigo"], entidadeRows);

  console.log(
    `  -> CSVs bootstrapados do Supabase em ${DEFAULT_DIR} (uf=${ufRows.length} municipio=${municipioRows.length} ente=${enteRows.length} entidade=${entidadeRows.length})`,
  );
}

function pick(row: CsvRow, aliases: string[]): string {
  for (const alias of aliases) {
    const value = row[alias];
    if (value && value.trim().length > 0) return value.trim();
  }
  return "";
}

function omitKeys(row: CsvRow, keys: string[]): Record<string, string> {
  const set = new Set(keys);
  const out: Record<string, string> = {};
  Object.entries(row).forEach(([k, v]) => {
    if (!set.has(k) && v !== "") out[k] = v;
  });
  return out;
}

function normalizeCode(value: string): string {
  return value.replace(/\D+/g, "");
}

function toUfRows(rows: CsvRow[], now: string): UfRow[] {
  return rows
    .map((row) => {
      const codigo = normalizeCode(
        pick(row, ["codigo", "cod_uf", "id_uf", "co_uf", "uf_codigo"]),
      );
      const nome = pick(row, ["nome", "nome_uf", "descricao", "ds_uf"]);
      const sigla = pick(row, ["sigla", "sg_uf", "uf"]);
      if (!codigo || !nome) return null;
      return {
        codigo,
        nome,
        sigla: sigla || null,
        dados: omitKeys(row, [
          "codigo",
          "cod_uf",
          "id_uf",
          "co_uf",
          "uf_codigo",
          "nome",
          "nome_uf",
          "descricao",
          "ds_uf",
          "sigla",
          "sg_uf",
          "uf",
        ]),
        atualizado_em: now,
      };
    })
    .filter((row): row is UfRow => row !== null);
}

function toMunicipioRows(rows: CsvRow[], now: string): MunicipioRow[] {
  return rows
    .map((row) => {
      const codigo = normalizeCode(
        pick(row, ["codigo", "cod_municipio", "id_municipio", "co_municipio", "cod_ibge"]),
      );
      const nome = pick(row, ["nome", "nome_municipio", "municipio", "descricao"]);
      const ufCodigo = pick(row, ["uf_codigo", "cod_uf", "co_uf", "id_uf", "codigo_uf"]);
      if (!codigo || !nome) return null;
      return {
        codigo,
        nome,
        uf_codigo: ufCodigo ? normalizeCode(ufCodigo) : null,
        dados: omitKeys(row, [
          "codigo",
          "cod_municipio",
          "id_municipio",
          "co_municipio",
          "cod_ibge",
          "nome",
          "nome_municipio",
          "municipio",
          "descricao",
          "uf_codigo",
          "cod_uf",
          "co_uf",
          "id_uf",
          "codigo_uf",
        ]),
        atualizado_em: now,
      };
    })
    .filter((row): row is MunicipioRow => row !== null);
}

function toEnteRows(rows: CsvRow[], now: string): EnteRow[] {
  return rows
    .map((row) => {
      const codigo = normalizeCode(
        pick(row, ["id_ente", "codigo", "cod_ente", "co_ente"]),
      );
      const nome = pick(row, ["nome", "nome_ente", "ente", "descricao"]);
      if (!codigo || !nome) return null;
      return {
        codigo,
        nome,
        dados: omitKeys(row, [
          "id_ente",
          "codigo",
          "cod_ente",
          "co_ente",
          "nome",
          "nome_ente",
          "ente",
          "descricao",
        ]),
        atualizado_em: now,
      };
    })
    .filter((row): row is EnteRow => row !== null);
}

function toEntidadeRows(rows: CsvRow[], now: string): EntidadeRow[] {
  return rows
    .map((row) => {
      const codigo = normalizeCode(
        pick(row, ["codigo", "cod_entidade", "id_entidade", "co_entidade"]),
      );
      const nome = pick(row, ["nome", "nome_entidade", "entidade", "descricao"]);
      const enteCodigo = pick(row, ["ente_codigo", "cod_ente", "id_ente", "co_ente"]);
      const municipioCodigo = pick(row, ["municipio_codigo", "cod_municipio", "id_municipio", "co_municipio", "cod_ibge"]);
      const ufCodigo = pick(row, ["uf_codigo", "cod_uf", "id_uf", "co_uf"]);
      if (!codigo || !nome) return null;
      return {
        codigo,
        nome,
        ente_codigo: enteCodigo ? normalizeCode(enteCodigo) : null,
        municipio_codigo: municipioCodigo ? normalizeCode(municipioCodigo) : null,
        uf_codigo: ufCodigo ? normalizeCode(ufCodigo) : null,
        dados: omitKeys(row, [
          "codigo",
          "cod_entidade",
          "id_entidade",
          "co_entidade",
          "nome",
          "nome_entidade",
          "entidade",
          "descricao",
          "ente_codigo",
          "cod_ente",
          "id_ente",
          "co_ente",
          "municipio_codigo",
          "cod_municipio",
          "id_municipio",
          "co_municipio",
          "cod_ibge",
          "uf_codigo",
          "cod_uf",
          "id_uf",
          "co_uf",
        ]),
        atualizado_em: now,
      };
    })
    .filter((row): row is EntidadeRow => row !== null);
}

function dedupeByCodigo<T extends { codigo: string }>(rows: T[], nome: string): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  let duplicados = 0;
  for (const row of rows) {
    if (!row.codigo || seen.has(row.codigo)) {
      duplicados += 1;
      continue;
    }
    seen.add(row.codigo);
    deduped.push(row);
  }
  if (duplicados > 0) {
    console.log(`  -> ${nome}: ${duplicados} registro(s) com codigo vazio/duplicado ignorados`);
  }
  return deduped;
}

async function limparTabela(tabela: string): Promise<void> {
  const { error } = await supabase.from(tabela).delete().neq("codigo", "__never__");
  if (error) throw new Error(`Erro ao limpar ${tabela}: ${error.message}`);
}

async function inserirLotes(tabela: string, dados: Record<string, unknown>[]): Promise<void> {
  if (dados.length === 0) return;
  const lote = 500;
  for (let i = 0; i < dados.length; i += lote) {
    const chunk = dados.slice(i, i + lote);
    const { error } = await supabase.from(tabela).insert(chunk);
    if (error) throw new Error(`Erro ao inserir em ${tabela}: ${error.message}`);
  }
}

async function gravarLog(
  status: "sucesso" | "erro",
  registros: number,
  duracaoMs: number,
  mensagem?: string,
): Promise<void> {
  await supabase.from("etl_log").insert({
    modulo: MODULO,
    status,
    mensagem: mensagem ?? null,
    registros,
    duracao_ms: duracaoMs,
  });
}

async function refreshTabela(tabela: DimTable, dados: Record<string, unknown>[]): Promise<void> {
  await inserirLotes(tabela, dados);
}

export async function executarCargaDimensoesCsv(): Promise<void> {
  const inicio = Date.now();
  const now = new Date().toISOString();
  console.log(`[${now}] Iniciando ETL: ${MODULO}${DRY_RUN ? " (dry-run)" : ""}`);
  try {
    const missing = missingCsvPaths();
    if (missing.length > 0) {
      if (!AUTO_BOOTSTRAP_FROM_SUPABASE) {
        throw new Error(`CSV(s) de dimensao ausente(s): ${missing.join(", ")}`);
      }
      console.log(`  -> CSV(s) ausente(s): ${missing.length}. Tentando bootstrap do Supabase...`);
      await bootstrapCsvFromSupabase();
    }

    console.log("  -> Lendo arquivos CSV...");
    const ufFile = loadCsv(FILES.uf);
    const municipioFile = loadCsv(FILES.municipio);
    const enteFile = loadCsv(FILES.ente);
    const entidadeFile = loadCsv(FILES.entidade);

    console.log(`  -> UF: delimiter=${ufFile.delimiter} encoding=${ufFile.encoding} rows=${ufFile.rows.length}`);
    console.log(`  -> Municipio: delimiter=${municipioFile.delimiter} encoding=${municipioFile.encoding} rows=${municipioFile.rows.length}`);
    console.log(`  -> Ente: delimiter=${enteFile.delimiter} encoding=${enteFile.encoding} rows=${enteFile.rows.length}`);
    console.log(`  -> Entidade: delimiter=${entidadeFile.delimiter} encoding=${entidadeFile.encoding} rows=${entidadeFile.rows.length}`);

    const ufRows = dedupeByCodigo(toUfRows(ufFile.rows, now), "UF");
    const municipioRows = dedupeByCodigo(toMunicipioRows(municipioFile.rows, now), "Municipio");
    const enteRows = dedupeByCodigo(toEnteRows(enteFile.rows, now), "Ente");
    const entidadeRows = dedupeByCodigo(toEntidadeRows(entidadeFile.rows, now), "Entidade");

    console.log(
      `  -> Registros parseados: uf=${ufRows.length} municipio=${municipioRows.length} ente=${enteRows.length} entidade=${entidadeRows.length}`,
    );
    console.log(
      `  -> Exemplos normalizacao: "17,00" => "${normalizeCode("17,00")}", "23.111" => "${normalizeCode("23.111")}", "1200401" => "${normalizeCode("1200401")}"`,
    );

    const total = ufRows.length + municipioRows.length + enteRows.length + entidadeRows.length;
    if (DRY_RUN) {
      const duracao = Date.now() - inicio;
      console.log(`  OK - Dry-run concluido em ${duracao}ms (${total} registros preparados)`);
      return;
    }

    console.log("  -> Atualizando Supabase (refresh completo por dimensao)...");
    // Ordem de carga para integridade: UF -> Municipio -> Ente -> Entidade
    await limparTabela("aux_dim_entidade");
    await limparTabela("aux_dim_municipio");
    await limparTabela("aux_dim_ente");
    await limparTabela("aux_dim_uf");

    await refreshTabela("aux_dim_uf", ufRows);
    await refreshTabela("aux_dim_municipio", municipioRows);
    await refreshTabela("aux_dim_ente", enteRows);
    await refreshTabela("aux_dim_entidade", entidadeRows);

    const duracao = Date.now() - inicio;
    console.log(`  OK - Dimensoes carregadas em ${duracao}ms (${total} registros)`);
    await gravarLog("sucesso", total, duracao);
  } catch (error) {
    const duracao = Date.now() - inicio;
    const mensagem = error instanceof Error ? error.message : String(error);
    console.error(`  ERRO - ${mensagem}`);
    await gravarLog("erro", 0, duracao, mensagem);
    throw error;
  }
}

if (require.main === module) {
  executarCargaDimensoesCsv().catch(() => process.exit(1));
}
