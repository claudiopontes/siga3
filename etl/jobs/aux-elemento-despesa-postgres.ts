/**
 * ETL — Carrega aux_dim_elemento_despesa do SQL Server para PostgreSQL.
 * Uso: cd etl && npm run aux:elemento-despesa
 */

import "dotenv/config";
import { queryInDatabase } from "../connectors/sqlserver";
import { pgQuery, withPgTransaction, closePgPool } from "../connectors/postgres";

const db = process.env.SQLSERVER_APC_DATABASE || "APC";

async function main() {
  console.log("[aux-elemento-despesa] Iniciando carga...");

  // Recria tabela para garantir schema correto (nome no lugar de descricao)
  await pgQuery(`
    CREATE TABLE IF NOT EXISTS public.aux_elemento_despesa (
      codigo varchar(10) PRIMARY KEY,
      nome   varchar(255) NOT NULL
    )
  `);
  // Adiciona coluna nome se a tabela já existia com schema antigo
  await pgQuery(`
    ALTER TABLE public.aux_elemento_despesa
    ADD COLUMN IF NOT EXISTS nome varchar(255)
  `).catch(() => void 0);

  const rows = await queryInDatabase<{ codigo: string; nome: string }>(
    db,
    `SELECT
       CAST(CODIGO AS varchar(10))   AS codigo,
       CAST(NOME   AS varchar(255))  AS nome
     FROM referencias.ELEMENTO_DESPESA
     WHERE CODIGO IS NOT NULL AND NOME IS NOT NULL
     GROUP BY CAST(CODIGO AS varchar(10)), CAST(NOME AS varchar(255))
     ORDER BY codigo`
  );

  console.log(`[aux-elemento-despesa] ${rows.length} elementos encontrados no SQL Server.`);

  await withPgTransaction(async (client) => {
    await client.query("TRUNCATE public.aux_elemento_despesa");
    for (const row of rows) {
      await client.query(
        `INSERT INTO public.aux_elemento_despesa (codigo, nome) VALUES ($1, $2)
         ON CONFLICT (codigo) DO UPDATE SET nome = EXCLUDED.nome`,
        [String(row.codigo).trim(), String(row.nome).trim()]
      );
    }
  });

  console.log(`[aux-elemento-despesa] Carga concluída — ${rows.length} registros gravados (campo: nome).`);
}

main()
  .then(() => closePgPool())
  .catch((err) => {
    console.error("[aux-elemento-despesa] Erro:", (err as Error).message);
    closePgPool().catch(() => void 0);
    process.exit(1);
  });
