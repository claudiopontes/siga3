import "dotenv/config";
import { pgQuery, closePgPool } from "../connectors/postgres";

async function main() {
  const q = async (label: string, sql: string) => {
    const rows = await pgQuery<Record<string, unknown>>(sql).catch((e: Error) => [{ erro: e.message }]);
    console.log(`\n--- ${label} ---`);
    if (rows.length === 0) console.log("  (vazio)");
    else for (const r of rows.slice(0, 3)) console.log(" ", JSON.stringify(r));
  };

  await q("dw.fato_infodengue_semana (count)",
    "SELECT count(*)::text AS c FROM dw.fato_infodengue_semana");

  await q("dw.fato_infodengue_semana — anos e semanas disponíveis",
    `SELECT ano_epidemiologico, min(semana_epidemiologica)::text AS se_min,
            max(semana_epidemiologica)::text AS se_max, count(*)::text AS c
     FROM dw.fato_infodengue_semana
     GROUP BY ano_epidemiologico ORDER BY ano_epidemiologico DESC LIMIT 5`);

  await q("dw.fato_infodengue_semana — amostra",
    "SELECT * FROM dw.fato_infodengue_semana ORDER BY ano_epidemiologico DESC, semana_epidemiologica DESC LIMIT 2");

  await q("mart.vigilancia_arboviroses_resumo_municipio — sample",
    "SELECT * FROM mart.vigilancia_arboviroses_resumo_municipio LIMIT 3");

  await q("mart.vigilancia_arboviroses_resumo_home",
    "SELECT * FROM mart.vigilancia_arboviroses_resumo_home");

  await closePgPool();
}

main().catch((e: Error) => { console.error(e.message); process.exit(1); });
