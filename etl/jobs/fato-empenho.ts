/**
 * ETL - Fato Empenho
 * Fonte: vw_fato_empenho_polanco (SQL Server - APC)
 * Destino: Supabase.fato_empenho
 */

import "dotenv/config";
import { queryInDatabase } from "../connectors/sqlserver";
import { getSupabase } from "../connectors/supabase";

type ModoCarga = "FULL" | "INCREMENTAL";

type Remessa = {
  ano_remessa: number;
  numero_remessa: number;
};

type EmpenhoRow = {
  id_despesa: number;
  id_remessa: number;
  ano_remessa: number;
  numero_remessa: number;
  id_entidade: number;
  id_acao: number | null;
  id_programa: number | null;
  id_unidade_orcamentaria: number | null;
  id_fonte_destinacao_recurso: number | null;
  id_aplicacao: number | null;
  numero_funcao: number | null;
  numero_subfuncao: number | null;
  numero_categoria_economica: number | null;
  numero_grupo_natureza_despesa: number | null;
  numero_modalidade_aplicacao: number | null;
  numero_elemento_despesa: number | null;
  cpf_cnpj_credor: string | null;
  tipo_credor: number | null;
  numero_empenho: number | null;
  ano_empenho: number | null;
  data_empenho: string | null;
  tipo_empenho: string | null;
  numero_empenho_ref: number | null;
  tipo_lancamento: string | null;
  historico_empenho: string | null;
  valor_empenho: number;
  valor_anulado: number;
  valor_liquidado: number;
  valor_pago: number;
  valor_retido: number;
  valor_empenhado_liquido: number;
  valor_a_liquidar: number;
  valor_a_pagar: number;
  etl_atualizado_em: string;
};

const MODULO = "fato_empenho";
const supabase = getSupabase();

const SQL_DATABASE = process.env.FATO_EMPENHO_SQLSERVER_DATABASE || process.env.SQLSERVER_APC_DATABASE || "APC";
const SOURCE_VIEW = process.env.FATO_EMPENHO_SOURCE_VIEW || "audit.vw_fato_empenho_polanco";
const SUPABASE_TABLE = process.env.FATO_EMPENHO_SUPABASE_TABLE || "fato_empenho";
const MODO_CARGA = normalizeModo(process.env.FATO_EMPENHO_MODO_CARGA || "INCREMENTAL");
const LOOKBACK_REMESSAS = toPositiveInt(Number(process.env.FATO_EMPENHO_LOOKBACK_REMESSAS || "3"), 3);
const SUPABASE_UPSERT_BATCH = toPositiveInt(Number(process.env.FATO_EMPENHO_SUPABASE_BATCH || "500"), 500);

function normalizeModo(value: string): ModoCarga {
  return value.toUpperCase() === "FULL" ? "FULL" : "INCREMENTAL";
}

function toPositiveInt(input: number, fallback: number): number {
  if (!Number.isFinite(input) || input < 1) return fallback;
  return Math.trunc(input);
}

function assertSafeSqlIdentifier(identifier: string): void {
  if (!/^[A-Za-z0-9_\].\[]+$/.test(identifier)) {
    throw new Error(`Identificador SQL invalido em FATO_EMPENHO_SOURCE_VIEW: ${identifier}`);
  }
}

function chaveRemessa(r: Remessa): number {
  return r.ano_remessa * 10000 + r.numero_remessa;
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

async function validarDestino(): Promise<void> {
  const { error } = await supabase.from(SUPABASE_TABLE).select("id_despesa").limit(1);
  if (error) {
    throw new Error(
      `Tabela destino indisponivel no Supabase (${SUPABASE_TABLE}). ` +
        "Aplique o schema em etl/schema/fato_empenho.sql. " +
        `Detalhe: ${error.message}`,
    );
  }
}

async function buscarRemessasFonte(): Promise<Remessa[]> {
  assertSafeSqlIdentifier(SOURCE_VIEW);

  const sql = `
SELECT DISTINCT ANO_REMESSA AS ano_remessa, NUMERO_REMESSA AS numero_remessa
FROM ${SOURCE_VIEW}
ORDER BY ANO_REMESSA, NUMERO_REMESSA;
`;
  return queryInDatabase<Remessa>(SQL_DATABASE, sql);
}

async function buscarUltimaRemessaDestino(): Promise<Remessa | null> {
  const { data, error } = await supabase
    .from(SUPABASE_TABLE)
    .select("ano_remessa,numero_remessa")
    .order("ano_remessa", { ascending: false })
    .order("numero_remessa", { ascending: false })
    .limit(1);

  if (error) throw new Error(`Erro ao consultar ultima remessa no Supabase: ${error.message}`);
  if (!data || data.length === 0) return null;

  const row = data[0] as Remessa;
  return { ano_remessa: row.ano_remessa, numero_remessa: row.numero_remessa };
}

async function escolherRemessasCarga(): Promise<Remessa[]> {
  const remessasFonte = await buscarRemessasFonte();
  if (remessasFonte.length === 0) return [];
  if (MODO_CARGA === "FULL") return remessasFonte;

  const ultimaDestino = await buscarUltimaRemessaDestino();
  if (!ultimaDestino) return remessasFonte;

  // Seleciona as últimas LOOKBACK_REMESSAS remessas a partir da última carregada
  const chaveUltima = chaveRemessa(ultimaDestino);
  const remessasOrdenadas = remessasFonte.filter((r) => chaveRemessa(r) >= chaveUltima);

  // Garante ao menos o lookback configurado contando a partir do final
  if (remessasOrdenadas.length > LOOKBACK_REMESSAS) {
    return remessasOrdenadas.slice(remessasOrdenadas.length - LOOKBACK_REMESSAS);
  }
  return remessasOrdenadas;
}

async function carregarRemessa(remessa: Remessa, agora: string): Promise<EmpenhoRow[]> {
  const sql = `
SELECT
  ID_DESPESA                    AS id_despesa,
  ID_REMESSA                    AS id_remessa,
  ANO_REMESSA                   AS ano_remessa,
  NUMERO_REMESSA                AS numero_remessa,
  ID_ENTIDADE                   AS id_entidade,
  ID_ACAO                       AS id_acao,
  ID_PROGRAMA                   AS id_programa,
  ID_UNIDADE_ORCAMENTARIA       AS id_unidade_orcamentaria,
  ID_FONTE_DESTINACAO_RECURSO   AS id_fonte_destinacao_recurso,
  ID_APLICACAO                  AS id_aplicacao,
  NUMERO_FUNCAO                 AS numero_funcao,
  NUMERO_SUBFUNCAO              AS numero_subfuncao,
  NUMERO_CATEGORIA_ECONOMICA    AS numero_categoria_economica,
  NUMERO_GRUPO_NATUREZA_DESPESA AS numero_grupo_natureza_despesa,
  NUMERO_MODALIDADE_APLICACAO   AS numero_modalidade_aplicacao,
  NUMERO_ELEMENTO_DESPESA       AS numero_elemento_despesa,
  CPF_CNPJ_CREDOR               AS cpf_cnpj_credor,
  TIPO_CREDOR                   AS tipo_credor,
  NUMERO_EMPENHO                AS numero_empenho,
  ANO_EMPENHO                   AS ano_empenho,
  DATA_EMPENHO                  AS data_empenho,
  LEFT(TIPO_EMPENHO, 1)         AS tipo_empenho,
  NUMERO_EMPENHO_REF            AS numero_empenho_ref,
  TIPO_LANCAMENTO               AS tipo_lancamento,
  HISTORICO_EMPENHO             AS historico_empenho,
  VALOR_EMPENHO                 AS valor_empenho,
  VALOR_ANULADO                 AS valor_anulado,
  VALOR_LIQUIDADO               AS valor_liquidado,
  VALOR_PAGO                    AS valor_pago,
  VALOR_RETIDO                  AS valor_retido,
  VALOR_EMPENHADO_LIQUIDO       AS valor_empenhado_liquido,
  VALOR_A_LIQUIDAR              AS valor_a_liquidar,
  VALOR_A_PAGAR                 AS valor_a_pagar,
  '${agora}'                    AS etl_atualizado_em
FROM ${SOURCE_VIEW}
WHERE ANO_REMESSA = ${remessa.ano_remessa} AND NUMERO_REMESSA = ${remessa.numero_remessa}
ORDER BY ID_DESPESA;
`;
  return queryInDatabase<EmpenhoRow>(SQL_DATABASE, sql);
}

async function upsertEmLotes(rows: EmpenhoRow[], batchSize: number): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase
      .from(SUPABASE_TABLE)
      .upsert(batch, { onConflict: "id_despesa" });
    if (error) throw new Error(`Erro ao fazer upsert no Supabase (lote ${i / batchSize + 1}): ${error.message}`);
  }
}

export async function executarETLFatoEmpenho(): Promise<void> {
  const inicio = Date.now();
  console.log(`[${new Date().toISOString()}] Iniciando ETL: ${MODULO}`);
  console.log(`  -> Fonte SQL: ${SQL_DATABASE}.${SOURCE_VIEW}`);
  console.log(`  -> Destino Supabase: ${SUPABASE_TABLE}`);
  console.log(
    `  -> Modo: ${MODO_CARGA}${MODO_CARGA === "INCREMENTAL" ? ` (lookback=${LOOKBACK_REMESSAS} remessas)` : ""}`,
  );

  try {
    await validarDestino();

    const remessas = await escolherRemessasCarga();
    if (remessas.length === 0) {
      const duracao = Date.now() - inicio;
      console.log("  -> Nenhuma remessa encontrada para carga.");
      await gravarLog("sucesso", 0, duracao, "Nenhuma remessa encontrada para carga");
      return;
    }

    const primeira = remessas[0];
    const ultima = remessas[remessas.length - 1];
    console.log(
      `  -> Remessas: ${remessas.length} (${primeira.ano_remessa}/${primeira.numero_remessa} a ${ultima.ano_remessa}/${ultima.numero_remessa})`,
    );

    const agora = new Date().toISOString();
    let totalRegistros = 0;

    for (let i = 0; i < remessas.length; i++) {
      const remessa = remessas[i];
      const rows = await carregarRemessa(remessa, agora);
      if (rows.length > 0) {
        await upsertEmLotes(rows, SUPABASE_UPSERT_BATCH);
        totalRegistros += rows.length;
      }
      console.log(
        `  -> [${i + 1}/${remessas.length}] Remessa ${remessa.ano_remessa}/${remessa.numero_remessa}: ${rows.length} registros`,
      );
    }

    const duracao = Date.now() - inicio;
    console.log(`  OK - ETL concluido em ${duracao}ms (${totalRegistros} registros em ${remessas.length} remessas)`);
    await gravarLog("sucesso", totalRegistros, duracao);
  } catch (error) {
    const duracao = Date.now() - inicio;
    const mensagem = error instanceof Error ? error.message : String(error);
    console.error(`  ERRO - ${mensagem}`);
    await gravarLog("erro", 0, duracao, mensagem);
    throw error;
  }
}

if (require.main === module) {
  executarETLFatoEmpenho().catch(() => process.exit(1));
}
