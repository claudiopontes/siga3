import "dotenv/config";
import { pgQuery, closePgPool } from "../connectors/postgres";

const SCHEMAS_ESPERADOS = ["raw", "stage", "dw", "mart", "audit"];
const TABELAS_ESPERADAS = [
  { schema: "public", tabela: "fato_empenho" },
  { schema: "public", tabela: "dim_ente" },
  { schema: "public", tabela: "dim_credor" },
];

async function main() {
  console.log("[postgres-check] Testando conexão...");

  const [{ version }] = await pgQuery<{ version: string }>("SELECT version()");
  console.log("[postgres-check] Versão:", version);

  for (const schema of SCHEMAS_ESPERADOS) {
    const rows = await pgQuery<{ existe: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = $1) AS existe`,
      [schema]
    );
    const existe = rows[0]?.existe;
    console.log(`[postgres-check] Schema '${schema}': ${existe ? "✓ existe" : "✗ NÃO encontrado"}`);
  }

  for (const { schema, tabela } of TABELAS_ESPERADAS) {
    const rows = await pgQuery<{ existe: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = $1 AND table_name = $2
       ) AS existe`,
      [schema, tabela]
    );
    const existe = rows[0]?.existe;
    if (existe) {
      const [{ total }] = await pgQuery<{ total: string }>(
        `SELECT COUNT(*) AS total FROM ${schema}.${tabela}`
      );
      console.log(`[postgres-check] ${schema}.${tabela}: ✓ existe — ${total} registros`);
    } else {
      console.log(`[postgres-check] ${schema}.${tabela}: ✗ NÃO encontrada`);
    }
  }

  await closePgPool();
}

main().catch((err) => {
  console.error("[postgres-check] Erro:", (err as Error).message);
  process.exit(1);
});
