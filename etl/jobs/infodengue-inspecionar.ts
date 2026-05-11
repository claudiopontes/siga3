/**
 * infodengue-inspecionar.ts
 *
 * Job exploratório: inspeciona a API InfoDengue/AlertaDengue para os
 * municípios do Acre, testando as três doenças monitoradas.
 *
 * O que faz:
 *   - Testa endpoint para 2 municípios representativos (Rio Branco + Cruzeiro do Sul)
 *   - Testa dengue, chikungunya e zika
 *   - Imprime URL, status HTTP, chaves retornadas e amostra de dados
 *   - Salva payload em raw.infodengue_raw quando bem-sucedido
 *   - Registra claramente falhas e ausência de dados
 *
 * Variáveis de ambiente (.env):
 *   INFODENGUE_API_BASE_URL  — base da API (padrão: https://info.dengue.mat.br/api/alertcity)
 *   INFODENGUE_ANO_INICIO    — ano inicial (padrão: 2024)
 *   INFODENGUE_ANO_FIM       — ano final   (padrão: 2026)
 *   INFODENGUE_TIMEOUT_MS    — timeout     (padrão: 30000)
 *   INFODENGUE_RATE_LIMIT_MS — pausa       (padrão: 500)
 *
 * Uso: cd etl && npm run infodengue:inspecionar
 */

import "dotenv/config";
import { pgQuery, closePgPool } from "../connectors/postgres";

// ─── Configuração ─────────────────────────────────────────────────────────────

const BASE_URL   = (process.env.INFODENGUE_API_BASE_URL ?? "https://info.dengue.mat.br/api/alertcity").replace(/\/$/, "");
const ANO_INICIO = Number(process.env.INFODENGUE_ANO_INICIO ?? "2024");
const ANO_FIM    = Number(process.env.INFODENGUE_ANO_FIM    ?? "2026");
const TIMEOUT_MS = Number(process.env.INFODENGUE_TIMEOUT_MS    ?? "30000");
const RATE_LIMIT = Number(process.env.INFODENGUE_RATE_LIMIT_MS ?? "500");

// Municípios representativos para inspeção
const MUNICIPIOS_TESTE = [
  { codigo: "1200401", nome: "Rio Branco" },
  { codigo: "1200203", nome: "Cruzeiro do Sul" },
];

const DOENCAS = ["dengue", "chikungunya", "zika"] as const;
type Doenca = typeof DOENCAS[number];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function montarUrl(geocode: string, doenca: Doenca, anoInicio: number, anoFim: number): string {
  return `${BASE_URL}?geocode=${geocode}&disease=${doenca}&format=json` +
    `&ew_start=1&ew_end=53&ey_start=${anoInicio}&ey_end=${anoFim}`;
}

async function buscar(url: string): Promise<{ ok: boolean; status: number; dados: unknown; erro?: string }> {
  try {
    const resp = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Varadouro-Digital-ETL/1.0 (TCE-AC)" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!resp.ok) {
      return { ok: false, status: resp.status, dados: null, erro: `HTTP ${resp.status}` };
    }
    const texto = await resp.text();
    try {
      const dados = JSON.parse(texto);
      return { ok: true, status: resp.status, dados };
    } catch {
      return { ok: false, status: resp.status, dados: null, erro: `Resposta não é JSON: ${texto.slice(0, 100)}` };
    }
  } catch (e) {
    return { ok: false, status: 0, dados: null, erro: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Salvar raw ───────────────────────────────────────────────────────────────

async function salvarRaw(
  geocode: string, nome: string, doenca: Doenca,
  anoInicio: number, anoFim: number, url: string, payload: unknown,
): Promise<void> {
  try {
    await pgQuery(
      `INSERT INTO raw.infodengue_raw
         (codigo_municipio_ibge, nome_municipio, uf, doenca,
          ano_inicio, ano_fim, semana_inicio, semana_fim, endpoint, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [geocode, nome, "AC", doenca, anoInicio, anoFim, 1, 53, url, JSON.stringify(payload)],
    );
    console.log(`    ✓ Payload salvo em raw.infodengue_raw`);
  } catch (e) {
    console.warn(`    ⚠ Não foi possível salvar raw: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ─── Ponto de entrada ─────────────────────────────────────────────────────────

async function main() {
  console.log("[infodengue:inspecionar] Inspeção da API InfoDengue/AlertaDengue");
  console.log(`  Base URL    : ${BASE_URL}`);
  console.log(`  Anos        : ${ANO_INICIO}–${ANO_FIM}`);
  console.log(`  Timeout     : ${TIMEOUT_MS}ms | Rate limit: ${RATE_LIMIT}ms\n`);

  const sep = "─".repeat(80);
  const resultados: Array<{ municipio: string; doenca: string; status: string; registros: number }> = [];

  for (const mun of MUNICIPIOS_TESTE) {
    console.log(`${sep}`);
    console.log(`Município: ${mun.nome} (geocode: ${mun.codigo})`);
    console.log(sep);

    for (const doenca of DOENCAS) {
      const url = montarUrl(mun.codigo, doenca, ANO_INICIO, ANO_FIM);
      console.log(`\n  [${doenca.toUpperCase()}]`);
      console.log(`  URL: ${url}`);

      const res = await buscar(url);
      await sleep(RATE_LIMIT);

      if (!res.ok) {
        console.log(`  ✗ Falha: ${res.erro}`);
        resultados.push({ municipio: mun.nome, doenca, status: `ERRO: ${res.erro}`, registros: 0 });
        continue;
      }

      const lista = Array.isArray(res.dados) ? res.dados : [];
      console.log(`  ✓ HTTP ${res.status} — ${lista.length} registros retornados`);

      if (lista.length === 0) {
        console.log(`  ℹ Sem dados para este município/doença/período.`);
        resultados.push({ municipio: mun.nome, doenca, status: "SEM_DADOS", registros: 0 });
        continue;
      }

      // Chaves disponíveis
      const chaves = Object.keys(lista[0] as object);
      console.log(`  Campos disponíveis (${chaves.length}): ${chaves.join(", ")}`);

      // Amostra: registro mais recente
      const ultimo = lista[lista.length - 1] as Record<string, unknown>;
      console.log(`  Semana mais recente:`);
      console.log(`    data_iniSE      : ${ultimo.data_iniSE ?? "—"}`);
      console.log(`    SE              : ${ultimo.SE ?? "—"}`);
      console.log(`    casos           : ${ultimo.casos ?? "—"}`);
      console.log(`    casos_est       : ${ultimo.casos_est ?? "—"}`);
      console.log(`    nivel           : ${ultimo.nivel ?? "—"} (1=verde 2=amarelo 3=laranja 4=vermelho)`);
      console.log(`    Rt              : ${ultimo.Rt ?? "—"}`);
      console.log(`    p_rt1           : ${ultimo.p_rt1 ?? "—"}`);
      console.log(`    p_inc100k       : ${ultimo.p_inc100k ?? "—"}`);
      console.log(`    transmissao     : ${ultimo.transmissao ?? "—"}`);
      console.log(`    receptivo       : ${ultimo.receptivo ?? "—"}`);
      console.log(`    notif_accum_year: ${ultimo.notif_accum_year ?? "—"}`);

      // Salva payload
      await salvarRaw(mun.codigo, mun.nome, doenca, ANO_INICIO, ANO_FIM, url, res.dados);
      resultados.push({ municipio: mun.nome, doenca, status: "OK", registros: lista.length });
    }
  }

  // Resumo final
  console.log(`\n${sep}`);
  console.log("RESUMO DA INSPEÇÃO");
  console.log(sep);
  console.log(`${"Município".padEnd(22)} ${"Doença".padEnd(14)} ${"Status".padEnd(12)} Registros`);
  console.log("─".repeat(60));
  for (const r of resultados) {
    console.log(`${r.municipio.padEnd(22)} ${r.doenca.padEnd(14)} ${r.status.padEnd(12)} ${r.registros}`);
  }

  const sucessos = resultados.filter(r => r.status === "OK").length;
  const semDados = resultados.filter(r => r.status === "SEM_DADOS").length;
  const erros    = resultados.filter(r => r.status.startsWith("ERRO")).length;
  console.log(`\n  Total: ${resultados.length} | OK: ${sucessos} | Sem dados: ${semDados} | Erros: ${erros}`);

  if (erros > 0) {
    console.log("\n  ⚠ Verificar conectividade ou URL da API InfoDengue.");
    console.log("    Defina INFODENGUE_API_BASE_URL no .env se necessário.");
  }
  if (sucessos > 0) {
    console.log("\n  ✓ API funcional. Execute npm run carga-infodengue:postgres para carga completa.");
  }
  console.log(sep);
}

main()
  .then(() => closePgPool())
  .catch((err) => {
    console.error("[infodengue:inspecionar] Erro fatal:", (err as Error).message);
    closePgPool().catch(() => void 0);
    process.exit(1);
  });
