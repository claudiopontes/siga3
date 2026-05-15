import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { pgQuery, closePgPool } from "./connectors/postgres";

async function run() {
  const file = "250_ia_analise_processo_pauta.sql";
  const filePath = path.join(__dirname, "schema", "postgres", file);
  const sql = fs.readFileSync(filePath, "utf-8");
  console.log(`\n[migration] Executando ${file}...`);
  await pgQuery(sql);
  console.log(`[migration] OK — ${file}`);
}

run()
  .catch((err) => { console.error("[migration] ERRO:", err instanceof Error ? err.message : err); process.exit(1); })
  .finally(() => closePgPool());
