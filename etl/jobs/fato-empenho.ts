/**
 * ETL - Fato Empenho
 * Fonte: vw_fato_empenho_polanco (SQL Server - APC)
 * Destino: Supabase.fato_empenho
 */

import "dotenv/config";
import { queryInDatabase } from "../connectors/sqlserver";
import { pgQuery, closePgPool } from "../connectors/postgres";

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

const SQL_DATABASE = process.env.FATO_EMPENHO_SQLSERVER_DATABASE || process.env.SQLSERVER_APC_DATABASE || "APC";
const SOURCE_VIEW = process.env.FATO_EMPENHO_SOURCE_VIEW || "audit.vw_fato_empenho_polanco";
const PG_TABLE = process.env.FATO_EMPENHO_SUPABASE_TABLE || "fato_empenho";
const MODO_CARGA = normalizeModo(process.env.FATO_EMPENHO_MODO_CARGA || "INCREMENTAL");
const LOOKBACK_REMESSAS = toPositiveInt(Number(process.env.FATO_EMPENHO_LOOKBACK_REMESSAS || "3"), 3);
const PG_UPSERT_BATCH = toPositiveInt(Number(process.env.FATO_EMPENHO_SUPABASE_BATCH || "500"), 500);

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
      `Tabela destino nao encontrada no PostgreSQL: public.${PG_TABLE}. ` +
      `Execute: npm run postgres:migrate`,
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
  const rows = await pgQuery<Remessa>(
    `SELECT ano_remessa, numero_remessa
     FROM public.${PG_TABLE}
     ORDER BY ano_remessa DESC, numero_remessa DESC
     LIMIT 1`,
  );
  if (rows.length === 0) return null;
  return { ano_remessa: rows[0].ano_remessa, numero_remessa: rows[0].numero_remessa };
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
    for (const r of batch) {
      await pgQuery(
        `INSERT INTO public.${PG_TABLE} (
           id_despesa, id_remessa, ano_remessa, numero_remessa, id_entidade, id_acao, id_programa,
           id_unidade_orcamentaria, id_fonte_destinacao_recurso, id_aplicacao, numero_funcao, numero_subfuncao,
           numero_categoria_economica, numero_grupo_natureza_despesa, numero_modalidade_aplicacao,
           numero_elemento_despesa, cpf_cnpj_credor, tipo_credor, numero_empenho, ano_empenho, data_empenho,
           tipo_empenho, numero_empenho_ref, tipo_lancamento, historico_empenho, valor_empenho, valor_anulado,
           valor_liquidado, valor_pago, valor_retido, valor_empenhado_liquido, valor_a_liquidar, valor_a_pagar,
           etl_atualizado_em
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,
           $26,$27,$28,$29,$30,$31,$32,$33,$34
         )
         ON CONFLICT (id_despesa) DO UPDATE SET
           id_remessa=$2, ano_remessa=$3, numero_remessa=$4, id_entidade=$5, id_acao=$6, id_programa=$7,
           id_unidade_orcamentaria=$8, id_fonte_destinacao_recurso=$9, id_aplicacao=$10, numero_funcao=$11,
           numero_subfuncao=$12, numero_categoria_economica=$13, numero_grupo_natureza_despesa=$14,
           numero_modalidade_aplicacao=$15, numero_elemento_despesa=$16, cpf_cnpj_credor=$17, tipo_credor=$18,
           numero_empenho=$19, ano_empenho=$20, data_empenho=$21, tipo_empenho=$22, numero_empenho_ref=$23,
           tipo_lancamento=$24, historico_empenho=$25, valor_empenho=$26, valor_anulado=$27, valor_liquidado=$28,
           valor_pago=$29, valor_retido=$30, valor_empenhado_liquido=$31, valor_a_liquidar=$32, valor_a_pagar=$33,
           etl_atualizado_em=$34`,
        [
          r.id_despesa, r.id_remessa, r.ano_remessa, r.numero_remessa, r.id_entidade, r.id_acao, r.id_programa,
          r.id_unidade_orcamentaria, r.id_fonte_destinacao_recurso, r.id_aplicacao, r.numero_funcao, r.numero_subfuncao,
          r.numero_categoria_economica, r.numero_grupo_natureza_despesa, r.numero_modalidade_aplicacao,
          r.numero_elemento_despesa, r.cpf_cnpj_credor, r.tipo_credor, r.numero_empenho, r.ano_empenho, r.data_empenho,
          r.tipo_empenho, r.numero_empenho_ref, r.tipo_lancamento, r.historico_empenho, r.valor_empenho, r.valor_anulado,
          r.valor_liquidado, r.valor_pago, r.valor_retido, r.valor_empenhado_liquido, r.valor_a_liquidar, r.valor_a_pagar,
          r.etl_atualizado_em,
        ],
      );
    }
  }
}

export async function executarETLFatoEmpenho(): Promise<void> {
  const inicio = Date.now();
  console.log(`[${new Date().toISOString()}] Iniciando ETL: ${MODULO}`);
  console.log(`  -> Fonte SQL: ${SQL_DATABASE}.${SOURCE_VIEW}`);
  console.log(`  -> Destino PostgreSQL: ${PG_TABLE}`);
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
        await upsertEmLotes(rows, PG_UPSERT_BATCH);
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
  executarETLFatoEmpenho()
    .catch(() => process.exit(1))
    .finally(() => closePgPool());
}
