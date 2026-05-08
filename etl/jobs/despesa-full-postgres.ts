/**
 * ETL — Fato Empenho carga full (SQL Server -> PostgreSQL local)
 *
 * Estrategia:
 *   1. Le todas as remessas disponiveis na view do SQL Server (paginado por remessa)
 *   2. Insere em stage.fato_empenho_full_stg (TRUNCATE antes)
 *   3. Valida contagem minima (DESPESA_MIN_REGISTROS, default 100)
 *   4. Em transacao: TRUNCATE public.fato_empenho CASCADE + INSERT ... SELECT FROM stage
 *   5. Grava audit.etl_log e audit.etl_carga
 *
 * Variaveis de ambiente:
 *   FATO_EMPENHO_SQLSERVER_DATABASE  — banco SQL Server (default: APC)
 *   SQLSERVER_APC_DATABASE           — fallback do banco SQL Server
 *   FATO_EMPENHO_SOURCE_VIEW         — view/tabela fonte (default: audit.vw_fato_empenho_polanco)
 *   DESPESA_MIN_REGISTROS            — minimo de registros esperados (default: 100)
 *   DESPESA_BATCH_SIZE               — tamanho do lote de insert no stage (default: 1000)
 *
 * Uso:
 *   cd etl && npm run despesa:full:postgres
 */

import "dotenv/config";
import { queryInDatabase } from "../connectors/sqlserver";
import { pgQuery, withPgTransaction, closePgPool } from "../connectors/postgres";

// ---------------------------------------------------------------------------
// Configuracao
// ---------------------------------------------------------------------------

const MODULO = "despesa_full_postgres";
const SQL_DATABASE =
  process.env.FATO_EMPENHO_SQLSERVER_DATABASE ||
  process.env.SQLSERVER_APC_DATABASE ||
  "APC";
const SOURCE_VIEW =
  process.env.FATO_EMPENHO_SOURCE_VIEW || "audit.vw_fato_empenho_polanco";
const MIN_REGISTROS = toPositiveInt(
  Number(process.env.DESPESA_MIN_REGISTROS || "100"),
  100,
);
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
      `Identificador SQL invalido em FATO_EMPENHO_SOURCE_VIEW: "${identifier}". ` +
        "Use apenas letras, numeros, underscores, pontos e colchetes.",
    );
  }
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

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
};

// ---------------------------------------------------------------------------
// Leitura SQL Server
// ---------------------------------------------------------------------------

async function buscarRemessas(): Promise<Remessa[]> {
  assertSafeSqlIdentifier(SOURCE_VIEW);
  const sql = `
SELECT DISTINCT
  ANO_REMESSA    AS ano_remessa,
  NUMERO_REMESSA AS numero_remessa
FROM ${SOURCE_VIEW}
ORDER BY ANO_REMESSA, NUMERO_REMESSA;
`;
  return queryInDatabase<Remessa>(SQL_DATABASE, sql);
}

async function lerRemessa(remessa: Remessa): Promise<EmpenhoRow[]> {
  // Reutiliza a mesma query do job fato-empenho.ts, adaptada para PostgreSQL destino
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
WHERE ANO_REMESSA = ${remessa.ano_remessa}
  AND NUMERO_REMESSA = ${remessa.numero_remessa}
ORDER BY ID_DESPESA;
`;
  return queryInDatabase<EmpenhoRow>(SQL_DATABASE, sql);
}

// ---------------------------------------------------------------------------
// Escrita no stage (PostgreSQL)
// ---------------------------------------------------------------------------

async function inserirStageEmLotes(
  client: import("pg").PoolClient,
  rows: EmpenhoRow[],
): Promise<void> {
  const agora = new Date().toISOString();
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const lote = rows.slice(i, i + BATCH_SIZE);
    // Monta VALUES placeholders
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
      `INSERT INTO stage.fato_empenho_full_stg (
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
      ) VALUES ${placeholders.join(",")}`,
      valores,
    );
  }
  void agora; // usado apenas para timestamp etl_carregado_em (DEFAULT now())
}

// ---------------------------------------------------------------------------
// Auditoria
// ---------------------------------------------------------------------------

async function iniciarCarga(): Promise<number> {
  const rows = await pgQuery<{ id_carga: number }>(
    `INSERT INTO audit.etl_carga
       (modulo, origem, destino, modo_carga, status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id_carga`,
    [
      MODULO,
      `${SQL_DATABASE}.${SOURCE_VIEW}`,
      "public.fato_empenho (via stage.fato_empenho_full_stg)",
      "full_truncate_insert",
      "iniciado",
    ],
  );
  return rows[0].id_carga;
}

async function finalizarCarga(
  idCarga: number,
  status: "ok" | "erro",
  lidos: number,
  gravados: number,
  mensagem?: string,
): Promise<void> {
  await pgQuery(
    `UPDATE audit.etl_carga
     SET status = $1, registros_lidos = $2, registros_gravados = $3,
         finalizado_em = now(), mensagem = $4
     WHERE id_carga = $5`,
    [status, lidos, gravados, mensagem ?? null, idCarga],
  );
}

async function registrarLog(
  status: "ok" | "erro",
  registros: number,
  duracao: number,
  mensagem?: string,
): Promise<void> {
  await pgQuery(
    `INSERT INTO audit.etl_log (modulo, status, registros, duracao_ms, mensagem)
     VALUES ($1, $2, $3, $4, $5)`,
    [MODULO, status, registros, duracao, mensagem ?? null],
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const inicio = Date.now();

  console.log(`[${new Date().toISOString()}] Iniciando ETL: ${MODULO}`);
  console.log(`  -> Fonte SQL Server: ${SQL_DATABASE}.${SOURCE_VIEW}`);
  console.log(`  -> Destino PostgreSQL: public.fato_empenho (via stage)`);
  console.log(`  -> Validacao minima: ${MIN_REGISTROS} registros`);
  console.log(`  -> Batch size stage: ${BATCH_SIZE}`);

  // Guarda referencia ao pool de auditoria antes de iniciar
  const idCarga = await iniciarCarga();

  try {
    // PASSO 1 — listar remessas disponiveis
    console.log("  -> Buscando remessas na fonte...");
    const remessas = await buscarRemessas();
    if (remessas.length === 0) {
      const duracao = Date.now() - inicio;
      console.log("  -> Nenhuma remessa encontrada. Abortando.");
      await registrarLog("ok", 0, duracao, "Nenhuma remessa encontrada");
      await finalizarCarga(idCarga, "ok", 0, 0, "Nenhuma remessa encontrada");
      return;
    }
    const primeira = remessas[0];
    const ultima = remessas[remessas.length - 1];
    console.log(
      `  -> Remessas encontradas: ${remessas.length} ` +
        `(${primeira.ano_remessa}/${primeira.numero_remessa} ate ${ultima.ano_remessa}/${ultima.numero_remessa})`,
    );

    // PASSO 2 — TRUNCATE stage e carga por remessa
    console.log("  -> Truncando stage.fato_empenho_full_stg...");
    await pgQuery("TRUNCATE stage.fato_empenho_full_stg");

    let totalLidos = 0;
    for (let i = 0; i < remessas.length; i++) {
      const remessa = remessas[i];
      const rows = await lerRemessa(remessa);
      if (rows.length > 0) {
        // Usamos uma conexao independente do pool para o stage (sem transacao por remessa,
        // porque o TRUNCATE do stage ja foi feito antes; toleramos falha parcial no stage)
        const client = await (await import("../connectors/postgres"))
          .getPgPool()
          .connect();
        try {
          await inserirStageEmLotes(client, rows);
        } finally {
          client.release();
        }
        totalLidos += rows.length;
      }
      console.log(
        `  -> [${i + 1}/${remessas.length}] Remessa ${remessa.ano_remessa}/${remessa.numero_remessa}: ${rows.length} registros`,
      );
    }
    console.log(`  -> Total no stage: ${totalLidos} registros`);

    // PASSO 3 — validar contagem minima
    if (totalLidos < MIN_REGISTROS) {
      throw new Error(
        `Validacao falhou: ${totalLidos} registros no stage, minimo esperado ${MIN_REGISTROS}. ` +
          "Ajuste DESPESA_MIN_REGISTROS ou verifique a fonte.",
      );
    }

    // PASSO 4 — promover stage -> public em transacao
    console.log("  -> Promovendo stage para public.fato_empenho...");
    await withPgTransaction(async (client) => {
      await client.query("TRUNCATE public.fato_empenho CASCADE");
      await client.query(`
        INSERT INTO public.fato_empenho (
          id_despesa, id_remessa, ano_remessa, numero_remessa,
          id_entidade, id_acao, id_programa, id_unidade_orcamentaria,
          id_fonte_destinacao_recurso, id_aplicacao,
          numero_funcao, numero_subfuncao, numero_categoria_economica,
          numero_grupo_natureza_despesa, numero_modalidade_aplicacao,
          numero_elemento_despesa, cpf_cnpj_credor, tipo_credor,
          numero_empenho, ano_empenho, data_empenho, tipo_empenho,
          numero_empenho_ref, tipo_lancamento, historico_empenho,
          valor_empenho, valor_anulado, valor_liquidado, valor_pago,
          valor_retido, valor_empenhado_liquido, valor_a_liquidar, valor_a_pagar,
          etl_carregado_em
        )
        SELECT
          id_despesa, id_remessa, ano_remessa, numero_remessa,
          id_entidade, id_acao, id_programa, id_unidade_orcamentaria,
          id_fonte_destinacao_recurso, id_aplicacao,
          numero_funcao, numero_subfuncao, numero_categoria_economica,
          numero_grupo_natureza_despesa, numero_modalidade_aplicacao,
          numero_elemento_despesa, cpf_cnpj_credor, tipo_credor,
          numero_empenho, ano_empenho, data_empenho, tipo_empenho,
          numero_empenho_ref, tipo_lancamento, historico_empenho,
          valor_empenho, valor_anulado, valor_liquidado, valor_pago,
          valor_retido, valor_empenhado_liquido, valor_a_liquidar, valor_a_pagar,
          etl_carregado_em
        FROM stage.fato_empenho_full_stg
      `);
    });

    // PASSO 5 — verificar contagem final
    const rows = await pgQuery<{ total: string }>(
      "SELECT COUNT(*) AS total FROM public.fato_empenho",
    );
    const totalGravado = parseInt(rows[0].total, 10);

    const duracao = Date.now() - inicio;
    console.log(
      `  OK - ETL concluido em ${duracao}ms | lidos: ${totalLidos} | gravados: ${totalGravado}`,
    );

    await registrarLog("ok", totalGravado, duracao);
    await finalizarCarga(idCarga, "ok", totalLidos, totalGravado);
  } catch (error) {
    const duracao = Date.now() - inicio;
    const mensagem = error instanceof Error ? error.message : String(error);
    console.error(`  ERRO - ${mensagem}`);
    await registrarLog("erro", 0, duracao, mensagem).catch(() => void 0);
    await finalizarCarga(idCarga, "erro", 0, 0, mensagem).catch(() => void 0);
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
