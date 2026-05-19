/**
 * Utilitario manual — invoca public.fn_refresh_combustivel_empenho_mensal()
 * para reconstruir public.combustivel_empenho_mensal a partir dos dados brutos.
 *
 * Substitui a versao Supabase anterior. Operacao DESTRUTIVA (TRUNCATE interno
 * na funcao SQL); exige confirmacao explicita via flag --confirm.
 *
 * Uso:
 *   cd etl && npx ts-node scripts/refresh-empenho-mensal.ts --confirm
 */

import "dotenv/config";
import { pgQuery, closePgPool } from "../connectors/postgres";

const CONFIRM = process.argv.includes("--confirm");

(async () => {
  try {
    console.log("Verificando tabela public.combustivel_empenho_mensal...");
    const rows = await pgQuery<{ existe: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'combustivel_empenho_mensal'
       ) AS existe`,
    );
    if (!rows[0]?.existe) {
      console.error(
        "Tabela nao encontrada: public.combustivel_empenho_mensal. " +
          "Aplique a migration etl/schema/postgres/112_combustivel_empenhos.sql primeiro " +
          "(npm run postgres:migrate).",
      );
      process.exit(1);
    }

    if (!CONFIRM) {
      console.warn(
        "Esta operacao executa public.fn_refresh_combustivel_empenho_mensal(), " +
          "que faz TRUNCATE + INSERT na tabela. " +
          "Reexecute com a flag --confirm para prosseguir.",
      );
      process.exit(2);
    }

    console.log("Chamando public.fn_refresh_combustivel_empenho_mensal()...");
    const inicio = Date.now();
    await pgQuery(`SELECT public.fn_refresh_combustivel_empenho_mensal()`);
    console.log(`OK - tabela populada em ${Date.now() - inicio}ms`);
  } finally {
    await closePgPool();
  }
})().catch((err) => {
  console.error("ERRO:", err instanceof Error ? err.message : err);
  process.exit(1);
});
