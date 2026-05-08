/**
 * ETL — Dimensões de remessas (APC.dbo.ENTIDADE + APC.dbo.ENTE -> PostgreSQL local)
 *
 * Carrega:
 *   dw.dim_remessa_entidade  (a partir de APC.dbo.ENTIDADE + APC.dbo.ENTE)
 *   dw.dim_remessa_ente      (a partir de APC.dbo.ENTE)
 *
 * Se colunas não existirem, captura erro e imprime TODO sem abortar.
 *
 * Uso:
 *   cd etl && npm run remessas:dimensoes:postgres
 */

import "dotenv/config";
import { queryInDatabase } from "../connectors/sqlserver";
import { pgQuery, withPgTransaction, closePgPool } from "../connectors/postgres";

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

const MODULO = "remessas_dimensoes_postgres";
const APC_DATABASE = process.env.SQLSERVER_APC_DATABASE || "APC";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type DimEntidadeRow = {
  id_entidade: number;
  id_entidade_cjur: number | null;
  nome_entidade: string | null;
  nome_ente: string | null;
  cnpj: string | null;
  tipo_entidade: string | null;
  situacao: string | null;
};

type DimEnteRow = {
  id_ente: number;
  nome_ente: string | null;
  cnpj: string | null;
  codigo: string | null;
  tipo_ente: string | null;
  situacao: string | null;
};

// ---------------------------------------------------------------------------
// Leitura SQL Server
// ---------------------------------------------------------------------------

async function lerDimEntidade(): Promise<DimEntidadeRow[]> {
  const sql = `
SELECT
  CAST(e.ID_ENTIDADE AS bigint)   AS id_entidade,
  e.ID_ENTE                       AS id_entidade_cjur,
  e.NOME                          AS nome_entidade,
  ent.NOME                        AS nome_ente,
  NULL                            AS cnpj,
  NULL                            AS tipo_entidade,
  CASE WHEN e.INATIVO = 1 THEN 'INATIVO' ELSE 'ATIVO' END AS situacao
FROM dbo.ENTIDADE e
LEFT JOIN dbo.ENTE ent ON ent.ID_ENTE = e.ID_ENTE
WHERE UPPER(e.NOME) NOT LIKE '%TESTE%'
ORDER BY e.ID_ENTIDADE
`;
  return queryInDatabase<DimEntidadeRow>(APC_DATABASE, sql);
}

async function lerDimEnte(): Promise<DimEnteRow[]> {
  const sql = `
SELECT
  CAST(ID_ENTE AS bigint) AS id_ente,
  NOME                    AS nome_ente,
  CNPJ_MASCARA            AS cnpj,
  CAST(CODIGO AS varchar) AS codigo,
  NULL                    AS tipo_ente,
  NULL                    AS situacao
FROM dbo.ENTE
WHERE UPPER(NOME) NOT LIKE '%TESTE%'
ORDER BY ID_ENTE
`;
  return queryInDatabase<DimEnteRow>(APC_DATABASE, sql);
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function executarDimensoesRemessasPostgres(): Promise<void> {
  const inicio = Date.now();
  console.log(`[${new Date().toISOString()}] Iniciando ETL: ${MODULO}`);
  console.log(`  -> Fonte SQL Server: ${APC_DATABASE}.dbo.{ENTIDADE, ENTE}`);
  console.log(`  -> Destino PostgreSQL: dw.{dim_remessa_entidade, dim_remessa_ente}`);

  let totalGravado = 0;

  // ---------------------------------------------------------------------------
  // dw.dim_remessa_entidade
  // ---------------------------------------------------------------------------
  let entidades: DimEntidadeRow[] = [];
  try {
    console.log("  -> Lendo APC.dbo.ENTIDADE + dbo.ENTE...");
    entidades = await lerDimEntidade();
    console.log(`  -> ${entidades.length} entidades lidas`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `  [AVISO] Falha ao ler dbo.ENTIDADE/dbo.ENTE: ${msg}` +
        "\n  TODO: verificar se as colunas ID_ENTIDADE, ID_ENTE, NOME, INATIVO existem em APC.dbo.ENTIDADE",
    );
  }

  // ---------------------------------------------------------------------------
  // dw.dim_remessa_ente
  // ---------------------------------------------------------------------------
  let entes: DimEnteRow[] = [];
  try {
    console.log("  -> Lendo APC.dbo.ENTE...");
    entes = await lerDimEnte();
    console.log(`  -> ${entes.length} entes lidos`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `  [AVISO] Falha ao ler dbo.ENTE: ${msg}` +
        "\n  TODO: verificar se as colunas ID_ENTE, NOME, CNPJ_MASCARA, CODIGO existem em APC.dbo.ENTE",
    );
  }

  try {
    await withPgTransaction(async (client) => {
      // dim_remessa_ente (sem FK — pode truncar primeiro)
      await client.query("TRUNCATE dw.dim_remessa_ente");
      for (const r of entes) {
        await client.query(
          `INSERT INTO dw.dim_remessa_ente
             (id_ente, nome_ente, cnpj, codigo, tipo_ente, situacao, origem, etl_carregado_em)
           VALUES ($1, $2, $3, $4, $5, $6, 'APC', now())
           ON CONFLICT (id_ente) DO UPDATE SET
             nome_ente         = EXCLUDED.nome_ente,
             cnpj              = EXCLUDED.cnpj,
             codigo            = EXCLUDED.codigo,
             tipo_ente         = EXCLUDED.tipo_ente,
             situacao          = EXCLUDED.situacao,
             etl_atualizado_em = now()`,
          [r.id_ente, r.nome_ente, r.cnpj, r.codigo, r.tipo_ente, r.situacao],
        );
      }
      console.log(`  -> dw.dim_remessa_ente: ${entes.length} registros gravados`);

      // dim_remessa_entidade
      await client.query("TRUNCATE dw.dim_remessa_entidade");
      for (const r of entidades) {
        await client.query(
          `INSERT INTO dw.dim_remessa_entidade
             (id_entidade, id_entidade_cjur, nome_entidade, nome_ente, cnpj, tipo_entidade, situacao, origem, etl_carregado_em)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'APC', now())
           ON CONFLICT (id_entidade) DO UPDATE SET
             id_entidade_cjur  = EXCLUDED.id_entidade_cjur,
             nome_entidade     = EXCLUDED.nome_entidade,
             nome_ente         = EXCLUDED.nome_ente,
             cnpj              = EXCLUDED.cnpj,
             tipo_entidade     = EXCLUDED.tipo_entidade,
             situacao          = EXCLUDED.situacao,
             etl_atualizado_em = now()`,
          [
            r.id_entidade,
            r.id_entidade_cjur,
            r.nome_entidade,
            r.nome_ente,
            r.cnpj,
            r.tipo_entidade,
            r.situacao,
          ],
        );
      }
      console.log(`  -> dw.dim_remessa_entidade: ${entidades.length} registros gravados`);
    });

    totalGravado = entes.length + entidades.length;
    const duracao = Date.now() - inicio;
    console.log(`  OK - ETL concluído em ${duracao}ms | total gravado: ${totalGravado} registros`);
    await registrarLog("ok", totalGravado, duracao);
  } catch (error) {
    const duracao = Date.now() - inicio;
    const mensagem = error instanceof Error ? error.message : String(error);
    console.error(`  ERRO - ${mensagem}`);
    await registrarLog("erro", 0, duracao, mensagem).catch(() => void 0);
    throw error;
  }
}

if (require.main === module) {
  executarDimensoesRemessasPostgres()
    .then(() => closePgPool())
    .catch(() => {
      closePgPool().catch(() => void 0);
      process.exit(1);
    });
}
