/**
 * ETL — Dimensoes oficiais ENTE / ENTIDADE / CREDOR (SQL Server -> PostgreSQL local)
 *
 * Estrategia: TRUNCATE + INSERT em transacao (carga full idempotente).
 * Fontes:
 *   APC.dbo.ENTE
 *   APC.dbo.ENTIDADE
 *   APC.dbo.CREDOR
 *
 * Uso:
 *   cd etl && npm run dimensoes:postgres
 */

import "dotenv/config";
import { queryInDatabase } from "../connectors/sqlserver";
import { pgQuery, withPgTransaction, closePgPool } from "../connectors/postgres";

// ---------------------------------------------------------------------------
// Configuracao
// ---------------------------------------------------------------------------

const MODULO = "dimensoes_ente_entidade_postgres";
const SQL_DATABASE = process.env.SQLSERVER_APC_DATABASE || "APC";
const BATCH_SIZE = toPositiveInt(Number(process.env.DIM_BATCH_SIZE || "500"), 500);

function toPositiveInt(input: number, fallback: number): number {
  if (!Number.isFinite(input) || input < 1) return fallback;
  return Math.trunc(input);
}

// ---------------------------------------------------------------------------
// Tipos (espelham as colunas do SQL Server — mesmas queries do job Supabase)
// ---------------------------------------------------------------------------

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

type CredorRow = {
  cnpj_cpf: string;
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

// ---------------------------------------------------------------------------
// Leitura SQL Server
// ---------------------------------------------------------------------------

async function lerEnte(agora: string): Promise<EnteRow[]> {
  const sql = `
SELECT
  ID_ENTE        AS id_ente,
  CODIGO         AS codigo,
  NOME           AS nome,
  POPULACAO      AS populacao,
  COD_IBGCE      AS cod_ibgce,
  REGIAO         AS regiao,
  CNPJ_MASCARA   AS cnpj_mascara,
  COD_MUNICIPIO  AS cod_municipio,
  '${agora}'     AS atualizado_em
FROM dbo.ENTE
WHERE UPPER(NOME) NOT LIKE '%TESTE%'
ORDER BY ID_ENTE;
`;
  return queryInDatabase<EnteRow>(SQL_DATABASE, sql);
}

async function lerEntidade(agora: string): Promise<EntidadeRow[]> {
  const sql = `
SELECT
  ID_ENTIDADE                    AS id_entidade,
  ANO_INICIO                     AS ano_inicio,
  ANO_REFERENCIA                 AS ano_referencia,
  CODIGO                         AS codigo,
  CONVERT(VARCHAR(33), DATA_INATIVO, 127) AS data_inativo,
  ID_ENTIDADE_CJUR               AS id_entidade_cjur,
  ID_ENTIDADE_EXECUTIVO          AS id_entidade_executivo,
  INATIVO                        AS inativo,
  MES_INICIO                     AS mes_inicio,
  MES_REFERENCIA                 AS mes_referencia,
  NOME                           AS nome,
  PLANEJAMENTO                   AS planejamento,
  RGF                            AS rgf,
  RREO                           AS rreo,
  ID_CLASSIFICACAO_ADMINISTRATIVA AS id_classificacao_administrativa,
  ID_ENTE                        AS id_ente,
  ID_PODER                       AS id_poder,
  ID_RGF                         AS id_rgf,
  ID_FUNDEB                      AS id_fundeb,
  ID_FMS                         AS id_fms,
  ID_ESFERA                      AS id_esfera,
  RPPS                           AS rpps,
  APENAS_PCA                     AS apenas_pca,
  DETALHE_PODER                  AS detalhe_poder,
  '${agora}'                     AS atualizado_em
FROM dbo.ENTIDADE
WHERE UPPER(NOME) NOT LIKE '%TESTE%'
ORDER BY ID_ENTIDADE;
`;
  return queryInDatabase<EntidadeRow>(SQL_DATABASE, sql);
}

async function lerCredor(agora: string): Promise<CredorRow[]> {
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
  '${agora}'          AS atualizado_em
FROM dbo.CREDOR
WHERE cnpj_cpf IS NOT NULL;
`;
  return queryInDatabase<CredorRow>(SQL_DATABASE, sql);
}

// ---------------------------------------------------------------------------
// Escrita PostgreSQL — INSERT em lotes dentro de transacao
// ---------------------------------------------------------------------------

async function inserirEntesEmLotes(
  client: import("pg").PoolClient,
  rows: EnteRow[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const lote = rows.slice(i, i + BATCH_SIZE);
    for (const r of lote) {
      await client.query(
        `INSERT INTO public.dim_ente
           (id_ente, codigo, nome, populacao, cod_ibge, regiao, cnpj_mascara, cod_municipio, atualizado_em)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id_ente) DO UPDATE SET
           codigo        = EXCLUDED.codigo,
           nome          = EXCLUDED.nome,
           populacao     = EXCLUDED.populacao,
           cod_ibge      = EXCLUDED.cod_ibge,
           regiao        = EXCLUDED.regiao,
           cnpj_mascara  = EXCLUDED.cnpj_mascara,
           cod_municipio = EXCLUDED.cod_municipio,
           atualizado_em = EXCLUDED.atualizado_em`,
        [
          r.id_ente,
          r.codigo,
          r.nome,
          r.populacao,
          r.cod_ibgce,
          r.regiao,
          r.cnpj_mascara,
          r.cod_municipio,
          r.atualizado_em,
        ],
      );
    }
  }
}

async function inserirEntidadesEmLotes(
  client: import("pg").PoolClient,
  rows: EntidadeRow[],
): Promise<void> {
  for (const r of rows) {
    await client.query(
      `INSERT INTO public.dim_entidade
         (id_entidade, id_ente, nome, inativo, atualizado_em)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id_entidade) DO UPDATE SET
         id_ente       = EXCLUDED.id_ente,
         nome          = EXCLUDED.nome,
         inativo       = EXCLUDED.inativo,
         atualizado_em = EXCLUDED.atualizado_em`,
      [r.id_entidade, r.id_ente, r.nome, r.inativo, r.atualizado_em],
    );
  }
}

async function inserirCredoresEmLotes(
  client: import("pg").PoolClient,
  rows: CredorRow[],
): Promise<void> {
  for (const r of rows) {
    await client.query(
      `INSERT INTO public.dim_credor
         (cnpj_cpf, inscricao_estadual, inscricao_municipal, nome, endereco, bairro, cidade, uf, cep, fone, atualizado_em)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (cnpj_cpf) DO UPDATE SET
         inscricao_estadual  = EXCLUDED.inscricao_estadual,
         inscricao_municipal = EXCLUDED.inscricao_municipal,
         nome                = EXCLUDED.nome,
         endereco            = EXCLUDED.endereco,
         bairro              = EXCLUDED.bairro,
         cidade              = EXCLUDED.cidade,
         uf                  = EXCLUDED.uf,
         cep                 = EXCLUDED.cep,
         fone                = EXCLUDED.fone,
         atualizado_em       = EXCLUDED.atualizado_em`,
      [
        r.cnpj_cpf,
        r.inscricao_estadual,
        r.inscricao_municipal,
        r.nome,
        r.endereco,
        r.bairro,
        r.cidade,
        r.uf,
        r.cep,
        r.fone,
        r.atualizado_em,
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Auditoria
// ---------------------------------------------------------------------------

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

async function registrarCarga(
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

async function iniciarCarga(): Promise<number> {
  const rows = await pgQuery<{ id_carga: number }>(
    `INSERT INTO audit.etl_carga
       (modulo, origem, destino, modo_carga, status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id_carga`,
    [
      MODULO,
      `${SQL_DATABASE}.dbo.{ENTE,ENTIDADE,CREDOR}`,
      "public.{dim_ente,dim_entidade,dim_credor}",
      "truncate_insert",
      "iniciado",
    ],
  );
  return rows[0].id_carga;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function executarCargaDimensoesEnteEntidadePostgres(): Promise<void> {
  const inicio = Date.now();
  console.log(`[${new Date().toISOString()}] Iniciando ETL: ${MODULO}`);
  console.log(`  -> Fonte SQL Server: ${SQL_DATABASE}.dbo.{ENTE, ENTIDADE, CREDOR}`);
  console.log(`  -> Destino PostgreSQL: public.{dim_ente, dim_entidade, dim_credor}`);

  const idCarga = await iniciarCarga();
  const agora = new Date().toISOString();

  try {
    // 1. Leitura paralela do SQL Server
    console.log("  -> Lendo dados do SQL Server...");
    const [entes, entidades, credores] = await Promise.all([
      lerEnte(agora),
      lerEntidade(agora),
      lerCredor(agora),
    ]);
    console.log(
      `  -> Lidos: ente=${entes.length} | entidade=${entidades.length} | credor=${credores.length}`,
    );

    // Filtrar entidades cujo id_ente existe entre os entes carregados
    const enteIds = new Set(entes.map((e) => e.id_ente));
    const entidadesValidas = entidades.filter((e) => enteIds.has(e.id_ente));
    if (entidades.length !== entidadesValidas.length) {
      console.log(
        `  -> Entidades filtradas: ${entidades.length - entidadesValidas.length} ignoradas (id_ente ausente em dim_ente)`,
      );
    }

    const totalLidos = entes.length + entidadesValidas.length + credores.length;

    // 2. Escrita no PostgreSQL em transacao
    console.log("  -> Gravando no PostgreSQL...");
    await withPgTransaction(async (client) => {
      // TRUNCATE respeitando FK: entidade depende de ente
      await client.query("TRUNCATE public.dim_entidade");
      await client.query("TRUNCATE public.dim_ente CASCADE");
      await client.query("TRUNCATE public.dim_credor");

      await inserirEntesEmLotes(client, entes);
      console.log(`  -> dim_ente: ${entes.length} registros gravados`);

      await inserirEntidadesEmLotes(client, entidadesValidas);
      console.log(`  -> dim_entidade: ${entidadesValidas.length} registros gravados`);

      await inserirCredoresEmLotes(client, credores);
      console.log(`  -> dim_credor: ${credores.length} registros gravados`);
    });

    const duracao = Date.now() - inicio;
    console.log(
      `  OK - ETL concluido em ${duracao}ms | total gravado: ${totalLidos} registros`,
    );

    await registrarLog("ok", totalLidos, duracao);
    await registrarCarga(idCarga, "ok", entes.length + entidades.length + credores.length, totalLidos);
  } catch (error) {
    const duracao = Date.now() - inicio;
    const mensagem = error instanceof Error ? error.message : String(error);
    console.error(`  ERRO - ${mensagem}`);
    await registrarLog("erro", 0, duracao, mensagem).catch(() => void 0);
    await registrarCarga(idCarga, "erro", 0, 0, mensagem).catch(() => void 0);
    throw error;
  }
}

if (require.main === module) {
  executarCargaDimensoesEnteEntidadePostgres()
    .then(() => closePgPool())
    .catch(() => {
      closePgPool().catch(() => void 0);
      process.exit(1);
    });
}
