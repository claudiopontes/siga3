/**
 * pni-direto-inspecionar.ts
 *
 * Job exploratório: acessa URLs diretas ou páginas de recurso OpenDataSUS do PNI,
 * sem depender da API CKAN.
 *
 * Tipos de entrada aceitos em PNI_DIRECT_URLS:
 *   1. URL direta de arquivo  — CSV, JSON, XML ou ZIP
 *   2. URL de página de recurso — contém /resource/{uuid}
 *      → o job extrai links de download do HTML e os testa automaticamente
 *
 * Para ZIPs: baixa amostra, detecta CSV interno via cabeçalho ZIP local,
 * descomprime com zlib.inflateRaw (sem dependência extra).
 *
 * Variáveis de ambiente (.env):
 *   PNI_DIRECT_URLS          — lista de URLs separadas por vírgula
 *   PNI_DIRECT_SAMPLE_ROWS   — máx. de linhas da amostra CSV (padrão: 200)
 *   PNI_UF                   — sigla da UF para filtro (padrão: AC)
 *   PNI_TIMEOUT_MS           — timeout por requisição (padrão: 30000)
 *   PNI_RATE_LIMIT_MS        — pausa entre requisições (padrão: 500)
 *
 * Uso:
 *   cd etl && npm run pni:direto:inspecionar
 */

import "dotenv/config";
import { inflateRaw } from "zlib";
import { promisify } from "util";

const inflateRawAsync = promisify(inflateRaw);

// ─── Configuração ─────────────────────────────────────────────────────────────

const DIRECT_URLS_RAW = process.env.PNI_DIRECT_URLS ?? "";
const SAMPLE_ROWS     = Number(process.env.PNI_DIRECT_SAMPLE_ROWS ?? "200");
const UF              = process.env.PNI_UF           ?? "AC";
const TIMEOUT_MS      = Number(process.env.PNI_TIMEOUT_MS    ?? "30000");
const RATE_LIMIT      = Number(process.env.PNI_RATE_LIMIT_MS ?? "500");

const DIRECT_URLS: string[] = DIRECT_URLS_RAW
  .split(",")
  .map((u) => u.trim())
  .filter(Boolean);

const OPENDATASUS_HOST = "https://opendatasus.saude.gov.br";

// ─── Tipos ───────────────────────────────────────────────────────────────────

type FormatoResposta = "CSV" | "JSON" | "XML" | "ZIP" | "PDF" | "HTML" | "ERRO";

interface DeteccaoCampos {
  tem_uf:        boolean;
  tem_municipio: boolean;
  tem_ibge:      boolean;
  tem_data:      boolean;
  tem_ano:       boolean;
  tem_mes:       boolean;
  tem_imunobio:  boolean;
  tem_dose:      boolean;
  tem_grupo:     boolean;
  tem_idade:     boolean;
  tem_cnes:      boolean;
  tem_cobertura: boolean;
  tem_populacao: boolean;
  campos_uf:     string[];
  campos_ibge:   string[];
  campos_data:   string[];
  campos_vacina: string[];
}

interface ResultadoUrl {
  url_entrada:      string;
  url_download?:    string;
  label:            string;
  tipo_entrada:     "arquivo_direto" | "pagina_recurso";
  links_encontrados?: string[];
  status_head:      number;
  content_type:     string;
  content_length?:  string;
  tamanho_mb?:      string;
  aceita_range:     boolean;
  formato:          FormatoResposta;
  csv_dentro_zip?:  string;
  separador?:       string;
  total_campos:     number;
  cabecalhos:       string[];
  deteccao:         DeteccaoCampos;
  amostra_linhas:   string[];
  amostra_ac:       string[];
  tem_dados_ac:     boolean;
  tipo_dado:        "doses_aplicadas" | "cobertura_percentual" | "ambos" | "indefinido";
  viabilidade:      "ALTA" | "MEDIA" | "BAIXA";
  observacoes:      string;
  erro?:            string;
}

// ─── Helpers gerais ───────────────────────────────────────────────────────────

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function detectarSeparador(linha: string): string {
  const contagens: Record<string, number> = { ";": 0, ",": 0, "\t": 0, "|": 0 };
  for (const sep of Object.keys(contagens)) {
    contagens[sep] = (linha.match(new RegExp(`\\${sep === "\t" ? "t" : sep}`, "g")) ?? []).length;
  }
  return Object.entries(contagens).sort((a, b) => b[1] - a[1])[0][0];
}

function limparCampo(campo: string): string {
  return campo.trim().replace(/^["']|["']$/g, "").trim();
}

function resolverUrl(href: string, base: string): string {
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  if (href.startsWith("//")) return "https:" + href;
  if (href.startsWith("/")) {
    const u = new URL(base);
    return u.origin + href;
  }
  return base.replace(/\/[^/]*$/, "/") + href;
}

// ─── Detecção de campos ───────────────────────────────────────────────────────

const RE_UF        = /\b(uf|sg_uf|co_uf|estado|estado_sigla|paciente_endereco_uf)\b/i;
const RE_MUNICIPIO = /\b(municipio|nome_municipio|no_municipio|ds_municipio|paciente_endereco_nmMunicipio)\b/i;
const RE_IBGE      = /\b(ibge|co_ibge|cod_ibge|codigo_ibge|co_municipio|co_mun|paciente_endereco_coIbgeMunicipio)\b/i;
const RE_DATA      = /\b(dt_|data_|data$|vacina_dataAplicacao|dataAplicacao|competencia)\b/i;
const RE_ANO       = /\b(ano|year|nu_ano)\b/i;
const RE_MES       = /\b(mes|month|nu_mes)\b/i;
const RE_IMUNOBIO  = /\b(imunobio|imunobiologico|vacina_nome|vacina_codigo|vacina_descricao|ds_vacina)\b/i;
const RE_DOSE      = /\b(dose|nu_dose|vacina_descricaoDose|descricaoDose)\b/i;
const RE_GRUPO     = /\b(grupo|estrategia|publico|categoria|vacina_grupoAtendimento|grupoAtendimento)\b/i;
const RE_IDADE     = /\b(idade|faixa|dt_nasc|nu_idade|paciente_idade|paciente_dataNascimento)\b/i;
const RE_CNES      = /\b(cnes|co_cnes|estabelecimento_valor|estabelecimento_razaoSocial)\b/i;
const RE_COBERTURA = /\b(cobertura|percentual|pct_|porcent)\b/i;
const RE_POPULACAO = /\b(populacao|pop_alvo|denominador|meta|target)\b/i;

function detectarCampos(campos: string[]): DeteccaoCampos {
  const match = (re: RegExp) => campos.filter((c) => re.test(c));
  const tem   = (re: RegExp) => campos.some((c) => re.test(c));
  return {
    tem_uf: tem(RE_UF), tem_municipio: tem(RE_MUNICIPIO), tem_ibge: tem(RE_IBGE),
    tem_data: tem(RE_DATA), tem_ano: tem(RE_ANO), tem_mes: tem(RE_MES),
    tem_imunobio: tem(RE_IMUNOBIO), tem_dose: tem(RE_DOSE), tem_grupo: tem(RE_GRUPO),
    tem_idade: tem(RE_IDADE), tem_cnes: tem(RE_CNES),
    tem_cobertura: tem(RE_COBERTURA), tem_populacao: tem(RE_POPULACAO),
    campos_uf: match(RE_UF), campos_ibge: match(RE_IBGE),
    campos_data: match(RE_DATA), campos_vacina: match(RE_IMUNOBIO),
  };
}

const DETECCAO_VAZIA: DeteccaoCampos = {
  tem_uf: false, tem_municipio: false, tem_ibge: false, tem_data: false,
  tem_ano: false, tem_mes: false, tem_imunobio: false, tem_dose: false,
  tem_grupo: false, tem_idade: false, tem_cnes: false,
  tem_cobertura: false, tem_populacao: false,
  campos_uf: [], campos_ibge: [], campos_data: [], campos_vacina: [],
};

function determinarTipoDado(det: DeteccaoCampos): ResultadoUrl["tipo_dado"] {
  if (det.tem_cobertura && det.tem_populacao) return "ambos";
  if (det.tem_cobertura || det.tem_populacao) return "cobertura_percentual";
  if (det.tem_imunobio  || det.tem_dose)      return "doses_aplicadas";
  return "indefinido";
}

function calcularViabilidade(formato: FormatoResposta, det: DeteccaoCampos): ResultadoUrl["viabilidade"] {
  if (["PDF", "HTML", "ERRO"].includes(formato)) return "BAIXA";
  const temGeo   = det.tem_uf || det.tem_municipio || det.tem_ibge;
  const temTempo = det.tem_data || det.tem_ano;
  const temVac   = det.tem_imunobio || det.tem_dose;
  if (temGeo && temTempo && temVac) return "ALTA";
  if (temGeo || temVac)             return "MEDIA";
  return "BAIXA";
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

const HEADERS_BASE = {
  "User-Agent": "Varadouro-Digital-ETL/1.0 (TCE-AC PNI)",
  Accept: "application/octet-stream, text/csv, application/json, text/html, */*",
};

async function fazerHead(url: string): Promise<{
  status: number; contentType: string; contentLength?: string;
  tamanhoMb?: string; aceitaRange: boolean;
}> {
  try {
    const resp = await fetch(url, {
      method: "HEAD",
      headers: HEADERS_BASE,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const ct = resp.headers.get("content-type") ?? "";
    const cl = resp.headers.get("content-length") ?? undefined;
    const ar = (resp.headers.get("accept-ranges") ?? "").toLowerCase().includes("bytes");
    const mb = cl ? `${(Number(cl) / 1_048_576).toFixed(1)} MB` : undefined;
    return { status: resp.status, contentType: ct, contentLength: cl, tamanhoMb: mb, aceitaRange: ar };
  } catch {
    return { status: 0, contentType: "", aceitaRange: false };
  }
}

async function lerBytesIniciais(url: string, bytesMax: number): Promise<{ buffer: Buffer; truncado: boolean }> {
  const resp = await fetch(url, {
    headers: { ...HEADERS_BASE, Range: `bytes=0-${bytesMax - 1}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!resp.ok && resp.status !== 206) throw new Error(`HTTP ${resp.status}`);

  const chunks: Buffer[] = [];
  let total = 0;
  const reader = resp.body?.getReader();
  if (reader) {
    while (total < bytesMax) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(Buffer.from(value));
      total += value.length;
    }
    reader.cancel().catch(() => void 0);
  }
  return { buffer: Buffer.concat(chunks), truncado: total >= bytesMax };
}

// ─── Detecção de formato ──────────────────────────────────────────────────────

function detectarFormato(contentType: string, inicio: Buffer): FormatoResposta {
  const ct = contentType.toLowerCase();
  // Bytes mágicos têm prioridade sobre content-type (que pode ser enganoso)
  if (inicio.slice(0, 2).toString("hex") === "504b") return "ZIP"; // PK
  if (inicio.slice(0, 4).toString() === "%PDF")       return "PDF";
  if (ct.includes("application/pdf"))                 return "PDF";
  if (ct.includes("zip"))                             return "ZIP";
  const str = inicio.slice(0, 512).toString("utf-8", 0, 512);
  if (ct.includes("text/html") || str.trimStart().startsWith("<!")) return "HTML";
  if (ct.includes("xml") || str.trimStart().startsWith("<?xml"))    return "XML";
  if (ct.includes("json") || /^\s*[\[{]/.test(str))                 return "JSON";
  if (ct.includes("csv"))                                            return "CSV";
  // Heurística CSV: primeira linha tem muitos separadores
  const primeiraLinha = str.split("\n")[0] ?? "";
  if (primeiraLinha.includes(";") || (primeiraLinha.match(/,/g)?.length ?? 0) > 3) return "CSV";
  return "ERRO";
}

// ─── Inspeciona ZIP: lê cabeçalho local e descomprime amostra ────────────────

interface EntradaZip {
  nome:        string;
  metodo:      number; // 0=stored, 8=deflate
  tamanhoComp: number;
  offset:      number; // offset dos dados comprimidos dentro do buffer
}

function lerCabecalhoZipLocal(buf: Buffer): EntradaZip | null {
  // Local file header: PK\x03\x04 (4) + versão (2) + flags (2) + método (2)
  //   + mod time (2) + mod date (2) + CRC (4) + comp size (4) + uncomp size (4)
  //   + fname len (2) + extra len (2) = 30 bytes fixos
  if (buf.length < 30) return null;
  const sig = buf.readUInt32LE(0);
  if (sig !== 0x04034b50) return null; // assinatura PK\x03\x04

  const metodo      = buf.readUInt16LE(8);
  const tamanhoComp = buf.readUInt32LE(18);
  const fnameLen    = buf.readUInt16LE(26);
  const extraLen    = buf.readUInt16LE(28);
  const nome        = buf.slice(30, 30 + fnameLen).toString("utf-8");
  const offset      = 30 + fnameLen + extraLen;

  return { nome, metodo, tamanhoComp, offset };
}

async function inspecionarZip(buf: Buffer): Promise<{
  arquivoNome: string;
  cabecalhos: string[];
  amostraLinhas: string[];
  amostraAc: string[];
  separador: string;
  erro?: string;
}> {
  const vazio = { arquivoNome: "", cabecalhos: [], amostraLinhas: [], amostraAc: [], separador: ";" };

  const entrada = lerCabecalhoZipLocal(buf);
  if (!entrada) return { ...vazio, erro: "Não foi possível ler o cabeçalho ZIP local (buffer insuficiente ou formato inválido)" };

  console.log(`   ZIP: primeiro arquivo = "${entrada.nome}" | método = ${entrada.metodo === 8 ? "DEFLATE" : entrada.metodo === 0 ? "STORED" : `método ${entrada.metodo}`}`);

  const ehCsv = /\.(csv|txt)$/i.test(entrada.nome);
  if (!ehCsv) {
    return { ...vazio, arquivoNome: entrada.nome, erro: `Primeiro arquivo no ZIP não é CSV: "${entrada.nome}"` };
  }

  const dadosComp = buf.slice(entrada.offset, entrada.offset + Math.min(entrada.tamanhoComp, buf.length - entrada.offset));
  if (dadosComp.length === 0) {
    return { ...vazio, arquivoNome: entrada.nome, erro: "Buffer insuficiente para descomprimir (arquivo muito grande para a amostra baixada)" };
  }

  let texto = "";
  if (entrada.metodo === 0) {
    // STORED: dados brutos
    texto = dadosComp.toString("latin1");
  } else if (entrada.metodo === 8) {
    // DEFLATE: usar inflateRaw do Node.js
    try {
      const decomprimido = await inflateRawAsync(dadosComp);
      texto = decomprimido.toString("latin1");
    } catch (e) {
      // Dados truncados: inflateRaw pode falhar no meio do stream — tenta pegar o que deu
      const msg = e instanceof Error ? e.message : String(e);
      // Se for erro de truncamento, ainda pode haver texto parcial decomprimido antes do erro
      return { ...vazio, arquivoNome: entrada.nome, erro: `Descompressão parcial: ${msg}. Buffer baixado (${buf.length} bytes) pode ser insuficiente.` };
    }
  } else {
    return { ...vazio, arquivoNome: entrada.nome, erro: `Método de compressão ${entrada.metodo} não suportado (somente STORED=0 e DEFLATE=8)` };
  }

  const csv = inspecionarCsvTexto(texto, SAMPLE_ROWS, UF);
  return { arquivoNome: entrada.nome, ...csv };
}

// ─── Inspeciona texto CSV ─────────────────────────────────────────────────────

function inspecionarCsvTexto(
  texto: string,
  maxLinhas: number,
  uf: string,
): { separador: string; cabecalhos: string[]; amostraLinhas: string[]; amostraAc: string[] } {
  const linhas = texto.split("\n").filter((l) => l.trim().length > 0);
  if (linhas.length === 0) return { separador: ";", cabecalhos: [], amostraLinhas: [], amostraAc: [] };

  const separador  = detectarSeparador(linhas[0]);
  const cabecalhos = linhas[0].split(separador).map(limparCampo);
  const colUf      = cabecalhos.findIndex((c) => RE_UF.test(c));
  const colIbge    = cabecalhos.findIndex((c) => RE_IBGE.test(c));
  const dados      = linhas.slice(1, maxLinhas + 1);

  const amostraAc = dados.filter((linha) => {
    const cols = linha.split(separador).map(limparCampo);
    if (colUf   >= 0) return cols[colUf]?.toUpperCase() === uf;
    if (colIbge >= 0) return cols[colIbge]?.startsWith("12");
    return linha.toUpperCase().includes(uf);
  });

  return { separador, cabecalhos, amostraLinhas: dados.slice(0, 5), amostraAc: amostraAc.slice(0, 5) };
}

// ─── Inspeciona texto JSON ────────────────────────────────────────────────────

function inspecionarJsonTexto(
  texto: string,
  uf: string,
): { cabecalhos: string[]; amostraLinhas: string[]; amostraAc: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(texto);
  } catch {
    const match = texto.match(/^(\[[\s\S]*,)/);
    if (match) try { parsed = JSON.parse(match[1].slice(0, -1) + "]"); } catch { /* nada */ }
  }
  if (!parsed) return { cabecalhos: [], amostraLinhas: [], amostraAc: [] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const registros: Record<string, unknown>[] = Array.isArray(parsed)
    ? (parsed as Record<string, unknown>[])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    : ((parsed as any)?.data ?? (parsed as any)?.records ?? (parsed as any)?.items ?? []);

  if (registros.length === 0) return { cabecalhos: [], amostraLinhas: [], amostraAc: [] };
  const cabecalhos = Object.keys(registros[0]);
  const colUf      = cabecalhos.find((c) => RE_UF.test(c));
  const colIbge    = cabecalhos.find((c) => RE_IBGE.test(c));
  const amostraAc  = registros.filter((r) => {
    if (colUf)   return String(r[colUf] ?? "").toUpperCase() === uf;
    if (colIbge) return String(r[colIbge] ?? "").startsWith("12");
    return JSON.stringify(r).toUpperCase().includes(uf);
  });

  return {
    cabecalhos,
    amostraLinhas: registros.slice(0, 3).map((r) => JSON.stringify(r).slice(0, 200)),
    amostraAc:     amostraAc.slice(0, 3).map((r) => JSON.stringify(r).slice(0, 200)),
  };
}

// ─── Extrai links de download de página HTML de recurso CKAN ─────────────────

function extrairLinksDownload(html: string, baseUrl: string): string[] {
  const candidatos = new Set<string>();

  // ── 1. __NEXT_DATA__ (Next.js SPA): contém props da página com resource.url ─
  const reNextData = /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i;
  const mNext = reNextData.exec(html);
  if (mNext) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nextData = JSON.parse(mNext[1]) as any;
      // Estrutura típica: props.pageProps.resource.url ou props.pageProps.pkg.resources[].url
      const resource = nextData?.props?.pageProps?.resource;
      if (resource?.url) {
        console.log(`   [__NEXT_DATA__] resource.url = ${resource.url}`);
        try { candidatos.add(resolverUrl(resource.url, baseUrl)); } catch { /* nada */ }
      }
      if (resource?.datastore_active) {
        const rid = resource.id ?? extrairUuid(baseUrl);
        if (rid) {
          candidatos.add(`${OPENDATASUS_HOST}/datastore/dump/${rid}?bom=true&format=csv`);
        }
      }
      // Alternativa: pageProps.pkg.resources
      const resources = nextData?.props?.pageProps?.pkg?.resources as Array<{ id: string; url: string; datastore_active?: boolean }> | undefined;
      if (resources) {
        const uuid = extrairUuid(baseUrl);
        const res = resources.find((r) => r.id === uuid) ?? resources[0];
        if (res?.url) {
          console.log(`   [__NEXT_DATA__] pkg.resources[].url = ${res.url}`);
          try { candidatos.add(resolverUrl(res.url, baseUrl)); } catch { /* nada */ }
        }
      }
    } catch { /* JSON inválido */ }
  }

  // ── 2. href clássicos ──────────────────────────────────────────────────────
  const reHref = /href\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = reHref.exec(html)) !== null) {
    const href = m[1].trim();
    const ehCandidato =
      href.includes("/download") ||
      href.includes("datastore/dump") ||
      /\.(csv|json|xml|zip)(\?|$)/i.test(href) ||
      href.includes("resource_id=");
    if (ehCandidato) {
      try { candidatos.add(resolverUrl(href, baseUrl)); } catch { /* nada */ }
    }
  }

  // ── 3. data-href ──────────────────────────────────────────────────────────
  const reData = /data-href\s*=\s*["']([^"']+)["']/gi;
  while ((m = reData.exec(html)) !== null) {
    const href = m[1].trim();
    if (href.includes("/download") || /\.(csv|zip|json)(\?|$)/i.test(href)) {
      try { candidatos.add(resolverUrl(href, baseUrl)); } catch { /* nada */ }
    }
  }

  // ── 4. UUIDs de resource mencionados no HTML/JS inline ────────────────────
  const reResId = /["']([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})["']/gi;
  const uuidsEncontrados = new Set<string>();
  while ((m = reResId.exec(html)) !== null) {
    uuidsEncontrados.add(m[1]);
  }
  for (const rid of uuidsEncontrados) {
    // Só adiciona UUIDs que não são o próprio resource da URL (já tratado acima)
    if (rid !== extrairUuid(baseUrl)) {
      candidatos.add(`${OPENDATASUS_HOST}/datastore/dump/${rid}?bom=true&format=csv`);
    }
  }

  return [...candidatos];
}

// ─── Constrói candidatos CKAN a partir do UUID (sem parsing de HTML) ─────────

function candidatosPorUuid(uuid: string, datasetSlug: string): string[] {
  const base = OPENDATASUS_HOST;
  return [
    // Datastore dump CSV (mais provável para recursos com datastore ativo)
    `${base}/datastore/dump/${uuid}?bom=true&format=csv`,
    `${base}/datastore/dump/${uuid}?format=csv`,
    // API CKAN datastore (amostra de 5 linhas para verificar formato)
    `${base}/api/3/action/datastore_search?resource_id=${uuid}&limit=5`,
    // Padrão de download direto CKAN
    `${base}/dataset/${datasetSlug}/resource/${uuid}/download/`,
  ];
}

function extrairSlugDataset(urlRecurso: string): string {
  const m = urlRecurso.match(/\/dataset\/([^/]+)\/resource\//);
  return m?.[1] ?? "";
}

function extrairUuid(urlRecurso: string): string {
  const m = urlRecurso.match(/\/resource\/([0-9a-f-]{36})/i);
  return m?.[1] ?? "";
}

// ─── Resolve URL de página de recurso → URL de download ──────────────────────

async function resolverPaginaRecurso(urlRecurso: string): Promise<{
  linksEncontrados: string[];
  urlEscolhida?: string;
  formatoEsperado?: string;
}> {
  console.log(`   → Detectado como página de recurso CKAN. Baixando HTML...`);

  // 1. Tenta extrair links do HTML
  let html = "";
  let htmlOk = false;
  try {
    const resp = await fetch(urlRecurso, {
      headers: { ...HEADERS_BASE, Accept: "text/html,*/*" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    html = await resp.text();
    htmlOk = resp.ok;
    // Diagnóstico: imprime início do HTML para ajudar a identificar bloqueios
    const inicio = html.replace(/\s+/g, " ").slice(0, 300).trim();
    console.log(`   HTML recebido (${html.length} bytes, HTTP ${resp.status}): ${inicio}`);
  } catch (e) {
    console.log(`   ✗ Falha ao baixar página: ${e instanceof Error ? e.message : e}`);
  }
  await sleep(RATE_LIMIT);

  const linksDoHtml = htmlOk ? extrairLinksDownload(html, urlRecurso) : [];
  console.log(`   Links extraídos do HTML: ${linksDoHtml.length}`);

  // 2. Sempre adiciona candidatos derivados do UUID (fallback robusto)
  const uuid = extrairUuid(urlRecurso);
  const slug  = extrairSlugDataset(urlRecurso);
  const candidatosUuid = uuid ? candidatosPorUuid(uuid, slug) : [];
  console.log(`   Candidatos por UUID (${uuid.slice(0, 8)}...): ${candidatosUuid.length}`);

  // União sem duplicatas, links do HTML têm prioridade
  const todos = [...new Set([...linksDoHtml, ...candidatosUuid])];
  console.log(`   Total de candidatos a testar: ${todos.length}`);
  for (const l of todos) console.log(`     - ${l}`);

  if (todos.length === 0) return { linksEncontrados: [] };

  // 3. Testa HEAD em cada candidato para escolher o melhor
  let urlEscolhida: string | undefined;
  let formatoEsperado: string | undefined;
  let bloqueadosHtml = 0;

  for (const link of todos) {
    console.log(`   → HEAD ${link.slice(0, 100)}`);
    const h = await fazerHead(link);
    await sleep(RATE_LIMIT);
    if (h.status === 0 || h.status >= 400) {
      console.log(`     ✗ HTTP ${h.status} — ignorando`);
      continue;
    }
    console.log(`     HTTP ${h.status} | ${h.contentType} | ${h.tamanhoMb ?? "tamanho desconhecido"}`);

    const ct = h.contentType.toLowerCase();

    // Detecta bloqueio WAF: todos os endpoints retornam text/html com 0 bytes
    if (ct.includes("text/html") && (h.contentLength === "0" || h.tamanhoMb === "0.0 MB")) {
      bloqueadosHtml++;
      continue;
    }

    const ehArquivo = ct.includes("csv") || ct.includes("json") || ct.includes("zip") ||
                      ct.includes("octet-stream") || ct.includes("xml") ||
                      /\.(csv|json|zip|xml)(\?|$)/i.test(link);

    if (ehArquivo && !urlEscolhida) {
      urlEscolhida    = link;
      formatoEsperado = ct;
    }
    // Preferir CSV/JSON sobre ZIP e dump
    if ((ct.includes("csv") || ct.includes("json")) && !link.includes("dump")) {
      urlEscolhida    = link;
      formatoEsperado = ct;
      break;
    }
  }

  if (bloqueadosHtml > 0 && !urlEscolhida) {
    console.log(`\n   ⚠ WAF/CDN detectado: ${bloqueadosHtml}/${todos.length} URLs retornaram HTTP 200 com text/html (0 bytes).`);
    console.log("   O portal Next.js está servindo o shell da aplicação para todas as requisições automáticas.");
    console.log("   A URL real do arquivo ZIP/CSV exige sessão de navegador para ser obtida.");
  }

  return { linksEncontrados: todos, urlEscolhida, formatoEsperado };
}

// ─── Resultado parcial padrão ─────────────────────────────────────────────────

function resultadoErro(
  urlEntrada: string,
  idx: number,
  tipoEntrada: ResultadoUrl["tipo_entrada"],
  erro: string,
  extras: Partial<ResultadoUrl> = {},
): ResultadoUrl {
  return {
    url_entrada: urlEntrada,
    label: `URL-${idx + 1}`,
    tipo_entrada: tipoEntrada,
    status_head: 0,
    content_type: "",
    aceita_range: false,
    formato: "ERRO",
    total_campos: 0,
    cabecalhos: [],
    deteccao: DETECCAO_VAZIA,
    amostra_linhas: [],
    amostra_ac: [],
    tem_dados_ac: false,
    tipo_dado: "indefinido",
    viabilidade: "BAIXA",
    observacoes: "",
    erro,
    ...extras,
  };
}

// ─── Inspeciona uma URL (arquivo direto ou página de recurso) ─────────────────

async function inspecionarUrl(urlEntrada: string, idx: number): Promise<ResultadoUrl> {
  const ehPaginaRecurso = /\/resource\/[0-9a-f-]{36}/i.test(urlEntrada);
  const tipoEntrada: ResultadoUrl["tipo_entrada"] = ehPaginaRecurso ? "pagina_recurso" : "arquivo_direto";

  console.log(`\n${"─".repeat(80)}`);
  console.log(`URL-${idx + 1} [${tipoEntrada}]`);
  console.log(`  ${urlEntrada}`);

  // ── Resolução de página de recurso ────────────────────────────────────────
  let urlDownload = urlEntrada;
  let linksEncontrados: string[] = [];

  if (ehPaginaRecurso) {
    const resolucao = await resolverPaginaRecurso(urlEntrada);
    linksEncontrados = resolucao.linksEncontrados;

    if (!resolucao.urlEscolhida) {
      const temCandidatos = linksEncontrados.length > 0;
      console.log(`\n  ⚠  ${temCandidatos ? `${linksEncontrados.length} URL(s) testadas mas todas bloqueadas pelo WAF (retornaram HTML).` : "Nenhum link de download encontrado na página."}`);
      console.log("\n  O portal opendatasus.saude.gov.br usa Next.js com WAF que bloqueia");
      console.log("  requisições automáticas — retorna HTTP 200 + HTML para todos os endpoints.");
      console.log("  A URL real do arquivo requer sessão de navegador autenticada.");
      console.log("\n  Para obter a URL de download:");
      console.log("    1. Abra a página no navegador:");
      console.log(`       ${urlEntrada}`);
      console.log('    2. Clique com botão direito no botão "Baixar" / "Download"');
      console.log('    3. Escolha "Copiar endereço do link" (NÃO clique — só copie o href)');
      console.log("    4. A URL será algo como:");
      console.log("       https://opendatasus.saude.gov.br/.../download/vacinas-2025-01.zip");
      console.log("    5. Cole essa URL (não a de recurso) em PNI_DIRECT_URLS no etl/.env");
      console.log("    6. Rode novamente: npm run pni:direto:inspecionar");
      const erro = temCandidatos
        ? `WAF bloqueou ${linksEncontrados.length} URLs candidatas (HTTP 200 + text/html). URL real do arquivo exige sessão de navegador.`
        : "Nenhum link de download extraído do HTML da página de recurso.";
      return resultadoErro(urlEntrada, idx, tipoEntrada, erro, { links_encontrados: linksEncontrados });
    }

    urlDownload = resolucao.urlEscolhida;
    console.log(`\n  URL de download selecionada: ${urlDownload}`);
    await sleep(RATE_LIMIT);
  }

  // ── HEAD na URL de download ───────────────────────────────────────────────
  console.log("  → HEAD...");
  const head = await fazerHead(urlDownload);
  console.log(`  HTTP ${head.status} | ${head.contentType || "(sem Content-Type)"} | ${head.tamanhoMb ?? "tamanho desconhecido"} | Range: ${head.aceitaRange ? "sim" : "não"}`);
  await sleep(RATE_LIMIT);

  if (head.status === 0) {
    return resultadoErro(urlEntrada, idx, tipoEntrada, "Timeout ou conexão recusada.", { url_download: urlDownload, links_encontrados: linksEncontrados });
  }
  if (head.status === 401 || head.status === 403) {
    return resultadoErro(urlEntrada, idx, tipoEntrada, `HTTP ${head.status} — acesso negado, recurso requer autenticação.`, { url_download: urlDownload, links_encontrados: linksEncontrados, status_head: head.status, content_type: head.contentType });
  }

  // ── Download da amostra (máx. 2 MB) ──────────────────────────────────────
  const BYTES_MAX = 2 * 1_048_576; // 2 MB
  console.log(`  → Baixando amostra (máx. ${(BYTES_MAX / 1_048_576).toFixed(0)} MB)...`);
  let bufferAmostra: Buffer;
  let truncado = false;

  try {
    const { buffer, truncado: t } = await lerBytesIniciais(urlDownload, BYTES_MAX);
    bufferAmostra = buffer;
    truncado = t;
    console.log(`  Bytes lidos: ${bufferAmostra.length.toLocaleString("pt-BR")} ${truncado ? "(truncado)" : "(completo)"}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`  ✗ Falha no download: ${msg}`);
    return resultadoErro(urlEntrada, idx, tipoEntrada, `Falha no download: ${msg}`, {
      url_download: urlDownload, links_encontrados: linksEncontrados,
      status_head: head.status, content_type: head.contentType,
      tamanho_mb: head.tamanhoMb, aceita_range: head.aceitaRange,
    });
  }

  await sleep(RATE_LIMIT);

  const formato = detectarFormato(head.contentType, bufferAmostra);
  console.log(`  Formato detectado: ${formato}`);

  // ── Processamento por formato ─────────────────────────────────────────────

  let cabecalhos: string[] = [];
  let amostraLinhas: string[] = [];
  let amostraAc: string[] = [];
  let separador: string | undefined;
  let csvDentroZip: string | undefined;
  const obsPartes: string[] = [];

  if (formato === "CSV") {
    const texto = bufferAmostra.toString("latin1");
    const csv = inspecionarCsvTexto(texto, SAMPLE_ROWS, UF);
    ({ cabecalhos, amostraLinhas, amostraAc, separador } = csv);
    console.log(`  Separador: "${separador === "\t" ? "TAB" : separador}" | Campos: ${cabecalhos.length}`);
    if (truncado) obsPartes.push("Arquivo truncado na leitura (>2 MB).");
  }

  if (formato === "JSON") {
    const texto = bufferAmostra.toString("utf-8");
    const json = inspecionarJsonTexto(texto, UF);
    ({ cabecalhos, amostraLinhas, amostraAc } = json);
    console.log(`  Campos JSON: ${cabecalhos.length}`);
    if (truncado) obsPartes.push("JSON truncado na leitura (>2 MB).");
  }

  if (formato === "ZIP") {
    console.log(`  Inspecionando estrutura ZIP (${bufferAmostra.length.toLocaleString("pt-BR")} bytes baixados)...`);
    const zip = await inspecionarZip(bufferAmostra);
    csvDentroZip = zip.arquivoNome || undefined;

    if (zip.erro) {
      console.log(`  ⚠ ZIP: ${zip.erro}`);
      obsPartes.push(`ZIP: ${zip.erro}`);

      if (!zip.cabecalhos.length) {
        // Formato ZIP mas não foi possível inspecionar o CSV interno
        return {
          url_entrada: urlEntrada, url_download: urlDownload,
          label: `URL-${idx + 1}`, tipo_entrada: tipoEntrada,
          links_encontrados: linksEncontrados,
          status_head: head.status, content_type: head.contentType,
          content_length: head.contentLength, tamanho_mb: head.tamanhoMb,
          aceita_range: head.aceitaRange,
          formato: "ZIP", csv_dentro_zip: csvDentroZip,
          total_campos: 0, cabecalhos: [], deteccao: DETECCAO_VAZIA,
          amostra_linhas: [], amostra_ac: [], tem_dados_ac: false,
          tipo_dado: "indefinido", viabilidade: "MEDIA",
          observacoes: obsPartes.join(" ") ||
            "ZIP confirmado. Não foi possível descomprimir amostra com buffer parcial. " +
            "Arquivo exige download completo para inspeção. " +
            "Tamanho total: " + (head.tamanhoMb ?? "desconhecido") + ".",
        };
      }
    }

    ({ cabecalhos, amostraLinhas, amostraAc, separador } = zip);
    console.log(`  CSV interno: "${csvDentroZip}" | Separador: "${separador === "\t" ? "TAB" : separador}" | Campos: ${cabecalhos.length}`);
    obsPartes.push(`Arquivo ZIP contendo CSV: "${csvDentroZip}".`);
  }

  if (formato === "HTML") {
    obsPartes.push("Download retornou HTML — possível WAF/redirecionamento. Tentar URL alternativa.");
    return {
      url_entrada: urlEntrada, url_download: urlDownload,
      label: `URL-${idx + 1}`, tipo_entrada: tipoEntrada,
      links_encontrados: linksEncontrados,
      status_head: head.status, content_type: head.contentType,
      aceita_range: false, formato: "HTML",
      total_campos: 0, cabecalhos: [], deteccao: DETECCAO_VAZIA,
      amostra_linhas: [], amostra_ac: [], tem_dados_ac: false,
      tipo_dado: "indefinido", viabilidade: "BAIXA",
      observacoes: obsPartes.join(" "),
    };
  }

  if (formato === "PDF") {
    return {
      url_entrada: urlEntrada, url_download: urlDownload,
      label: `URL-${idx + 1}`, tipo_entrada: tipoEntrada,
      links_encontrados: linksEncontrados,
      status_head: head.status, content_type: head.contentType,
      tamanho_mb: head.tamanhoMb, aceita_range: head.aceitaRange,
      formato: "PDF", total_campos: 0, cabecalhos: [], deteccao: DETECCAO_VAZIA,
      amostra_linhas: [], amostra_ac: [], tem_dados_ac: false,
      tipo_dado: "indefinido", viabilidade: "BAIXA",
      observacoes: "Dicionário de variáveis em PDF — consulta manual.",
    };
  }

  // ── Detecção de campos e viabilidade ─────────────────────────────────────
  const deteccao   = detectarCampos(cabecalhos);
  const temDadosAc = amostraAc.length > 0;
  const tipoDado   = determinarTipoDado(deteccao);
  const viabilidade = calcularViabilidade(formato, deteccao);

  console.log(`  UF detectado     : ${deteccao.tem_uf ? "✓ " + deteccao.campos_uf.join(", ") : "✗"}`);
  console.log(`  IBGE/município   : ${deteccao.tem_ibge ? "✓ " + deteccao.campos_ibge.join(", ") : "✗"}`);
  console.log(`  Data vacinação   : ${deteccao.tem_data ? "✓ " + deteccao.campos_data.join(", ") : "✗"}`);
  console.log(`  Imunobiológico   : ${deteccao.tem_imunobio ? "✓ " + deteccao.campos_vacina.join(", ") : "✗"}`);
  console.log(`  Tipo de dado     : ${tipoDado}`);
  console.log(`  Dados UF=${UF}     : ${temDadosAc ? `✓ ${amostraAc.length} linha(s) na amostra` : "✗ nenhuma linha filtrada"}`);
  console.log(`  Viabilidade      : ${viabilidade}`);

  if (!deteccao.tem_uf && !deteccao.tem_ibge) obsPartes.push("Sem campo de UF/IBGE detectado — filtro geográfico não confirmado.");
  if (!deteccao.tem_imunobio) obsPartes.push("Campo de imunobiológico não identificado — verificar dicionário de variáveis.");
  if (tipoDado === "doses_aplicadas") obsPartes.push("Dados de doses aplicadas (registros individuais). Para cobertura %, cruzar com pop.-alvo IBGE/SIGTAP.");
  if (tipoDado === "cobertura_percentual") obsPartes.push("Dados de cobertura percentual já calculada — denominador incluído.");

  return {
    url_entrada: urlEntrada, url_download: urlDownload,
    label: `URL-${idx + 1}`, tipo_entrada: tipoEntrada,
    links_encontrados: linksEncontrados,
    status_head: head.status, content_type: head.contentType,
    content_length: head.contentLength, tamanho_mb: head.tamanhoMb,
    aceita_range: head.aceitaRange,
    formato, csv_dentro_zip: csvDentroZip, separador,
    total_campos: cabecalhos.length, cabecalhos, deteccao,
    amostra_linhas: amostraLinhas, amostra_ac: amostraAc,
    tem_dados_ac: temDadosAc, tipo_dado: tipoDado, viabilidade,
    observacoes: obsPartes.join(" ") || "Sem observações adicionais.",
  };
}

// ─── Relatório final ──────────────────────────────────────────────────────────

function imprimirRelatorio(resultados: ResultadoUrl[]) {
  const SEP = "═".repeat(100);
  const sep = "─".repeat(100);

  console.log("\n" + SEP);
  console.log("RELATÓRIO — INSPEÇÃO PNI POR URLs DIRETAS / PÁGINAS DE RECURSO");
  console.log(`UF: ${UF} | Amostra: ${SAMPLE_ROWS} linhas | URLs testadas: ${resultados.length}`);
  console.log(SEP);

  for (const r of resultados) {
    const icon = r.viabilidade === "ALTA" ? "✓" : r.viabilidade === "MEDIA" ? "~" : "✗";
    console.log(`\n[${icon} ${r.viabilidade}] ${r.label} [${r.tipo_entrada}]`);
    console.log(`  URL entrada    : ${r.url_entrada}`);
    if (r.url_download && r.url_download !== r.url_entrada)
      console.log(`  URL download   : ${r.url_download}`);
    if (r.links_encontrados?.length)
      console.log(`  Links extraídos: ${r.links_encontrados.length}`);
    console.log(`  Status HEAD    : ${r.status_head}`);
    console.log(`  Content-Type   : ${r.content_type || "(não informado)"}`);
    console.log(`  Tamanho        : ${r.tamanho_mb ?? "desconhecido"}`);
    console.log(`  Accept-Ranges  : ${r.aceita_range ? "sim" : "não"}`);
    console.log(`  Formato        : ${r.formato}${r.csv_dentro_zip ? ` → CSV interno: "${r.csv_dentro_zip}"` : ""}${r.separador ? ` (sep: "${r.separador === "\t" ? "TAB" : r.separador}")` : ""}`);
    console.log(`  Campos totais  : ${r.total_campos}`);

    if (r.erro) { console.log(`  Erro           : ${r.erro}`); continue; }

    if (r.cabecalhos.length > 0) {
      console.log(`\n  Campos (${r.cabecalhos.length}):`);
      for (let i = 0; i < r.cabecalhos.length; i += 5)
        console.log("    " + r.cabecalhos.slice(i, i + 5).join(" | "));
    }

    const checks: [string, boolean, string[]][] = [
      ["UF",               r.deteccao.tem_uf,        r.deteccao.campos_uf],
      ["Município",        r.deteccao.tem_municipio, []],
      ["Código IBGE",      r.deteccao.tem_ibge,      r.deteccao.campos_ibge],
      ["Data vacinação",   r.deteccao.tem_data,      r.deteccao.campos_data],
      ["Ano",              r.deteccao.tem_ano,       []],
      ["Mês",              r.deteccao.tem_mes,       []],
      ["Imunobiológico",   r.deteccao.tem_imunobio,  r.deteccao.campos_vacina],
      ["Dose",             r.deteccao.tem_dose,      []],
      ["Grupo/Estratégia", r.deteccao.tem_grupo,     []],
      ["Idade/Nasc.",      r.deteccao.tem_idade,     []],
      ["CNES",             r.deteccao.tem_cnes,      []],
      ["Cobertura (%)",    r.deteccao.tem_cobertura, []],
      ["Pop. alvo",        r.deteccao.tem_populacao, []],
    ];
    console.log("\n  Campos-chave:");
    for (const [lbl, ok, cols] of checks)
      console.log(`    ${ok ? "✓" : "✗"} ${lbl}${cols.length ? " → " + cols.join(", ") : ""}`);

    console.log(`\n  Tipo de dado   : ${r.tipo_dado}`);
    console.log(`  Dados UF=${UF}   : ${r.tem_dados_ac ? `✓ ${r.amostra_ac.length} linha(s)` : "✗ não encontrado na amostra"}`);

    if (r.amostra_linhas.length > 0) {
      console.log("\n  Amostra (primeiras linhas de dados):");
      for (const l of r.amostra_linhas.slice(0, 3))
        console.log("    " + l.slice(0, 180));
    }
    if (r.amostra_ac.length > 0) {
      console.log(`\n  Amostra UF=${UF}:`);
      for (const l of r.amostra_ac.slice(0, 3))
        console.log("    " + l.slice(0, 180));
    }
    console.log(`\n  Observações    : ${r.observacoes}`);
  }

  console.log("\n" + sep);
  console.log("RESUMO");
  console.log(sep);

  const alta  = resultados.filter((r) => r.viabilidade === "ALTA");
  const media = resultados.filter((r) => r.viabilidade === "MEDIA");
  const baixa = resultados.filter((r) => r.viabilidade === "BAIXA");
  const comAc = resultados.filter((r) => r.tem_dados_ac);
  const tipos  = [...new Set(resultados.map((r) => r.tipo_dado).filter((t) => t !== "indefinido"))];

  console.log(`  URLs testadas          : ${resultados.length}`);
  console.log(`  Viabilidade ALTA       : ${alta.length}`);
  console.log(`  Viabilidade MÉDIA      : ${media.length}`);
  console.log(`  Viabilidade BAIXA      : ${baixa.length}`);
  console.log(`  URLs com dados UF=${UF}  : ${comAc.length}`);
  if (tipos.length) console.log(`  Tipos de dado          : ${tipos.join(", ")}`);

  if (alta.length > 0) {
    const melhor = alta[0];
    console.log("\n  ► RECOMENDAÇÃO: Viabilidade ALTA detectada.");
    console.log(`    URL recomendada : ${melhor.url_download ?? melhor.url_entrada}`);
    console.log(`    Formato         : ${melhor.formato}${melhor.csv_dentro_zip ? ` (CSV interno: ${melhor.csv_dentro_zip})` : ""}`);
    console.log(`    Tipo de dado    : ${melhor.tipo_dado}`);
    console.log("\n  Próximos passos:");
    console.log("    1. Criar tabela raw.pni_doses_raw no PostgreSQL");
    console.log("    2. Criar job pni-full-postgres.ts (carga incremental por mês/UF)");
    console.log("    3. Criar mart.vacinacao_municipio");
    if (melhor.tipo_dado === "doses_aplicadas")
      console.log("    4. Cruzar com pop.-alvo para cobertura percentual (etapa futura)");
  } else if (media.length > 0) {
    console.log("\n  ► RECOMENDAÇÃO: Viabilidade MÉDIA — dados acessíveis mas exigem pré-processamento.");
    if (media.some((r) => r.formato === "ZIP"))
      console.log("    ZIP detectado: download completo necessário para ETL. Avaliar tamanho vs. estratégia de carga.");
    console.log("    Validar campos manualmente antes de criar o ETL completo.");
  } else {
    console.log("\n  ► RECOMENDAÇÃO: Viabilidade BAIXA.");
    console.log("    - Verificar URLs no portal e atualizar PNI_DIRECT_URLS");
    console.log("    - Tentar URL da página de recurso: /dataset/.../resource/{uuid}");
    console.log("    - Alternativa: SIPNI/TABNET para cobertura consolidada");
  }

  console.log("\n" + SEP);
}

// ─── Ponto de entrada ─────────────────────────────────────────────────────────

async function main() {
  console.log("[pni:direto:inspecionar] Inspeção PNI — URLs diretas e páginas de recurso");
  console.log(`  UF          : ${UF}`);
  console.log(`  Amostra     : ${SAMPLE_ROWS} linhas`);
  console.log(`  Timeout     : ${TIMEOUT_MS}ms | Rate limit: ${RATE_LIMIT}ms`);
  console.log(`  URLs        : ${DIRECT_URLS.length}`);
  for (const u of DIRECT_URLS) console.log(`    - ${u}`);

  if (DIRECT_URLS.length === 0) {
    console.log("\n⚠  Nenhuma URL configurada em PNI_DIRECT_URLS.");
    console.log("\n   Formatos aceitos:");
    console.log("   A) URL direta de arquivo:");
    console.log("      PNI_DIRECT_URLS=https://opendatasus.saude.gov.br/.../download/jan2025.csv");
    console.log("\n   B) URL de página de recurso (o job extrai o link de download automaticamente):");
    console.log("      PNI_DIRECT_URLS=https://opendatasus.saude.gov.br/dataset/.../resource/{uuid}");
    console.log("\n   Como obter as URLs:");
    console.log("   1. Acesse: https://opendatasus.saude.gov.br/dataset/doses-aplicadas-pelo-programa-de-nacional-de-imunizacoes-pni-2025");
    console.log("   2. Clique em um recurso mensal (ex: Vacinacao - Janeiro 2025 CSV)");
    console.log("   3. Copie a URL da página de recurso que aparece na barra de endereços");
    console.log("      ex: https://opendatasus.saude.gov.br/dataset/doses-aplicadas-pelo-programa-de-nacional-de-imunizacoes-pni-2025/resource/e40da42c-...");
    console.log("   4. Cole em PNI_DIRECT_URLS no arquivo etl/.env");
    process.exit(0);
  }

  const resultados: ResultadoUrl[] = [];
  for (let i = 0; i < DIRECT_URLS.length; i++) {
    try {
      resultados.push(await inspecionarUrl(DIRECT_URLS[i], i));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  ✗ Erro inesperado na URL ${i + 1}: ${msg}`);
      resultados.push(resultadoErro(DIRECT_URLS[i], i, "arquivo_direto", msg));
    }
    if (i < DIRECT_URLS.length - 1) await sleep(RATE_LIMIT);
  }

  imprimirRelatorio(resultados);
}

main().catch((err) => {
  console.error("[pni:direto:inspecionar] Erro fatal:", (err as Error).message);
  process.exit(1);
});
