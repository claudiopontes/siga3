/**
 * ETL - Dimensoes de Empenho (SQL Server -> Supabase)
 * Fontes:
 *  - APC.referencias.APLICACAO
 *  - APC.dbo.CREDOR
 */

import "dotenv/config";
import { queryInDatabase } from "../connectors/sqlserver";
import { pgQuery, closePgPool } from "../connectors/postgres";

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
const PG_BATCH = toPositiveInt(Number(process.env.DIM_EMPENHO_SUPABASE_BATCH || "500"), 500);

const TABELAS = {
  aplicacao: process.env.DIM_APLICACAO_TABLE || "dim_aplicacao",
  credor: process.env.DIM_CREDOR_TABLE || "dim_credor",
};

function toPositiveInt(input: number, fallback: number): number {
  if (!Number.isFinite(input) || input < 1) return fallback;
  return Math.trunc(input);
}

async function gravarLog(status: "sucesso" | "erro", registros: number, duracao: number, mensagem?: string) {
  await pgQuery(
    `INSERT INTO audit.etl_log (modulo, status, registros, duracao_ms, mensagem)
     VALUES ($1, $2, $3, $4, $5)`,
    [MODULO, status, registros, duracao, mensagem ?? null],
  );
}

async function validarTabelaDestino(schema: string, tabela: string): Promise<void> {
  const rows = await pgQuery<{ existe: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = $1 AND table_name = $2
     ) AS existe`,
    [schema, tabela],
  );
  if (!rows[0]?.existe) {
    throw new Error(
      `Tabela destino nao encontrada no PostgreSQL: ${schema}.${tabela}. ` +
      `Execute: npm run postgres:migrate`,
    );
  }
}

async function upsertAplicacaoEmLotes(rows: AplicacaoRow[]): Promise<void> {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += PG_BATCH) {
    const lote = rows.slice(i, i + PG_BATCH);
    for (const r of lote) {
      await pgQuery(
        `INSERT INTO public.dim_aplicacao (id_aplicacao, codigo, descricao, atualizado_em)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (id_aplicacao) DO UPDATE SET codigo=$2, descricao=$3, atualizado_em=$4`,
        [r.id_aplicacao, r.codigo, r.descricao, r.atualizado_em],
      );
    }
  }
}

async function upsertCredorEmLotes(rows: CredorRow[]): Promise<void> {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += PG_BATCH) {
    const lote = rows.slice(i, i + PG_BATCH);
    for (const r of lote) {
      await pgQuery(
        `INSERT INTO public.dim_credor (cnpj_cpf, inscricao_estadual, inscricao_municipal, nome, endereco, bairro, cidade, uf, cep, fone, atualizado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (cnpj_cpf) DO UPDATE SET inscricao_estadual=$2, inscricao_municipal=$3, nome=$4, endereco=$5, bairro=$6, cidade=$7, uf=$8, cep=$9, fone=$10, atualizado_em=$11`,
        [r.cnpj_cpf, r.inscricao_estadual, r.inscricao_municipal, r.nome, r.endereco, r.bairro, r.cidade, r.uf, r.cep, r.fone, r.atualizado_em],
      );
    }
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
    await Promise.all([
      validarTabelaDestino("public", TABELAS.aplicacao),
      validarTabelaDestino("public", TABELAS.credor),
    ]);

    const [aplicacoes, credores] = await Promise.all([carregarAplicacao(), carregarCredor()]);
    console.log(`  -> Registros fonte: aplicacao=${aplicacoes.length} | credor=${credores.length}`);

    await upsertAplicacaoEmLotes(aplicacoes);
    await upsertCredorEmLotes(credores);

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
  executarCargaDimensoesEmpenhoSqlServer()
    .catch(() => process.exit(1))
    .finally(() => closePgPool());
}
