/**
 * ETL — Bootstrap do audit de sincronização da Folha SICAP (Fase 17B.1)
 *
 * Popula audit.folha_sicap_remessa_sync a partir do estado atual das
 * tabelas-fato folha.fato_contracheque e folha.fato_verba_contracheque,
 * calculando o hash de assinatura com EXATAMENTE a mesma função do job
 * principal (folha-sicap-carga-base.ts).
 *
 * Quando rodar:
 *   - 1x após aplicar a migration 290 (cria a tabela audit).
 *   - Idempotente: pode rodar de novo a qualquer momento — só reflete
 *     o estado atual (cc, verbas) e o hash atual da remessa no SICAP.
 *
 * O que faz:
 *   1. Lista (id_entidade_cjur, ano, mes) distintos em folha.fato_contracheque.
 *   2. Para cada par, busca a remessa correspondente no SICAP e calcula o hash.
 *   3. Conta cc e verbas no Postgres por chave.
 *   4. UPSERT em audit.folha_sicap_remessa_sync.
 *
 * Uso:
 *   cd etl
 *   npm run folha:sicap:bootstrap-audit
 */

import "dotenv/config";
import * as crypto from "crypto";
import sql from "mssql/msnodesqlv8";
import { pgQuery, closePgPool } from "../connectors/postgres";

const MODULO = "folha_sicap_bootstrap_audit";

const SICAP_DATABASE = process.env.SICAP_SQLSERVER_DATABASE || "SICAP";
const SICAP_HOST = process.env.SICAP_SQLSERVER_HOST || process.env.SQLSERVER_HOST || "";
const SICAP_PORT = parseInt(process.env.SICAP_SQLSERVER_PORT || "1433", 10);
const SICAP_USER = process.env.SICAP_SQLSERVER_USER || "";
const SICAP_PASSWORD = process.env.SICAP_SQLSERVER_PASSWORD || "";
const SICAP_ENCRYPT = (process.env.SICAP_SQLSERVER_ENCRYPT || "false").toLowerCase() === "true";

let sicapPool: sql.ConnectionPool | null = null;

async function getSicapPool(): Promise<sql.ConnectionPool> {
  if (sicapPool?.connected) return sicapPool;
  const usaTrustedConnection = !SICAP_USER || !SICAP_PASSWORD;
  const config: sql.config = {
    server: SICAP_HOST,
    database: SICAP_DATABASE,
    port: SICAP_PORT,
    user: usaTrustedConnection ? undefined : SICAP_USER,
    password: usaTrustedConnection ? undefined : SICAP_PASSWORD,
    options: {
      trustedConnection: usaTrustedConnection,
      trustServerCertificate: true,
      encrypt: SICAP_ENCRYPT,
    },
    connectionTimeout: 30000,
    requestTimeout: 600000,
  };
  sicapPool = new sql.ConnectionPool(config);
  await sicapPool.connect();
  return sicapPool;
}

async function closeSicapPool(): Promise<void> {
  if (sicapPool) {
    try { await sicapPool.close(); } catch { /* ignora */ }
    sicapPool = null;
  }
}

async function sicapQuery<T>(queryStr: string): Promise<T[]> {
  const pool = await getSicapPool();
  const result = await pool.request().query(queryStr);
  return result.recordset as T[];
}

// Replica exata da função em folha-sicap-carga-base.ts.
function calcularHashAssinatura(
  idRemessa: number | string | null | undefined,
  dataEnvio: unknown,
  dataConfirmacao: unknown,
  tempoAtraso: unknown,
): string {
  const norm = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    if (v instanceof Date) return v.toISOString();
    return String(v);
  };
  const assinatura = [norm(idRemessa), norm(dataEnvio), norm(dataConfirmacao), norm(tempoAtraso)].join("|");
  return crypto.createHash("sha256").update(assinatura).digest("hex");
}

export async function executarBootstrapAudit(): Promise<void> {
  const inicio = Date.now();
  console.log(`[${new Date().toISOString()}] Iniciando: ${MODULO}`);
  console.log(`  -> Fonte SQL Server: ${SICAP_HOST || "(SQLSERVER_HOST global)"} / ${SICAP_DATABASE}`);
  console.log(`  -> Destino: audit.folha_sicap_remessa_sync`);

  // 1) Lista chaves presentes na fato_contracheque
  console.log(`\n[1/4] Listando chaves presentes em folha.fato_contracheque...`);
  const chaves = await pgQuery<{
    id_entidade_cjur: number;
    ano: number;
    mes: number;
    qtd_contracheques: number;
  }>(`
    SELECT id_entidade_cjur, ano, mes, COUNT(*)::int AS qtd_contracheques
      FROM folha.fato_contracheque
     GROUP BY id_entidade_cjur, ano, mes
     ORDER BY ano, mes, id_entidade_cjur
  `);
  console.log(`  -> ${chaves.length} chave(s) (entidade × ano × mes) encontradas.`);
  if (chaves.length === 0) {
    console.log(`  Nada a fazer. Encerrando.`);
    return;
  }

  // 2) Contagens de verbas em paralelo no Postgres
  console.log(`\n[2/4] Contando verbas no Postgres por chave...`);
  const verbasPorChave = await pgQuery<{
    id_entidade_cjur: number;
    ano: number;
    mes: number;
    qtd_verbas: number;
  }>(`
    SELECT id_entidade_cjur, ano, mes, COUNT(*)::int AS qtd_verbas
      FROM folha.fato_verba_contracheque
     GROUP BY id_entidade_cjur, ano, mes
  `);
  const mapaVerbas = new Map<string, number>();
  for (const v of verbasPorChave) {
    mapaVerbas.set(`${v.id_entidade_cjur}|${v.ano}|${v.mes}`, v.qtd_verbas);
  }
  console.log(`  -> ${verbasPorChave.length} chaves com verbas.`);

  // 3) Lista remessas SICAP cobrindo todas as competências envolvidas
  console.log(`\n[3/4] Buscando remessas correspondentes no SICAP...`);
  const competencias = Array.from(
    new Set(chaves.map((c) => `${c.ano}-${c.mes}`)),
  ).map((s) => {
    const [a, m] = s.split("-").map(Number);
    return { ano: a, mes: m };
  });
  const filtroCompetencias = competencias.map((c) => `(r.ano = ${c.ano} AND r.mes = ${c.mes})`).join(" OR ");
  const remessas = await sicapQuery<{
    id_entidade_cjur: number;
    ano: number;
    mes: number;
    id_remessa_sicap: number | string;
    data_envio: Date | string | null;
    data_confirmacao: Date | string | null;
    tempo_atraso: number | null;
  }>(`
    SELECT
      r.idEntidadeCjur     AS id_entidade_cjur,
      r.ano                AS ano,
      r.mes                AS mes,
      r.id                 AS id_remessa_sicap,
      r.dataEnvio          AS data_envio,
      r.dataConfirmacao    AS data_confirmacao,
      r.tempoAtraso        AS tempo_atraso
    FROM remessa.Remessa r
    WHERE ${filtroCompetencias}
  `);
  const mapaRemessas = new Map<string, {
    id_remessa_sicap: number;
    hash: string;
  }>();
  for (const r of remessas) {
    const k = `${Number(r.id_entidade_cjur)}|${Number(r.ano)}|${Number(r.mes)}`;
    mapaRemessas.set(k, {
      id_remessa_sicap: Number(r.id_remessa_sicap),
      hash: calcularHashAssinatura(r.id_remessa_sicap, r.data_envio, r.data_confirmacao, r.tempo_atraso),
    });
  }
  console.log(`  -> ${remessas.length} remessas encontradas no SICAP.`);

  // 4) UPSERT no audit
  console.log(`\n[4/4] Gravando audit.folha_sicap_remessa_sync...`);
  let inseridas = 0;
  let semRemessa = 0;
  for (const ch of chaves) {
    const k = `${ch.id_entidade_cjur}|${ch.ano}|${ch.mes}`;
    const rem = mapaRemessas.get(k);
    if (!rem) {
      semRemessa += 1;
      console.warn(`  [aviso] sem remessa no SICAP para entidade=${ch.id_entidade_cjur} ${ch.ano}-${String(ch.mes).padStart(2, "0")} — pulando.`);
      continue;
    }
    await pgQuery(
      `INSERT INTO audit.folha_sicap_remessa_sync
         (id_entidade_cjur, ano, mes, id_remessa_sicap, hash_assinatura,
          qtd_contracheques, qtd_verbas, sincronizado_em, id_carga_etl)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now(), NULL)
       ON CONFLICT (id_entidade_cjur, ano, mes) DO UPDATE SET
         id_remessa_sicap = EXCLUDED.id_remessa_sicap,
         hash_assinatura  = EXCLUDED.hash_assinatura,
         qtd_contracheques = EXCLUDED.qtd_contracheques,
         qtd_verbas        = EXCLUDED.qtd_verbas,
         sincronizado_em   = now()`,
      [
        ch.id_entidade_cjur, ch.ano, ch.mes,
        rem.id_remessa_sicap, rem.hash,
        ch.qtd_contracheques,
        mapaVerbas.get(k) ?? 0,
      ],
    );
    inseridas += 1;
  }

  const duracao = Date.now() - inicio;
  console.log(`\n=== RESUMO ${MODULO} ===`);
  console.log(`  Chaves no Postgres:        ${chaves.length}`);
  console.log(`  Remessas casadas (SICAP):  ${inseridas}`);
  console.log(`  Sem remessa correspondente: ${semRemessa}`);
  console.log(`  Tempo total: ${duracao} ms`);
}

if (require.main === module) {
  executarBootstrapAudit()
    .then(async () => {
      await closeSicapPool();
      await closePgPool();
    })
    .catch(async (err) => {
      console.error(`ERRO no ${MODULO}:`, err);
      await closeSicapPool();
      await closePgPool().catch(() => void 0);
      process.exit(1);
    });
}
