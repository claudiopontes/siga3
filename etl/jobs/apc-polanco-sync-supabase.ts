/**
 * ETL - Sincronizacao APC Polanco (SQL Server -> Supabase)
 * Fonte: APC.dbo.tb_despesa_combustivel_polanco
 * Destino: Supabase.tb_despesa_combustivel_polanco
 */

import "dotenv/config";
import { queryInDatabase } from "../connectors/sqlserver";
import { getSupabase } from "../connectors/supabase";

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

const MODULO = "apc_polanco_sync_supabase";
const APC_DATABASE = process.env.SQLSERVER_APC_DATABASE || "APC";
const SUPABASE_TABLE = process.env.APC_POLANCO_SUPABASE_TABLE || "tb_despesa_combustivel_polanco";
const SQL_PAGE_SIZE = Number(process.env.APC_POLANCO_SYNC_SQL_PAGE_SIZE || "2000");
const SUPABASE_INSERT_BATCH = Number(process.env.APC_POLANCO_SYNC_SUPABASE_BATCH || "500");

const supabase = getSupabase();

function toPosInt(input: number, fallback: number): number {
  if (!Number.isFinite(input) || input < 1) return fallback;
  return Math.trunc(input);
}

async function gravarLog(status: "sucesso" | "erro", registros: number, duracao: number, mensagem?: string) {
  await supabase.from("etl_log").insert({
    modulo: MODULO,
    status,
    mensagem: mensagem ?? null,
    registros,
    duracao_ms: duracao,
  });
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

async function limparDestino(): Promise<void> {
  const { error } = await supabase.from(SUPABASE_TABLE).delete().neq("id_despesa", -1);
  if (error) {
    if (error.message.toLowerCase().includes("schema cache")) {
      throw new Error(
        `Destino Supabase ainda nao pronto para escrita (${SUPABASE_TABLE}). ` +
          `Aplique o schema em etl/schema/supabase_apc_despesa_combustivel_polanco.sql e aguarde o refresh de schema cache. ` +
          `Detalhe: ${error.message}`,
      );
    }
    throw new Error(`Erro ao limpar ${SUPABASE_TABLE}: ${error.message}`);
  }
}

async function validarDestino(): Promise<void> {
  const { error } = await supabase.from(SUPABASE_TABLE).select("id_despesa", { head: true, count: "exact" });
  if (error) {
    throw new Error(
      `Tabela destino indisponivel no Supabase (${SUPABASE_TABLE}). ` +
        `Aplique o schema em etl/schema/supabase_apc_despesa_combustivel_polanco.sql. ` +
        `Detalhe: ${error.message}`,
    );
  }
}

async function inserirEmLotes(rows: SqlRow[], batchSize: number): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from(SUPABASE_TABLE).insert(batch);
    if (error) throw new Error(`Erro ao inserir lote no Supabase: ${error.message}`);
  }
}

export async function executarSyncApcPolancoSupabase(): Promise<void> {
  const inicio = Date.now();
  const sqlPageSize = toPosInt(SQL_PAGE_SIZE, 2000);
  const insertBatch = toPosInt(SUPABASE_INSERT_BATCH, 500);

  console.log(`[${new Date().toISOString()}] Iniciando ETL: ${MODULO}`);
  console.log(`  -> Fonte SQL: ${APC_DATABASE}.dbo.tb_despesa_combustivel_polanco`);
  console.log(`  -> Destino Supabase: ${SUPABASE_TABLE}`);

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
  executarSyncApcPolancoSupabase().catch(() => process.exit(1));
}
