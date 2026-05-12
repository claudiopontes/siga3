/**
 * sim-api-inspecionar.ts
 *
 * Descobre e testa endpoints da API SIM (Sistema de Informação sobre Mortalidade)
 * na plataforma Dados Abertos Saúde v1.
 * Base: https://apidadosabertos.saude.gov.br/v1
 * Swagger: https://apidadosabertos.saude.gov.br/v1/#/Vigilância e Meio Ambiente/
 *
 * Uso: cd etl && npm run sim:api:inspecionar
 */

import "dotenv/config";
import * as https from "https";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";

const BASE_URL  = (process.env.SIM_API_BASE_URL ?? "https://apidadosabertos.saude.gov.br").replace(/\/$/, "");
const ANOS      = (process.env.SIM_ANOS ?? "2024,2025,2026").split(",").map(s => s.trim()).filter(Boolean);
const UF        = process.env.SIM_UF ?? "AC";
const TIMEOUT   = parseInt(process.env.SIM_TIMEOUT_MS ?? "30000", 10);
const PAGE_SIZE = parseInt(process.env.SIM_PAGE_SIZE ?? "10", 10);

const UA = "Varadouro-Digital-ETL/1.0 (TCE-AC SIM exploratorio)";

const CAMPOS_SENSIVEIS = [
  "nu_cpf", "nm_paciente", "ds_nome", "nu_cns",
  "co_paciente", "no_paciente", "dt_nascimento",
];

// Endpoint confirmado: sem prefixo /v1. Retorna {"sim":[...]} com limit/offset.
const ROTAS_CANDIDATAS = [
  "/vigilancia-e-meio-ambiente/sistema-de-informacao-sobre-mortalidade",
  "/v1/vigilancia-e-meio-ambiente/sistema-de-informacao-sobre-mortalidade",
  "/sim/obitos",
  "/mortalidade",
];

const PARAMS_CANDIDATOS = ["limit", "offset", "ano", "uf", "sg_uf", "co_uf", "CODMUNRES", "codmunres"];

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
      headers: { "User-Agent": UA, "Accept": "application/json" },
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
// Swagger / OpenAPI
// ---------------------------------------------------------------------------

async function descobrirSwagger(): Promise<string[]> {
  const candidatos = [
    `${BASE_URL}/openapi.json`,
    `${BASE_URL}/swagger.json`,
    `${BASE_URL}/api-docs`,
    `https://apidadosabertos.saude.gov.br/openapi.json`,
    `https://apidadosabertos.saude.gov.br/swagger.json`,
    `https://apidadosabertos.saude.gov.br/v1/openapi.json`,
  ];

  const pathsEncontrados: string[] = [];

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
          const paths = Object.keys((doc.paths ?? {}) as object).filter(p =>
            p.includes("mortalidade") || p.includes("sim") || p.includes("vigilancia")
          );
          if (paths.length) {
            console.log(`    Endpoints SIM encontrados: ${paths.join(", ")}`);
            pathsEncontrados.push(...paths);
          }
        } catch { /* não é Swagger útil */ }
      }
    } catch {
      console.log(`  ✗ erro  ${u}`);
    }
  }

  return pathsEncontrados;
}

// ---------------------------------------------------------------------------
// Teste de rotas candidatas
// ---------------------------------------------------------------------------

interface ResultadoRota {
  rota: string;
  url: string;
  status: number;
  tipoConteudo: string | null;
  paginacao: unknown;
  totalRegistros: number | null;
  camposDetectados: string[];
  camposSensiveis: string[];
  temDadosAC: boolean;
  anos: string[];
  amostra: unknown;
  erro: string | null;
}

async function testarRota(rota: string): Promise<ResultadoRota> {
  const url = `${BASE_URL}${rota}`;
  const resultado: ResultadoRota = {
    rota,
    url,
    status: 0,
    tipoConteudo: null,
    paginacao: null,
    totalRegistros: null,
    camposDetectados: [],
    camposSensiveis: [],
    temDadosAC: false,
    anos: [],
    amostra: null,
    erro: null,
  };

  // Conjunto de parâmetros a tentar
  const conjuntosParams: Record<string, string>[] = [
    { ano: ANOS[0], uf: UF, page: "1", pageSize: String(PAGE_SIZE) },
    { ano: ANOS[0], sg_uf: UF, page: "1", pageSize: String(PAGE_SIZE) },
    { ano: ANOS[0], co_uf: UF, page: "1", size: String(PAGE_SIZE) },
    { ano: ANOS[0], page: "1", limit: String(PAGE_SIZE) },
    { page: "1", pageSize: String(PAGE_SIZE) },
  ];

  for (const params of conjuntosParams) {
    try {
      const resp = await fetchJson(url, params);
      resultado.status = resp.status;
      resultado.tipoConteudo = resp.headers["content-type"] ?? null;

      if (resp.status !== 200) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(resp.body);
      } catch {
        resultado.erro = "Resposta não é JSON válido";
        resultado.amostra = resp.body.slice(0, 300);
        break;
      }

      const obj = parsed as Record<string, unknown>;

      // Paginação
      const pagInfo: Record<string, unknown> = {};
      for (const c of ["totalRegistros", "total", "count", "totalElements", "page", "pageSize", "limit", "offset", "hasNext"]) {
        if (c in obj) pagInfo[c] = obj[c];
      }
      resultado.paginacao = Object.keys(pagInfo).length > 0 ? pagInfo : null;

      for (const c of ["totalRegistros", "total", "count", "totalElements"]) {
        if (typeof obj[c] === "number") { resultado.totalRegistros = obj[c] as number; break; }
      }

      // Registros
      let registros: unknown[] = [];
      for (const c of ["data", "items", "registros", "result", "results", "obitos", "content"]) {
        if (Array.isArray(obj[c])) { registros = obj[c] as unknown[]; break; }
      }
      if (registros.length === 0 && Array.isArray(parsed)) registros = parsed as unknown[];

      if (registros.length > 0) {
        const primeiro = registros[0] as Record<string, unknown>;
        resultado.camposDetectados = Object.keys(primeiro);
        resultado.camposSensiveis = resultado.camposDetectados
          .filter(k => CAMPOS_SENSIVEIS.some(s => k.toLowerCase().includes(s.replace("_", ""))));
        resultado.amostra = mascarar(registros.slice(0, 2));

        // Detectar dados AC
        const textoReg = JSON.stringify(registros).toLowerCase();
        resultado.temDadosAC = textoReg.includes('"ac"') || textoReg.includes('"12"') || textoReg.includes("120");

        // Detectar anos presentes
        const anosDetect = new Set<string>();
        for (const reg of registros) {
          const r = reg as Record<string, unknown>;
          for (const campo of ["ano", "ano_obito", "dt_obito", "dtobito"]) {
            const v = r[campo];
            if (v && String(v).match(/^20\d{2}/)) {
              anosDetect.add(String(v).slice(0, 4));
            }
          }
        }
        resultado.anos = Array.from(anosDetect);
      } else {
        resultado.amostra = mascarar(obj);
      }

      break; // encontrou resposta válida
    } catch (err) {
      resultado.erro = (err as Error).message;
    }
  }

  return resultado;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  SIM — Inspeção API Dados Abertos Saúde v1           ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`Base URL : ${BASE_URL}`);
  console.log(`Anos     : ${ANOS.join(", ")}`);
  console.log(`UF filtro: ${UF}`);
  console.log(`Parâmetros testados: ${PARAMS_CANDIDATOS.join(", ")}`);

  const pathsSwagger = await descobrirSwagger();

  const rotasParaTestar = [...new Set([...ROTAS_CANDIDATAS, ...pathsSwagger])];

  const resultados: ResultadoRota[] = [];
  for (const rota of rotasParaTestar) {
    console.log(`\n── Testando rota: ${rota} ──`);
    const r = await testarRota(rota);
    resultados.push(r);

    console.log(`  URL    : ${r.url}`);
    console.log(`  Status : ${r.status}`);
    console.log(`  Content-Type: ${r.tipoConteudo ?? "N/A"}`);
    if (r.erro) {
      console.log(`  Erro   : ${r.erro}`);
    } else {
      console.log(`  Total registros: ${r.totalRegistros ?? "(não detectado)"}`);
      console.log(`  Paginação: ${JSON.stringify(r.paginacao ?? "não detectada")}`);
      console.log(`  Campos (${r.camposDetectados.length}): ${r.camposDetectados.join(", ")}`);
      if (r.camposSensiveis.length > 0) {
        console.log(`  Campos sensíveis: ${r.camposSensiveis.join(", ")}`);
      }
      console.log(`  Dados AC: ${r.temDadosAC ? "sim" : "não detectado"}`);
      console.log(`  Anos detectados: ${r.anos.join(", ") || "nenhum"}`);
      console.log(`  Amostra:`);
      console.log(JSON.stringify(r.amostra, null, 2).split("\n").map(l => "    " + l).join("\n"));
    }
  }

  // Resumo e sugestão
  console.log("\n══════════════════════════════════════════════════════");
  console.log("Resumo:");
  const funcional = resultados.find(r => !r.erro && r.status === 200);
  for (const r of resultados) {
    if (r.erro || r.status !== 200) {
      console.log(`  ${r.rota}: INVIAVEL — ${r.erro ?? `HTTP ${r.status}`}`);
    } else {
      console.log(`  ${r.rota}: DISPONIVEL — ${r.totalRegistros ?? "?"} registros, ${r.camposDetectados.length} campos`);
    }
  }

  if (funcional) {
    console.log(`\nSugestão para .env:`);
    console.log(`  SIM_ENDPOINT_MORTALIDADE=${funcional.rota}`);
  } else {
    console.log("\nNenhuma rota funcional encontrada. Verificar documentação da API.");
  }

  // Gravar inventário
  const inventarioPath = path.resolve(__dirname, "../../docs/mortalidade-inventario.md");
  const secaoInspecao = `\n---\n\n## Resultado da Inspeção — ${new Date().toISOString().slice(0, 10)}\n\n` +
    resultados.map(r => {
      if (r.erro || r.status !== 200) return `- \`${r.rota}\`: **INVIAVEL** — ${r.erro ?? `HTTP ${r.status}`}`;
      return `- \`${r.rota}\`: **DISPONIVEL** — ${r.totalRegistros ?? "?"} registros · campos: \`${r.camposDetectados.join(", ")}\``;
    }).join("\n") +
    (funcional ? `\n\n**Endpoint sugerido:** \`SIM_ENDPOINT_MORTALIDADE=${funcional.rota}\`` : "");

  if (fs.existsSync(inventarioPath)) {
    const conteudo = fs.readFileSync(inventarioPath, "utf-8").replace(/\n---\n\n## Resultado da Inspeção[^]*/m, "");
    fs.writeFileSync(inventarioPath, conteudo + secaoInspecao, "utf-8");
  } else {
    fs.mkdirSync(path.dirname(inventarioPath), { recursive: true });
    fs.writeFileSync(inventarioPath, `# Inventário SIM/SINASC\n${secaoInspecao}`, "utf-8");
  }
  console.log(`\n✓ Inventário atualizado: docs/mortalidade-inventario.md`);

  console.log("\nPróximos passos:");
  console.log("  npm run sim:api:ingest        — carga SIM → PostgreSQL");
  console.log("  npm run mart:mortalidade      — reconstrói marts de mortalidade");
}

main().catch((err) => {
  console.error("Erro fatal:", (err as Error).message);
  process.exit(1);
});
