/**
 * pni-inspecionar.ts
 *
 * Job exploratório: descobre recursos reais do PNI (doses aplicadas) no
 * OpenDataSUS/RNDS para os anos 2024, 2025 e 2026.
 *
 * O que faz:
 *   - Busca metadados dos datasets PNI 2024/2025/2026 no portal CKAN
 *   - Lista recursos mensais (CSV, JSON, XML, API, PDF dicionário)
 *   - Testa amostras pequenas (máx. PNI_MAX_SAMPLE_ROWS linhas)
 *   - Detecta campos relevantes: UF, município, IBGE, data, imunobiológico,
 *     dose, grupo, faixa etária, CNES, população-alvo/cobertura
 *   - NÃO baixa arquivos grandes
 *   - NÃO grava no banco de dados
 *
 * Variáveis de ambiente (.env):
 *   PNI_OPENDATASUS_BASE_URL    — portal CKAN (padrão: https://opendatasus.saude.gov.br)
 *   PNI_API_ALTERNATIVE_BASE_URL — API alternativa (padrão: https://apidadosabertos.saude.gov.br)
 *   PNI_DATASET_SLUG_2025       — slug do dataset 2025 no CKAN
 *   PNI_UF                      — sigla da UF (padrão: AC)
 *   PNI_ANO_INICIO              — primeiro ano de interesse (padrão: 2024)
 *   PNI_ANO_FIM                 — último ano de interesse (padrão: 2026)
 *   PNI_TIMEOUT_MS              — timeout por requisição (padrão: 30000)
 *   PNI_RATE_LIMIT_MS           — pausa entre requisições (padrão: 500)
 *   PNI_MAX_SAMPLE_ROWS         — linhas máximas na amostra (padrão: 100)
 *
 * Uso:
 *   cd etl && npm run pni:inspecionar
 */

import "dotenv/config";

// ─── Configuração ─────────────────────────────────────────────────────────────

const CKAN_BASE      = (process.env.PNI_OPENDATASUS_BASE_URL     ?? "https://opendatasus.saude.gov.br").replace(/\/$/, "");
const ALT_BASE       = (process.env.PNI_API_ALTERNATIVE_BASE_URL ?? "https://apidadosabertos.saude.gov.br").replace(/\/$/, "");
const SLUG_2025      = process.env.PNI_DATASET_SLUG_2025 ?? "doses-aplicadas-pelo-programa-de-nacional-de-imunizacoes-pni-2025";
const UF             = process.env.PNI_UF          ?? "AC";
const ANO_INICIO     = Number(process.env.PNI_ANO_INICIO      ?? "2024");
const ANO_FIM        = Number(process.env.PNI_ANO_FIM         ?? "2026");
const TIMEOUT_MS     = Number(process.env.PNI_TIMEOUT_MS      ?? "30000");
const RATE_LIMIT     = Number(process.env.PNI_RATE_LIMIT_MS   ?? "500");
const MAX_ROWS       = Number(process.env.PNI_MAX_SAMPLE_ROWS ?? "100");

// ─── Tipos ───────────────────────────────────────────────────────────────────

type FormatoResposta = "JSON" | "CSV" | "XML" | "ZIP" | "DBF" | "PDF" | "HTML" | "VAZIO" | "ERRO";
type Viabilidade     = "ALTA" | "MEDIA" | "BAIXA";

interface ResourcePNI {
  nome:             string;
  url:              string;
  resource_id?:     string;
  formato:          FormatoResposta;
  datastore_active: boolean;
  tamanho_aprox?:   string;
  campos?:          string[];
  tem_uf:           boolean;
  tem_municipio:    boolean;
  tem_ibge:         boolean;
  tem_data:         boolean;
  tem_imunobio:     boolean;
  tem_dose:         boolean;
  tem_grupo:        boolean;
  tem_idade:        boolean;
  tem_cnes:         boolean;
  tem_populacao:    boolean;
  amostra?:         unknown;
  viabilidade:      Viabilidade;
  observacoes:      string;
}

interface DatasetPNI {
  ano:        number;
  slug:       string;
  titulo?:    string;
  encontrado: boolean;
  resources:  ResourcePNI[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function buscar(url: string): Promise<{ formato: FormatoResposta; dados: unknown; status: number; tamanho?: string }> {
  console.log(`  → GET ${url.slice(0, 100)}`);
  try {
    const resp = await fetch(url, {
      headers: {
        Accept: "application/json, text/csv, application/xml, */*",
        "User-Agent": "Varadouro-Digital-ETL/1.0 (TCE-AC PNI exploratório)",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const contentType = resp.headers.get("content-type") ?? "";
    const contentLen  = resp.headers.get("content-length");
    const tamanho     = contentLen ? `${(Number(contentLen) / 1_048_576).toFixed(1)} MB` : undefined;

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      return { formato: "ERRO", dados: `HTTP ${resp.status}: ${body.slice(0, 200)}`, status: resp.status, tamanho };
    }

    // Lê até 64 KB (amostra leve)
    const reader = resp.body?.getReader();
    let texto = "";
    if (reader) {
      const decoder = new TextDecoder();
      let bytes = 0;
      while (bytes < 65_536) {
        const { done, value } = await reader.read();
        if (done) break;
        texto += decoder.decode(value, { stream: !done });
        bytes += value?.length ?? 0;
      }
      reader.cancel().catch(() => void 0);
    }

    if (contentType.includes("application/pdf") || texto.slice(0, 4) === "%PDF") {
      return { formato: "PDF", dados: "(arquivo PDF)", status: resp.status, tamanho };
    }
    if (contentType.includes("application/zip") || texto.slice(0, 2) === "PK") {
      return { formato: "ZIP", dados: "(arquivo ZIP binário)", status: resp.status, tamanho };
    }
    if (texto.slice(0, 4) === "\xD7\xCD\xC1\xC8") {
      return { formato: "DBF", dados: "(arquivo DBF binário)", status: resp.status, tamanho };
    }
    if (contentType.includes("text/html") || texto.trimStart().startsWith("<!DOCTYPE") || texto.trimStart().startsWith("<html")) {
      return { formato: "HTML", dados: texto.slice(0, 300), status: resp.status, tamanho };
    }
    if (contentType.includes("xml") || texto.trimStart().startsWith("<?xml")) {
      return { formato: "XML", dados: texto.slice(0, 500), status: resp.status, tamanho };
    }
    if (contentType.includes("text/csv") || (texto.includes(";") && !texto.trimStart().startsWith("{"))) {
      return { formato: "CSV", dados: texto.slice(0, 600), status: resp.status, tamanho };
    }
    try {
      const parsed = JSON.parse(texto);
      return { formato: "JSON", dados: parsed, status: resp.status, tamanho };
    } catch {
      return { formato: "ERRO", dados: `Conteúdo não reconhecido: ${texto.slice(0, 150)}`, status: resp.status, tamanho };
    }
  } catch (e) {
    return { formato: "ERRO", dados: e instanceof Error ? e.message : String(e), status: 0 };
  }
}

// ─── Detecção de campos relevantes ───────────────────────────────────────────

const CAMPOS_UF        = /\b(uf|sg_uf|co_uf|estado|estado_sigla)\b/i;
const CAMPOS_MUNICIPIO = /\b(municipio|nome_municipio|no_municipio|ds_municipio)\b/i;
const CAMPOS_IBGE      = /\b(ibge|co_ibge|cod_ibge|codigo_ibge|co_municipio|co_mun)\b/i;
const CAMPOS_DATA      = /\b(dt_|data|competencia|ano|mes|year|month|vacina_dataAplicacao)\b/i;
const CAMPOS_IMUNOBIO  = /\b(imunobio|imunobiologico|vacina|ds_vacina|vacina_nome|vacina_codigo)\b/i;
const CAMPOS_DOSE      = /\b(dose|nu_dose|vacina_descricaoDose|descricaoDose)\b/i;
const CAMPOS_GRUPO     = /\b(grupo|estrategia|publico|categoria|vacina_grupoAtendimento)\b/i;
const CAMPOS_IDADE     = /\b(idade|faixa|dt_nasc|nu_idade|paciente_idade|paciente_dataNascimento)\b/i;
const CAMPOS_CNES      = /\b(cnes|co_cnes|estabelecimento|unidade)\b/i;
const CAMPOS_POPULACAO = /\b(populacao|pop_alvo|denominador|cobertura|meta)\b/i;

function detectarCampos(campos: string[]) {
  const detectar = (re: RegExp) => campos.some((c) => re.test(c));
  return {
    tem_uf:        detectar(CAMPOS_UF),
    tem_municipio: detectar(CAMPOS_MUNICIPIO),
    tem_ibge:      detectar(CAMPOS_IBGE),
    tem_data:      detectar(CAMPOS_DATA),
    tem_imunobio:  detectar(CAMPOS_IMUNOBIO),
    tem_dose:      detectar(CAMPOS_DOSE),
    tem_grupo:     detectar(CAMPOS_GRUPO),
    tem_idade:     detectar(CAMPOS_IDADE),
    tem_cnes:      detectar(CAMPOS_CNES),
    tem_populacao: detectar(CAMPOS_POPULACAO),
  };
}

function calcularViabilidade(r: Pick<ResourcePNI, "formato" | "datastore_active" | "tem_uf" | "tem_municipio" | "tem_ibge" | "tem_data">): Viabilidade {
  if (["ZIP", "DBF", "PDF", "HTML", "ERRO"].includes(r.formato)) return "BAIXA";
  if (r.datastore_active && (r.tem_uf || r.tem_municipio || r.tem_ibge)) return "ALTA";
  if (r.formato === "JSON" && (r.tem_uf || r.tem_municipio)) return "ALTA";
  if (r.formato === "CSV" && r.tem_data) return "MEDIA";
  if (r.formato === "JSON") return "MEDIA";
  return "BAIXA";
}

// ─── CKAN ─────────────────────────────────────────────────────────────────────

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
  id:        string;
  name:      string;
  title:     string;
  notes?:    string;
  resources: CkanResource[];
}

async function buscarCkanPorSlug(slug: string): Promise<CkanPackage | null> {
  const url = `${CKAN_BASE}/api/3/action/package_show?id=${encodeURIComponent(slug)}`;
  const res = await buscar(url);
  await sleep(RATE_LIMIT);
  if (res.formato !== "JSON") {
    console.log(`    ✗ CKAN retornou ${res.formato} (HTTP ${res.status}) — não é JSON válido`);
    if (res.formato === "HTML") console.log(`    (Portal pode estar bloqueando ou retornando página de erro)`);
    return null;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = res.dados as any;
  if (!body?.success || !body?.result) {
    const erro = body?.error?.message ?? body?.error?.name ?? JSON.stringify(body).slice(0, 100);
    console.log(`    ✗ CKAN: success=${body?.success} result=${body?.result === null ? "null" : "??"} — ${erro}`);
    return null;
  }
  return body.result as CkanPackage;
}

async function buscarCkanPorTermos(termos: string): Promise<CkanPackage[]> {
  const url = `${CKAN_BASE}/api/3/action/package_search?q=${encodeURIComponent(termos)}&rows=5`;
  const res = await buscar(url);
  await sleep(RATE_LIMIT);
  if (res.formato !== "JSON") {
    console.log(`    ✗ Busca CKAN retornou ${res.formato} (HTTP ${res.status})`);
    return [];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = res.dados as any;
  const count = body?.result?.count ?? 0;
  console.log(`    Resultados CKAN: ${count} dataset(s) encontrado(s)`);
  if (count > 0) {
    const results = (body?.result?.results ?? []) as CkanPackage[];
    for (const p of results) console.log(`      - ${p.name}: "${p.title}"`);
  }
  return (body?.result?.results ?? []) as CkanPackage[];
}

// ─── Inspeciona resource individual ──────────────────────────────────────────

async function inspecionarResource(ckanRes: CkanResource): Promise<ResourcePNI> {
  const formato = (ckanRes.format?.toUpperCase() ?? "?") as FormatoResposta;
  const tamanhoKB = ckanRes.size ? `${(ckanRes.size / 1_048_576).toFixed(1)} MB` : undefined;

  // Arquivos muito grandes ou binários — não baixar
  const ehPesado = ["ZIP", "DBF"].includes(formato) || (ckanRes.size != null && ckanRes.size > 50_000_000);
  if (ehPesado) {
    return {
      nome: ckanRes.name,
      url: ckanRes.url,
      resource_id: ckanRes.id,
      formato,
      datastore_active: ckanRes.datastore_active,
      tamanho_aprox: tamanhoKB,
      tem_uf: false, tem_municipio: false, tem_ibge: false, tem_data: false,
      tem_imunobio: false, tem_dose: false, tem_grupo: false, tem_idade: false,
      tem_cnes: false, tem_populacao: false,
      viabilidade: "BAIXA",
      observacoes: `Arquivo pesado (${formato}, ${tamanhoKB ?? "tamanho desconhecido"}) — download bulk necessário.`,
    };
  }

  // PDF — dicionário de variáveis
  if (formato === "PDF") {
    return {
      nome: ckanRes.name,
      url: ckanRes.url,
      resource_id: ckanRes.id,
      formato: "PDF",
      datastore_active: false,
      tamanho_aprox: tamanhoKB,
      tem_uf: false, tem_municipio: false, tem_ibge: false, tem_data: false,
      tem_imunobio: false, tem_dose: false, tem_grupo: false, tem_idade: false,
      tem_cnes: false, tem_populacao: false,
      viabilidade: "BAIXA",
      observacoes: "Dicionário de variáveis em PDF — consulta manual para mapear campos.",
    };
  }

  // Datastore ativo — testa via API CKAN com amostra limitada
  if (ckanRes.datastore_active) {
    const dsUrl = `${CKAN_BASE}/api/3/action/datastore_search?resource_id=${ckanRes.id}&limit=${MAX_ROWS}`;
    const res = await buscar(dsUrl);
    await sleep(RATE_LIMIT);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = res.dados as any;
    const camposArr: string[] = (body?.result?.fields ?? []).map((f: { id: string }) => f.id);
    const totalReg: number | undefined = body?.result?.total;
    const amostra = (body?.result?.records ?? []).slice(0, 3);
    const det = detectarCampos(camposArr);

    return {
      nome: ckanRes.name,
      url: dsUrl,
      resource_id: ckanRes.id,
      formato: res.formato,
      datastore_active: true,
      tamanho_aprox: totalReg ? `${totalReg.toLocaleString("pt-BR")} registros` : tamanhoKB,
      campos: camposArr.slice(0, 20),
      ...det,
      amostra,
      viabilidade: calcularViabilidade({ formato: res.formato, datastore_active: true, ...det }),
      observacoes: `Datastore ativo. ${totalReg ? `${totalReg.toLocaleString("pt-BR")} registros.` : ""} Campos detectados: ${camposArr.length}.`,
    };
  }

  // CSV ou JSON direto — lê amostra
  const res = await buscar(ckanRes.url);
  await sleep(RATE_LIMIT);

  let camposArr: string[] = [];
  let amostra: unknown;

  if (res.formato === "CSV" && typeof res.dados === "string") {
    const linhas = res.dados.split("\n");
    const separador = linhas[0].includes(";") ? ";" : ",";
    camposArr = linhas[0].split(separador).map((c) => c.trim().replace(/^"|"$/g, ""));
    amostra = linhas.slice(1, 4).join("\n");
  }
  if (res.formato === "JSON") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = res.dados as any;
    const item = Array.isArray(body) ? body[0] : (body?.data?.[0] ?? body?.records?.[0] ?? body?.items?.[0]);
    if (item && typeof item === "object") {
      camposArr = Object.keys(item);
      amostra = item;
    }
  }

  const det = detectarCampos(camposArr);

  return {
    nome: ckanRes.name,
    url: ckanRes.url,
    resource_id: ckanRes.id,
    formato: res.formato,
    datastore_active: false,
    tamanho_aprox: res.tamanho ?? tamanhoKB,
    campos: camposArr.slice(0, 20),
    ...det,
    amostra,
    viabilidade: calcularViabilidade({ formato: res.formato, datastore_active: false, ...det }),
    observacoes: `Resource direto. Formato ${res.formato}. ${res.formato === "HTML" ? "Portal retornou HTML — API REST não detectada." : ""} ${res.formato === "ERRO" ? `Erro: ${String(res.dados).slice(0, 100)}` : ""}`.trim(),
  };
}

// ─── Inspeciona API alternativa ───────────────────────────────────────────────

async function testarApiAlternativa(label: string, path: string): Promise<ResourcePNI> {
  const url = `${ALT_BASE}${path}`;
  const res = await buscar(url);
  await sleep(RATE_LIMIT);

  let camposArr: string[] = [];
  let amostra: unknown;

  if (res.formato === "JSON") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = res.dados as any;
    const item = Array.isArray(body) ? body[0] : (body?.data?.[0] ?? body?.items?.[0] ?? body?.result?.[0]);
    if (item && typeof item === "object") {
      camposArr = Object.keys(item);
      amostra = item;
    }
  }

  const det = detectarCampos(camposArr);

  return {
    nome: label,
    url,
    formato: res.formato,
    datastore_active: false,
    campos: camposArr.slice(0, 20),
    ...det,
    amostra,
    viabilidade: calcularViabilidade({ formato: res.formato, datastore_active: false, ...det }),
    observacoes: `API alternativa (apidadosabertos.saude.gov.br). ${res.formato === "ERRO" ? `Erro: ${String(res.dados).slice(0, 150)}` : ""} ${res.formato === "HTML" ? "Retornou HTML — endpoint não existe ou requer autenticação." : ""}`.trim(),
  };
}

// ─── Inspeciona dataset PNI de um ano ────────────────────────────────────────

async function inspecionarDatasetAno(ano: number): Promise<DatasetPNI> {
  // Monta variações de slug esperadas
  const slugs = [
    `doses-aplicadas-pelo-programa-de-nacional-de-imunizacoes-pni-${ano}`,
    `doses-aplicadas-pelo-programa-nacional-de-imunizacoes-pni-${ano}`,
    `pni-doses-aplicadas-${ano}`,
    `si-pni-doses-aplicadas-${ano}`,
  ];
  if (ano === 2025) slugs.unshift(SLUG_2025);

  let pacote: CkanPackage | null = null;
  let slugUsado = "";

  for (const slug of slugs) {
    console.log(`  Tentando slug: ${slug}`);
    pacote = await buscarCkanPorSlug(slug);
    if (pacote) { slugUsado = slug; break; }
  }

  // Fallback: busca por termos
  if (!pacote) {
    console.log(`  Slug não encontrado. Tentando busca por termos para ${ano}...`);
    const resultados = await buscarCkanPorTermos(`doses aplicadas PNI imunizações ${ano}`);
    const match = resultados.find((p) => p.name.includes(String(ano)) || p.title?.includes(String(ano)));
    pacote = match ?? null;
    if (pacote) slugUsado = pacote.name;
  }

  if (!pacote) {
    return { ano, slug: slugs[0], encontrado: false, resources: [] };
  }

  console.log(`  Dataset encontrado: "${pacote.title}" (${pacote.resources.length} recursos)`);

  const resources: ResourcePNI[] = [];
  for (const ckanRes of pacote.resources) {
    console.log(`    Inspecionando resource: ${ckanRes.name} [${ckanRes.format}]`);
    const r = await inspecionarResource(ckanRes);
    resources.push(r);
  }

  return { ano, slug: slugUsado, titulo: pacote.title, encontrado: true, resources };
}

// ─── Imprime relatório ────────────────────────────────────────────────────────

function imprimirRelatorio(datasets: DatasetPNI[], altResources: ResourcePNI[]) {
  const SEP = "═".repeat(100);
  const sep = "─".repeat(100);

  console.log("\n" + SEP);
  console.log("INVENTÁRIO PNI — DOSES APLICADAS (OpenDataSUS / RNDS)");
  console.log(`UF: ${UF} | Anos: ${ANO_INICIO}–${ANO_FIM} | Portal: ${CKAN_BASE}`);
  console.log(SEP);

  // Por dataset/ano
  for (const ds of datasets) {
    console.log(`\n▶ PNI ${ds.ano}`);
    if (!ds.encontrado) {
      console.log(`  ✗ Dataset NÃO encontrado no CKAN para ${ds.ano}`);
      console.log(`    Slugs tentados: ${ds.slug}`);
      continue;
    }
    console.log(`  ✓ Dataset: "${ds.titulo}" (slug: ${ds.slug})`);
    console.log(`  Recursos: ${ds.resources.length}`);

    // Agrupa por mês
    const mensais = ds.resources.filter((r) => /janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro/i.test(r.nome));
    const outros  = ds.resources.filter((r) => !mensais.includes(r));

    if (mensais.length > 0) {
      console.log(`\n  Recursos mensais (${mensais.length}):`);
      for (const r of mensais) {
        const viab = r.viabilidade === "ALTA" ? "✓" : r.viabilidade === "MEDIA" ? "~" : "✗";
        console.log(`    [${viab}] ${r.nome} — ${r.formato} — ${r.viabilidade}`);
        if (r.tamanho_aprox) console.log(`         Tamanho: ${r.tamanho_aprox}`);
      }
    }

    if (outros.length > 0) {
      console.log(`\n  Outros recursos (${outros.length}):`);
      for (const r of outros) {
        const viab = r.viabilidade === "ALTA" ? "✓" : r.viabilidade === "MEDIA" ? "~" : "✗";
        console.log(`    [${viab}] ${r.nome} — ${r.formato} — ${r.viabilidade}`);
      }
    }

    // Campos detectados — usando primeiro resource com campos
    const comCampos = ds.resources.find((r) => r.campos && r.campos.length > 0);
    if (comCampos?.campos) {
      console.log(`\n  Campos detectados (${comCampos.campos.length}): ${comCampos.campos.join(", ")}`);

      const checks = [
        ["UF",              comCampos.tem_uf],
        ["Município",       comCampos.tem_municipio],
        ["Código IBGE",     comCampos.tem_ibge],
        ["Data/Ano/Mês",    comCampos.tem_data],
        ["Imunobiológico",  comCampos.tem_imunobio],
        ["Dose",            comCampos.tem_dose],
        ["Grupo/Estratégia",comCampos.tem_grupo],
        ["Idade/Nasc.",     comCampos.tem_idade],
        ["CNES",            comCampos.tem_cnes],
        ["População/Cobert.",comCampos.tem_populacao],
      ] as [string, boolean][];

      console.log("\n  Campos-chave:");
      for (const [label, ok] of checks) {
        console.log(`    ${ok ? "✓" : "✗"} ${label}`);
      }

      if (comCampos.amostra) {
        console.log("\n  Amostra (1 registro):");
        console.log("  " + JSON.stringify(comCampos.amostra, null, 2).replace(/\n/g, "\n  ").slice(0, 800));
      }
    }
  }

  // API alternativa
  console.log("\n" + sep);
  console.log("API ALTERNATIVA — apidadosabertos.saude.gov.br");
  console.log(sep);
  for (const r of altResources) {
    const viab = r.viabilidade === "ALTA" ? "✓ ALTA" : r.viabilidade === "MEDIA" ? "~ MEDIA" : "✗ BAIXA";
    console.log(`\n  ${viab} — ${r.nome}`);
    console.log(`  URL: ${r.url}`);
    console.log(`  Formato: ${r.formato}`);
    if (r.campos?.length) console.log(`  Campos: ${r.campos.join(", ")}`);
    console.log(`  Obs: ${r.observacoes}`);
  }

  // Resumo consolidado
  console.log("\n" + sep);
  console.log("RESUMO CONSOLIDADO");
  console.log(sep);

  const todosResources = [
    ...datasets.flatMap((d) => d.resources),
    ...altResources,
  ];
  const alta  = todosResources.filter((r) => r.viabilidade === "ALTA");
  const media = todosResources.filter((r) => r.viabilidade === "MEDIA");
  const baixa = todosResources.filter((r) => r.viabilidade === "BAIXA");

  console.log(`\n  Viabilidade ALTA  : ${alta.length} recurso(s)`);
  console.log(`  Viabilidade MÉDIA : ${media.length} recurso(s)`);
  console.log(`  Viabilidade BAIXA : ${baixa.length} recurso(s)`);

  const anosEncontrados = datasets.filter((d) => d.encontrado).map((d) => d.ano);
  console.log(`\n  Datasets encontrados : ${anosEncontrados.length > 0 ? anosEncontrados.join(", ") : "nenhum"}`);
  const anosAusentes = datasets.filter((d) => !d.encontrado).map((d) => d.ano);
  if (anosAusentes.length > 0) console.log(`  Datasets ausentes    : ${anosAusentes.join(", ")}`);

  // Determina tipo de dados disponível
  const temRegistrosIndividuais = todosResources.some((r) =>
    r.tem_uf && (r.tem_municipio || r.tem_ibge) && r.tem_imunobio && r.viabilidade !== "BAIXA"
  );
  const temCobertura = todosResources.some((r) => r.tem_populacao && r.viabilidade !== "BAIXA");

  console.log("\n  Tipo de dado disponível:");
  console.log(`    Doses aplicadas (registros individuais) : ${temRegistrosIndividuais ? "✓ SIM" : "✗ não detectado"}`);
  console.log(`    Cobertura vacinal (pop. alvo/denom.)   : ${temCobertura ? "✓ SIM" : "✗ não detectado — exige denominador externo"}`);

  // Recomendação
  console.log("\n" + sep);
  console.log("RECOMENDAÇÃO PARA PRÓXIMA ETAPA");
  console.log(sep);

  if (alta.length > 0) {
    const melhor = alta[0];
    console.log(`\n  ► Viabilidade: ALTA`);
    console.log(`    Recurso recomendado : ${melhor.nome}`);
    console.log(`    URL                 : ${melhor.url}`);
    if (melhor.resource_id) console.log(`    resource_id         : ${melhor.resource_id}`);
    console.log("\n  Próximos passos:");
    console.log("    1. Criar tabela raw.pni_doses_raw no DW");
    console.log("    2. Carga incremental por mês/ano via CKAN Datastore ou CSV");
    console.log("    3. Mart: agrupar por município IBGE, imunobiológico, mês, ano");
    if (!temCobertura) {
      console.log("\n  Sobre cobertura vacinal:");
      console.log("    O dataset PNI contém doses aplicadas (numerador).");
      console.log("    Para calcular cobertura (%), cruzar com população-alvo via IBGE/SIGTAP.");
      console.log("    Alternativa: usar cobertura consolidada disponível no TABNET/SIPNI.");
    }
  } else if (media.length > 0) {
    console.log(`\n  ► Viabilidade: MÉDIA — fontes detectadas mas exigem pré-processamento.`);
    console.log("    Avaliar download de CSV mensais e carga local.");
  } else {
    console.log("\n  ► Viabilidade: BAIXA — nenhuma fonte com API REST detectada.");
    console.log("    Alternativas:");
    console.log("    - SIPNI/TABNET: cobertura vacinal consolidada (download manual)");
    console.log("    - e-Gestor APS: cobertura por ESF/município (autenticação necessária)");
    console.log("    - Aumentar PNI_TIMEOUT_MS e rodar novamente");
  }

  console.log("\n" + SEP);
}

// ─── Ponto de entrada ─────────────────────────────────────────────────────────

async function main() {
  console.log("[pni:inspecionar] Inventário PNI — Doses aplicadas (OpenDataSUS/RNDS)");
  console.log(`  Portal CKAN   : ${CKAN_BASE}`);
  console.log(`  API alternativa: ${ALT_BASE}`);
  console.log(`  UF            : ${UF}`);
  console.log(`  Anos          : ${ANO_INICIO}–${ANO_FIM}`);
  console.log(`  Timeout       : ${TIMEOUT_MS}ms | Rate limit: ${RATE_LIMIT}ms | Amostra: ${MAX_ROWS} linhas\n`);

  const datasets: DatasetPNI[] = [];

  // Inspeciona um dataset por ano
  for (let ano = ANO_INICIO; ano <= ANO_FIM; ano++) {
    console.log(`\n══ Dataset PNI ${ano} ══════════════════════════════════════════════════════`);
    try {
      const ds = await inspecionarDatasetAno(ano);
      datasets.push(ds);
    } catch (e) {
      console.error(`  ✗ Erro inesperado para ${ano}: ${e instanceof Error ? e.message : String(e)}`);
      datasets.push({ ano, slug: `pni-${ano}`, encontrado: false, resources: [] });
    }
  }

  // Testa API alternativa
  console.log("\n══ API Alternativa (apidadosabertos.saude.gov.br) ══════════════════════");
  const altResources: ResourcePNI[] = [];

  const endpointsAlt = [
    { label: "PNI cobertura v1",         path: `/pni/v1/cobertura?uf=${UF}&ano=${ANO_INICIO}&limit=${MAX_ROWS}` },
    { label: "PNI doses v1",             path: `/pni/v1/doses?uf=${UF}&ano=${ANO_INICIO}&limit=${MAX_ROWS}` },
    { label: "PNI doses (co_uf)",        path: `/pni/doses?co_uf=${UF}&ano=${ANO_INICIO}&limit=${MAX_ROWS}` },
    { label: "PNI imunizações",          path: `/pni/imunizacoes?uf=${UF}&ano=${ANO_INICIO}&limit=${MAX_ROWS}` },
    { label: "PNI cobertura municipal",  path: `/pni/cobertura?uf=${UF}&ano=${ANO_INICIO}&limit=${MAX_ROWS}` },
    { label: "SIPNI doses",              path: `/sipni/v1/doses?uf=${UF}&ano=${ANO_INICIO}&limit=${MAX_ROWS}` },
    { label: "SIPNI cobertura",          path: `/sipni/cobertura?uf=${UF}&ano=${ANO_INICIO}&limit=${MAX_ROWS}` },
  ];

  for (const ep of endpointsAlt) {
    try {
      const r = await testarApiAlternativa(ep.label, ep.path);
      altResources.push(r);
    } catch (e) {
      altResources.push({
        nome: ep.label, url: `${ALT_BASE}${ep.path}`,
        formato: "ERRO", datastore_active: false,
        tem_uf: false, tem_municipio: false, tem_ibge: false, tem_data: false,
        tem_imunobio: false, tem_dose: false, tem_grupo: false, tem_idade: false,
        tem_cnes: false, tem_populacao: false,
        viabilidade: "BAIXA",
        observacoes: `Exceção: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  imprimirRelatorio(datasets, altResources);
}

main().catch((err) => {
  console.error("[pni:inspecionar] Erro fatal:", (err as Error).message);
  process.exit(1);
});
