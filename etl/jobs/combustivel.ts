/**
 * ETL — Painel Combustível
 * Fonte: dbo.vw_NF_combustiveis (NF-e — dados reais de notas fiscais)
 * Destino: Supabase (tabelas agregadas)
 */

import { query, closePool } from '../connectors/sqlserver'
import { getSupabase } from '../connectors/supabase'

const supabase = getSupabase()
const MODULO = 'combustivel'
const SQL_EMITENTE_EXPR = `
COALESCE(
    NULLIF(LTRIM(RTRIM(NOME_FANTASIA_EMITENTE)) COLLATE DATABASE_DEFAULT, ''),
    NULLIF(LTRIM(RTRIM(RAZAO_SOCIAL_EMITENTE)) COLLATE DATABASE_DEFAULT, ''),
    'EMITENTE NAO INFORMADO' COLLATE DATABASE_DEFAULT
)
`

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface RowMensal {
  ano: number
  mes: number
  entidade: string
  emitente: string
  tipo_combustivel: string
  litros: number
  valor_total: number
  qtd_notas: number
}

interface RowEntidade {
  entidade: string
  litros: number
  valor_total: number
  qtd_notas: number
}

interface RowTipo {
  tipo_combustivel: string
  litros: number
  valor_total: number
  qtd_notas: number
}

interface RowEmitente {
  emitente: string
  litros: number
  valor_total: number
  qtd_notas: number
}

interface RowKpi {
  valor_total: number
  litros_total: number
  preco_medio: number
  total_entidades: number
  total_notas: number
  data_inicio: string
  data_fim: string
}

// ─── Queries SQL Server ───────────────────────────────────────────────────────

const SQL_MENSAL = `
SELECT
    ANO                          AS ano,
    MES                          AS mes,
    LTRIM(RTRIM(ENTIDADE))       AS entidade,
    ${SQL_EMITENTE_EXPR}         AS emitente,
    TIPO_COMBUSTIVEL             AS tipo_combustivel,
    SUM(QUANTIDADE)              AS litros,
    SUM(VALOR * QUANTIDADE)      AS valor_total,
    COUNT(*)                     AS qtd_notas
FROM dbo.vw_NF_combustiveis
GROUP BY
    ANO,
    MES,
    ENTIDADE,
    ${SQL_EMITENTE_EXPR},
    TIPO_COMBUSTIVEL
ORDER BY ANO, MES
`

const SQL_ENTIDADE = `
SELECT
    LTRIM(RTRIM(ENTIDADE))  AS entidade,
    SUM(QUANTIDADE)         AS litros,
    SUM(VALOR * QUANTIDADE) AS valor_total,
    COUNT(*)                AS qtd_notas
FROM dbo.vw_NF_combustiveis
GROUP BY ENTIDADE
ORDER BY valor_total DESC
`

const SQL_TIPO = `
SELECT
    TIPO_COMBUSTIVEL        AS tipo_combustivel,
    SUM(QUANTIDADE)         AS litros,
    SUM(VALOR * QUANTIDADE) AS valor_total,
    COUNT(*)                AS qtd_notas
FROM dbo.vw_NF_combustiveis
GROUP BY TIPO_COMBUSTIVEL
ORDER BY valor_total DESC
`

const SQL_EMITENTE = `
SELECT
    ${SQL_EMITENTE_EXPR} AS emitente,
    SUM(QUANTIDADE)         AS litros,
    SUM(VALOR * QUANTIDADE) AS valor_total,
    COUNT(*)                AS qtd_notas
FROM dbo.vw_NF_combustiveis
GROUP BY
    ${SQL_EMITENTE_EXPR}
ORDER BY valor_total DESC
`

const SQL_KPIS = `
SELECT
    SUM(VALOR * QUANTIDADE)                                           AS valor_total,
    SUM(QUANTIDADE)                                                   AS litros_total,
    CASE
        WHEN SUM(QUANTIDADE) > 0 THEN SUM(VALOR * QUANTIDADE) / SUM(QUANTIDADE)
        ELSE 0
    END                                                               AS preco_medio,
    COUNT(DISTINCT ID_ENTIDADE)                                       AS total_entidades,
    COUNT(*)                                                          AS total_notas,
    CONVERT(VARCHAR(10), MIN(DATA_EMISSAO), 23)                       AS data_inicio,
    CONVERT(VARCHAR(10), MAX(DATA_EMISSAO), 23)                       AS data_fim
FROM dbo.vw_NF_combustiveis
`

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function limparTabela(tabela: string): Promise<void> {
  const { error } = await supabase.from(tabela).delete().neq('id', 0)
  if (error) throw new Error(`Erro ao limpar ${tabela}: ${error.message}`)
}

async function inserir(tabela: string, dados: Record<string, unknown>[]): Promise<void> {
  if (dados.length === 0) return
  const tamanhoLote = 500
  for (let i = 0; i < dados.length; i += tamanhoLote) {
    const lote = dados.slice(i, i + tamanhoLote)
    const { error } = await supabase.from(tabela).insert(lote)
    if (error) throw new Error(`Erro ao inserir em ${tabela}: ${error.message}`)
  }
}

async function gravarLog(status: 'sucesso' | 'erro', registros: number, duracao: number, mensagem?: string) {
  await supabase.from('etl_log').insert({
    modulo: MODULO,
    status,
    mensagem: mensagem ?? null,
    registros,
    duracao_ms: duracao,
  })
}

// ─── Job principal ────────────────────────────────────────────────────────────

export async function executarETLCombustivel(): Promise<void> {
  const inicio = Date.now()
  console.log(`[${new Date().toISOString()}] Iniciando ETL: ${MODULO}`)

  try {
    // 1. Buscar dados no SQL Server
    console.log('  → Consultando SQL Server...')
    const [mensal, entidade, tipo, emitente, kpis] = await Promise.all([
      query<RowMensal>(SQL_MENSAL),
      query<RowEntidade>(SQL_ENTIDADE),
      query<RowTipo>(SQL_TIPO),
      query<RowEmitente>(SQL_EMITENTE),
      query<RowKpi>(SQL_KPIS),
    ])

    console.log(`  → Registros: mensal=${mensal.length} | entidade=${entidade.length} | tipo=${tipo.length} | emitente=${emitente.length}`)

    // 2. Limpar e reinserir (substituição total)
    console.log('  → Atualizando Supabase...')
    const agora = new Date().toISOString()

    await Promise.all([
      limparTabela('combustivel_mensal'),
      limparTabela('combustivel_entidade'),
      limparTabela('combustivel_tipo'),
      limparTabela('combustivel_emitente'),
      limparTabela('combustivel_kpis'),
    ])

    await Promise.all([
      inserir('combustivel_mensal',   mensal.map(r   => ({ ...r, atualizado_em: agora }))),
      inserir('combustivel_entidade', entidade.map(r => ({ ...r, atualizado_em: agora }))),
      inserir('combustivel_tipo',     tipo.map(r     => ({ ...r, atualizado_em: agora }))),
      inserir('combustivel_emitente', emitente.map(r => ({ ...r, atualizado_em: agora }))),
    ])

    if (kpis.length > 0) {
      await inserir('combustivel_kpis', [{ ...kpis[0], atualizado_em: agora }])
    }

    const duracao = Date.now() - inicio
    const total = mensal.length + entidade.length + tipo.length + emitente.length
    console.log(`  ✓ Concluído em ${duracao}ms — ${total} registros gravados`)
    await gravarLog('sucesso', total, duracao)

  } catch (err) {
    const duracao = Date.now() - inicio
    const mensagem = err instanceof Error ? err.message : String(err)
    console.error(`  ✗ Erro: ${mensagem}`)
    await gravarLog('erro', 0, duracao, mensagem)
    throw err

  } finally {
    await closePool()
  }
}

// Execução direta
if (require.main === module) {
  executarETLCombustivel().catch(() => process.exit(1))
}
