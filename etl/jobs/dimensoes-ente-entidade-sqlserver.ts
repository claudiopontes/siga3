/**
 * ETL - Dimensoes oficiais ENTE/ENTIDADE (SQL Server -> Supabase)
 * Estratégia: upsert diário por chave primária (incremental por PK)
 */

import "dotenv/config";
import { queryInDatabase } from "../connectors/sqlserver";
import { getSupabase } from "../connectors/supabase";

type EnteRow = {
  id_ente: number;
  codigo: number;
  nome: string;
  populacao: number | null;
  cod_ibgce: number | null;
  regiao: string | null;
  cnpj_mascara: string | null;
  cod_municipio: string | null;
  atualizado_em: string;
};

type EntidadeRow = {
  id_entidade: number;
  ano_inicio: number | null;
  ano_referencia: number;
  codigo: number | null;
  data_inativo: string | null;
  id_entidade_cjur: number;
  id_entidade_executivo: number;
  inativo: number;
  mes_inicio: number | null;
  mes_referencia: number;
  nome: string;
  planejamento: number;
  rgf: number;
  rreo: number;
  id_classificacao_administrativa: number;
  id_ente: number;
  id_poder: number;
  id_rgf: number;
  id_fundeb: number | null;
  id_fms: number | null;
  id_esfera: number | null;
  rpps: number;
  apenas_pca: number;
  detalhe_poder: number | null;
  atualizado_em: string;
};

const MODULO = "dimensoes_ente_entidade_sqlserver";
const SQL_DATABASE = process.env.SQLSERVER_APC_DATABASE || "APC";
const BATCH = toPositiveInt(Number(process.env.DIM_ENTE_ENTIDADE_SUPABASE_BATCH || "500"), 500);

const TABELAS = {
  ente: process.env.DIM_ENTE_TABLE || "dim_ente",
  entidade: process.env.DIM_ENTIDADE_TABLE || "dim_entidade",
};

const supabase = getSupabase();

function toPositiveInt(input: number, fallback: number): number {
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

async function validarTabelaDestino(tabela: string): Promise<void> {
  const { error } = await supabase.from(tabela).select("*").limit(1);
  if (error) {
    throw new Error(
      `Tabela destino indisponivel no Supabase (${tabela}). ` +
        "Aplique o schema em etl/schema/dimensoes_ente_entidade.sql. " +
        `Detalhe: ${error.message}`,
    );
  }
}

async function upsertEmLotes<T extends Record<string, unknown>>(tabela: string, rows: T[], onConflict: string) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await supabase.from(tabela).upsert(chunk, { onConflict });
    if (error) throw new Error(`Erro no upsert de ${tabela}: ${error.message}`);
  }
}

async function carregarEnte(): Promise<EnteRow[]> {
  const now = new Date().toISOString();
  const sql = `
SELECT
  ID_ENTE AS id_ente,
  CODIGO AS codigo,
  NOME AS nome,
  POPULACAO AS populacao,
  COD_IBGCE AS cod_ibgce,
  REGIAO AS regiao,
  CNPJ_MASCARA AS cnpj_mascara,
  COD_MUNICIPIO AS cod_municipio,
  '${now}' AS atualizado_em
FROM dbo.ENTE
WHERE UPPER(NOME) NOT LIKE '%TESTE%'
ORDER BY ID_ENTE;
`;
  return queryInDatabase<EnteRow>(SQL_DATABASE, sql);
}

async function carregarEntidade(): Promise<EntidadeRow[]> {
  const now = new Date().toISOString();
  const sql = `
SELECT
  ID_ENTIDADE AS id_entidade,
  ANO_INICIO AS ano_inicio,
  ANO_REFERENCIA AS ano_referencia,
  CODIGO AS codigo,
  CONVERT(VARCHAR(33), DATA_INATIVO, 127) AS data_inativo,
  ID_ENTIDADE_CJUR AS id_entidade_cjur,
  ID_ENTIDADE_EXECUTIVO AS id_entidade_executivo,
  INATIVO AS inativo,
  MES_INICIO AS mes_inicio,
  MES_REFERENCIA AS mes_referencia,
  NOME AS nome,
  PLANEJAMENTO AS planejamento,
  RGF AS rgf,
  RREO AS rreo,
  ID_CLASSIFICACAO_ADMINISTRATIVA AS id_classificacao_administrativa,
  ID_ENTE AS id_ente,
  ID_PODER AS id_poder,
  ID_RGF AS id_rgf,
  ID_FUNDEB AS id_fundeb,
  ID_FMS AS id_fms,
  ID_ESFERA AS id_esfera,
  RPPS AS rpps,
  APENAS_PCA AS apenas_pca,
  DETALHE_PODER AS detalhe_poder,
  '${now}' AS atualizado_em
FROM dbo.ENTIDADE
WHERE UPPER(NOME) NOT LIKE '%TESTE%'
ORDER BY ID_ENTIDADE;
`;
  return queryInDatabase<EntidadeRow>(SQL_DATABASE, sql);
}

export async function executarCargaDimensoesEnteEntidadeSqlServer(): Promise<void> {
  const inicio = Date.now();
  console.log(`[${new Date().toISOString()}] Iniciando ETL: ${MODULO}`);
  console.log(`  -> Fonte SQL: ${SQL_DATABASE}.dbo.ENTE / dbo.ENTIDADE`);
  console.log(`  -> Destino Supabase: ${TABELAS.ente} / ${TABELAS.entidade}`);

  try {
    await Promise.all([validarTabelaDestino(TABELAS.ente), validarTabelaDestino(TABELAS.entidade)]);

    const [entes, entidades] = await Promise.all([carregarEnte(), carregarEntidade()]);
    console.log(`  -> Registros fonte: ente=${entes.length} | entidade=${entidades.length}`);

    await upsertEmLotes(TABELAS.ente, entes, "id_ente");
    await upsertEmLotes(TABELAS.entidade, entidades, "id_entidade");

    const duracao = Date.now() - inicio;
    const total = entes.length + entidades.length;
    console.log(`  OK - ETL concluido em ${duracao}ms (${total} upserts)`);
    await gravarLog("sucesso", total, duracao);
  } catch (error) {
    const duracao = Date.now() - inicio;
    const mensagem = error instanceof Error ? error.message : String(error);
    console.error(`  ERRO - ${mensagem}`);
    await gravarLog("erro", 0, duracao, mensagem);
    throw error;
  }
}

if (require.main === module) {
  executarCargaDimensoesEnteEntidadeSqlServer().catch(() => process.exit(1));
}
