import 'dotenv/config'
import sql from 'mssql/msnodesqlv8'

const config: sql.config = {
  server:   process.env.SQLSERVER_HOST!,
  database: process.env.SQLSERVER_DATABASE!,
  port:     parseInt(process.env.SQLSERVER_PORT || '1433'),
  options: {
    trustedConnection:      true,
    trustServerCertificate: true,
    encrypt:                false,
  },
  connectionTimeout: 30000,
  requestTimeout:    120000,
}

let pool: sql.ConnectionPool | null = null

export async function getPool(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) return pool
  pool = await sql.connect(config)
  return pool
}

export async function query<T>(queryStr: string): Promise<T[]> {
  const p = await getPool()
  const result = await p.request().query(queryStr)
  return result.recordset as T[]
}

export async function queryInDatabase<T>(database: string, queryStr: string): Promise<T[]> {
  const tmpConfig: sql.config = {
    ...config,
    database,
  }

  const tmpPool = new sql.ConnectionPool(tmpConfig)
  await tmpPool.connect()
  try {
    const result = await tmpPool.request().query(queryStr)
    return result.recordset as T[]
  } finally {
    await tmpPool.close()
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.close()
    pool = null
  }
}
