import "dotenv/config";
import { pgQuery, closePgPool } from "../connectors/postgres";

async function check() {
  // Amostra de códigos IBGE no sisagua_resumo
  const sisaguaCodigos = await pgQuery<{ c: string; nome: string; amostras: string }>(
    "SELECT codigo_municipio_ibge AS c, nome_municipio AS nome, total_amostras::text AS amostras FROM mart.sisagua_resumo_municipio ORDER BY total_amostras DESC LIMIT 10"
  );
  console.log("\n--- mart.sisagua_resumo_municipio (top 10 por amostras) ---");
  for (const r of sisaguaCodigos) console.log(`  ${r.c} | ${r.nome} | amostras: ${r.amostras}`);

  // Amostra de códigos IBGE no siops_resumo_municipio
  const siopsCodigos = await pgQuery<{ c: string; nome: string }>(
    "SELECT codigo_municipio_ibge AS c, nome_municipio AS nome FROM mart.siops_resumo_municipio LIMIT 5"
  ).catch(() => [] as { c: string; nome: string }[]);
  console.log("\n--- mart.siops_resumo_municipio (5 primeiros) ---");
  for (const r of siopsCodigos) console.log(`  ${r.c} | ${r.nome}`);

  // Comprimento dos códigos
  const lens = await pgQuery<{ len: string; cnt: string }>(
    "SELECT length(codigo_municipio_ibge) AS len, count(*)::text AS cnt FROM mart.sisagua_resumo_municipio GROUP BY 1"
  );
  console.log("\n--- Comprimento dos códigos IBGE no sisagua_resumo ---");
  for (const r of lens) console.log(`  ${r.len} dígitos: ${r.cnt} municípios`);

  const siopsLens = await pgQuery<{ len: string; cnt: string }>(
    "SELECT length(codigo_municipio_ibge) AS len, count(*)::text AS cnt FROM mart.siops_resumo_municipio GROUP BY 1"
  ).catch(() => [] as { len: string; cnt: string }[]);
  console.log("\n--- Comprimento dos códigos IBGE no siops_resumo ---");
  for (const r of siopsLens) console.log(`  ${r.len} dígitos: ${r.cnt} municípios`);

  // saude_resumo: ver se algum município tem sisagua_total_amostras > 0
  const saudeSisagua = await pgQuery<{ nome: string; amostras: string }>(
    "SELECT nome_municipio AS nome, sisagua_total_amostras::text AS amostras FROM mart.saude_resumo_municipio WHERE sisagua_total_amostras > 0 LIMIT 5"
  );
  console.log("\n--- mart.saude_resumo_municipio com sisagua_total_amostras > 0 ---");
  if (saudeSisagua.length === 0) console.log("  NENHUM município com amostras > 0");
  else for (const r of saudeSisagua) console.log(`  ${r.nome} | ${r.amostras}`);

  // saude_resumo: amostra de códigos
  const saudeCodigos = await pgQuery<{ c: string; nome: string }>(
    "SELECT codigo_municipio_ibge AS c, nome_municipio AS nome FROM mart.saude_resumo_municipio LIMIT 5"
  );
  console.log("\n--- mart.saude_resumo_municipio (5 primeiros) ---");
  for (const r of saudeCodigos) console.log(`  ${r.c} | ${r.nome}`);

  const saudeLens = await pgQuery<{ len: string; cnt: string }>(
    "SELECT length(codigo_municipio_ibge) AS len, count(*)::text AS cnt FROM mart.saude_resumo_municipio GROUP BY 1"
  );
  console.log("\n--- Comprimento dos códigos IBGE no saude_resumo ---");
  for (const r of saudeLens) console.log(`  ${r.len} dígitos: ${r.cnt} municípios`);

  await closePgPool();
}

check().catch((e: Error) => { console.error(e.message); process.exit(1); });
