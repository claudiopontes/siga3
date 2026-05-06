import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { withPgTransaction, closePgPool } from "../connectors/postgres";

const SCHEMA_DIR = path.resolve(__dirname, "../schema/postgres");

async function main() {
  const arquivos = fs
    .readdirSync(SCHEMA_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (arquivos.length === 0) {
    console.log("[postgres-migrate] Nenhum arquivo SQL encontrado em", SCHEMA_DIR);
    return;
  }

  for (const arquivo of arquivos) {
    const caminho = path.join(SCHEMA_DIR, arquivo);
    const sql = fs.readFileSync(caminho, "utf-8");
    console.log(`[postgres-migrate] Aplicando ${arquivo}...`);
    try {
      await withPgTransaction(async (client) => {
        await client.query(sql);
      });
      console.log(`[postgres-migrate] ✓ ${arquivo} aplicado com sucesso.`);
    } catch (err) {
      console.error(`[postgres-migrate] ✗ Erro ao aplicar ${arquivo}:`, (err as Error).message);
      throw err;
    }
  }

  console.log("[postgres-migrate] Todos os schemas aplicados.");
  await closePgPool();
}

main().catch((err) => {
  console.error("[postgres-migrate] Falha:", (err as Error).message);
  process.exit(1);
});
