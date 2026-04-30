import "dotenv/config";
import crypto from "node:crypto";
import { query, closePool } from "../connectors/sqlserver";
import { getSupabase } from "../connectors/supabase";

const MODULO = "processos_gabinete";
const SQL_DATABASE = process.env.PROCESSOS_GABINETE_SQLSERVER_DATABASE ?? "EPROCESS";
const VIEW_ORIGEM = process.env.PROCESSOS_GABINETE_VIEW ?? "audit.vw_ProcessosGabinetesConselheiros";
const DRY_RUN = process.argv.includes("--dry-run");
const SUPABASE_BATCH = 500;

interface SqlProcessoGabineteRow {
  relator: string | null;
  atividade_atual: string | null;
  duracao_setor_dias: number | null;
  id_grupo: number | null;
  grupo_atual: string | null;
  ic_gabinete_cons: number | null;
  setor: string | null;
  usuario_atual: string | null;
  assunto: string | null;
  classe: string | null;
  orgao: string | null;
  processo: number | null;
  data_criacao: Date | string | null;
  data_chegada_setor_atual: Date | string | null;
  tempo_de_registro_dias: number | null;
  prazo_regulamentado_dias: number | null;
  dias_em_atraso: number | null;
  flag_mais_15_dias: number | null;
  flag_processo_sensivel: number | null;
  flag_prazo_regulamentar_vencido: number | null;
}

type SupabaseProcessoGabineteRow = {
  carga_id: number;
  relator: string | null;
  id_grupo: number | null;
  grupo_atual: string | null;
  ic_gabinete_cons: number;
  setor: string | null;
  usuario_atual: string | null;
  processo: number | null;
  assunto: string | null;
  classe: string | null;
  orgao: string | null;
  atividade_atual: string | null;
  data_criacao: string | null;
  data_chegada_setor_atual: string | null;
  duracao_setor_dias: number | null;
  tempo_de_registro_dias: number | null;
  prazo_regulamentado_dias: number | null;
  dias_em_atraso: number | null;
  flag_mais_15_dias: number;
  flag_processo_sensivel: number;
  flag_prazo_regulamentar_vencido: number;
  dados: Record<string, unknown>;
  hash_registro: string;
  coletado_em: string;
};

type ResumoGabinete = {
  grupo_atual: string;
  total: number;
  mais_15_dias: number;
  sensiveis: number;
  prazo_vencido: number;
};

const SQL_PROCESSOS_GABINETE = `
USE [${SQL_DATABASE}];

SELECT
    relator,
    atividade_atual,
    duracao_setor_dias,
    id_grupo,
    grupo_atual,
    ic_gabinete_cons,
    setor,
    usuario_atual,
    assunto,
    classe,
    orgao,
    processo,
    data_criacao,
    data_chegada_setor_atual,
    tempo_de_registro_dias,
    prazo_regulamentado_dias,
    dias_em_atraso,
    flag_mais_15_dias,
    flag_processo_sensivel,
    flag_prazo_regulamentar_vencido
FROM ${VIEW_ORIGEM}
ORDER BY
    grupo_atual,
    duracao_setor_dias DESC,
    processo;
`;

function assertSafeSqlIdentifier(identifier: string): void {
  if (!/^[A-Za-z0-9_.\[\]]+$/.test(identifier)) {
    throw new Error(`Identificador SQL invalido em PROCESSOS_GABINETE_VIEW: ${identifier}`);
  }
}

function assertSafeSqlDatabase(identifier: string): void {
  if (!/^[A-Za-z0-9_]+$/.test(identifier)) {
    throw new Error(`Identificador SQL invalido em PROCESSOS_GABINETE_SQLSERVER_DATABASE: ${identifier}`);
  }
}

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? value.toISOString() : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const date = new Date(trimmed);
    const time = date.getTime();
    return Number.isFinite(time) ? date.toISOString() : null;
  }
  return null;
}

function toInt(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}

function toNullableInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function normalizeFlag(value: unknown): number {
  if (value === 1 || value === true) return 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true") return 1;
  }
  return 0;
}

function jsonSafe(value: unknown): unknown {
  if (value instanceof Date) return toIso(value);
  return value;
}

function normalizarDadosOriginais(row: SqlProcessoGabineteRow): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, jsonSafe(value)]));
}

function gerarHash(row: Omit<SupabaseProcessoGabineteRow, "carga_id" | "dados" | "hash_registro" | "coletado_em">): string {
  return crypto
    .createHash("sha256")
    .update(
      [
        row.processo,
        row.id_grupo,
        row.grupo_atual,
        row.atividade_atual,
        row.data_chegada_setor_atual,
        row.flag_mais_15_dias,
        row.flag_processo_sensivel,
        row.flag_prazo_regulamentar_vencido,
      ].map((value) => value ?? "").join("|"),
    )
    .digest("hex");
}

function mapRow(row: SqlProcessoGabineteRow): Omit<SupabaseProcessoGabineteRow, "carga_id"> {
  const normalizado = {
    relator: toText(row.relator),
    id_grupo: toNullableInt(row.id_grupo),
    grupo_atual: toText(row.grupo_atual),
    ic_gabinete_cons: toInt(row.ic_gabinete_cons, 0),
    setor: toText(row.setor),
    usuario_atual: toText(row.usuario_atual),
    processo: toNullableInt(row.processo),
    assunto: toText(row.assunto),
    classe: toText(row.classe),
    orgao: toText(row.orgao),
    atividade_atual: toText(row.atividade_atual),
    data_criacao: toIso(row.data_criacao),
    data_chegada_setor_atual: toIso(row.data_chegada_setor_atual),
    duracao_setor_dias: toNullableInt(row.duracao_setor_dias),
    tempo_de_registro_dias: toNullableInt(row.tempo_de_registro_dias),
    prazo_regulamentado_dias: toNullableInt(row.prazo_regulamentado_dias),
    dias_em_atraso: toNullableInt(row.dias_em_atraso),
    flag_mais_15_dias: normalizeFlag(row.flag_mais_15_dias),
    flag_processo_sensivel: normalizeFlag(row.flag_processo_sensivel),
    flag_prazo_regulamentar_vencido: normalizeFlag(row.flag_prazo_regulamentar_vencido),
  };

  return {
    ...normalizado,
    dados: normalizarDadosOriginais(row),
    hash_registro: gerarHash(normalizado),
    coletado_em: new Date().toISOString(),
  };
}

function deduplicarRegistros(
  rows: Omit<SupabaseProcessoGabineteRow, "carga_id">[],
): Omit<SupabaseProcessoGabineteRow, "carga_id">[] {
  const porHash = new Map<string, Omit<SupabaseProcessoGabineteRow, "carga_id">>();
  for (const row of rows) {
    if (!porHash.has(row.hash_registro)) porHash.set(row.hash_registro, row);
  }
  return [...porHash.values()];
}

function contarFlag(rows: Omit<SupabaseProcessoGabineteRow, "carga_id">[], flag: keyof Pick<
  SupabaseProcessoGabineteRow,
  "flag_mais_15_dias" | "flag_processo_sensivel" | "flag_prazo_regulamentar_vencido"
>): number {
  return rows.filter((row) => row[flag] === 1).length;
}

function gerarResumoPorGabinete(rows: Omit<SupabaseProcessoGabineteRow, "carga_id">[]): ResumoGabinete[] {
  const resumo = new Map<string, ResumoGabinete>();
  for (const row of rows) {
    const grupo = row.grupo_atual ?? "Sem gabinete informado";
    const atual = resumo.get(grupo) ?? {
      grupo_atual: grupo,
      total: 0,
      mais_15_dias: 0,
      sensiveis: 0,
      prazo_vencido: 0,
    };
    atual.total += 1;
    atual.mais_15_dias += row.flag_mais_15_dias;
    atual.sensiveis += row.flag_processo_sensivel;
    atual.prazo_vencido += row.flag_prazo_regulamentar_vencido;
    resumo.set(grupo, atual);
  }
  return [...resumo.values()].sort((a, b) => b.total - a.total || a.grupo_atual.localeCompare(b.grupo_atual));
}

async function gravarLog(status: "sucesso" | "erro", registros: number, duracao: number, mensagem?: string): Promise<void> {
  const supabase = getSupabase();
  await supabase.from("etl_log").insert({
    modulo: MODULO,
    status,
    mensagem: mensagem ?? null,
    registros,
    duracao_ms: duracao,
  });
}

async function criarCarga(): Promise<number> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("processos_gabinete_carga")
    .insert({
      fonte: "sqlserver",
      view_origem: VIEW_ORIGEM,
      status: "iniciada",
      registros: 0,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Erro ao criar processos_gabinete_carga: ${error.message}`);
  return (data as { id: number }).id;
}

async function finalizarCarga(cargaId: number, status: "sucesso" | "erro", registros: number, mensagem?: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("processos_gabinete_carga")
    .update({
      status,
      finalizado_em: new Date().toISOString(),
      registros,
      mensagem: mensagem ?? null,
    })
    .eq("id", cargaId);

  if (error) throw new Error(`Erro ao finalizar processos_gabinete_carga ${cargaId}: ${error.message}`);
}

async function inserirLotes(rows: Omit<SupabaseProcessoGabineteRow, "carga_id">[], cargaId: number): Promise<number> {
  const supabase = getSupabase();
  let inseridos = 0;

  for (let i = 0; i < rows.length; i += SUPABASE_BATCH) {
    const lote = rows.slice(i, i + SUPABASE_BATCH).map((row) => ({ ...row, carga_id: cargaId }));
    const { error } = await supabase.from("processos_gabinete_raw").insert(lote);
    if (error) {
      throw new Error(`Erro ao inserir processos_gabinete_raw (lote ${i / SUPABASE_BATCH + 1}): ${error.message}`);
    }
    inseridos += lote.length;
  }

  return inseridos;
}

function imprimirDryRun(rows: Omit<SupabaseProcessoGabineteRow, "carga_id">[], totalOrigem: number): void {
  const totalMais15 = contarFlag(rows, "flag_mais_15_dias");
  const totalSensiveis = contarFlag(rows, "flag_processo_sensivel");
  const totalPrazoVencido = contarFlag(rows, "flag_prazo_regulamentar_vencido");

  console.log("\n--- DRY-RUN: processos_gabinete ---");
  console.log(`  VIEW_ORIGEM: ${VIEW_ORIGEM}`);
  console.log(`  Registros retornados SQL Server: ${totalOrigem}`);
  console.log(`  Registros mapeados unicos: ${rows.length}`);
  console.log(`  flag_mais_15_dias = 1: ${totalMais15}`);
  console.log(`  flag_processo_sensivel = 1: ${totalSensiveis}`);
  console.log(`  flag_prazo_regulamentar_vencido = 1: ${totalPrazoVencido}`);
  console.log("\n  Resumo por gabinete atual:");
  for (const item of gerarResumoPorGabinete(rows)) {
    console.log(
      `  - ${item.grupo_atual}: total=${item.total}, mais_15=${item.mais_15_dias}, sensiveis=${item.sensiveis}, prazo_vencido=${item.prazo_vencido}`,
    );
  }
  console.log("\n  5 primeiros registros mapeados:");
  console.dir(rows.slice(0, 5), { depth: null });
  console.log("--- Fim dry-run ---\n");
}

export async function executarCargaProcessosGabinete(): Promise<void> {
  const inicio = Date.now();
  console.log(`[${new Date().toISOString()}] Iniciando ETL: ${MODULO}`);
  if (DRY_RUN) console.log("  -> Modo dry-run ativo. Nenhum dado sera gravado no Supabase.");

  assertSafeSqlDatabase(SQL_DATABASE);
  assertSafeSqlIdentifier(VIEW_ORIGEM);

  let cargaId: number | null = null;
  let inseridos = 0;

  try {
    console.log("  -> Consultando SQL Server...");
    console.log(`     banco=${SQL_DATABASE} view=${VIEW_ORIGEM}`);
    const rowsSql = await query<SqlProcessoGabineteRow>(SQL_PROCESSOS_GABINETE);
    const registrosMapeados = rowsSql.map(mapRow);
    const registros = deduplicarRegistros(registrosMapeados);

    const totalMais15 = contarFlag(registros, "flag_mais_15_dias");
    const totalSensiveis = contarFlag(registros, "flag_processo_sensivel");
    const totalPrazoVencido = contarFlag(registros, "flag_prazo_regulamentar_vencido");

    console.log(`  -> Registros encontrados: ${rowsSql.length}`);
    if (registros.length !== rowsSql.length) {
      console.log(`  -> Registros unicos por hash: ${registros.length} (${rowsSql.length - registros.length} duplicados ignorados)`);
    }
    console.log(`  -> Processos ha mais de 15 dias: ${totalMais15}`);
    console.log(`  -> Processos sensiveis: ${totalSensiveis}`);
    console.log(`  -> Processos com prazo regulamentar vencido: ${totalPrazoVencido}`);

    if (DRY_RUN) {
      imprimirDryRun(registros, rowsSql.length);
      return;
    }

    console.log("  -> Criando carga no Supabase...");
    cargaId = await criarCarga();
    console.log(`     carga_id=${cargaId}`);

    console.log("  -> Inserindo registros...");
    inseridos = await inserirLotes(registros, cargaId);

    await finalizarCarga(cargaId, "sucesso", inseridos);

    const duracao = Date.now() - inicio;
    await gravarLog("sucesso", inseridos, duracao);
    console.log(`  OK - ${MODULO} carregado em ${duracao} ms (${inseridos} registros)`);
  } catch (error) {
    const duracao = Date.now() - inicio;
    const mensagem = error instanceof Error ? error.message : String(error);
    console.error(`  ERRO - ${mensagem}`);

    if (cargaId !== null) {
      await finalizarCarga(cargaId, "erro", inseridos, mensagem).catch((finalizarErro) => {
        const msg = finalizarErro instanceof Error ? finalizarErro.message : String(finalizarErro);
        console.error(`  ERRO ao atualizar carga com falha: ${msg}`);
      });
    }

    await gravarLog("erro", inseridos, duracao, mensagem).catch((logErro) => {
      const msg = logErro instanceof Error ? logErro.message : String(logErro);
      console.error(`  ERRO ao gravar etl_log: ${msg}`);
    });
    throw error;
  } finally {
    await closePool();
  }
}

if (require.main === module) {
  executarCargaProcessosGabinete().catch(() => process.exit(1));
}
