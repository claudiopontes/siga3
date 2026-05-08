import { Pool, QueryResultRow } from "pg";

let _pool: Pool | null = null;

export function getDb(): Pool {
  if (!_pool) {
    if (process.env.DATABASE_URL) {
      _pool = new Pool({ connectionString: process.env.DATABASE_URL });
    } else {
      _pool = new Pool({
        host: process.env.PGHOST ?? "localhost",
        port: Number(process.env.PGPORT ?? "5432"),
        database: process.env.PGDATABASE ?? "varadouro_digital",
        user: process.env.PGUSER ?? "varadouro",
        password: process.env.PGPASSWORD,
      });
    }
  }
  return _pool;
}

export async function dbQuery<T extends QueryResultRow = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await getDb().query<T>(sql, params as unknown[]);
  return result.rows;
}
