/**
 * ETL — Fato Empenho carga incremental (SQL Server -> PostgreSQL local)
 *
 * Estratégia:
 *   1. Busca id_remessa distintos já presentes em public.fato_empenho
 *   2. Busca id_remessa distintos disponíveis na view fonte (SQL Server)
 *   3. Carrega somente remessas novas (que ainda não existem no destino)
 *   4. UPSERT em public.fato_empenho ON CONFLICT (id_despesa) DO UPDATE SET
 *   5. Grava audit.etl_log e audit.etl_carga
 *
 * Obs: remessas já presentes no destino são ignoradas. Para reprocessar
 *      remessas existentes, use o job despesa:full:postgres.
 *
 * Variáveis de ambiente:
 *   FATO_EMPENHO_SQLSERVER_DATABASE  — banco SQL Server (default: APC)
 *   SQLSERVER_APC_DATABASE           — fallback do banco SQL Server
 *   FATO_EMPENHO_SOURCE_VIEW         — view/tabela fonte (default: audit.vw_fato_empenho_polanco)
 *   DESPESA_BATCH_SIZE               — tamanho do lote de upsert (default: 1000)
 *
 * Uso:
 *   cd etl && npm run despesa:incremental:postgres
 */

import "dotenv/config";
import { queryInDatabase } from "../connectors/sqlserver";
import { pgQuery, getPgPool, closePgPool } from "../connectors/postgres";
import { iniciarCargaEtl, finalizarCargaEtl, registrarLogEtl } from "../lib/auditoria";

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

const MODULO = "despesa_incremental_postgres";
const SQL_DATABASE =
  process.env.FATO_EMPENHO_SQLSERVER_DATABASE ||
  process.env.SQLSERVER_APC_DATABASE ||
  "APC";
const SOURCE_VIEW =
  process.env.FATO_EMPENHO_SOURCE_VIEW || "audit.vw_fato_empenho_polanco";
const BATCH_SIZE = toPositiveInt(
  Number(process.env.DESPESA_BATCH_SIZE || "1000"),
  1000,
);

function toPositiveInt(input: number, fallback: number): number {
  if (!Number.isFinite(input) || input < 1) return fallback;
  return Math.trunc(input);
}

function assertSafeSqlIdentifier(identifier: string): void {
  if (!/^[A-Za-z0-9_\].\[]+$/.test(identifier)) {
    throw new Error(
      `Identificador SQL inválido em FATO_EMPENHO_SOURCE_VIEW: "${identifier}". ` +
        "Use apenas letras, números, underscores, pontos e colchetes.",
    );
  }
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type RemessaRef = {
  id_remessa: number;
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
};

// ---------------------------------------------------------------------------
// Leitura: remessas existentes no destino
// ---------------------------------------------------------------------------

async function buscarRemessasNoDestino(): Promise<Set<number>> {
  const rows = await pgQuery<{ id_remessa: string }>(
    "SELECT DISTINCT id_remessa FROM public.fato_empenho",
  );
  return new Set(rows.map((r) => Number(r.id_remessa)));
}

// ---------------------------------------------------------------------------
// Leitura: remessas disponíveis na fonte
// ---------------------------------------------------------------------------

async function buscarRemessasNaFonte(): Promise<RemessaRef[]> {
  assertSafeSqlIdentifier(SOURCE_VIEW);
  const sql = `
SELECT DISTINCT
  ID_REMESSA     AS id_remessa,
  ANO_REMESSA    AS ano_remessa,
  NUMERO_REMESSA AS numero_remessa
FROM ${SOURCE_VIEW}
ORDER BY ANO_REMESSA, NUMERO_REMESSA;
`;
  return queryInDatabase<RemessaRef>(SQL_DATABASE, sql);
}

// ---------------------------------------------------------------------------
// Leitura: empenhos de uma remessa específica
// ---------------------------------------------------------------------------

async function lerRemessa(ref: RemessaRef): Promise<EmpenhoRow[]> {
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
  VALOR_A_PAGAR                 AS valor_a_pagar
FROM ${SOURCE_VIEW}
WHERE ID_REMESSA = ${ref.id_remessa}
ORDER BY ID_DESPESA;
`;
  return queryInDatabase<EmpenhoRow>(SQL_DATABASE, sql);
}

// ---------------------------------------------------------------------------
// Escrita: UPSERT em lotes no destino
// ---------------------------------------------------------------------------

async function upsertEmLotes(
  client: import("pg").PoolClient,
  rows: EmpenhoRow[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const lote = rows.slice(i, i + BATCH_SIZE);
    const placeholders: string[] = [];
    const valores: unknown[] = [];
    let p = 1;

    for (const r of lote) {
      placeholders.push(
        `($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`,
      );
      valores.push(
        r.id_despesa,
        r.id_remessa,
        r.ano_remessa,
        r.numero_remessa,
        r.id_entidade,
        r.id_acao,
        r.id_programa,
        r.id_unidade_orcamentaria,
        r.id_fonte_destinacao_recurso,
        r.id_aplicacao,
        r.numero_funcao,
        r.numero_subfuncao,
        r.numero_categoria_economica,
        r.numero_grupo_natureza_despesa,
        r.numero_modalidade_aplicacao,
        r.numero_elemento_despesa,
        r.cpf_cnpj_credor,
        r.tipo_credor,
        r.numero_empenho,
        r.ano_empenho,
        r.data_empenho,
        r.tipo_empenho,
        r.numero_empenho_ref,
        r.tipo_lancamento,
        r.historico_empenho,
        r.valor_empenho ?? 0,
        r.valor_anulado ?? 0,
        r.valor_liquidado ?? 0,
        r.valor_pago ?? 0,
        r.valor_retido ?? 0,
        r.valor_empenhado_liquido ?? 0,
        r.valor_a_liquidar ?? 0,
        r.valor_a_pagar ?? 0,
      );
    }

    await client.query(
      `INSERT INTO public.fato_empenho (
        id_despesa, id_remessa, ano_remessa, numero_remessa,
        id_entidade, id_acao, id_programa, id_unidade_orcamentaria,
        id_fonte_destinacao_recurso, id_aplicacao,
        numero_funcao, numero_subfuncao, numero_categoria_economica,
        numero_grupo_natureza_despesa, numero_modalidade_aplicacao,
        numero_elemento_despesa, cpf_cnpj_credor, tipo_credor,
        numero_empenho, ano_empenho, data_empenho, tipo_empenho,
        numero_empenho_ref, tipo_lancamento, historico_empenho,
        valor_empenho, valor_anulado, valor_liquidado, valor_pago,
        valor_retido, valor_empenhado_liquido, valor_a_liquidar, valor_a_pagar
      ) VALUES ${placeholders.join(",")}
      ON CONFLICT (id_despesa) DO UPDATE SET
        id_remessa                    = EXCLUDED.id_remessa,
        ano_remessa                   = EXCLUDED.ano_remessa,
        numero_remessa                = EXCLUDED.numero_remessa,
        id_entidade                   = EXCLUDED.id_entidade,
        id_acao                       = EXCLUDED.id_acao,
        id_programa                   = EXCLUDED.id_programa,
        id_unidade_orcamentaria       = EXCLUDED.id_unidade_orcamentaria,
        id_fonte_destinacao_recurso   = EXCLUDED.id_fonte_destinacao_recurso,
        id_aplicacao                  = EXCLUDED.id_aplicacao,
        numero_funcao                 = EXCLUDED.numero_funcao,
        numero_subfuncao              = EXCLUDED.numero_subfuncao,
        numero_categoria_economica    = EXCLUDED.numero_categoria_economica,
        numero_grupo_natureza_despesa = EXCLUDED.numero_grupo_natureza_despesa,
        numero_modalidade_aplicacao   = EXCLUDED.numero_modalidade_aplicacao,
        numero_elemento_despesa       = EXCLUDED.numero_elemento_despesa,
        cpf_cnpj_credor               = EXCLUDED.cpf_cnpj_credor,
        tipo_credor                   = EXCLUDED.tipo_credor,
        numero_empenho                = EXCLUDED.numero_empenho,
        ano_empenho                   = EXCLUDED.ano_empenho,
        data_empenho                  = EXCLUDED.data_empenho,
        tipo_empenho                  = EXCLUDED.tipo_empenho,
        numero_empenho_ref            = EXCLUDED.numero_empenho_ref,
        tipo_lancamento               = EXCLUDED.tipo_lancamento,
        historico_empenho             = EXCLUDED.historico_empenho,
        valor_empenho                 = EXCLUDED.valor_empenho,
        valor_anulado                 = EXCLUDED.valor_anulado,
        valor_liquidado               = EXCLUDED.valor_liquidado,
        valor_pago                    = EXCLUDED.valor_pago,
        valor_retido                  = EXCLUDED.valor_retido,
        valor_empenhado_liquido       = EXCLUDED.valor_empenhado_liquido,
        valor_a_liquidar              = EXCLUDED.valor_a_liquidar,
        valor_a_pagar                 = EXCLUDED.valor_a_pagar,
        etl_atualizado_em             = now()`,
      valores,
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const inicio = Date.now();

  console.log(`[${new Date().toISOString()}] Iniciando ETL: ${MODULO}`);
  console.log(`  -> Fonte SQL Server: ${SQL_DATABASE}.${SOURCE_VIEW}`);
  console.log(`  -> Destino PostgreSQL: public.fato_empenho (upsert direto)`);
  console.log(`  -> Batch size upsert: ${BATCH_SIZE}`);

  const idCarga = await iniciarCargaEtl({
    modulo: MODULO,
    modoCarga: "incremental_upsert",
    origem: `${SQL_DATABASE}.${SOURCE_VIEW}`,
    destino: "public.fato_empenho",
  });

  try {
    // PASSO 1 — remessas já no destino
    console.log("  -> Verificando remessas já carregadas no destino...");
    const remessasNoDestino = await buscarRemessasNoDestino();
    console.log(`  -> Remessas já no destino: ${remessasNoDestino.size}`);

    // PASSO 2 — remessas disponíveis na fonte
    console.log("  -> Buscando remessas disponíveis na fonte...");
    const remessasNaFonte = await buscarRemessasNaFonte();
    console.log(`  -> Remessas na fonte: ${remessasNaFonte.length}`);

    // PASSO 3 — diferença: remessas novas
    const remessasNovas = remessasNaFonte.filter(
      (r) => !remessasNoDestino.has(r.id_remessa),
    );
    console.log(`  -> Remessas novas a processar: ${remessasNovas.length}`);

    if (remessasNovas.length === 0) {
      const duracao = Date.now() - inicio;
      console.log("  -> Nenhuma remessa nova. Destino já está atualizado.");
      await registrarLogEtl({
        modulo: MODULO,
        status: "ok",
        registros: 0,
        duracaoMs: duracao,
        mensagem: "Nenhuma remessa nova encontrada",
      });
      await finalizarCargaEtl({
        idCarga,
        status: "ok",
        registrosLidos: 0,
        registrosGravados: 0,
        mensagem: "Nenhuma remessa nova encontrada",
      });
      return;
    }

    // PASSO 4 — carregar cada remessa nova com UPSERT
    let totalLidos = 0;
    let totalGravados = 0;

    for (let i = 0; i < remessasNovas.length; i++) {
      const ref = remessasNovas[i];
      const rows = await lerRemessa(ref);

      if (rows.length > 0) {
        const pool = getPgPool();
        const client = await pool.connect();
        try {
          await upsertEmLotes(client, rows);
        } finally {
          client.release();
        }
        totalGravados += rows.length;
      }

      totalLidos += rows.length;
      console.log(
        `  -> [${i + 1}/${remessasNovas.length}] Remessa ${ref.ano_remessa}/${ref.numero_remessa} (id_remessa=${ref.id_remessa}): ${rows.length} registros`,
      );
    }

    const duracao = Date.now() - inicio;
    console.log(
      `  OK - ETL concluído em ${duracao}ms | lidos: ${totalLidos} | gravados/atualizados: ${totalGravados}`,
    );

    await registrarLogEtl({
      modulo: MODULO,
      status: "ok",
      registros: totalGravados,
      duracaoMs: duracao,
    });
    await finalizarCargaEtl({
      idCarga,
      status: "ok",
      registrosLidos: totalLidos,
      registrosGravados: totalGravados,
    });
  } catch (error) {
    const duracao = Date.now() - inicio;
    const mensagem = error instanceof Error ? error.message : String(error);
    console.error(`  ERRO - ${mensagem}`);
    await registrarLogEtl({
      modulo: MODULO,
      status: "erro",
      registros: 0,
      duracaoMs: duracao,
      mensagem,
    }).catch(() => void 0);
    await finalizarCargaEtl({
      idCarga,
      status: "erro",
      registrosLidos: 0,
      registrosGravados: 0,
      mensagem,
    }).catch(() => void 0);
    throw error;
  }
}

if (require.main === module) {
  main()
    .then(() => closePgPool())
    .catch(() => {
      closePgPool().catch(() => void 0);
      process.exit(1);
    });
}
