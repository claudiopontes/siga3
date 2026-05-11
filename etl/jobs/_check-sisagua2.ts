import "dotenv/config";
import { pgQuery, closePgPool } from "../connectors/postgres";

async function main() {
  const r = await pgQuery<{
    nome: string; amostras: string; fora: string;
    ecoli: string; coli: string; pct: string | null; data: string | null;
  }>(`
    SELECT
      nome_municipio AS nome,
      total_amostras::text AS amostras,
      total_fora_padrao::text AS fora,
      total_ecoli::text AS ecoli,
      total_coliformes::text AS coli,
      percentual_fora_padrao::text AS pct,
      data_ultima_coleta::text AS data
    FROM mart.sisagua_resumo_municipio
    WHERE total_amostras > 0
    ORDER BY total_fora_padrao DESC
    LIMIT 10
  `);
  console.log("nome | amostras | fora_padrão | ecoli | coliformes | % fora | última coleta");
  for (const row of r) {
    console.log(`${row.nome} | ${row.amostras} | ${row.fora} | ${row.ecoli} | ${row.coli} | ${row.pct} | ${row.data}`);
  }
  await closePgPool();
}

main().catch((e: Error) => { console.error(e.message); process.exit(1); });
