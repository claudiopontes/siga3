/**
 * siops-inspecionar.ts
 *
 * Job exploratório: descobre endpoints e formato real da API SIOPS.
 * Imprime estrutura real do JSON, lista de municípios do Acre e indicadores.
 *
 * Variáveis de ambiente:
 *   SIOPS_API_BASE_URL      — base da API (padrão: https://siops-consulta-publica-api.saude.gov.br)
 *   SIOPS_UF_CODIGO         — código IBGE numérico da UF (padrão: 12 = Acre)
 *   SIOPS_TIMEOUT_MS        — timeout por requisição (padrão: 30000)
 *
 * Uso: cd etl && npm run siops:inspecionar
 */

import "dotenv/config";
import { pgQuery, closePgPool } from "../connectors/postgres";

const BASE_URL   = (process.env.SIOPS_API_BASE_URL || "https://siops-consulta-publica-api.saude.gov.br").replace(/\/$/, "");
const UF_CODIGO  = process.env.SIOPS_UF_CODIGO || "12"; // Acre = 12
const TIMEOUT_MS = parseInt(process.env.SIOPS_TIMEOUT_MS || "30000", 10);

async function get(path: string): Promise<{ ok: boolean; status: number; dados: unknown }> {
  const url = `${BASE_URL}${path}`;
  try {
    const resp = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "Varadouro-Digital-ETL/1.0 (interno TCE-AC)" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await resp.text();
    let dados: unknown = text;
    try { dados = JSON.parse(text); } catch { /* mantém como texto */ }
    return { ok: resp.ok, status: resp.status, dados };
  } catch (err) {
    return { ok: false, status: 0, dados: null };
  }
}

async function main() {
  console.log("[siops:inspecionar] API SIOPS — Inspeção de endpoints e formatos");
  console.log(`  Base URL : ${BASE_URL}`);
  console.log(`  UF código: ${UF_CODIGO} (Acre=12)`);
  console.log();

  // 1. Anos/períodos disponíveis
  console.log("── 1. Períodos disponíveis (/v1/ano-periodo) ──");
  const periodos = await get("/v1/ano-periodo");
  if (periodos.ok && Array.isArray(periodos.dados)) {
    const ultimos = (periodos.dados as Record<string, unknown>[]).slice(-6);
    for (const p of ultimos) {
      console.log(`   ano=${p.ds_ano}  nu_periodo=${p.nu_periodo}  ds_periodo=${p.ds_periodo}`);
    }
    console.log(`   Total de períodos: ${(periodos.dados as unknown[]).length}`);
  } else {
    console.log(`   ✗ HTTP ${periodos.status}`);
  }

  console.log();

  // 2. Municípios do Acre
  console.log(`── 2. Municípios UF ${UF_CODIGO} (/v1/ente/municipal/${UF_CODIGO}) ──`);
  const municipios = await get(`/v1/ente/municipal/${UF_CODIGO}`);
  if (municipios.ok && Array.isArray(municipios.dados)) {
    const lista = municipios.dados as Record<string, unknown>[];
    console.log(`   Total: ${lista.length} municípios`);
    for (const m of lista.slice(0, 5)) {
      console.log(`   co_municipio=${m.co_municipio}  no_municipio=${m.no_municipio}`);
    }
    if (lista.length > 5) console.log(`   ... +${lista.length - 5} municípios`);
  } else {
    console.log(`   ✗ HTTP ${municipios.status} — Verifique se SIOPS_UF_CODIGO é o código IBGE numérico da UF (Acre=12)`);
  }

  console.log();

  // 3. Indicadores de um município (Rio Branco, 2023, anual)
  const COD_RIO_BRANCO = "120040"; // código 6 dígitos SIOPS (IBGE 7 sem o último)
  console.log(`── 3. Indicadores Rio Branco 2023/anual (/v1/indicador/municipal/${COD_RIO_BRANCO}/2023/2) ──`);
  const indicadores = await get(`/v1/indicador/municipal/${COD_RIO_BRANCO}/2023/2`);
  if (indicadores.ok && Array.isArray(indicadores.dados)) {
    const lista = indicadores.dados as Record<string, unknown>[];
    console.log(`   Total de indicadores: ${lista.length}`);
    for (const ind of lista) {
      console.log(`   [${ind.numero_indicador}] ${String(ind.ds_indicador).trim().slice(0, 70)}`);
      console.log(`         numerador=${ind.numerador}  denominador=${ind.denominador}  calculado="${ind.indicador_calculado}"`);
    }
    // Salva amostra
    await pgQuery(`
      INSERT INTO raw.siops_indicadores_raw (ano, periodo, uf, codigo_municipio_ibge, nome_municipio, endpoint, payload)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [2023, "2", "AC", COD_RIO_BRANCO, "Rio Branco", `/v1/indicador/municipal/${COD_RIO_BRANCO}/2023/2`, JSON.stringify(indicadores.dados)]);
    console.log(`   ✓ Amostra salva em raw.siops_indicadores_raw`);
  } else {
    console.log(`   ✗ HTTP ${indicadores.status}`);
    if (indicadores.dados) console.log(`   Resposta: ${JSON.stringify(indicadores.dados).slice(0, 200)}`);
  }

  console.log();

  // 4. RREO saúde
  console.log(`── 4. RREO saúde (/v1/rreo/municipal/AC/${COD_RIO_BRANCO}/2023/2) ──`);
  const rreo = await get(`/v1/rreo/municipal/AC/${COD_RIO_BRANCO}/2023/2`);
  console.log(`   HTTP ${rreo.status} — ${rreo.ok ? "OK" : "erro"}`);
  if (rreo.ok) {
    console.log(`   Estrutura: ${JSON.stringify(rreo.dados).slice(0, 200)}`);
  }

  console.log();
  console.log("── Resumo ──");
  console.log("  Endpoint funcional : /v1/indicador/municipal/{co_municipio6}/{ano}/{nu_periodo}");
  console.log("  Código município   : 6 dígitos SIOPS (IBGE 7 dígitos sem o último)");
  console.log("  nu_periodo         : 1 = 1º semestre, 2 = anual");
  console.log("  Indicador ASPS     : numero_indicador='3.2' (% receita própria aplicada em saúde)");
  console.log();
  console.log("  Para carregar os dados execute:");
  console.log("    npm run carga-siops:postgres");
}

main()
  .then(() => closePgPool())
  .catch((err) => {
    console.error("[siops:inspecionar] Erro:", (err as Error).message);
    closePgPool().catch(() => void 0);
    process.exit(1);
  });
