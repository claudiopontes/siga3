/**
 * Utilitario manual — contagens e amostras de combustivel/empenho no PostgreSQL.
 * Substitui a versao Supabase anterior. Apenas leitura.
 *
 * Uso:
 *   cd etl && npx ts-node scripts/check-empenho-mensal.ts
 */

import "dotenv/config";
import { pgQuery, closePgPool } from "../connectors/postgres";

type CountRow = { total: string | number };

(async () => {
  try {
    const totalMensal = await pgQuery<CountRow>(
      `SELECT count(*)::bigint AS total FROM public.combustivel_empenho_mensal`,
    );
    console.log(
      "Registros em public.combustivel_empenho_mensal:",
      Number(totalMensal[0]?.total ?? 0),
    );

    const amostraMensal = await pgQuery(
      `SELECT * FROM public.combustivel_empenho_mensal LIMIT 3`,
    );
    console.log("Amostra:", JSON.stringify(amostraMensal, null, 2));

    const totalBruto = await pgQuery<CountRow>(
      `SELECT count(*)::bigint AS total FROM public.tb_despesa_combustivel_polanco`,
    );
    console.log(
      "Registros em public.tb_despesa_combustivel_polanco:",
      Number(totalBruto[0]?.total ?? 0),
    );

    const amostraBruto = await pgQuery(
      `SELECT data_empenho, entidade, tipo_combustivel, valor_empenho
       FROM public.tb_despesa_combustivel_polanco
       LIMIT 3`,
    );
    console.log("Amostra bruta:", JSON.stringify(amostraBruto, null, 2));
  } finally {
    await closePgPool();
  }
})().catch((err) => {
  console.error("ERRO:", err instanceof Error ? err.message : err);
  process.exit(1);
});
