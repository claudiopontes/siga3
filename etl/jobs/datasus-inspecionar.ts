/**
 * datasus-inspecionar.ts
 *
 * Job exploratório: inventaria fontes DATASUS/OpenDataSUS relevantes ao
 * Painel da Saúde (SIM, SINASC, SIH, SIA, SI-PNI, SINAN e agravos).
 *
 * O que faz:
 *   - Busca metadados de datasets no portal CKAN (opendatasus.saude.gov.br)
 *   - Testa endpoints REST alternativos (apidadosabertos.saude.gov.br)
 *   - Detecta formato da resposta: JSON, CSV, ZIP, DBF, HTML, erro
 *   - NÃO baixa arquivos grandes
 *   - NÃO grava no banco de dados
 *   - Imprime inventário consolidado no console
 *
 * Variáveis de ambiente (.env):
 *   DATASUS_API_BASE_URL            — portal CKAN (padrão: https://opendatasus.saude.gov.br)
 *   DATASUS_API_ALTERNATIVE_BASE_URL — API alternativa (padrão: https://apidadosabertos.saude.gov.br)
 *   DATASUS_UF                      — sigla da UF (padrão: AC)
 *   DATASUS_ANO_INICIO              — ano inicial de interesse (padrão: 2023)
 *   DATASUS_ANO_FIM                 — ano final de interesse (padrão: 2026)
 *   DATASUS_TIMEOUT_MS              — timeout por requisição (padrão: 30000)
 *   DATASUS_RATE_LIMIT_MS           — pausa entre requisições (padrão: 500)
 *
 * Uso:
 *   cd etl && npm run datasus:inspecionar
 */

import "dotenv/config";

// ─── Configuração ─────────────────────────────────────────────────────────────

const CKAN_BASE    = (process.env.DATASUS_API_BASE_URL            ?? "https://opendatasus.saude.gov.br").replace(/\/$/, "");
const ALT_BASE     = (process.env.DATASUS_API_ALTERNATIVE_BASE_URL ?? "https://apidadosabertos.saude.gov.br").replace(/\/$/, "");
const UF           = process.env.DATASUS_UF        ?? "AC";
const ANO_INICIO   = Number(process.env.DATASUS_ANO_INICIO ?? "2023");
const ANO_FIM      = Number(process.env.DATASUS_ANO_FIM    ?? "2026");
const TIMEOUT_MS   = Number(process.env.DATASUS_TIMEOUT_MS    ?? "30000");
const RATE_LIMIT   = Number(process.env.DATASUS_RATE_LIMIT_MS ?? "500");

// ─── Tipos ───────────────────────────────────────────────────────────────────

type FormatoResposta = "JSON" | "CSV" | "ZIP" | "DBF" | "XML" | "HTML" | "VAZIO" | "ERRO";
type Viabilidade     = "ALTA" | "MEDIA" | "BAIXA";
type Subpagina       = "assistencia" | "vacinacao" | "mortalidade" | "vigilancia" | "multiplas";

interface ItemInventario {
  fonte:          string;
  finalidade:     string;
  url:            string;
  resource_id?:   string;
  formato:        FormatoResposta;
  datastore_active?: boolean;
  periodos?:      string;
  campos?:        string[];
  filtro_uf?:     boolean;
  filtro_mun?:    boolean;
  filtro_ano?:    boolean;
  tamanho_aprox?: string;
  viabilidade:    Viabilidade;
  subpagina:      Subpagina;
  observacoes:    string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function buscar(url: string): Promise<{ formato: FormatoResposta; dados: unknown; status: number; tamanho?: string }> {
  try {
    const resp = await fetch(url, {
      headers: { Accept: "application/json, text/plain, */*", "User-Agent": "Varadouro-Digital-ETL/1.0 (TCE-AC)" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const contentType = resp.headers.get("content-type") ?? "";
    const contentLen  = resp.headers.get("content-length");
    const tamanho     = contentLen ? `${(Number(contentLen) / 1024).toFixed(0)} KB` : undefined;

    if (!resp.ok) {
      return { formato: "ERRO", dados: `HTTP ${resp.status}`, status: resp.status };
    }

    // Lê apenas os primeiros 32 KB para não consumir banda
    const reader = resp.body?.getReader();
    let texto = "";
    if (reader) {
      const decoder = new TextDecoder();
      let bytes = 0;
      while (bytes < 32_768) {
        const { done, value } = await reader.read();
        if (done) break;
        texto += decoder.decode(value, { stream: !done });
        bytes += value?.length ?? 0;
      }
      reader.cancel().catch(() => void 0);
    }

    // Detecta formato pelo content-type e início do conteúdo
    if (contentType.includes("text/html") || texto.trimStart().startsWith("<!DOCTYPE") || texto.trimStart().startsWith("<html")) {
      return { formato: "HTML", dados: texto.slice(0, 200), status: resp.status, tamanho };
    }
    if (contentType.includes("application/zip") || texto.startsWith("PK")) {
      return { formato: "ZIP", dados: "(arquivo binário ZIP)", status: resp.status, tamanho };
    }
    if (texto.slice(0, 4) === "\xD7\xCD\xC1\xC8") { // DBF magic
      return { formato: "DBF", dados: "(arquivo binário DBF)", status: resp.status, tamanho };
    }
    if (contentType.includes("text/csv") || (texto.includes(",") && !texto.trimStart().startsWith("{"))) {
      return { formato: "CSV", dados: texto.slice(0, 300), status: resp.status, tamanho };
    }
    if (contentType.includes("xml") || texto.trimStart().startsWith("<?xml")) {
      return { formato: "XML", dados: texto.slice(0, 300), status: resp.status, tamanho };
    }

    try {
      const parsed = JSON.parse(texto);
      return { formato: "JSON", dados: parsed, status: resp.status, tamanho };
    } catch {
      return { formato: "ERRO", dados: `Conteúdo não reconhecido: ${texto.slice(0, 100)}`, status: resp.status, tamanho };
    }
  } catch (e) {
    return { formato: "ERRO", dados: e instanceof Error ? e.message : String(e), status: 0 };
  }
}

// ─── Busca CKAN ───────────────────────────────────────────────────────────────

interface CkanResource {
  id:               string;
  name:             string;
  format:           string;
  url:              string;
  datastore_active: boolean;
  size?:            number;
  description?:     string;
}

interface CkanPackage {
  id:          string;
  name:        string;
  title:       string;
  notes?:      string;
  resources:   CkanResource[];
  tags?:       Array<{ name: string }>;
}

async function buscarCkan(termos: string[]): Promise<CkanPackage[]> {
  const q = termos.join(" ");
  const url = `${CKAN_BASE}/api/3/action/package_search?q=${encodeURIComponent(q)}&rows=20`;
  console.log(`  [CKAN] Buscando: ${q}`);
  const res = await buscar(url);
  await sleep(RATE_LIMIT);

  if (res.formato !== "JSON") {
    console.log(`    ✗ Resposta não-JSON: ${res.formato} (HTTP ${res.status})`);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = res.dados as any;
  if (!body?.result?.results) return [];
  return body.result.results as CkanPackage[];
}

// ─── Inspeciona resource de um pacote CKAN ────────────────────────────────────

async function inspecionarResource(pkg: CkanPackage, resource: CkanResource, fonte: string, finalidade: string, subpagina: Subpagina): Promise<ItemInventario> {
  const tamanhoKB = resource.size ? `${(resource.size / 1024).toFixed(0)} KB` : undefined;
  const formato = resource.format?.toUpperCase() ?? "?";

  // Não tenta baixar arquivos grandes (ZIP, DBF, CSV grandes)
  const ehArquivoGrande = ["ZIP", "DBF"].includes(formato) || (resource.size && resource.size > 5_000_000);
  if (ehArquivoGrande) {
    return {
      fonte,
      finalidade,
      url: resource.url,
      resource_id: resource.id,
      formato: formato as FormatoResposta,
      datastore_active: resource.datastore_active,
      tamanho_aprox: tamanhoKB,
      viabilidade: "BAIXA",
      subpagina,
      observacoes: `Arquivo pesado (${formato}) — somente download bulk, sem API REST detectada.`,
    };
  }

  // Se datastore_active, testa endpoint CKAN Datastore com amostra de 5 linhas
  if (resource.datastore_active) {
    const dsUrl = `${CKAN_BASE}/api/3/action/datastore_search?resource_id=${resource.id}&limit=5`;
    console.log(`    [datastore] ${resource.name} → ${dsUrl.slice(0, 80)}...`);
    const res = await buscar(dsUrl);
    await sleep(RATE_LIMIT);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = res.dados as any;
    const campos = body?.result?.fields?.map((f: { id: string }) => f.id) as string[] | undefined;
    const totalReg: number | undefined = body?.result?.total;

    const filtroUF  = campos?.some((c) => /uf|estado|sg_uf/i.test(c)) ?? false;
    const filtroMun = campos?.some((c) => /municipio|ibge|co_mun/i.test(c)) ?? false;
    const filtroAno = campos?.some((c) => /ano|competencia|dt_/i.test(c)) ?? false;

    return {
      fonte,
      finalidade,
      url: dsUrl,
      resource_id: resource.id,
      formato: res.formato,
      datastore_active: true,
      campos: campos?.slice(0, 10),
      filtro_uf:  filtroUF,
      filtro_mun: filtroMun,
      filtro_ano: filtroAno,
      tamanho_aprox: totalReg ? `${totalReg.toLocaleString("pt-BR")} registros` : tamanhoKB,
      viabilidade: "ALTA",
      subpagina,
      observacoes: `Datastore ativo. ${totalReg ? `${totalReg.toLocaleString("pt-BR")} registros totais.` : ""} ${filtroUF ? "Filtro por UF disponível." : "Sem campo UF detectado."}`,
    };
  }

  // Testa URL direta do resource (HEAD apenas para detectar tipo)
  console.log(`    [resource] ${resource.name} → ${resource.url.slice(0, 80)}`);
  const res = await buscar(resource.url);
  await sleep(RATE_LIMIT);

  const viab: Viabilidade = res.formato === "JSON" ? "MEDIA" : res.formato === "CSV" ? "MEDIA" : "BAIXA";
  return {
    fonte,
    finalidade,
    url: resource.url,
    resource_id: resource.id,
    formato: res.formato,
    datastore_active: false,
    tamanho_aprox: res.tamanho ?? tamanhoKB,
    viabilidade: viab,
    subpagina,
    observacoes: `Formato ${res.formato}. ${res.formato === "HTML" ? "Portal retornou HTML — sem API JSON direta." : ""}${res.formato === "ERRO" ? `Erro: ${String(res.dados).slice(0, 80)}` : ""}`,
  };
}

// ─── Testa endpoint REST alternativo ─────────────────────────────────────────

async function testarEndpointAlt(
  label: string,
  path: string,
  fonte: string,
  finalidade: string,
  subpagina: Subpagina,
): Promise<ItemInventario> {
  const url = `${ALT_BASE}${path}`;
  console.log(`  [ALT] ${label} → ${url}`);
  const res = await buscar(url);
  await sleep(RATE_LIMIT);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = res.dados as any;
  let campos: string[] | undefined;
  let filtroUF = false;
  let filtroMun = false;
  let filtroAno = false;
  let totalInfo = "";

  if (res.formato === "JSON" && body) {
    const amostra = Array.isArray(body) ? body[0] : (body?.items?.[0] ?? body?.data?.[0] ?? body?.result?.[0]);
    if (amostra && typeof amostra === "object") {
      campos = Object.keys(amostra).slice(0, 12);
      filtroUF  = campos.some((c) => /uf|estado|sg_uf/i.test(c));
      filtroMun = campos.some((c) => /municipio|ibge|co_mun/i.test(c));
      filtroAno = campos.some((c) => /ano|competencia|dt_/i.test(c));
    }
    const total = body?.total ?? body?.count ?? (Array.isArray(body) ? body.length : undefined);
    if (total !== undefined) totalInfo = ` Total: ${total}.`;
  }

  const viab: Viabilidade = res.formato === "JSON" ? "ALTA" : res.formato === "CSV" ? "MEDIA" : "BAIXA";
  return {
    fonte,
    finalidade,
    url,
    formato: res.formato,
    campos,
    filtro_uf:  filtroUF,
    filtro_mun: filtroMun,
    filtro_ano: filtroAno,
    viabilidade: viab,
    subpagina,
    observacoes: `Endpoint alternativo (apidadosabertos.saude.gov.br).${totalInfo} ${res.formato === "ERRO" ? `Erro: ${String(res.dados).slice(0, 120)}` : ""} ${res.formato === "HTML" ? "Retornou HTML — sem API JSON." : ""}`.trim(),
  };
}

// ─── Imprime resultado de uma busca CKAN ─────────────────────────────────────

async function inspecionarPacotes(
  pacotes: CkanPackage[],
  fonte: string,
  finalidade: string,
  subpagina: Subpagina,
  maxResources = 2,
): Promise<ItemInventario[]> {
  const items: ItemInventario[] = [];
  for (const pkg of pacotes.slice(0, 3)) {
    console.log(`  [pacote] ${pkg.title ?? pkg.name}`);
    const resources = (pkg.resources ?? []).slice(0, maxResources);
    for (const res of resources) {
      const item = await inspecionarResource(pkg, res, fonte, finalidade, subpagina);
      item.observacoes = `Pacote CKAN: "${pkg.title}". ${item.observacoes}`;
      items.push(item);
    }
  }
  return items;
}

// ─── Exibe inventário formatado ───────────────────────────────────────────────

function imprimirInventario(inventario: ItemInventario[]) {
  const sep = "─".repeat(100);
  console.log("\n" + sep);
  console.log("INVENTÁRIO DATASUS / OpenDataSUS");
  console.log(`UF: ${UF} | Anos de interesse: ${ANO_INICIO}–${ANO_FIM}`);
  console.log(sep);

  const por_viabilidade: Record<Viabilidade, ItemInventario[]> = { ALTA: [], MEDIA: [], BAIXA: [] };
  for (const item of inventario) por_viabilidade[item.viabilidade].push(item);

  for (const viab of ["ALTA", "MEDIA", "BAIXA"] as Viabilidade[]) {
    const grupo = por_viabilidade[viab];
    if (grupo.length === 0) continue;
    console.log(`\n▶ Viabilidade ${viab} (${grupo.length} item${grupo.length !== 1 ? "ns" : ""})`);
    for (const item of grupo) {
      console.log(`\n  ┌ ${item.fonte} — ${item.finalidade}`);
      console.log(`  │ Subpágina sugerida : /painel-saude/${item.subpagina}`);
      console.log(`  │ Formato            : ${item.formato}${item.datastore_active ? " (datastore ativo)" : ""}`);
      console.log(`  │ URL                : ${item.url}`);
      if (item.resource_id) console.log(`  │ resource_id        : ${item.resource_id}`);
      if (item.periodos)    console.log(`  │ Períodos           : ${item.periodos}`);
      if (item.tamanho_aprox) console.log(`  │ Tamanho aprox.     : ${item.tamanho_aprox}`);
      const filtros = [item.filtro_uf && "UF", item.filtro_mun && "Município", item.filtro_ano && "Ano"].filter(Boolean);
      if (filtros.length) console.log(`  │ Filtros disponíveis: ${filtros.join(", ")}`);
      if (item.campos?.length) console.log(`  │ Campos detectados  : ${item.campos.join(", ")}`);
      console.log(`  └ Observações        : ${item.observacoes}`);
    }
  }

  // Resumo por subpágina
  console.log("\n" + sep);
  console.log("RESUMO POR SUBPÁGINA SUGERIDA");
  console.log(sep);
  const subpaginas: Subpagina[] = ["mortalidade", "assistencia", "vacinacao", "vigilancia", "multiplas"];
  for (const sp of subpaginas) {
    const grupo = inventario.filter((i) => i.subpagina === sp);
    if (grupo.length === 0) continue;
    const alta  = grupo.filter((i) => i.viabilidade === "ALTA").length;
    const media = grupo.filter((i) => i.viabilidade === "MEDIA").length;
    const baixa = grupo.filter((i) => i.viabilidade === "BAIXA").length;
    console.log(`\n  /painel-saude/${sp}`);
    console.log(`    Fontes: ${grupo.map((i) => i.fonte).join(", ")}`);
    console.log(`    Viabilidade: ALTA=${alta} MEDIA=${media} BAIXA=${baixa}`);
  }

  // Recomendação
  console.log("\n" + sep);
  console.log("RECOMENDAÇÃO INICIAL");
  console.log(sep);
  const altaViab = inventario.filter((i) => i.viabilidade === "ALTA");
  const htmlOuErro = inventario.filter((i) => i.formato === "HTML" || i.formato === "ERRO");
  const arquivos = inventario.filter((i) => ["ZIP", "DBF"].includes(i.formato));
  console.log(`  Fontes com viabilidade ALTA    : ${altaViab.length} — ${altaViab.map((i) => i.fonte).join(", ") || "nenhuma"}`);
  console.log(`  Retornaram HTML/erro           : ${htmlOuErro.map((i) => i.fonte).join(", ") || "nenhuma"}`);
  console.log(`  Exigem download de arquivo     : ${arquivos.map((i) => i.fonte).join(", ") || "nenhuma"}`);

  if (altaViab.length > 0) {
    const proxima = altaViab.sort((a, b) => {
      const ord: Record<Subpagina, number> = { mortalidade: 1, assistencia: 2, vacinacao: 3, vigilancia: 4, multiplas: 5 };
      return ord[a.subpagina] - ord[b.subpagina];
    })[0];
    console.log(`\n  ► Próxima subpágina recomendada: /painel-saude/${proxima.subpagina}`);
    console.log(`    Fonte mais viável            : ${proxima.fonte}`);
    console.log(`    URL/recurso                  : ${proxima.url}`);
  } else {
    console.log("\n  ► Nenhuma fonte com viabilidade ALTA detectada nesta rodada.");
    console.log("    Verifique conectividade ou tente novamente aumentando DATASUS_TIMEOUT_MS.");
  }
  console.log("\n" + sep);
}

// ─── Ponto de entrada ─────────────────────────────────────────────────────────

async function main() {
  console.log("[datasus:inspecionar] Iniciando inventário DATASUS/OpenDataSUS");
  console.log(`  Portal CKAN : ${CKAN_BASE}`);
  console.log(`  API alt.    : ${ALT_BASE}`);
  console.log(`  UF          : ${UF}`);
  console.log(`  Anos        : ${ANO_INICIO}–${ANO_FIM}`);
  console.log(`  Timeout     : ${TIMEOUT_MS}ms | Rate limit: ${RATE_LIMIT}ms\n`);

  const inventario: ItemInventario[] = [];

  // ── 1. SIM — Sistema de Informações sobre Mortalidade ────────────────────
  console.log("── 1. SIM — Mortalidade ──────────────────────────────────────────");
  {
    const pkgs = await buscarCkan(["SIM mortalidade óbitos"]);
    inventario.push(...await inspecionarPacotes(pkgs, "SIM", "Óbitos e mortalidade por CID-10", "mortalidade"));

    // Testa endpoint alternativo REST
    inventario.push(await testarEndpointAlt(
      "SIM REST",
      `/sim/v1/obitos?uf=${UF}&ano=${ANO_INICIO}&limit=5`,
      "SIM",
      "Óbitos por UF/ano",
      "mortalidade",
    ));
    inventario.push(await testarEndpointAlt(
      "SIM REST v2",
      `/sim/obitos?co_uf=${UF}&ano=${ANO_INICIO}&limit=5`,
      "SIM",
      "Óbitos por UF/ano (v2)",
      "mortalidade",
    ));
  }

  // ── 2. SINASC — Sistema de Informações sobre Nascidos Vivos ──────────────
  console.log("\n── 2. SINASC — Nascidos Vivos ────────────────────────────────────");
  {
    const pkgs = await buscarCkan(["SINASC nascidos vivos"]);
    inventario.push(...await inspecionarPacotes(pkgs, "SINASC", "Nascidos vivos, prematuridade e pré-natal", "mortalidade"));

    inventario.push(await testarEndpointAlt(
      "SINASC REST",
      `/sinasc/v1/nascidos?uf=${UF}&ano=${ANO_INICIO}&limit=5`,
      "SINASC",
      "Nascidos vivos por UF/ano",
      "mortalidade",
    ));
  }

  // ── 3. SIH — Sistema de Informações Hospitalares ─────────────────────────
  console.log("\n── 3. SIH/SUS — Internações Hospitalares ─────────────────────────");
  {
    const pkgs = await buscarCkan(["SIH internações hospitalares AIH"]);
    inventario.push(...await inspecionarPacotes(pkgs, "SIH/SUS", "Internações hospitalares (AIH)", "assistencia"));

    inventario.push(await testarEndpointAlt(
      "SIH REST",
      `/sih/v1/aih?uf=${UF}&ano=${ANO_INICIO}&limit=5`,
      "SIH/SUS",
      "Autorizações de Internação Hospitalar",
      "assistencia",
    ));
    inventario.push(await testarEndpointAlt(
      "SIH consolidado",
      `/sih/internacoes?co_uf=${UF}&competencia=${ANO_INICIO}01&limit=5`,
      "SIH/SUS",
      "Internações consolidadas",
      "assistencia",
    ));
  }

  // ── 4. SIA — Sistema de Informações Ambulatoriais ────────────────────────
  console.log("\n── 4. SIA/SUS — Produção Ambulatorial ────────────────────────────");
  {
    const pkgs = await buscarCkan(["SIA ambulatorial produção BPA"]);
    inventario.push(...await inspecionarPacotes(pkgs, "SIA/SUS", "Produção ambulatorial (BPA/APAC)", "assistencia"));

    inventario.push(await testarEndpointAlt(
      "SIA REST",
      `/sia/v1/bpa?uf=${UF}&ano=${ANO_INICIO}&limit=5`,
      "SIA/SUS",
      "Boletim de Produção Ambulatorial",
      "assistencia",
    ));
  }

  // ── 5. SI-PNI — Programa Nacional de Imunizações ─────────────────────────
  console.log("\n── 5. SI-PNI — Imunizações / Vacinação ───────────────────────────");
  {
    const pkgs = await buscarCkan(["SI-PNI vacinação imunização cobertura vacinal"]);
    inventario.push(...await inspecionarPacotes(pkgs, "SI-PNI", "Cobertura vacinal e doses aplicadas", "vacinacao"));

    inventario.push(await testarEndpointAlt(
      "PNI cobertura",
      `/pni/v1/cobertura?uf=${UF}&ano=${ANO_INICIO}&limit=5`,
      "SI-PNI",
      "Cobertura vacinal por imunobiológico",
      "vacinacao",
    ));
    inventario.push(await testarEndpointAlt(
      "PNI doses",
      `/pni/doses?co_uf=${UF}&ano=${ANO_INICIO}&limit=5`,
      "SI-PNI",
      "Doses aplicadas por município",
      "vacinacao",
    ));
  }

  // ── 6. SINAN — Sistema de Informação de Agravos de Notificação ───────────
  console.log("\n── 6. SINAN — Agravos de Notificação ─────────────────────────────");
  {
    const pkgs = await buscarCkan(["SINAN agravos notificação dengue"]);
    inventario.push(...await inspecionarPacotes(pkgs, "SINAN", "Agravos de notificação compulsória", "vigilancia"));

    inventario.push(await testarEndpointAlt(
      "SINAN dengue",
      `/sinan/v1/dengue?uf=${UF}&ano=${ANO_INICIO}&limit=5`,
      "SINAN/Dengue",
      "Casos notificados de dengue",
      "vigilancia",
    ));
    inventario.push(await testarEndpointAlt(
      "SINAN tuberculose",
      `/sinan/v1/tuberculose?uf=${UF}&ano=${ANO_INICIO}&limit=5`,
      "SINAN/Tuberculose",
      "Casos notificados de tuberculose",
      "vigilancia",
    ));
    inventario.push(await testarEndpointAlt(
      "SINAN hanseníase",
      `/sinan/v1/hanseniase?uf=${UF}&ano=${ANO_INICIO}&limit=5`,
      "SINAN/Hanseníase",
      "Casos notificados de hanseníase",
      "vigilancia",
    ));
  }

  // ── 7. Dengue/Arboviroses — dataset específico ────────────────────────────
  console.log("\n── 7. Arboviroses — Dengue / Chikungunya / Zika ──────────────────");
  {
    const pkgs = await buscarCkan(["dengue chikungunya zika arbovirose"]);
    inventario.push(...await inspecionarPacotes(pkgs, "SINAN/Arboviroses", "Dengue, chikungunya e zika", "vigilancia"));

    // SVS (Secretaria de Vigilância em Saúde) — InfoDengue / painel arboviroses
    inventario.push(await testarEndpointAlt(
      "SVS arboviroses",
      `/svs/arboviroses?uf=${UF}&ano=${ANO_INICIO}&limit=5`,
      "SVS/Arboviroses",
      "Painel de arboviroses SVS",
      "vigilancia",
    ));
  }

  // ── Imprime inventário consolidado ────────────────────────────────────────
  imprimirInventario(inventario);
}

main().catch((err) => {
  console.error("[datasus:inspecionar] Erro fatal:", (err as Error).message);
  process.exit(1);
});
