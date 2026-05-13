/**
 * ETL - Sincronizacao APC Polanco (SQL Server -> PostgreSQL)
 * Fonte: APC.dbo.tb_despesa_combustivel_polanco
 * Destino: public.tb_despesa_combustivel_polanco
 */

import "dotenv/config";
import { queryInDatabase } from "../connectors/sqlserver";
import { pgQuery, closePgPool } from "../connectors/postgres";

type SqlRow = {
  id_despesa: number;
  id_entidade: number | null;
  entidade: string | null;
  ano_empenho: number | null;
  data_empenho: string | null;
  numero_empenho: string | null;
  historico_empenho: string | null;
  credor: string | null;
  nome_credor: string | null;
  numero_elemento_despesa: string | null;
  elemento_despesa: string | null;
  numero_funcao: string | null;
  funcao: string | null;
  numero_subfuncao: string | null;
  subfuncao: string | null;
  valor_empenho: number | null;
  valor_liquidado: number | null;
  eh_combustivel: boolean | number;
  tipo_combustivel: string;
  forma_fornecimento: string;
  regra_match: string;
  dt_carga_etl: string;
};

type CountRow = { total: number };

const MODULO = "combustivel_empenho_apc";
const APC_DATABASE = process.env.SQLSERVER_APC_DATABASE || "APC";
const PG_TABLE = process.env.APC_POLANCO_SUPABASE_TABLE || "tb_despesa_combustivel_polanco";
const SQL_PAGE_SIZE = Number(process.env.APC_POLANCO_SYNC_SQL_PAGE_SIZE || "2000");
const PG_INSERT_BATCH = Number(process.env.APC_POLANCO_SYNC_SUPABASE_BATCH || "500");

function toPosInt(input: number, fallback: number): number {
  if (!Number.isFinite(input) || input < 1) return fallback;
  return Math.trunc(input);
}

async function gravarLog(status: "sucesso" | "erro", registros: number, duracao: number, mensagem?: string) {
  await pgQuery(
    `INSERT INTO audit.etl_log (modulo, status, registros, duracao_ms, mensagem)
     VALUES ($1, $2, $3, $4, $5)`,
    [MODULO, status, registros, duracao, mensagem ?? null],
  );
}

async function validarDestino(): Promise<void> {
  const rows = await pgQuery<{ existe: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS existe`,
    [PG_TABLE],
  );
  if (!rows[0]?.existe) {
    throw new Error(
      `Tabela destino não encontrada no PostgreSQL: public.${PG_TABLE}. ` +
      `Execute: npm run postgres:migrate`,
    );
  }
}

async function limparDestino(): Promise<void> {
  await pgQuery(`DELETE FROM public.${PG_TABLE}`);
}

async function carregarPagina(offset: number, pageSize: number): Promise<SqlRow[]> {
  const sql = `
SELECT
  ID_DESPESA              AS id_despesa,
  ID_ENTIDADE             AS id_entidade,
  ENTIDADE                AS entidade,
  ANO_EMPENHO             AS ano_empenho,
  CONVERT(VARCHAR(10), DATA_EMPENHO, 23) AS data_empenho,
  NUMERO_EMPENHO          AS numero_empenho,
  HISTORICO_EMPENHO       AS historico_empenho,
  CREDOR                  AS credor,
  NOME_CREDOR             AS nome_credor,
  NUMERO_ELEMENTO_DESPESA AS numero_elemento_despesa,
  ELEMENTO_DESPESA        AS elemento_despesa,
  NUMERO_FUNCAO           AS numero_funcao,
  FUNCAO                  AS funcao,
  NUMERO_SUBFUNCAO        AS numero_subfuncao,
  SUBFUNCAO               AS subfuncao,
  VALOR_EMPENHO           AS valor_empenho,
  VALOR_LIQUIDADO         AS valor_liquidado,
  EH_COMBUSTIVEL          AS eh_combustivel,
  TIPO_COMBUSTIVEL        AS tipo_combustivel,
  FORMA_FORNECIMENTO      AS forma_fornecimento,
  REGRA_MATCH             AS regra_match,
  CONVERT(VARCHAR(33), DT_CARGA_ETL, 127) AS dt_carga_etl
FROM dbo.tb_despesa_combustivel_polanco
ORDER BY ID_DESPESA
OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY;
`;
  return queryInDatabase<SqlRow>(APC_DATABASE, sql);
}

async function inserirEmLotes(rows: SqlRow[], batchSize: number): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    for (const r of batch) {
      await pgQuery(
        `INSERT INTO public.${PG_TABLE} (
           id_despesa, id_entidade, entidade, ano_empenho, data_empenho,
           numero_empenho, historico_empenho, credor, nome_credor,
           numero_elemento_despesa, elemento_despesa, numero_funcao, funcao,
           numero_subfuncao, subfuncao, valor_empenho, valor_liquidado,
           eh_combustivel, tipo_combustivel, forma_fornecimento, regra_match, dt_carga_etl
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
         )
         ON CONFLICT (id_despesa) DO UPDATE SET
           id_entidade             = EXCLUDED.id_entidade,
           entidade                = EXCLUDED.entidade,
           ano_empenho             = EXCLUDED.ano_empenho,
           data_empenho            = EXCLUDED.data_empenho,
           numero_empenho          = EXCLUDED.numero_empenho,
           historico_empenho       = EXCLUDED.historico_empenho,
           credor                  = EXCLUDED.credor,
           nome_credor             = EXCLUDED.nome_credor,
           numero_elemento_despesa = EXCLUDED.numero_elemento_despesa,
           elemento_despesa        = EXCLUDED.elemento_despesa,
           numero_funcao           = EXCLUDED.numero_funcao,
           funcao                  = EXCLUDED.funcao,
           numero_subfuncao        = EXCLUDED.numero_subfuncao,
           subfuncao               = EXCLUDED.subfuncao,
           valor_empenho           = EXCLUDED.valor_empenho,
           valor_liquidado         = EXCLUDED.valor_liquidado,
           eh_combustivel          = EXCLUDED.eh_combustivel,
           tipo_combustivel        = EXCLUDED.tipo_combustivel,
           forma_fornecimento      = EXCLUDED.forma_fornecimento,
           regra_match             = EXCLUDED.regra_match,
           dt_carga_etl            = EXCLUDED.dt_carga_etl`,
        [
          r.id_despesa, r.id_entidade, r.entidade, r.ano_empenho, r.data_empenho,
          r.numero_empenho, r.historico_empenho, r.credor, r.nome_credor,
          r.numero_elemento_despesa, r.elemento_despesa, r.numero_funcao, r.funcao,
          r.numero_subfuncao, r.subfuncao, r.valor_empenho, r.valor_liquidado,
          typeof r.eh_combustivel === "number" ? r.eh_combustivel === 1 : r.eh_combustivel,
          r.tipo_combustivel, r.forma_fornecimento, r.regra_match, r.dt_carga_etl,
        ],
      );
    }
  }
}

export async function executarSyncApcPolancoSupabase(): Promise<void> {
  const inicio = Date.now();
  const sqlPageSize = toPosInt(SQL_PAGE_SIZE, 2000);
  const insertBatch = toPosInt(PG_INSERT_BATCH, 500);

  console.log(`[${new Date().toISOString()}] Iniciando ETL: ${MODULO}`);
  console.log(`  -> Fonte SQL: ${APC_DATABASE}.dbo.tb_despesa_combustivel_polanco`);
  console.log(`  -> Destino PostgreSQL: public.${PG_TABLE}`);

  try {
    await validarDestino();

    const [{ total }] = await queryInDatabase<CountRow>(
      APC_DATABASE,
      "SELECT COUNT(1) AS total FROM dbo.tb_despesa_combustivel_polanco",
    );

    console.log(`  -> Total na fonte SQL: ${total}`);
    console.log("  -> Limpando tabela de destino...");
    await limparDestino();

    let offset = 0;
    let inseridos = 0;
    while (offset < total) {
      const rows = await carregarPagina(offset, sqlPageSize);
      if (rows.length === 0) break;
      await inserirEmLotes(rows, insertBatch);
      inseridos += rows.length;
      offset += rows.length;
      console.log(`  -> Progresso: ${inseridos}/${total}`);
    }

    console.log("  -> Atualizando tabela agregada combustivel_empenho_mensal...");
    await pgQuery("SELECT fn_refresh_combustivel_empenho_mensal()");

    const duracao = Date.now() - inicio;
    console.log(`  OK - Sync concluido em ${duracao}ms (${inseridos} registros)`);
    await gravarLog("sucesso", inseridos, duracao);
  } catch (error) {
    const duracao = Date.now() - inicio;
    const mensagem = error instanceof Error ? error.message : String(error);
    console.error(`  ERRO - ${mensagem}`);
    await gravarLog("erro", 0, duracao, mensagem);
    throw error;
  }
}

if (require.main === module) {
  executarSyncApcPolancoSupabase()
    .catch(() => process.exit(1))
    .finally(() => closePgPool());
}
