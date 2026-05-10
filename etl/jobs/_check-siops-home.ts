import "dotenv/config";
import { pgQuery, closePgPool } from "../connectors/postgres";

async function run() {
  const h = await pgQuery(`SELECT COUNT(*) as total FROM mart.siops_alertas_home`);
  console.log("mart.siops_alertas_home:", (h[0] as { total: string }).total, "registros");

  const r = await pgQuery(`SELECT * FROM mart.siops_resumo_home`);
  console.log("mart.siops_resumo_home:", JSON.stringify(r, null, 2));

  const niveis = await pgQuery(`SELECT nivel, prioridade, COUNT(*) as total FROM mart.siops_alertas_home GROUP BY nivel, prioridade ORDER BY prioridade`);
  console.log("Distribuição por nível:", JSON.stringify(niveis, null, 2));

  await closePgPool();
}
run().catch(e => { console.error(e.message); closePgPool(); });
