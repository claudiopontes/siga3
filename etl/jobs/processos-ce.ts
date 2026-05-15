/**
 * ETL: processos-ce
 * Carrega todos os processos de Controle Externo (Id_Tipo_Proc = 2)
 * da view EPROCESS.processo.vwProc_Eletronico para public.processo.
 *
 * Estratégia:
 *   - Carga inicial: todos os 21.422 CE
 *   - Incremental: atualiza campos que mudam (situacao, relator, orgao, partes)
 *     via ON CONFLICT DO UPDATE
 *
 * Uso:
 *   npx ts-node jobs/processos-ce.ts
 *   npx ts-node jobs/processos-ce.ts --dry-run
 */
import "dotenv/config";
import { queryInDatabase, closePool } from "../connectors/sqlserver";
import { pgQuery, closePgPool } from "../connectors/postgres";

const MODULO    = "processos_ce";
const DB        = process.env.EPROCESS_SQLSERVER_DATABASE ?? "EPROCESS";
const DRY_RUN   = process.argv.includes("--dry-run");
const BATCH     = 500;

interface SqlProcessoRow {
  Cod_Processo:          number;
  Num_proc_ano:          string | null;
  Ano_Processo:          number | null;
  Objeto:                string | null;
  nome_classe:           string | null;
  NM_ASSUN:              string | null;
  cod_classe:            number | null;
  Cod_Orgao:             string | null;
  RELATOR:               string | null;
  nome_1_parte:          string | null;
  Partes:                string | null;
  NM_STATUS:             number | null;
  Situacao_Funcional:    string | null;
  Processos_Apensados:   string | null;
  Nm_Tipo_Proc:          string | null;
  Dt_Processo:           string | null;
}

function toText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toDate(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.toISOString() : null;
  const d = new Date(String(v));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

export async function executarCargaProcessosCe(): Promise<void> {
  return main();
}

async function main() {
  const inicio = Date.now();
  console.log(`[${MODULO}] inicio — dry_run=${DRY_RUN}`);

  // 1. Busca todos os processos CE no SQL Server
  console.log("  -> Consultando vwProc_Eletronico (Id_Tipo_Proc = 2)...");
  const rows = await queryInDatabase<SqlProcessoRow>(DB, `
    SELECT
      p.Cod_Processo,
      p.Num_proc_ano,
      p.Ano_Processo,
      p.Objeto,
      p.nome_classe,
      p.NM_ASSUN,
      p.cod_classe,
      p.Cod_Orgao,
      p.RELATOR,
      p.nome_1_parte,
      p.Partes,
      p.NM_STATUS,
      p.Situacao_Funcional,
      p.Processos_Apensados,
      p.Nm_Tipo_Proc,
      p.Dt_Processo
    FROM processo.vwProc_Eletronico p
    WHERE p.Id_Tipo_Proc = 2
    ORDER BY p.Cod_Processo
  `);
  console.log(`  -> Processos encontrados: ${rows.length}`);

  if (!rows.length) {
    console.log("  Nada a processar.");
    return;
  }

  if (DRY_RUN) {
    console.log("  [dry-run] Exemplo:", JSON.stringify(rows[0], null, 2));
    return;
  }

  // 2. Upsert em lotes
  let inseridos = 0;
  let atualizados = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const lote = rows.slice(i, i + BATCH);

    for (const r of lote) {
      const result = await pgQuery<{ xmax: string }>(
        `INSERT INTO public.processo
           (processo_id, numero_fmt, ano, objeto, nome_classe, assunto,
            cod_classe, nome_orgao, nome_relator, nome_1_parte, partes,
            nm_status, situacao, processos_apensados, tipo_processo,
            dt_criacao, coletado_em, atualizado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,now(),now())
         ON CONFLICT (processo_id) DO UPDATE SET
           numero_fmt          = EXCLUDED.numero_fmt,
           nome_orgao          = EXCLUDED.nome_orgao,
           nome_relator        = EXCLUDED.nome_relator,
           nome_1_parte        = EXCLUDED.nome_1_parte,
           partes              = EXCLUDED.partes,
           nm_status           = EXCLUDED.nm_status,
           situacao            = EXCLUDED.situacao,
           processos_apensados = EXCLUDED.processos_apensados,
           atualizado_em       = now()
         RETURNING xmax::text`,
        [
          r.Cod_Processo,
          toText(r.Num_proc_ano),
          toInt(r.Ano_Processo),
          toText(r.Objeto),
          toText(r.nome_classe),
          toText(r.NM_ASSUN),
          toInt(r.cod_classe),
          toText(r.Cod_Orgao),
          toText(r.RELATOR),
          toText(r.nome_1_parte),
          toText(r.Partes),
          toInt(r.NM_STATUS),
          toText(r.Situacao_Funcional),
          toText(r.Processos_Apensados),
          toText(r.Nm_Tipo_Proc),
          toDate(r.Dt_Processo),
        ]
      );
      // xmax = 0 → INSERT novo; xmax > 0 → UPDATE de existente
      if (result[0]?.xmax === "0") inseridos++;
      else atualizados++;
    }

    const progresso = Math.min(i + BATCH, rows.length);
    if (progresso % 2000 === 0 || progresso === rows.length) {
      console.log(`  -> Progresso: ${progresso}/${rows.length} (${inseridos} novos, ${atualizados} atualizados)`);
    }
  }

  const duracao = Date.now() - inicio;
  console.log(`  OK — ${MODULO} em ${duracao} ms (${inseridos} inseridos, ${atualizados} atualizados)`);

  await pgQuery(
    `INSERT INTO audit.etl_log (modulo, status, registros, duracao_ms)
     VALUES ($1, 'sucesso', $2, $3)
     ON CONFLICT DO NOTHING`,
    [MODULO, inseridos + atualizados, duracao]
  ).catch(() => undefined); // log é best-effort
}

main()
  .catch(e => { console.error("ERRO FATAL:", e instanceof Error ? e.message : e); process.exit(1); })
  .finally(async () => { await closePool(); await closePgPool(); });
