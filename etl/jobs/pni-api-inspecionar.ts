/**
 * pni-api-inspecionar.ts
 *
 * Inspeciona a API oficial de doses aplicadas PNI.
 * Base: https://apidadosabertos.saude.gov.br/v1/
 * Endpoints: GET /vacinacao/doses-aplicadas/pni-{ano}
 *
 * Uso: cd etl && npm run pni:api:inspecionar
 */

import "dotenv/config";
import * as https from "https";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";

const BASE_URL  = (process.env.PNI_API_BASE_URL  ?? "https://apidadosabertos.saude.gov.br/v1").replace(/\/$/, "");
const ANOS      = (process.env.PNI_ANOS           ?? "2025,2026").split(",").map(s => s.trim()).filter(Boolean);
const UF        = (process.env.PNI_UF             ?? "AC");
const PAGE_SIZE = parseInt(process.env.PNI_PAGE_SIZE ?? "10", 10);
const TIMEOUT   = parseInt(process.env.PNI_TIMEOUT_MS ?? "30000", 10);

const UA = "Varadouro-Digital-ETL/1.0 (TCE-AC PNI exploratorio)";

// Campos sensíveis que não devem aparecer no log
const CAMPOS_SENSIVEIS = ["co_paciente", "co_documento", "nu_cpf", "nu_cns", "nu_pis", "nome_paciente", "ds_nome"];

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function fetchJson(url: string, params: Record<string, string> = {}): Promise<{
  status: number;
  headers: http.IncomingMessage["headers"];
  body: string;
}> {
  const qs = new URLSearchParams(params).toString();
  const fullUrl = qs ? `${url}?${qs}` : url;
  return new Promise((resolve, reject) => {
    const mod = fullUrl.startsWith("https") ? https : http;
    const req = mod.get(fullUrl, {
      headers: {
        "User-Agent": UA,
        "Accept": "application/json",
      },
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: data }));
    });
    req.setTimeout(TIMEOUT, () => { req.destroy(); reject(new Error(`Timeout ${TIMEOUT}ms`)); });
    req.on("error", reject);
  });
}

function mascarar(obj: unknown, profundidade = 0): unknown {
  if (profundidade > 5 || obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.slice(0, 2).map(item => mascarar(item, profundidade + 1));
  if (typeof obj === "object") {
    const saida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      saida[k] = CAMPOS_SENSIVEIS.some(s => k.toLowerCase().includes(s.replace("_", "")))
        ? "***"
        : mascarar(v, profundidade + 1);
    }
    return saida;
  }
  return obj;
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

interface ResultadoTeste {
  url: string;
  status: number;
  tipoConteudo: string | null;
  paginacao: unknown;
  totalRegistros: number | null;
  camposDetectados: string[];
  camposSensiveis: string[];
  amostra: unknown;
  erro: string | null;
}

async function testarEndpoint(ano: string): Promise<ResultadoTeste> {
  const endpoint = `/vacinacao/doses-aplicadas/pni-${ano}`;
  const url = `${BASE_URL}${endpoint}`;

  const resultado: ResultadoTeste = {
    url,
    status: 0,
    tipoConteudo: null,
    paginacao: null,
    totalRegistros: null,
    camposDetectados: [],
    camposSensiveis: [],
    amostra: null,
    erro: null,
  };

  try {
    const resp = await fetchJson(url, { co_uf: UF, page: "1", pageSize: String(PAGE_SIZE) });
    resultado.status = resp.status;
    resultado.tipoConteudo = resp.headers["content-type"] ?? null;

    if (resp.status !== 200) {
      resultado.erro = `HTTP ${resp.status}`;
      return resultado;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(resp.body);
    } catch {
      resultado.erro = "Resposta não é JSON válido — possível bloqueio WAF";
      resultado.amostra = resp.body.slice(0, 300);
      return resultado;
    }

    const obj = parsed as Record<string, unknown>;

    // Detecta paginação
    const pagCandidatos = ["totalRegistros", "total", "count", "totalElements", "totalItems",
                           "page", "pageSize", "limit", "offset", "hasNext", "nextPage"];
    const pagInfo: Record<string, unknown> = {};
    for (const c of pagCandidatos) {
      if (c in obj) pagInfo[c] = obj[c];
    }
    resultado.paginacao = Object.keys(pagInfo).length > 0 ? pagInfo : null;

    // Campo de total
    for (const c of ["totalRegistros", "total", "count", "totalElements"]) {
      if (typeof obj[c] === "number") {
        resultado.totalRegistros = obj[c] as number;
        break;
      }
    }

    // Detecta array de registros
    let registros: unknown[] = [];
    for (const c of ["data", "items", "registros", "result", "results", "doses", "content"]) {
      if (Array.isArray(obj[c])) { registros = obj[c] as unknown[]; break; }
    }
    if (registros.length === 0 && Array.isArray(parsed)) {
      registros = (parsed as unknown[]);
    }

    if (registros.length > 0) {
      const primeiro = registros[0] as Record<string, unknown>;
      resultado.camposDetectados = Object.keys(primeiro);
      resultado.camposSensiveis = resultado.camposDetectados
        .filter(k => CAMPOS_SENSIVEIS.some(s => k.toLowerCase().includes(s.replace("_", ""))));
      resultado.amostra = mascarar(registros.slice(0, 2));
    } else {
      resultado.amostra = mascarar(obj);
    }

  } catch (err) {
    resultado.erro = (err as Error).message;
  }

  return resultado;
}

async function testarSwagger(): Promise<void> {
  const candidatos = [
    `${BASE_URL}/swagger`,
    `${BASE_URL}/swagger.json`,
    `${BASE_URL}/openapi.json`,
    `${BASE_URL}/v3/api-docs`,
    `${BASE_URL}/api-docs`,
    `https://apidadosabertos.saude.gov.br/swagger`,
    `https://apidadosabertos.saude.gov.br/openapi.json`,
  ];
  console.log("\n── Descoberta OpenAPI/Swagger ──");
  for (const u of candidatos) {
    try {
      const resp = await fetchJson(u);
      const ct = resp.headers["content-type"] ?? "";
      const isJson = ct.includes("json") || (resp.status === 200 && resp.body.trimStart().startsWith("{"));
      const tag = resp.status === 200 && isJson ? "✓ JSON" : `✗ ${resp.status}`;
      console.log(`  ${tag}  ${u}`);
      if (resp.status === 200 && isJson) {
        try {
          const doc = JSON.parse(resp.body) as Record<string, unknown>;
          const paths = Object.keys((doc.paths ?? {}) as object).filter(p => p.includes("pni") || p.includes("vacin"));
          if (paths.length) {
            console.log(`    Endpoints PNI encontrados: ${paths.join(", ")}`);
          }
        } catch { /* não é Swagger útil */ }
      }
    } catch {
      console.log(`  ✗ erro  ${u}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  PNI — Inspeção API oficial doses aplicadas          ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`Base URL : ${BASE_URL}`);
  console.log(`Anos     : ${ANOS.join(", ")}`);
  console.log(`UF filtro: ${UF}`);
  console.log(`Page size: ${PAGE_SIZE}`);

  await testarSwagger();

  const resultados: ResultadoTeste[] = [];
  for (const ano of ANOS) {
    console.log(`\n── Endpoint PNI ${ano} ──`);
    const r = await testarEndpoint(ano);
    resultados.push(r);

    console.log(`  URL    : ${r.url}`);
    console.log(`  Status : ${r.status}`);
    console.log(`  Content-Type: ${r.tipoConteudo ?? "N/A"}`);
    if (r.erro) {
      console.log(`  Erro   : ${r.erro}`);
    } else {
      console.log(`  Total registros: ${r.totalRegistros ?? "(não detectado)"}`);
      console.log(`  Paginação: ${JSON.stringify(r.paginacao ?? "não detectada")}`);
      console.log(`  Campos detectados (${r.camposDetectados.length}): ${r.camposDetectados.join(", ")}`);
      if (r.camposSensiveis.length > 0) {
        console.log(`  ⚠ Campos sensíveis: ${r.camposSensiveis.join(", ")}`);
      } else {
        console.log(`  ✓ Sem campos sensíveis óbvios`);
      }
      console.log(`  Amostra:`);
      console.log(JSON.stringify(r.amostra, null, 2).split("\n").map(l => "    " + l).join("\n"));
    }
  }

  // Resumo viabilidade
  console.log("\n══════════════════════════════════════════════════════");
  console.log("Resumo de viabilidade:");
  for (const r of resultados) {
    const ano = r.url.match(/pni-(\d{4})/)?.[1] ?? "?";
    if (r.erro || r.status !== 200) {
      console.log(`  PNI ${ano}: ✗ INVIÁVEL — ${r.erro ?? `HTTP ${r.status}`}`);
    } else {
      console.log(`  PNI ${ano}: ✓ DISPONÍVEL — ${r.totalRegistros ?? "?"} registros totais, ${r.camposDetectados.length} campos`);
    }
  }

  // Atualiza inventário
  const inventario = path.resolve(__dirname, "../../docs/pni-inventario.md");
  if (fs.existsSync(inventario)) {
    const secao = `\n---\n\n## 10. Inspeção da API oficial — ${new Date().toISOString().slice(0, 10)}\n\n` +
      resultados.map(r => {
        const ano = r.url.match(/pni-(\d{4})/)?.[1] ?? "?";
        if (r.erro || r.status !== 200) return `- PNI ${ano}: **INVIÁVEL** — ${r.erro ?? `HTTP ${r.status}`}`;
        return `- PNI ${ano}: **DISPONÍVEL** — ${r.totalRegistros ?? "?"} registros · campos: ${r.camposDetectados.join(", ")}`;
      }).join("\n");

    const conteudo = fs.readFileSync(inventario, "utf-8").replace(/\n---\n\n## 10\.[^]*/m, "");
    fs.writeFileSync(inventario, conteudo + secao, "utf-8");
    console.log(`\n✓ Inventário atualizado: docs/pni-inventario.md`);
  }

  console.log("\nPróximos passos:");
  console.log("  Se viável → npm run pni:ingest");
  console.log("  Se bloqueado → revisar PNI_API_BASE_URL no .env");
}

main().catch((err) => {
  console.error("Erro fatal:", (err as Error).message);
  process.exit(1);
});
