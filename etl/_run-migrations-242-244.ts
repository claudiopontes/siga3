import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { pgQuery, closePgPool } from "./connectors/postgres";

const MIGRATIONS = [
  "242_pauta_julgamento_enrich.sql",
  "243_pauta_julgamento_arquivo.sql",
  "244_pauta_julgamento_movimentacao.sql",
];

async function run() {
  for (const file of MIGRATIONS) {
    const filePath = path.join(__dirname, "schema", "postgres", file);
    const sql = fs.readFileSync(filePath, "utf-8");
    console.log(`\n[migration] Executando ${file}...`);
    try {
      await pgQuery(sql);
      console.log(`[migration] OK — ${file}`);
    } catch (err) {
      console.error(`[migration] ERRO em ${file}:`, err instanceof Error ? err.message : err);
      throw err;
    }
  }
  console.log("\n[migration] Todas as migrations concluídas.");
}

run()
  .catch(() => process.exit(1))
  .finally(() => closePgPool());
