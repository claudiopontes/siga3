/**
 * ETL - Dimensoes de Empenho (SQL Server -> Supabase)
 * Fontes:
 *  - APC.referencias.APLICACAO
 *  - APC.dbo.CREDOR
 */

import "dotenv/config";
import { queryInDatabase } from "../connectors/sqlserver";
import { getSupabase } from "../connectors/supabase";

type AplicacaoRow = {
  id_aplicacao: number;
  codigo: string;
  descricao: string;
  atualizado_em: string;
};

type CredorRow = {
  cnpj_cpf: string | null;
  inscricao_estadual: string | null;
  inscricao_municipal: string | null;
  nome: string | null;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  fone: string | null;
  atualizado_em: string;
};

const MODULO = "dimensoes_empenho_sqlserver";
const SQL_DATABASE = process.env.SQLSERVER_APC_DATABASE || "APC";
const SUPABASE_BATCH = toPositiveInt(Number(process.env.DIM_EMPENHO_SUPABASE_BATCH || "500"), 500);

const TABELAS = {
  aplicacao: process.env.DIM_APLICACAO_TABLE || "dim_aplicacao",
  credor: process.env.DIM_CREDOR_TABLE || "dim_credor",
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
        "Aplique o schema em etl/schema/dimensoes_empenho.sql. " +
        `Detalhe: ${error.message}`,
    );
  }
}

async function upsertEmLotes<T extends Record<string, unknown>>(
  tabela: string,
  rows: T[],
  onConflict: string,
): Promise<void> {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += SUPABASE_BATCH) {
    const lote = rows.slice(i, i + SUPABASE_BATCH);
    const { error } = await supabase.from(tabela).upsert(lote, { onConflict });
    if (error) throw new Error(`Erro no upsert de ${tabela}: ${error.message}`);
  }
}

async function carregarAplicacao(): Promise<AplicacaoRow[]> {
  const now = new Date().toISOString();
  const sql = `
SELECT
  ID_APLICACAO AS id_aplicacao,
  CODIGO       AS codigo,
  DESCRICAO    AS descricao,
  '${now}'     AS atualizado_em
FROM referencias.APLICACAO
ORDER BY ID_APLICACAO;
`;
  return queryInDatabase<AplicacaoRow>(SQL_DATABASE, sql);
}

async function carregarCredor(): Promise<CredorRow[]> {
  const now = new Date().toISOString();
  const sql = `
SELECT
  cnpj_cpf            AS cnpj_cpf,
  inscricao_estadual  AS inscricao_estadual,
  inscricao_municipal AS inscricao_municipal,
  nome                AS nome,
  endereco            AS endereco,
  bairro              AS bairro,
  cidade              AS cidade,
  uf                  AS uf,
  cep                 AS cep,
  fone                AS fone,
  '${now}'            AS atualizado_em
FROM dbo.CREDOR
WHERE cnpj_cpf IS NOT NULL;
`;
  return queryInDatabase<CredorRow>(SQL_DATABASE, sql);
}

export async function executarCargaDimensoesEmpenhoSqlServer(): Promise<void> {
  const inicio = Date.now();
  console.log(`[${new Date().toISOString()}] Iniciando ETL: ${MODULO}`);
  console.log(`  -> Fonte SQL: ${SQL_DATABASE} (referencias.APLICACAO + dbo.CREDOR)`);
  console.log(`  -> Destino Supabase: ${TABELAS.aplicacao} / ${TABELAS.credor}`);

  try {
    await Promise.all([validarTabelaDestino(TABELAS.aplicacao), validarTabelaDestino(TABELAS.credor)]);

    const [aplicacoes, credores] = await Promise.all([carregarAplicacao(), carregarCredor()]);
    console.log(`  -> Registros fonte: aplicacao=${aplicacoes.length} | credor=${credores.length}`);

    await upsertEmLotes(TABELAS.aplicacao, aplicacoes, "id_aplicacao");
    await upsertEmLotes(TABELAS.credor, credores, "cnpj_cpf");

    const duracao = Date.now() - inicio;
    const total = aplicacoes.length + credores.length;
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
  executarCargaDimensoesEmpenhoSqlServer().catch(() => process.exit(1));
}
