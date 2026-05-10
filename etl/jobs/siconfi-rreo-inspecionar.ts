/**
 * siconfi-rreo-inspecionar.ts
 *
 * Job exploratório: descobre endpoints e formato real da API SICONFI/RREO.
 * Imprime estrutura do JSON, lista de municípios do Acre e exemplos de RREO.
 *
 * Variáveis de ambiente:
 *   SICONFI_API_BASE_URL   — base da API (padrão: https://apidatalake.tesouro.gov.br/ords/siconfi/tt)
 *   SICONFI_CO_IBGE_UF     — código IBGE da UF (padrão: 12 = Acre)
 *   SICONFI_TIMEOUT_MS     — timeout por requisição (padrão: 30000)
 *
 * Uso: cd etl && npm run siconfi-rreo:inspecionar
 */

import "dotenv/config";

const BASE_URL  = (process.env.SICONFI_API_BASE_URL || "https://apidatalake.tesouro.gov.br/ords/siconfi/tt").replace(/\/$/, "");
const CO_UF     = process.env.SICONFI_CO_IBGE_UF || "12"; // Acre = 12
const TIMEOUT   = parseInt(process.env.SICONFI_TIMEOUT_MS || "30000", 10);

async function get(path: string): Promise<{ ok: boolean; status: number; dados: unknown }> {
  const url = `${BASE_URL}${path}`;
  console.log(`  GET ${url}`);
  try {
    const resp = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "Varadouro-Digital-ETL/1.0 (interno TCE-AC)" },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    const text = await resp.text();
    let dados: unknown = text;
    try { dados = JSON.parse(text); } catch { /* mantém como texto */ }
    return { ok: resp.ok, status: resp.status, dados };
  } catch (err) {
    console.log(`  ✗ Erro de rede: ${(err as Error).message}`);
    return { ok: false, status: 0, dados: null };
  }
}

function preview(obj: unknown, maxLen = 500): string {
  return JSON.stringify(obj).slice(0, maxLen);
}

async function main() {
  console.log("[siconfi-rreo:inspecionar] API SICONFI — Inspeção de endpoints RREO");
  console.log(`  Base URL : ${BASE_URL}`);
  console.log(`  CO_UF    : ${CO_UF} (Acre=12)`);
  console.log();

  // 1. Lista de exercícios disponíveis
  console.log("── 1. Exercícios disponíveis (/rreo) ──");
  const exercicios = await get("/rreo?limit=5");
  console.log(`   HTTP ${exercicios.status}`);
  if (exercicios.ok) {
    const d = exercicios.dados as Record<string, unknown>;
    const items = (d?.items ?? d) as unknown[];
    console.log(`   ${preview(items?.slice?.(0, 2) ?? d)}`);
  }
  console.log();

  // 2. RREO com filtro por UF
  console.log(`── 2. RREO por UF (an_exercicio=2023, nr_periodo=1) ──`);
  const r2 = await get(`/rreo?an_exercicio=2023&nr_periodo=1&co_tipo_demonstrativo=RREO&co_ibge_municipio_capital=&limit=3`);
  console.log(`   HTTP ${r2.status}`);
  if (r2.ok) console.log(`   ${preview(r2.dados)}`);
  console.log();

  // 3. Endpoint por município (código IBGE 7 dígitos)
  // Rio Branco = 1200401
  const COD_RIO_BRANCO = 1200401;
  console.log(`── 3. RREO por id_municipio=${COD_RIO_BRANCO} (Rio Branco) ──`);
  const r3 = await get(`/rreo?an_exercicio=2023&nr_periodo=1&id_municipio=${COD_RIO_BRANCO}&limit=5`);
  console.log(`   HTTP ${r3.status}`);
  if (r3.ok) {
    const d = r3.dados as Record<string, unknown>;
    const items = Array.isArray(d?.items) ? d.items as unknown[] : Array.isArray(d) ? d as unknown[] : [];
    console.log(`   Total de registros: ${items.length}`);
    if (items.length > 0) {
      console.log(`   Primeiro registro: ${preview(items[0])}`);
      // Listar campos
      const keys = Object.keys(items[0] as Record<string, unknown>);
      console.log(`   Campos disponíveis: ${keys.join(", ")}`);
    }
  }
  console.log();

  // 4. Tentativa com co_ibge
  console.log(`── 4. RREO com co_ibge (formato alternativo) ──`);
  const r4 = await get(`/rreo?an_exercicio=2023&nr_periodo=1&co_ibge=${COD_RIO_BRANCO}&limit=5`);
  console.log(`   HTTP ${r4.status} — ${preview(r4.dados, 200)}`);
  console.log();

  // 5. RREO Anexo 12 (Demonstrativo de Recursos Aplicados em Saúde)
  console.log(`── 5. RREO Anexo 12 (Saúde) ──`);
  const r5 = await get(`/rreo?an_exercicio=2023&nr_periodo=6&no_anexo=RREO-Anexo%2012&id_municipio=${COD_RIO_BRANCO}&limit=10`);
  console.log(`   HTTP ${r5.status}`);
  if (r5.ok) console.log(`   ${preview(r5.dados)}`);
  console.log();

  // 6. Listar municípios do Acre via endpoint diferente
  console.log(`── 6. Municípios do Acre ─ endpoint alternativo ──`);
  const r6 = await get(`/rreo?an_exercicio=2023&nr_periodo=1&co_ibge_estado=${CO_UF}&limit=30`);
  console.log(`   HTTP ${r6.status}`);
  if (r6.ok) {
    const d = r6.dados as Record<string, unknown>;
    const items = Array.isArray(d?.items) ? d.items : Array.isArray(d) ? d : [];
    console.log(`   Registros retornados: ${(items as unknown[]).length}`);
    if ((items as unknown[]).length > 0) console.log(`   Amostra: ${preview((items as unknown[])[0])}`);
  }
  console.log();

  // 7. RREO Demonstrativo de Execução das Despesas por Função/Subfunção
  console.log(`── 7. RREO por id_municipio sem filtro de anexo ──`);
  const r7 = await get(`/rreo?an_exercicio=2023&nr_periodo=6&id_municipio=${COD_RIO_BRANCO}&limit=5`);
  console.log(`   HTTP ${r7.status}`);
  if (r7.ok) {
    const d = r7.dados as Record<string, unknown>;
    const items = Array.isArray(d?.items) ? d.items : Array.isArray(d) ? d : [];
    const arr = items as Record<string, unknown>[];
    console.log(`   Total: ${arr.length}`);
    if (arr.length > 0) {
      console.log(`   Primeiro: ${preview(arr[0])}`);
      // mostrar anexos únicos
      const anexos = [...new Set(arr.map(i => i.no_anexo))];
      console.log(`   Anexos presentes: ${anexos.join(", ")}`);
    }
  }
  console.log();

  // 8. Endpoint com paginação completa - municípios Acre 2024
  console.log(`── 8. Lista todos os municípios do Acre que entregaram RREO 2024/1 ──`);
  const r8 = await get(`/rreo?an_exercicio=2024&nr_periodo=1&co_ibge_estado=${CO_UF}&limit=50`);
  console.log(`   HTTP ${r8.status}`);
  if (r8.ok) {
    const d = r8.dados as Record<string, unknown>;
    const items = Array.isArray(d?.items) ? d.items : Array.isArray(d) ? d : [];
    const arr = items as Record<string, unknown>[];
    const municipios = [...new Map(arr.map(i => [i.id_municipio, i.no_municipio])).entries()];
    console.log(`   Municípios com dado: ${municipios.length}`);
    for (const [id, nome] of municipios.slice(0, 5)) {
      console.log(`     id_municipio=${id}  no_municipio=${nome}`);
    }
  }
  console.log();

  console.log("── Resumo ──");
  console.log("  Endpoint base : /rreo");
  console.log("  Parâmetros chave:");
  console.log("    an_exercicio          — ano (ex: 2023)");
  console.log("    nr_periodo            — período (1-6 bimestres ou 1-2 semestral)");
  console.log("    id_municipio          — código IBGE 7 dígitos");
  console.log("    co_ibge_estado        — código UF (12=Acre)");
  console.log("    no_anexo              — ex: 'RREO-Anexo 12' (saúde)");
  console.log("    co_tipo_demonstrativo — 'RREO'");
  console.log();
  console.log("  Para carregar os dados execute:");
  console.log("    npm run carga-siconfi-rreo:postgres");
}

main().catch((err) => {
  console.error("[siconfi-rreo:inspecionar] Erro:", (err as Error).message);
  process.exit(1);
});
