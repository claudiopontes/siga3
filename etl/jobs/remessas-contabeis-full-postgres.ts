/**
 * ETL — Remessas contábeis carga full (SQL Server APC -> PostgreSQL local)
 *
 * Estratégia:
 *   1. Contar registros na fonte: APC.dbo.REMESSA
 *   2. TRUNCATE stage.remessa_contabil_stg
 *   3. Ler em lotes paginados (OFFSET/FETCH) e inserir no stage
 *   4. Validar contagem mínima (REMESSA_MIN_REGISTROS, default 10)
 *   5. Em transação: TRUNCATE dw.fato_remessa_contabil CASCADE + INSERT SELECT FROM stage
 *   6. Registrar audit.etl_log e audit.etl_carga
 *   7. Exibir contadores
 *
 * Variáveis de ambiente:
 *   SQLSERVER_APC_DATABASE  — banco SQL Server (default: APC)
 *   REMESSA_BATCH_SIZE      — tamanho do lote (default: 2000)
 *   REMESSA_MIN_REGISTROS   — mínimo de registros esperados (default: 10)
 *
 * Uso:
 *   cd etl && npm run remessas:full:postgres
 */

import "dotenv/config";
import { queryInDatabase } from "../connectors/sqlserver";
import { pgQuery, withPgTransaction, getPgPool, closePgPool } from "../connectors/postgres";
import { iniciarCargaEtl, finalizarCargaEtl, registrarLogEtl } from "../lib/auditoria";

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

const MODULO = "remessas_full_postgres";
const APC_DATABASE = process.env.SQLSERVER_APC_DATABASE || "APC";
const BATCH_SIZE = toPositiveInt(Number(process.env.REMESSA_BATCH_SIZE || "2000"), 2000);
const MIN_REGISTROS = toPositiveInt(Number(process.env.REMESSA_MIN_REGISTROS || "10"), 10);

function toPositiveInt(input: number, fallback: number): number {
  if (!Number.isFinite(input) || input < 1) return fallback;
  return Math.trunc(input);
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type RemessaRow = {
  id_remessa: number;
  id_entidade_cjur: number | null;
  ano: number;
  arquivo: string | null;
  data_confirmacao: string | null;
  data_envio: string | null;
  data_final: string;
  data_inicial: string;
  hash_arquivo: string | null;
  numero: number;
  prazo_envio: string;
  protocolo_envio: string | null;
  situacao: string;
  status: number;
  tipo_liberacao: string;
  id_entidade: number;
  status_publicacao: string | null;
  nome_usuario_enviou: string | null;
  data_processamento: string | null;
  tempo_de_processamento: number | null;
  email_enviado: number;
  nome_entidade_confirmacao: string | null;
  alerta_publicado: number;
  observacao: string | null;
};

// ---------------------------------------------------------------------------
// Leitura SQL Server (paginada)
// ---------------------------------------------------------------------------

async function contarFonte(): Promise<number> {
  const rows = await queryInDatabase<{ total: number }>(
    APC_DATABASE,
    `SELECT COUNT(*) AS total FROM dbo.REMESSA`,
  );
  return rows[0].total;
}

async function lerLote(offset: number, pageSize: number): Promise<RemessaRow[]> {
  const sql = `
SELECT
  CAST(ID_REMESSA AS bigint)              AS id_remessa,
  ID_ENTIDADE_CJUR                        AS id_entidade_cjur,
  ANO                                     AS ano,
  ARQUIVO                                 AS arquivo,
  CONVERT(VARCHAR(33), DATA_CONFIRMACAO, 127) AS data_confirmacao,
  CONVERT(VARCHAR(33), DATA_ENVIO, 127)   AS data_envio,
  CONVERT(VARCHAR(33), DATA_FINAL, 127)   AS data_final,
  CONVERT(VARCHAR(33), DATA_INICIAL, 127) AS data_inicial,
  HASH_ARQUIVO                            AS hash_arquivo,
  NUMERO                                  AS numero,
  CONVERT(VARCHAR(33), PRAZO_ENVIO, 127)  AS prazo_envio,
  PROTOCOLO_ENVIO                         AS protocolo_envio,
  SITUACAO                                AS situacao,
  CAST(STATUS AS smallint)                AS status,
  TIPO_LIBERACAO                          AS tipo_liberacao,
  CAST(ID_ENTIDADE AS bigint)             AS id_entidade,
  STATUS_PUBLICACAO                       AS status_publicacao,
  NOME_USUARIO_ENVIOU                     AS nome_usuario_enviou,
  CONVERT(VARCHAR(33), DATA_PROCESSAMENTO, 127) AS data_processamento,
  CAST(TEMPO_DE_PROCESSAMENTO AS bigint)  AS tempo_de_processamento,
  CASE WHEN EMAIL_ENVIADO = 1 THEN 1 ELSE 0 END AS email_enviado,
  NOME_ENTIDADE_CONFIRMACAO               AS nome_entidade_confirmacao,
  CASE WHEN ALERTA_PUBLICADO = 1 THEN 1 ELSE 0 END AS alerta_publicado,
  OBSERVACAO                              AS observacao
FROM dbo.REMESSA
ORDER BY ID_REMESSA
OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY
`;
  return queryInDatabase<RemessaRow>(APC_DATABASE, sql);
}

// ---------------------------------------------------------------------------
// Escrita no stage (PostgreSQL)
// ---------------------------------------------------------------------------

async function inserirStageEmLotes(
  client: import("pg").PoolClient,
  rows: RemessaRow[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const lote = rows.slice(i, i + BATCH_SIZE);
    const placeholders: string[] = [];
    const valores: unknown[] = [];
    let p = 1;

    for (const r of lote) {
      placeholders.push(
        `($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`,
      );
      valores.push(
        r.id_remessa,
        r.id_entidade_cjur,
        r.ano,
        r.arquivo,
        r.data_confirmacao,
        r.data_envio,
        r.data_final,
        r.data_inicial,
        r.hash_arquivo,
        r.numero,
        r.prazo_envio,
        r.protocolo_envio,
        r.situacao,
        r.status,
        r.tipo_liberacao,
        r.id_entidade,
        r.status_publicacao,
        r.nome_usuario_enviou,
        r.data_processamento,
        r.tempo_de_processamento,
        r.email_enviado === 1,
        r.nome_entidade_confirmacao,
        r.alerta_publicado === 1,
        r.observacao,
      );
    }

    await client.query(
      `INSERT INTO stage.remessa_contabil_stg (
        id_remessa, id_entidade_cjur, ano, arquivo,
        data_confirmacao, data_envio, data_final, data_inicial,
        hash_arquivo, numero, prazo_envio, protocolo_envio,
        situacao, status, tipo_liberacao, id_entidade,
        status_publicacao, nome_usuario_enviou, data_processamento,
        tempo_de_processamento, email_enviado, nome_entidade_confirmacao,
        alerta_publicado, observacao
      ) VALUES ${placeholders.join(",")}`,
      valores,
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function executarCargaRemessasFullPostgres(): Promise<void> {
  const inicio = Date.now();

  console.log(`[${new Date().toISOString()}] Iniciando ETL: ${MODULO}`);
  console.log(`  -> Fonte SQL Server: ${APC_DATABASE}.dbo.REMESSA`);
  console.log(`  -> Destino PostgreSQL: dw.fato_remessa_contabil (via stage)`);
  console.log(`  -> Validação mínima: ${MIN_REGISTROS} registros`);
  console.log(`  -> Batch size: ${BATCH_SIZE}`);

  const idCarga = await iniciarCargaEtl({
    modulo: MODULO,
    modoCarga: "full_truncate_insert",
    origem: `${APC_DATABASE}.dbo.REMESSA`,
    destino: "dw.fato_remessa_contabil (via stage.remessa_contabil_stg)",
  });

  try {
    // PASSO 1 — contar fonte
    console.log("  -> Contando registros na fonte...");
    const totalFonte = await contarFonte();
    console.log(`  -> Total na fonte: ${totalFonte} registros`);

    if (totalFonte === 0) {
      const duracao = Date.now() - inicio;
      console.log("  -> Fonte vazia. Abortando.");
      await registrarLogEtl({ modulo: MODULO, status: "ok", registros: 0, duracaoMs: duracao, mensagem: "Fonte vazia" });
      await finalizarCargaEtl({ idCarga, status: "ok", registrosLidos: 0, registrosGravados: 0, mensagem: "Fonte vazia" });
      return;
    }

    // PASSO 2 — TRUNCATE stage
    console.log("  -> Truncando stage.remessa_contabil_stg...");
    await pgQuery("TRUNCATE stage.remessa_contabil_stg");

    // PASSO 3 — Leitura paginada e inserção no stage
    let totalLidos = 0;
    let offset = 0;
    let pagina = 1;

    while (offset < totalFonte) {
      console.log(`  -> Lote ${pagina}: offset=${offset}, size=${BATCH_SIZE}...`);
      const rows = await lerLote(offset, BATCH_SIZE);
      if (rows.length === 0) break;

      const pool = getPgPool();
      const client = await pool.connect();
      try {
        await inserirStageEmLotes(client, rows);
      } finally {
        client.release();
      }

      totalLidos += rows.length;
      console.log(`  -> Lote ${pagina}: ${rows.length} registros inseridos no stage (total: ${totalLidos})`);

      if (rows.length < BATCH_SIZE) break;
      offset += BATCH_SIZE;
      pagina++;
    }

    console.log(`  -> Total no stage: ${totalLidos} registros`);

    // PASSO 4 — validar contagem mínima
    if (totalLidos < MIN_REGISTROS) {
      throw new Error(
        `Validação falhou: ${totalLidos} registros no stage, mínimo esperado ${MIN_REGISTROS}. ` +
          "Ajuste REMESSA_MIN_REGISTROS ou verifique a fonte.",
      );
    }

    // PASSO 5 — promover stage -> dw em transação
    console.log("  -> Promovendo stage para dw.fato_remessa_contabil...");
    await withPgTransaction(async (client) => {
      await client.query("TRUNCATE dw.fato_remessa_contabil CASCADE");
      await client.query(`
        INSERT INTO dw.fato_remessa_contabil (
          id_remessa, id_entidade, id_entidade_cjur, ano, numero,
          arquivo, data_confirmacao, data_envio, data_final, data_inicial,
          hash_arquivo, prazo_envio, protocolo_envio, situacao, status,
          tipo_liberacao, status_publicacao, nome_usuario_enviou,
          data_processamento, tempo_de_processamento, email_enviado,
          nome_entidade_confirmacao, alerta_publicado, observacao,
          etl_carregado_em
        )
        SELECT
          CAST(id_remessa AS bigint),
          id_entidade,
          id_entidade_cjur,
          ano,
          numero,
          arquivo,
          data_confirmacao,
          data_envio,
          data_final,
          data_inicial,
          hash_arquivo,
          prazo_envio,
          protocolo_envio,
          situacao,
          status,
          tipo_liberacao,
          status_publicacao,
          nome_usuario_enviou,
          data_processamento,
          tempo_de_processamento,
          CAST(email_enviado AS boolean),
          nome_entidade_confirmacao,
          alerta_publicado,
          observacao,
          now()
        FROM stage.remessa_contabil_stg
        WHERE id_remessa IS NOT NULL
          AND id_entidade IS NOT NULL
          AND ano IS NOT NULL
          AND numero IS NOT NULL
          AND data_final IS NOT NULL
          AND data_inicial IS NOT NULL
          AND prazo_envio IS NOT NULL
          AND situacao IS NOT NULL
          AND status IS NOT NULL
          AND tipo_liberacao IS NOT NULL
      `);
    });

    // PASSO 6 — verificar contagem final
    const rowsFinal = await pgQuery<{ total: string }>(
      "SELECT COUNT(*) AS total FROM dw.fato_remessa_contabil",
    );
    const totalGravado = parseInt(rowsFinal[0].total, 10);

    const duracao = Date.now() - inicio;
    console.log(
      `  OK - ETL concluído em ${duracao}ms | lidos: ${totalLidos} | gravados: ${totalGravado}`,
    );

    await registrarLogEtl({ modulo: MODULO, status: "ok", registros: totalGravado, duracaoMs: duracao });
    await finalizarCargaEtl({ idCarga, status: "ok", registrosLidos: totalLidos, registrosGravados: totalGravado });
  } catch (error) {
    const duracao = Date.now() - inicio;
    const mensagem = error instanceof Error ? error.message : String(error);
    console.error(`  ERRO - ${mensagem}`);
    await registrarLogEtl({ modulo: MODULO, status: "erro", registros: 0, duracaoMs: duracao, mensagem });
    await finalizarCargaEtl({ idCarga, status: "erro", registrosLidos: 0, registrosGravados: 0, mensagem });
    throw error;
  }
}

if (require.main === module) {
  executarCargaRemessasFullPostgres()
    .then(() => closePgPool())
    .catch(() => {
      closePgPool().catch(() => void 0);
      process.exit(1);
    });
}
