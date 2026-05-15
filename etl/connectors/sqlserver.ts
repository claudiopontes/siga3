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

// Pool principal (banco padrão do .env)
let pool: sql.ConnectionPool | null = null

// Cache de pools por banco alternativo — evita abrir/fechar conexão a cada lote
const dbPools = new Map<string, sql.ConnectionPool>()

// ---------------------------------------------------------------------------
// Retry com backoff exponencial para erros de rede transitórios
// ---------------------------------------------------------------------------

const RETRY_DELAYS_MS = [3000, 8000, 15000]

function ehErroTransitorio(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return (
    msg.includes('host não é conhecido') ||
    msg.includes('host não é') ||
    msg.includes('Connection timeout') ||
    msg.includes('Failed to connect') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('tempo limite') ||
    msg.includes('not known') ||
    msg.includes('network') ||
    msg.includes('Transport')
  )
}

async function comRetry<T>(fn: () => Promise<T>, contexto: string): Promise<T> {
  for (let tentativa = 0; tentativa <= RETRY_DELAYS_MS.length; tentativa++) {
    try {
      return await fn()
    } catch (err) {
      const isUltima = tentativa === RETRY_DELAYS_MS.length
      const isTransitorio = ehErroTransitorio(err)
      const msg = err instanceof Error ? err.message : String(err)

      if (isUltima || !isTransitorio) {
        console.error(`[sqlserver] ${contexto} — falha definitiva (tentativa ${tentativa + 1}): ${msg}`)
        throw err
      }

      const delay = RETRY_DELAYS_MS[tentativa]
      console.warn(`[sqlserver] ${contexto} — erro transitório (tentativa ${tentativa + 1}/${RETRY_DELAYS_MS.length + 1}): ${msg}`)
      console.warn(`[sqlserver] Aguardando ${delay}ms antes de reconectar...`)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw new Error('Unreachable')
}

// ---------------------------------------------------------------------------
// Pool principal
// ---------------------------------------------------------------------------

export async function getPool(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) return pool
  if (pool && !pool.connected) pool = null
  return comRetry(async () => {
    pool = await sql.connect(config)
    return pool
  }, 'getPool')
}

export async function query<T>(queryStr: string): Promise<T[]> {
  const p = await getPool()
  const result = await p.request().query(queryStr)
  return result.recordset as T[]
}

// ---------------------------------------------------------------------------
// Pool por banco alternativo (com reuso entre chamadas do mesmo job)
// ---------------------------------------------------------------------------

async function getDbPool(database: string): Promise<sql.ConnectionPool> {
  const existente = dbPools.get(database)
  if (existente?.connected) return existente

  // Descarta pool desconectado
  if (existente) {
    dbPools.delete(database)
    try { await existente.close() } catch { /* ignora */ }
  }

  return comRetry(async () => {
    const tmpPool = new sql.ConnectionPool({ ...config, database })
    await tmpPool.connect()
    dbPools.set(database, tmpPool)
    return tmpPool
  }, `getDbPool(${database})`)
}

export async function queryInDatabase<T>(database: string, queryStr: string): Promise<T[]> {
  return comRetry(async () => {
    const p = await getDbPool(database)
    try {
      const result = await p.request().query(queryStr)
      return result.recordset as T[]
    } catch (err) {
      // Se o pool falhou na execução da query, descarta para forçar reconexão na retry
      if (ehErroTransitorio(err)) {
        dbPools.delete(database)
        try { await p.close() } catch { /* ignora */ }
      }
      throw err
    }
  }, `queryInDatabase(${database})`)
}

// ---------------------------------------------------------------------------
// Fechamento de todos os pools
// ---------------------------------------------------------------------------

export async function closePool(): Promise<void> {
  const tarefas: Promise<void>[] = []

  if (pool) {
    tarefas.push(pool.close().catch((e) => console.warn('[sqlserver] Erro ao fechar pool principal:', e)))
    pool = null
  }

  for (const [db, p] of dbPools) {
    tarefas.push(p.close().catch((e) => console.warn(`[sqlserver] Erro ao fechar pool ${db}:`, e)))
  }
  dbPools.clear()

  await Promise.all(tarefas)
}
