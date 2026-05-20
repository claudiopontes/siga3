import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { getPgPool, withPgTransaction, closePgPool } from "../connectors/postgres";

const SCHEMA_DIR = path.resolve(__dirname, "../schema/postgres");
const HEALTHCHECK_TIMEOUT_MS = Number(process.env.MIGRATE_HEALTHCHECK_TIMEOUT_MS || "10000");
const STATEMENT_TIMEOUT_MS = Number(process.env.MIGRATE_STATEMENT_TIMEOUT_MS || "300000"); // 5 min por migration

// Logger com flush imediato — evita perceber "sessão travada" por buffer de stdout.
function log(msg: string): void {
  process.stdout.write(`${msg}\n`);
}
function logErr(msg: string): void {
  process.stderr.write(`${msg}\n`);
}

async function healthcheckPostgres(): Promise<void> {
  log(`[postgres-migrate] Testando conexão (timeout ${HEALTHCHECK_TIMEOUT_MS}ms)...`);
  const pool = getPgPool();

  const tentativa = pool.query("SELECT 1 AS ok");
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`Healthcheck do Postgres não respondeu em ${HEALTHCHECK_TIMEOUT_MS}ms`)),
      HEALTHCHECK_TIMEOUT_MS,
    ),
  );
  await Promise.race([tentativa, timeout]);
  log(`[postgres-migrate] ✓ Conexão OK.`);
}

async function main() {
  const t0 = Date.now();
  log(`[postgres-migrate] Iniciando em ${new Date().toISOString()}`);
  log(`[postgres-migrate] Diretório de schemas: ${SCHEMA_DIR}`);

  const arquivos = fs
    .readdirSync(SCHEMA_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (arquivos.length === 0) {
    log(`[postgres-migrate] Nenhum arquivo SQL encontrado.`);
    return;
  }

  log(`[postgres-migrate] ${arquivos.length} arquivo(s) a aplicar.`);

  await healthcheckPostgres();

  for (let i = 0; i < arquivos.length; i++) {
    const arquivo = arquivos[i];
    const caminho = path.join(SCHEMA_DIR, arquivo);
    const sql = fs.readFileSync(caminho, "utf-8");
    const inicio = Date.now();

    log(`[postgres-migrate] (${i + 1}/${arquivos.length}) Aplicando ${arquivo}...`);
    try {
      await withPgTransaction(async (client) => {
        // Limita tempo individual da migration para não travar a sessão indefinidamente.
        await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
        await client.query(sql);
      });
      const dur = Date.now() - inicio;
      log(`[postgres-migrate] ✓ ${arquivo} aplicado em ${dur} ms.`);
    } catch (err) {
      const dur = Date.now() - inicio;
      logErr(`[postgres-migrate] ✗ Erro em ${arquivo} após ${dur} ms: ${(err as Error).message}`);
      throw err;
    }
  }

  const dur = Date.now() - t0;
  log(`[postgres-migrate] Todos os schemas aplicados em ${dur} ms.`);
  await closePgPool();
}

main().catch(async (err) => {
  logErr(`[postgres-migrate] Falha: ${(err as Error).message}`);
  await closePgPool().catch(() => void 0);
  process.exit(1);
});
