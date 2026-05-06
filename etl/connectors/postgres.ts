import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

let _pool: Pool | null = null;

function buildConfig() {
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const ssl = url.searchParams.get("sslmode");
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: ssl === "require" || ssl === "verify-full" ? { rejectUnauthorized: false } : false,
    };
  }
  const sslmode = process.env.PGSSLMODE ?? "disable";
  return {
    host: process.env.PGHOST ?? "localhost",
    port: Number(process.env.PGPORT ?? "5432"),
    database: process.env.PGDATABASE ?? "varadouro_digital",
    user: process.env.PGUSER ?? "varadouro",
    password: process.env.PGPASSWORD ?? "varadouro_dev",
    ssl: sslmode === "require" || sslmode === "verify-full" ? { rejectUnauthorized: false } : false,
  };
}

export function getPgPool(): Pool {
  if (!_pool) {
    _pool = new Pool(buildConfig());
    _pool.on("error", (err) => {
      console.error("[postgres] Erro inesperado no pool:", err.message);
    });
    const cfg = buildConfig() as Record<string, unknown>;
    const host = (cfg.host as string | undefined) ?? "(via DATABASE_URL)";
    console.log(`[postgres] Pool iniciado — host: ${host}, database: ${cfg.database ?? "(via DATABASE_URL)"}`);
  }
  return _pool;
}

export async function pgQuery<T extends QueryResultRow = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const result: QueryResult<T> = await getPgPool().query<T>(sql, params as unknown[] | undefined);
  return result.rows;
}

export async function withPgTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPgPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function closePgPool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
    console.log("[postgres] Pool encerrado.");
  }
}
