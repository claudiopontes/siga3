/**
 * ETL - Painel Receita Publica
 * Fonte: audit.vw_ReceitaPorCategoria (SQL Server)
 * Destino: Supabase.receita_publica_categoria_mensal
 */

import "dotenv/config";
import { queryInDatabase } from "../connectors/sqlserver";
import { pgQuery, closePgPool } from "../connectors/postgres";

type ModoCarga = "FULL" | "INCREMENTAL";

type Periodo = {
  ano: number;
  mes: number;
};

type ReceitaRow = {
  id_remessa: number;
  id_entidade_cjur: number | null;
  id_entidade: number;
  ano: number;
  mes: number;
  id_natureza_receita_orcamentaria: number | null;
  id_catreceita: number | null;
  codigo: string;
  natureza_codigo: string | null;
  natureza_nome: string | null;
  natureza_descricao: string | null;
  natureza_nivel: number | null;
  natureza_tipo: string | null;
  natureza_ano_inicio: number | null;
  natureza_ano_fim: number | null;
  numero_fonte_recurso: number | null;
  fonte_classificacao: string | null;
  fonte_nome: string | null;
  codigo_conta_contabil: string;
  tipo_receita: string;
  previsao_inicial: number;
  previsao_atualizada: number;
  receita_realizada: number;
  registros_origem: number;
  atualizado_em: string;
};

const MODULO = "receita_publica";

const SQL_DATABASE = process.env.RECEITA_PUBLICA_SQLSERVER_DATABASE || process.env.SQLSERVER_APC_DATABASE || "APC";
const SOURCE_VIEW = process.env.RECEITA_PUBLICA_SOURCE_VIEW || "audit.vw_ReceitaPorCategoria_Polanco";
const PG_TABLE = process.env.RECEITA_PUBLICA_SUPABASE_TABLE || "receita_publica_categoria_mensal";
const MODO_CARGA = normalizeModo(process.env.RECEITA_PUBLICA_MODO_CARGA || "INCREMENTAL");
const LOOKBACK_MESES = toNonNegativeInt(Number(process.env.RECEITA_PUBLICA_LOOKBACK_MESES || "3"), 3);
const ANO_INICIO = toOptionalPositiveInt(process.env.RECEITA_PUBLICA_ANO_INICIO);
const PG_INSERT_BATCH = toPositiveInt(Number(process.env.RECEITA_PUBLICA_SUPABASE_BATCH || "500"), 500);

function normalizeModo(value: string): ModoCarga {
  return value.toUpperCase() === "FULL" ? "FULL" : "INCREMENTAL";
}

function toPositiveInt(input: number, fallback: number): number {
  if (!Number.isFinite(input) || input < 1) return fallback;
  return Math.trunc(input);
}

function toNonNegativeInt(input: number, fallback: number): number {
  if (!Number.isFinite(input) || input < 0) return fallback;
  return Math.trunc(input);
}

function toOptionalPositiveInt(input: string | undefined): number | null {
  if (!input) return null;
  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return Math.trunc(parsed);
}

function assertSafeSqlIdentifier(identifier: string): void {
  if (!/^[A-Za-z0-9_\].\[]+$/.test(identifier)) {
    throw new Error(`Identificador SQL invalido em RECEITA_PUBLICA_SOURCE_VIEW: ${identifier}`);
  }
}

function competencia(row: Periodo): number {
  return row.ano * 100 + row.mes;
}

function addMonths(row: Periodo, delta: number): Periodo {
  const date = new Date(Date.UTC(row.ano, row.mes - 1 + delta, 1));
  return { ano: date.getUTCFullYear(), mes: date.getUTCMonth() + 1 };
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

async function buscarPeriodosFonte(): Promise<Periodo[]> {
  assertSafeSqlIdentifier(SOURCE_VIEW);

  const filtroAno = ANO_INICIO ? `WHERE ANO >= ${ANO_INICIO}` : "";
  const sql = `
SELECT DISTINCT ANO AS ano, MES AS mes
FROM ${SOURCE_VIEW}
${filtroAno}
ORDER BY ANO, MES;
`;
  return queryInDatabase<Periodo>(SQL_DATABASE, sql);
}

async function buscarUltimoPeriodoDestino(): Promise<Periodo | null> {
  const rows = await pgQuery<Periodo>(
    `SELECT ano, mes FROM public.${PG_TABLE}
     ORDER BY ano DESC, mes DESC
     LIMIT 1`,
  );
  if (rows.length === 0) return null;
  return { ano: rows[0].ano, mes: rows[0].mes };
}

async function escolherPeriodosCarga(): Promise<Periodo[]> {
  const periodosFonte = await buscarPeriodosFonte();
  if (periodosFonte.length === 0) return [];
  if (MODO_CARGA === "FULL") return periodosFonte;

  const ultimoDestino = await buscarUltimoPeriodoDestino();
  if (!ultimoDestino) return periodosFonte;

  const inicio = competencia(addMonths(ultimoDestino, -LOOKBACK_MESES));
  return periodosFonte.filter((periodo) => competencia(periodo) >= inicio);
}

async function carregarDados(periodos: Periodo[]): Promise<ReceitaRow[]> {
  if (periodos.length === 0) return [];

  const agora = new Date().toISOString();
  const sql = `
SELECT
  r.ID_REMESSA AS id_remessa,
  r.ID_ENTIDADE_CJUR AS id_entidade_cjur,
  r.ID_ENTIDADE AS id_entidade,
  r.ANO AS ano,
  r.MES AS mes,
  r.ID_NATUREZA_RECEITA_ORCAMENTARIA AS id_natureza_receita_orcamentaria,
  r.ID_CATRECEITA AS id_catreceita,
  r.CODIGO AS codigo,
  MAX(nro.CODIGO) AS natureza_codigo,
  MAX(CAST(nro.NOME AS VARCHAR(500))) AS natureza_nome,
  MAX(CAST(nro.DESCRICAO AS VARCHAR(MAX))) AS natureza_descricao,
  MAX(nro.NIVEL) AS natureza_nivel,
  MAX(nro.TIPO) AS natureza_tipo,
  MAX(nro.ANO_INICIO) AS natureza_ano_inicio,
  MAX(nro.ANO_FIM) AS natureza_ano_fim,
  r.NUMERO_FONTE_RECURSO AS numero_fonte_recurso,
  MAX(r.FONTE_CLASSIFICACAO) AS fonte_classificacao,
  MAX(r.FONTE_NOME) AS fonte_nome,
  r.CODIGO_CONTA_CONTABIL AS codigo_conta_contabil,
  r.TIPO_RECEITA AS tipo_receita,
  SUM(r.PREVISAO_INICIAL) AS previsao_inicial,
  SUM(r.PREVISAO_ATUALIZADA) AS previsao_atualizada,
  SUM(r.RECEITA_REALIZADA) AS receita_realizada,
  COUNT_BIG(1) AS registros_origem,
  '${agora}' AS atualizado_em
FROM ${SOURCE_VIEW} r
LEFT JOIN referencias.NATUREZA_RECEITA_ORCAMENTARIA nro
  ON nro.ID_NATUREZA = r.ID_NATUREZA_RECEITA_ORCAMENTARIA
WHERE ${periodos.map((p) => `(r.ANO = ${p.ano} AND r.MES = ${p.mes})`).join(" OR ")}
GROUP BY
  r.ID_REMESSA,
  r.ID_ENTIDADE_CJUR,
  r.ID_ENTIDADE,
  r.ANO,
  r.MES,
  r.ID_NATUREZA_RECEITA_ORCAMENTARIA,
  r.ID_CATRECEITA,
  r.CODIGO,
  r.NUMERO_FONTE_RECURSO,
  r.CODIGO_CONTA_CONTABIL,
  r.TIPO_RECEITA
HAVING SUM(r.PREVISAO_INICIAL) <> 0
    OR SUM(r.PREVISAO_ATUALIZADA) <> 0
    OR SUM(r.RECEITA_REALIZADA) <> 0
ORDER BY r.ANO, r.MES, r.ID_ENTIDADE, r.CODIGO;
`;

  return queryInDatabase<ReceitaRow>(SQL_DATABASE, sql);
}

async function limparPeriodos(periodos: Periodo[]): Promise<void> {
  for (const periodo of periodos) {
    await pgQuery(
      `DELETE FROM public.${PG_TABLE} WHERE ano = $1 AND mes = $2`,
      [periodo.ano, periodo.mes],
    );
  }
}

async function inserirEmLotes(rows: ReceitaRow[], batchSize: number): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    for (const r of batch) {
      await pgQuery(
        `INSERT INTO public.${PG_TABLE} (
           id_remessa, id_entidade_cjur, id_entidade, ano, mes,
           id_natureza_receita_orcamentaria, id_catreceita, codigo,
           natureza_codigo, natureza_nome, natureza_descricao, natureza_nivel, natureza_tipo,
           natureza_ano_inicio, natureza_ano_fim, numero_fonte_recurso, fonte_classificacao, fonte_nome,
           codigo_conta_contabil, tipo_receita, previsao_inicial, previsao_atualizada,
           receita_realizada, registros_origem, atualizado_em
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25
         )`,
        [
          r.id_remessa, r.id_entidade_cjur, r.id_entidade, r.ano, r.mes,
          r.id_natureza_receita_orcamentaria, r.id_catreceita, r.codigo,
          r.natureza_codigo, r.natureza_nome, r.natureza_descricao, r.natureza_nivel, r.natureza_tipo,
          r.natureza_ano_inicio, r.natureza_ano_fim, r.numero_fonte_recurso, r.fonte_classificacao, r.fonte_nome,
          r.codigo_conta_contabil, r.tipo_receita, r.previsao_inicial, r.previsao_atualizada,
          r.receita_realizada, r.registros_origem, r.atualizado_em,
        ],
      );
    }
  }
}

export async function executarETLReceitaPublica(): Promise<void> {
  const inicio = Date.now();
  console.log(`[${new Date().toISOString()}] Iniciando ETL: ${MODULO}`);
  console.log(`  -> Fonte SQL: ${SQL_DATABASE}.${SOURCE_VIEW}`);
  console.log(`  -> Destino PostgreSQL: ${PG_TABLE}`);
  console.log(`  -> Modo: ${MODO_CARGA}${MODO_CARGA === "INCREMENTAL" ? ` (lookback=${LOOKBACK_MESES} meses)` : ""}`);

  try {
    await validarDestino();

    const periodos = await escolherPeriodosCarga();
    if (periodos.length === 0) {
      const duracao = Date.now() - inicio;
      console.log("  -> Nenhum periodo encontrado para carga.");
      await gravarLog("sucesso", 0, duracao, "Nenhum periodo encontrado para carga");
      return;
    }

    const primeiro = periodos[0];
    const ultimo = periodos[periodos.length - 1];
    console.log(`  -> Periodos: ${periodos.length} (${primeiro.ano}-${primeiro.mes} a ${ultimo.ano}-${ultimo.mes})`);

    const rows = await carregarDados(periodos);
    console.log(`  -> Registros agregados: ${rows.length}`);

    console.log("  -> Limpando periodos de destino...");
    await limparPeriodos(periodos);

    console.log("  -> Inserindo dados no PostgreSQL...");
    await inserirEmLotes(rows, PG_INSERT_BATCH);

    const duracao = Date.now() - inicio;
    console.log(`  OK - ETL concluido em ${duracao}ms (${rows.length} registros)`);
    await gravarLog("sucesso", rows.length, duracao);
  } catch (error) {
    const duracao = Date.now() - inicio;
    const mensagem = error instanceof Error ? error.message : String(error);
    console.error(`  ERRO - ${mensagem}`);
    await gravarLog("erro", 0, duracao, mensagem);
    throw error;
  }
}

if (require.main === module) {
  executarETLReceitaPublica()
    .catch(() => process.exit(1))
    .finally(() => closePgPool());
}
