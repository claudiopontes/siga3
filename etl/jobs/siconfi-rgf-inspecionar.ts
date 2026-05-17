/**
 * siconfi-rgf-inspecionar.ts
 *
 * Job exploratório: descobre o endpoint correto e o formato real da API SICONFI/RGF.
 * Testa sistematicamente:
 *   - Endpoint /rgf (dedicado)
 *   - Endpoint /rreo com co_tipo_demonstrativo=RGF
 *   - Variações de parâmetro: id_ente vs id_municipio
 *   - Anos: 2023, 2024, 2025, 2026
 *   - Períodos quadrimestrais: 1, 2, 3
 *
 * Uso: cd etl && npm run siconfi-rgf:inspecionar
 */

import "dotenv/config";

const BASE_URL = (process.env.SICONFI_API_BASE_URL || "https://apidatalake.tesouro.gov.br/ords/siconfi/tt").replace(/\/$/, "");
const TIMEOUT  = parseInt(process.env.SICONFI_TIMEOUT_MS || "30000", 10);

// Rio Branco — maior município, mais provável de ter dados entregues
const COD_RIO_BRANCO = 1200401;

async function get(path: string): Promise<{ ok: boolean; status: number; dados: unknown }> {
  const url = `${BASE_URL}${path}`;
  console.log(`  GET ${url}`);
  try {
    const resp = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Varadouro-Digital-ETL/1.0 (interno TCE-AC)" },
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

function preview(obj: unknown, maxLen = 600): string {
  return JSON.stringify(obj, null, 0).slice(0, maxLen);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("[siconfi-rgf:inspecionar] Descoberta de endpoint SICONFI/RGF");
  console.log(`  Base URL: ${BASE_URL}`);
  console.log(`  Município teste: Rio Branco (id=${COD_RIO_BRANCO})`);
  console.log();

  // ── 1. Endpoint dedicado /rgf sem filtros ──
  console.log("── 1. Endpoint /rgf sem filtros (limit=5) ──");
  const r1 = await get(`/rgf?limit=5`);
  console.log(`   HTTP ${r1.status}`);
  if (r1.ok) {
    const d = r1.dados as Record<string, unknown>;
    const items = Array.isArray(d?.items) ? d.items as Record<string, unknown>[] : [];
    console.log(`   Registros: ${items.length}`);
    if (items.length > 0) {
      console.log(`   Campos: ${Object.keys(items[0]).join(", ")}`);
      console.log(`   Primeiro: ${preview(items[0])}`);
    } else {
      console.log(`   Resposta bruta: ${preview(r1.dados, 300)}`);
    }
  }
  await sleep(1000);
  console.log();

  // ── 2. /rgf com id_ente (Rio Branco, 2024) ──
  console.log("── 2. /rgf com id_ente=1200401 ano=2024 período=1 ──");
  const r2 = await get(`/rgf?an_exercicio=2024&nr_periodo=1&id_ente=${COD_RIO_BRANCO}&limit=10`);
  console.log(`   HTTP ${r2.status}`);
  if (r2.ok) {
    const d = r2.dados as Record<string, unknown>;
    const items = Array.isArray(d?.items) ? d.items as Record<string, unknown>[] : [];
    console.log(`   Registros: ${items.length}`);
    if (items.length > 0) {
      console.log(`   ✅ FUNCIONA! Campos: ${Object.keys(items[0]).join(", ")}`);
      console.log(`   Primeiro: ${preview(items[0])}`);
    }
  }
  await sleep(1000);
  console.log();

  // ── 3. /rreo com co_tipo_demonstrativo=RGF ──
  console.log("── 3. /rreo com co_tipo_demonstrativo=RGF e id_ente=1200401 ano=2024 período=1 ──");
  const r3 = await get(`/rreo?an_exercicio=2024&nr_periodo=1&id_ente=${COD_RIO_BRANCO}&co_tipo_demonstrativo=RGF&limit=10`);
  console.log(`   HTTP ${r3.status}`);
  if (r3.ok) {
    const d = r3.dados as Record<string, unknown>;
    const items = Array.isArray(d?.items) ? d.items as Record<string, unknown>[] : [];
    console.log(`   Registros: ${items.length}`);
    if (items.length > 0) {
      console.log(`   ✅ FUNCIONA! Campos: ${Object.keys(items[0]).join(", ")}`);
      console.log(`   Primeiro: ${preview(items[0])}`);
    }
  }
  await sleep(1000);
  console.log();

  // ── 4. /rgf com id_municipio (formato alternativo) ──
  console.log("── 4. /rgf com id_municipio=1200401 (parâmetro alternativo) ano=2024 período=1 ──");
  const r4 = await get(`/rgf?an_exercicio=2024&nr_periodo=1&id_municipio=${COD_RIO_BRANCO}&limit=10`);
  console.log(`   HTTP ${r4.status}`);
  if (r4.ok) {
    const d = r4.dados as Record<string, unknown>;
    const items = Array.isArray(d?.items) ? d.items as Record<string, unknown>[] : [];
    console.log(`   Registros: ${items.length}`);
    if (items.length > 0) {
      console.log(`   ✅ FUNCIONA! Campos: ${Object.keys(items[0]).join(", ")}`);
    }
  }
  await sleep(1000);
  console.log();

  // ── 5. /rgf por anos e períodos recentes ──
  console.log("── 5. Varredura de anos/períodos recentes (Rio Branco) ──");
  for (const ano of [2023, 2024, 2025, 2026]) {
    for (const periodo of [1, 2, 3]) {
      const r = await get(`/rgf?an_exercicio=${ano}&nr_periodo=${periodo}&id_ente=${COD_RIO_BRANCO}&limit=5`);
      const d = r.dados as Record<string, unknown>;
      const items = Array.isArray(d?.items) ? d.items as unknown[] : [];
      const flag = items.length > 0 ? "✅" : "  ";
      console.log(`   ${flag} /rgf ${ano}/${periodo}  HTTP ${r.status}  registros=${items.length}`);
      await sleep(800);
    }
  }
  console.log();

  // ── 6. /rgf todos os municípios Acre 2024/1 ──
  console.log("── 6. /rgf por co_ibge_estado=12 (Acre) ano=2024 período=1 ──");
  const r6 = await get(`/rgf?an_exercicio=2024&nr_periodo=1&co_ibge_estado=12&limit=50`);
  console.log(`   HTTP ${r6.status}`);
  if (r6.ok) {
    const d = r6.dados as Record<string, unknown>;
    const items = Array.isArray(d?.items) ? d.items as Record<string, unknown>[] : [];
    console.log(`   Registros: ${items.length}`);
    if (items.length > 0) {
      const entes = [...new Map(items.map((i) => [i.cod_ibge ?? i.id_ente, i.instituicao ?? i.no_ente])).entries()];
      console.log(`   Entes distintos: ${entes.length}`);
      for (const [id, nome] of entes.slice(0, 5)) console.log(`     id=${id}  nome=${nome}`);
    }
  }
  await sleep(1000);
  console.log();

  // ── 7. Campos de um item RGF real (se encontrou) ──
  console.log("── 7. Campos disponíveis em item RGF real ──");
  for (const endpoint of [`/rgf`, `/rreo`]) {
    const suffix = endpoint === `/rreo` ? `&co_tipo_demonstrativo=RGF` : "";
    const r = await get(`${endpoint}?an_exercicio=2024&nr_periodo=1&id_ente=${COD_RIO_BRANCO}&limit=3${suffix}`);
    if (r.ok) {
      const d = r.dados as Record<string, unknown>;
      const items = Array.isArray(d?.items) ? d.items as Record<string, unknown>[] : [];
      if (items.length > 0) {
        console.log(`   [${endpoint}] Campos: ${Object.keys(items[0]).join(", ")}`);
        console.log(`   [${endpoint}] Amostra: ${preview(items[0])}`);
        const anexos = [...new Set(items.map((i) => i.anexo ?? i.no_anexo))];
        console.log(`   [${endpoint}] Anexos amostra: ${anexos.join(", ")}`);
      } else {
        console.log(`   [${endpoint}] Sem dados para 2024/1`);
      }
    }
    await sleep(1000);
  }
  console.log();

  // ── 8. Endpoint /rgf sem id_ente — retorna tudo do país (limite) ──
  console.log("── 8. /rgf sem id_ente, ano=2024, período=1 (limit=3) — verifica campos ──");
  const r8 = await get(`/rgf?an_exercicio=2024&nr_periodo=1&limit=3`);
  console.log(`   HTTP ${r8.status}`);
  if (r8.ok) {
    const d = r8.dados as Record<string, unknown>;
    const items = Array.isArray(d?.items) ? d.items as Record<string, unknown>[] : [];
    if (items.length > 0) {
      console.log(`   Campos: ${Object.keys(items[0]).join(", ")}`);
      console.log(`   Total count: ${(d.count as number ?? 0)}`);
      console.log(`   hasMore: ${d.hasMore}`);
      console.log(`   Primeiro: ${preview(items[0])}`);
    }
  }
  console.log();

  // ── 9. FINBRA — endpoints específicos do FINBRA para RGF ──
  // O manual SICONFI seção 1.2.1.2 mostra que RGF é consultado via FINBRA,
  // não via /rreo ou /rgf. O DataLake pode expor isso por endpoints como /finbra_rgf.
  console.log("── 9. FINBRA RGF — endpoints DataLake FINBRA ──");
  const finbraEndpoints = [
    `/finbra_rgf?an_exercicio=2024&nr_periodo=1&id_ente=${COD_RIO_BRANCO}&limit=5`,
    `/finbra_rgf?an_exercicio=2024&nr_periodo=1&limit=5`,
    `/finbra_rgf?limit=5`,
    `/finbra/rgf?an_exercicio=2024&nr_periodo=1&id_ente=${COD_RIO_BRANCO}&limit=5`,
    `/rgf_finbra?an_exercicio=2024&nr_periodo=1&id_ente=${COD_RIO_BRANCO}&limit=5`,
    `/finbra?co_tipo=RGF&an_exercicio=2024&nr_periodo=1&id_ente=${COD_RIO_BRANCO}&limit=5`,
    `/finbra?limit=5`,
  ];
  for (const ep of finbraEndpoints) {
    const r = await get(ep);
    const d = r.dados as Record<string, unknown>;
    const items = Array.isArray(d?.items) ? d.items as unknown[] : Array.isArray(d) ? d as unknown[] : [];
    const flag = items.length > 0 ? "✅" : r.status === 404 ? "404" : "  ";
    console.log(`   ${flag} HTTP ${r.status}  items=${items.length}  ${ep.split("?")[0]}`);
    if (items.length > 0) {
      console.log(`   ✅ DADOS ENCONTRADOS! Campos: ${Object.keys((items as Record<string, unknown>[])[0]).join(", ")}`);
      console.log(`   Primeiro: ${preview((items as unknown[])[0])}`);
    }
    await sleep(700);
  }
  console.log();

  // ── 10. /rreo SEM co_tipo_demonstrativo — vê todos os demonstrativos juntos ──
  console.log("── 9. /rreo SEM co_tipo_demonstrativo — Rio Branco 2024/1 (limit=5) ──");
  const r9 = await get(`/rreo?an_exercicio=2024&nr_periodo=1&id_ente=${COD_RIO_BRANCO}&limit=5`);
  console.log(`   HTTP ${r9.status}`);
  if (r9.ok) {
    const d = r9.dados as Record<string, unknown>;
    const items = Array.isArray(d?.items) ? d.items as Record<string, unknown>[] : [];
    console.log(`   Registros: ${items.length}  hasMore: ${d.hasMore}  count: ${d.count}`);
    if (items.length > 0) {
      console.log(`   Campos: ${Object.keys(items[0]).join(", ")}`);
      const demos = [...new Set(items.map((i) => i.demonstrativo ?? i.co_tipo_demonstrativo))];
      console.log(`   Demonstrativos presentes: ${demos.join(", ")}`);
      console.log(`   Primeiro: ${preview(items[0])}`);
    }
  }
  await sleep(1000);
  console.log();

  // ── 10. /rreo com no_anexo=RGF (busca direta pelo nome do anexo) ──
  console.log("── 10. /rreo com no_anexo=RGF-Anexo 01 — Rio Branco 2024/1 ──");
  const r10 = await get(`/rreo?an_exercicio=2024&nr_periodo=1&id_ente=${COD_RIO_BRANCO}&no_anexo=RGF-Anexo%2001&limit=10`);
  console.log(`   HTTP ${r10.status}`);
  if (r10.ok) {
    const d = r10.dados as Record<string, unknown>;
    const items = Array.isArray(d?.items) ? d.items as Record<string, unknown>[] : [];
    console.log(`   Registros: ${items.length}`);
    if (items.length > 0) {
      console.log(`   ✅ RGF encontrado via no_anexo! Campos: ${Object.keys(items[0]).join(", ")}`);
      console.log(`   Primeiro: ${preview(items[0])}`);
    }
  }
  await sleep(1000);
  console.log();

  // ── 11. Extrato de entregas — verifica se RGF consta como entregável ──
  console.log("── 11. extrato_entregas Rio Branco 2024 — lista entregáveis ──");
  const r11 = await get(`/extrato_entregas?id_ente=${COD_RIO_BRANCO}&an_referencia=2024`);
  console.log(`   HTTP ${r11.status}`);
  if (r11.ok) {
    const d = r11.dados as Record<string, unknown>;
    const items = Array.isArray(d?.items) ? d.items as Record<string, unknown>[] : [];
    console.log(`   Entregáveis no extrato: ${items.length}`);
    for (const item of items) {
      const i = item as Record<string, unknown>;
      console.log(`   entregavel="${i.entregavel}"  periodo=${i.periodo}  status="${i.status_relatorio}"  data="${i.data_status}"`);
    }
  }
  await sleep(1000);
  console.log();

  // ── 12. /rreo sem tipo — lista TODOS os demonstrativos disponíveis para Acre 2024/1 ──
  console.log("── 12. /rreo co_ibge_estado=12 2024/1 SEM co_tipo — todos demonstrativos Acre ──");
  const r12 = await get(`/rreo?an_exercicio=2024&nr_periodo=1&co_ibge_estado=12&limit=50`);
  console.log(`   HTTP ${r12.status}`);
  if (r12.ok) {
    const d = r12.dados as Record<string, unknown>;
    const items = Array.isArray(d?.items) ? d.items as Record<string, unknown>[] : [];
    console.log(`   Registros: ${items.length}  hasMore: ${d.hasMore}`);
    if (items.length > 0) {
      const demos = [...new Set((items as Record<string, unknown>[]).map((i) => i.demonstrativo))];
      const entes = [...new Set((items as Record<string, unknown>[]).map((i) => i.cod_ibge))];
      console.log(`   Demonstrativos: ${demos.join(", ")}`);
      console.log(`   Entes: ${entes.join(", ")}`);
    }
  }
  await sleep(1000);
  console.log();

  // ── 13. /rreo com co_tipo_demonstrativo=RGF sem id_ente — há RGF no Brasil? ──
  console.log("── 13. /rreo co_tipo_demonstrativo=RGF sem id_ente 2024/1 (limit=5) ──");
  const r13 = await get(`/rreo?an_exercicio=2024&nr_periodo=1&co_tipo_demonstrativo=RGF&limit=5`);
  console.log(`   HTTP ${r13.status}`);
  if (r13.ok) {
    const d = r13.dados as Record<string, unknown>;
    const items = Array.isArray(d?.items) ? d.items as Record<string, unknown>[] : [];
    console.log(`   Registros: ${items.length}  count: ${d.count}  hasMore: ${d.hasMore}`);
    if (items.length > 0) {
      console.log(`   ✅ RGF existe no /rreo! Entes: ${[...new Set((items as Record<string, unknown>[]).map(i => i.cod_ibge ?? i.id_ente))].join(", ")}`);
      console.log(`   Campos: ${Object.keys(items[0]).join(", ")}`);
    }
  }
  await sleep(1000);
  console.log();

  // ── 14. /rreo co_tipo_demonstrativo=RGF esfera=M — RGF municipal Brasil ──
  console.log("── 14. /rreo co_tipo_demonstrativo=RGF co_esfera=M (limit=5) — RGF municipal Brasil ──");
  const r14 = await get(`/rreo?an_exercicio=2024&nr_periodo=1&co_tipo_demonstrativo=RGF&co_esfera=M&limit=5`);
  console.log(`   HTTP ${r14.status}`);
  if (r14.ok) {
    const d = r14.dados as Record<string, unknown>;
    const items = Array.isArray(d?.items) ? d.items as Record<string, unknown>[] : [];
    console.log(`   Registros: ${items.length}  count: ${d.count}`);
    if (items.length > 0) {
      console.log(`   ✅ Campos: ${Object.keys(items[0]).join(", ")}`);
      console.log(`   Primeiro: ${preview(items[0])}`);
    }
  }
  await sleep(1000);
  console.log();

  // ── 15. anos anteriores com /rreo+RGF — dados históricos 2021/2022 ──
  console.log("── 15. /rreo co_tipo_demonstrativo=RGF anos 2021 e 2022 Rio Branco ──");
  for (const ano of [2021, 2022, 2023]) {
    for (const per of [1, 2, 3]) {
      const r = await get(`/rreo?an_exercicio=${ano}&nr_periodo=${per}&id_ente=${COD_RIO_BRANCO}&co_tipo_demonstrativo=RGF&limit=3`);
      const d = r.dados as Record<string, unknown>;
      const items = Array.isArray(d?.items) ? d.items as unknown[] : [];
      const flag = items.length > 0 ? "✅" : "  ";
      console.log(`   ${flag} /rreo RGF ${ano}/${per}  HTTP ${r.status}  registros=${items.length}`);
      await sleep(600);
    }
  }

  console.log();
  console.log("── Resumo ──");
  console.log("  /rgf endpoint:     vazio — DataLake não publica dados pelo /rgf");
  console.log("  Próximo passo:     verificar extrato (teste 11) para confirmar entrega RGF");
  console.log("                     e testes 9/13/14 para localizar via /rreo");
}

main().catch((err) => {
  console.error("[siconfi-rgf:inspecionar] Erro:", (err as Error).message);
  process.exit(1);
});
