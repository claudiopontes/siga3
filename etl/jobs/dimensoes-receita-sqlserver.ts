/**
 * ETL - Dimensoes de Receita (SQL Server -> Supabase)
 * Fontes:
 *  - APC.referencias.NATUREZA_RECEITA_ORCAMENTARIA
 *  - APC.referencias.GRUPO_FONTE_RECURSO
 *  - APC.contacorrente.FONTE_DESTINACAO_RECURSO
 */

import "dotenv/config";
import { queryInDatabase } from "../connectors/sqlserver";
import { pgQuery, closePgPool } from "../connectors/postgres";

type NaturezaRow = {
  id_natureza: number;
  numero: number;
  data_criacao: string | null;
  codigo: string;
  descricao: string;
  nivel: number;
  nome: string;
  tipo: string | null;
  ativo: boolean | null;
  especificacao: string | null;
  destinacao_legal: string | null;
  norma: string | null;
  amparo: string | null;
  ano_inicio: number;
  ano_fim: number;
  id_natureza_pai: number | null;
  extensao: number | null;
  rubrica: string | null;
  atualizado_em: string;
};

type GrupoFonteRow = {
  numero: number;
  data_criacao: string | null;
  codigo: string;
  nome: string;
  atualizado_em: string;
};

type FonteDestinacaoRow = {
  id_fonte_destinacao_recurso: number;
  classificacao: string;
  codigo: string;
  data_criacao: string | null;
  descricao: string;
  nome: string | null;
  numero: number;
  numero_grupo_fonte_recurso: number;
  ativo: boolean;
  ano_inicio: number | null;
  ano_fim: number | null;
  codigo_stn: string | null;
  atualizado_em: string;
};

const MODULO = "dimensoes_receita_sqlserver";
const SQL_DATABASE = process.env.SQLSERVER_APC_DATABASE || "APC";
const PG_BATCH = toPositiveInt(Number(process.env.DIM_RECEITA_SUPABASE_BATCH || "500"), 500);

const TABELAS = {
  natureza: process.env.DIM_RECEITA_TB_NATUREZA || "aux_dim_natureza_receita_orcamentaria",
  grupoFonte: process.env.DIM_RECEITA_TB_GRUPO_FONTE || "aux_dim_grupo_fonte_recurso",
  fonteDest: process.env.DIM_RECEITA_TB_FONTE_DESTINACAO || "aux_dim_fonte_destinacao_recurso",
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

async function limparTabela(tabela: string): Promise<void> {
  await pgQuery(`DELETE FROM public.${tabela}`);
}

async function inserirNaturezaEmLotes(rows: NaturezaRow[]): Promise<void> {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += PG_BATCH) {
    const lote = rows.slice(i, i + PG_BATCH);
    for (const r of lote) {
      await pgQuery(
        `INSERT INTO public.aux_dim_natureza_receita_orcamentaria
           (id_natureza, numero, data_criacao, codigo, descricao, nivel, nome, tipo, ativo, especificacao,
            destinacao_legal, norma, amparo, ano_inicio, ano_fim, id_natureza_pai, extensao, rubrica, atualizado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         ON CONFLICT (id_natureza) DO UPDATE SET numero=$2, data_criacao=$3, codigo=$4, descricao=$5, nivel=$6, nome=$7,
           tipo=$8, ativo=$9, especificacao=$10, destinacao_legal=$11, norma=$12, amparo=$13, ano_inicio=$14,
           ano_fim=$15, id_natureza_pai=$16, extensao=$17, rubrica=$18, atualizado_em=$19`,
        [r.id_natureza, r.numero, r.data_criacao, r.codigo, r.descricao, r.nivel, r.nome, r.tipo, r.ativo,
         r.especificacao, r.destinacao_legal, r.norma, r.amparo, r.ano_inicio, r.ano_fim, r.id_natureza_pai,
         r.extensao, r.rubrica, r.atualizado_em],
      );
    }
  }
}

async function inserirGrupoFonteEmLotes(rows: GrupoFonteRow[]): Promise<void> {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += PG_BATCH) {
    const lote = rows.slice(i, i + PG_BATCH);
    for (const r of lote) {
      await pgQuery(
        `INSERT INTO public.aux_dim_grupo_fonte_recurso (numero, data_criacao, codigo, nome, atualizado_em)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (numero) DO UPDATE SET data_criacao=$2, codigo=$3, nome=$4, atualizado_em=$5`,
        [r.numero, r.data_criacao, r.codigo, r.nome, r.atualizado_em],
      );
    }
  }
}

async function inserirFonteDestEmLotes(rows: FonteDestinacaoRow[]): Promise<void> {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += PG_BATCH) {
    const lote = rows.slice(i, i + PG_BATCH);
    for (const r of lote) {
      await pgQuery(
        `INSERT INTO public.aux_dim_fonte_destinacao_recurso
           (id_fonte_destinacao_recurso, classificacao, codigo, data_criacao, descricao, nome,
            numero, numero_grupo_fonte_recurso, ativo, ano_inicio, ano_fim, codigo_stn, atualizado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (id_fonte_destinacao_recurso) DO UPDATE SET classificacao=$2, codigo=$3, data_criacao=$4,
           descricao=$5, nome=$6, numero=$7, numero_grupo_fonte_recurso=$8, ativo=$9, ano_inicio=$10,
           ano_fim=$11, codigo_stn=$12, atualizado_em=$13`,
        [r.id_fonte_destinacao_recurso, r.classificacao, r.codigo, r.data_criacao, r.descricao, r.nome,
         r.numero, r.numero_grupo_fonte_recurso, r.ativo, r.ano_inicio, r.ano_fim, r.codigo_stn, r.atualizado_em],
      );
    }
  }
}

async function carregarNatureza(): Promise<NaturezaRow[]> {
  const now = new Date().toISOString();
  const sql = `
SELECT
  ID_NATUREZA AS id_natureza,
  NUMERO AS numero,
  CONVERT(VARCHAR(33), DATA_CRIACAO, 127) AS data_criacao,
  CODIGO AS codigo,
  CAST(DESCRICAO AS VARCHAR(MAX)) AS descricao,
  NIVEL AS nivel,
  CAST(NOME AS VARCHAR(500)) AS nome,
  TIPO AS tipo,
  ATIVO AS ativo,
  CAST(ESPECIFICACAO AS VARCHAR(MAX)) AS especificacao,
  CAST(DESTINACAO_LEGAL AS VARCHAR(MAX)) AS destinacao_legal,
  CAST(NORMA AS VARCHAR(MAX)) AS norma,
  CAST(AMPARO AS VARCHAR(MAX)) AS amparo,
  ANO_INICIO AS ano_inicio,
  ANO_FIM AS ano_fim,
  ID_NATUREZA_PAI AS id_natureza_pai,
  EXTENSAO AS extensao,
  RUBRICA AS rubrica,
  '${now}' AS atualizado_em
FROM referencias.NATUREZA_RECEITA_ORCAMENTARIA
ORDER BY ID_NATUREZA;
`;
  return queryInDatabase<NaturezaRow>(SQL_DATABASE, sql);
}

async function carregarGrupoFonte(): Promise<GrupoFonteRow[]> {
  const now = new Date().toISOString();
  const sql = `
SELECT
  NUMERO AS numero,
  CONVERT(VARCHAR(33), DATA_CRIACAO, 127) AS data_criacao,
  CODIGO AS codigo,
  NOME AS nome,
  '${now}' AS atualizado_em
FROM referencias.GRUPO_FONTE_RECURSO
ORDER BY NUMERO;
`;
  return queryInDatabase<GrupoFonteRow>(SQL_DATABASE, sql);
}

async function carregarFonteDestinacao(): Promise<FonteDestinacaoRow[]> {
  const now = new Date().toISOString();
  const sql = `
SELECT
  ID_FONTE_DESTINACAO_RECURSO AS id_fonte_destinacao_recurso,
  CLASSIFICACAO AS classificacao,
  CODIGO AS codigo,
  CONVERT(VARCHAR(33), DATA_CRIACAO, 127) AS data_criacao,
  CAST(DESCRICAO AS VARCHAR(MAX)) AS descricao,
  CAST(NOME AS VARCHAR(1000)) AS nome,
  NUMERO AS numero,
  NUMERO_GRUPO_FONTE_RECURSO AS numero_grupo_fonte_recurso,
  ATIVO AS ativo,
  ANO_INICIO AS ano_inicio,
  ANO_FIM AS ano_fim,
  CODIGO_STN AS codigo_stn,
  '${now}' AS atualizado_em
FROM contacorrente.FONTE_DESTINACAO_RECURSO
ORDER BY ID_FONTE_DESTINACAO_RECURSO;
`;
  return queryInDatabase<FonteDestinacaoRow>(SQL_DATABASE, sql);
}

export async function executarCargaDimensoesReceitaSqlServer(): Promise<void> {
  const inicio = Date.now();
  console.log(`[${new Date().toISOString()}] Iniciando ETL: ${MODULO}`);
  console.log(`  -> Fonte SQL: ${SQL_DATABASE} (referencias + contacorrente)`);

  try {
    await Promise.all([
      validarTabelaDestino("public", TABELAS.natureza),
      validarTabelaDestino("public", TABELAS.grupoFonte),
      validarTabelaDestino("public", TABELAS.fonteDest),
    ]);

    const [naturezas, grupos, fontes] = await Promise.all([
      carregarNatureza(),
      carregarGrupoFonte(),
      carregarFonteDestinacao(),
    ]);

    console.log(
      `  -> Registros fonte: natureza=${naturezas.length} | grupo_fonte=${grupos.length} | fonte_dest=${fontes.length}`,
    );

    // Limpa na ordem inversa de FK e reinsere
    await limparTabela(TABELAS.fonteDest);
    await limparTabela(TABELAS.grupoFonte);
    await limparTabela(TABELAS.natureza);

    await inserirNaturezaEmLotes(naturezas);
    await inserirGrupoFonteEmLotes(grupos);
    await inserirFonteDestEmLotes(fontes);

    const duracao = Date.now() - inicio;
    const total = naturezas.length + grupos.length + fontes.length;
    console.log(`  OK - ETL concluido em ${duracao}ms (${total} registros)`);
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
  executarCargaDimensoesReceitaSqlServer()
    .catch(() => process.exit(1))
    .finally(() => closePgPool());
}

