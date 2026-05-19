/**
 * siope-rreo-anexo8-diagnosticar-parametros.ts
 *
 * Fase 16C.1 — Diagnóstico dos parâmetros da API SICONFI para RREO Anexo 8 / MDE.
 *
 * Por que existe: a Fase 16C carregou zero registros com
 * (exercicio∈{2024,2023,2022}, nr_periodo=6, no_anexo="RREO-Anexo 08").
 * Este job sonda combinações reais — exercícios prioritários 2026/2025,
 * todos os períodos do mais recente para o mais antigo, dois tipos de
 * demonstrativo, três variantes de esfera e múltiplas grafias de anexo —
 * e imprime PARÂMETROS RECOMENDADOS + PATCH SUGERIDO + DECISÃO PARA 16C.2.
 *
 * NÃO persiste dados, NÃO mexe em migration/DW/mart/frontend/Aquiry.
 *
 * Variáveis de ambiente:
 *   SICONFI_API_BASE_URL  — base da API (padrão: https://apidatalake.tesouro.gov.br/ords/siconfi/tt)
 *   SICONFI_TIMEOUT_MS    — timeout por requisição (padrão: 30000)
 *   SICONFI_RATE_LIMIT_MS — pausa entre requisições (padrão: 1100)
 *
 * Uso: cd etl && npx ts-node jobs/siope-rreo-anexo8-diagnosticar-parametros.ts
 */

import "dotenv/config";

const BASE_URL   = (process.env.SICONFI_API_BASE_URL || "https://apidatalake.tesouro.gov.br/ords/siconfi/tt").replace(/\/$/, "");
const TIMEOUT_MS = parseInt(process.env.SICONFI_TIMEOUT_MS    || "30000", 10);
const RATE_LIMIT = parseInt(process.env.SICONFI_RATE_LIMIT_MS || "1100",  10);

// Priorização cronológica imposta pelo Varadouro:
// 2026/2025 primeiro; 2024 só como fallback técnico.
const EXERCICIOS_PRIORITARIOS = [2026, 2025];
const EXERCICIO_FALLBACK      = 2024;

const PERIODOS_DESC = [6, 5, 4, 3, 2, 1];

const TIPOS_DEMONSTRATIVO = ["RREO", "RREO Simplificado"];

const ANEXO_PRESUMIDO = "RREO-Anexo 08";

// Palavras-chave para selecionar anexos relevantes em /anexos-relatorios
const KEYWORDS_EDUCACAO = [
  /\b8\b/i, /\bVIII\b/i, /\b08\b/,
  /educ/i, /\bMDE\b/i, /ensino/i,
  /manuten[çc][ãa]o.*desenvolvimento.*ensino/i,
  /receitas?.*despesas?.*manuten/i,
];

interface EnteAlvo {
  id_ente: number;
  no_ente: string;
  esfera_real: "E" | "M";
  porte: "estado" | "capital" | "media" | "pequena";
}

const ENTES: EnteAlvo[] = [
  { id_ente: 12,      no_ente: "Governo do Estado do Acre", esfera_real: "E", porte: "estado"   },
  { id_ente: 1200401, no_ente: "Rio Branco",                esfera_real: "M", porte: "capital"  },
  { id_ente: 1200203, no_ente: "Cruzeiro do Sul",           esfera_real: "M", porte: "media"    },
  { id_ente: 1200500, no_ente: "Sena Madureira",            esfera_real: "M", porte: "media"    },
  { id_ente: 1200328, no_ente: "Jordão",                    esfera_real: "M", porte: "pequena"  }, // município pequeno
];

interface ProbeParams {
  an_exercicio: number;
  nr_periodo: number;
  id_ente: number;
  co_tipo_demonstrativo: string;
  co_esfera?: "M" | "E";
  no_anexo?: string;
}

interface ProbeResult {
  url: string;
  status: number;
  ok: boolean;
  itens: number;
  primeiro_no_anexo: string | null;
  no_anexos_distintos: string[];
  colunas_distintas: string[];
  contas_amostra: string[];
  erro: string | null;
  params: ProbeParams;
}

interface AnexoCatalogo {
  no_anexo?: string;
  co_anexo?: string;
  co_tipo_demonstrativo?: string;
  no_tipo_demonstrativo?: string;
  [k: string]: unknown;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function buildUrl(path: string, params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.append(k, String(v));
  }
  const qs = sp.toString();
  return `${BASE_URL}${path}${qs ? "?" + qs : ""}`;
}

async function getJson<T>(url: string): Promise<{ ok: boolean; status: number; data: T | null; erro: string | null }> {
  try {
    const resp = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Varadouro-Digital-ETL/1.0 (TCE-AC; SIOPE diag 16C.1)" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!resp.ok) {
      let body = "";
      try { body = (await resp.text()).slice(0, 200); } catch { /* ignore */ }
      return { ok: false, status: resp.status, data: null, erro: body || resp.statusText };
    }
    const data = (await resp.json()) as T;
    return { ok: true, status: resp.status, data, erro: null };
  } catch (err) {
    return { ok: false, status: 0, data: null, erro: (err as Error).message };
  }
}

// ---------------------------------------------------------------------------
// 1) /anexos-relatorios — catálogo
// ---------------------------------------------------------------------------

interface RespostaAnexos {
  items: AnexoCatalogo[];
  hasMore?: boolean;
}

async function consultarAnexosRelatorios(): Promise<AnexoCatalogo[]> {
  console.log("\n══════ 1. Catálogo /anexos-relatorios ══════");
  const url = buildUrl("/anexos-relatorios", {});
  const r = await getJson<RespostaAnexos>(url);
  console.log(`  GET ${url}`);
  console.log(`  HTTP ${r.status}  ${r.ok ? "OK" : "FALHA"}`);
  if (!r.ok || !r.data?.items) {
    console.log(`  Erro: ${r.erro ?? "sem corpo"}`);
    return [];
  }
  const itens = r.data.items;
  console.log(`  Total de anexos catalogados: ${itens.length}`);

  // Filtra por palavras-chave de educação/Anexo 8
  const relevantes = itens.filter((a) => {
    const texto = `${a.no_anexo ?? ""} ${a.co_anexo ?? ""} ${a.no_tipo_demonstrativo ?? ""} ${a.co_tipo_demonstrativo ?? ""}`;
    return KEYWORDS_EDUCACAO.some((rx) => rx.test(texto));
  });
  console.log(`  Anexos relevantes para Educação/Anexo 8 (${relevantes.length}):`);
  for (const a of relevantes) {
    console.log(`    [${a.co_tipo_demonstrativo ?? "?"}/${a.co_anexo ?? "?"}] ${a.no_anexo ?? "(sem nome)"}`);
  }
  return relevantes;
}

// ---------------------------------------------------------------------------
// 2) Sonda /rreo
// ---------------------------------------------------------------------------

interface RreoResposta {
  items: Array<{
    anexo?: string;
    coluna?: string;
    conta?: string;
    cod_conta?: string;
    demonstrativo?: string;
    esfera?: string;
    [k: string]: unknown;
  }>;
  hasMore?: boolean;
  count?: number;
}

async function sondarRreo(p: ProbeParams): Promise<ProbeResult> {
  const url = buildUrl("/rreo", {
    an_exercicio:          p.an_exercicio,
    nr_periodo:            p.nr_periodo,
    co_tipo_demonstrativo: p.co_tipo_demonstrativo,
    id_ente:               p.id_ente,
    co_esfera:             p.co_esfera,
    no_anexo:              p.no_anexo,
    limit:                 200,
  });
  const r = await getJson<RreoResposta>(url);
  await sleep(RATE_LIMIT);

  const items = r.data?.items ?? [];
  const anexos = [...new Set(items.map((i) => i.anexo).filter((x): x is string => !!x))];
  const colunas = [...new Set(items.map((i) => i.coluna).filter((x): x is string => !!x))];
  const contas = items.slice(0, 5).map((i) => i.conta ?? i.cod_conta ?? "?");

  return {
    url, status: r.status, ok: r.ok, itens: items.length,
    primeiro_no_anexo: anexos[0] ?? null,
    no_anexos_distintos: anexos,
    colunas_distintas: colunas,
    contas_amostra: contas,
    erro: r.erro, params: p,
  };
}

function logProbe(r: ProbeResult, prefixo = "    ") {
  const flag = r.itens > 0 ? "✓" : r.ok ? "·" : "✗";
  const q = new URL(r.url).searchParams;
  const compact =
    `ex=${q.get("an_exercicio")} p=${q.get("nr_periodo")} tipo="${q.get("co_tipo_demonstrativo")}"` +
    (q.get("co_esfera") ? ` esf=${q.get("co_esfera")}` : " esf=∅") +
    (q.get("no_anexo")  ? ` anexo="${q.get("no_anexo")}"`  : " anexo=∅");
  console.log(`${prefixo}${flag} HTTP ${r.status}  items=${r.itens}  ${compact}`);
  if (r.itens > 0) {
    if (r.no_anexos_distintos.length) console.log(`${prefixo}    anexos no payload: ${r.no_anexos_distintos.slice(0, 4).join(" | ")}`);
    if (r.colunas_distintas.length)   console.log(`${prefixo}    colunas: ${r.colunas_distintas.slice(0, 4).join(" | ")}`);
    if (r.contas_amostra.length)      console.log(`${prefixo}    contas: ${r.contas_amostra.slice(0, 3).map((c) => c.slice(0, 60)).join(" | ")}`);
  } else if (!r.ok && r.erro) {
    console.log(`${prefixo}    erro: ${r.erro.slice(0, 120)}`);
  }
}

// ---------------------------------------------------------------------------
// 3) Estratégia por ente: encontrar primeiro hit com early-stop
// ---------------------------------------------------------------------------

interface HitEnte {
  ente: EnteAlvo;
  exercicio: number;
  periodo: number;
  tipo: string;
  esfera_usada: "M" | "E" | null;
  anexos_observados: string[];
  todas_sondas: ProbeResult[];
}

async function sondarEnteCompleto(ente: EnteAlvo, exerciciosOrdenados: number[]): Promise<HitEnte | null> {
  console.log(`\n  ▸ ${ente.no_ente} (id_ente=${ente.id_ente}, porte=${ente.porte})`);
  const todas: ProbeResult[] = [];

  for (const exercicio of exerciciosOrdenados) {
    // Estratégia: sem no_anexo, sem co_esfera, tipo RREO, varia período do mais novo p/ mais antigo.
    for (const periodo of PERIODOS_DESC) {
      const r = await sondarRreo({
        an_exercicio: exercicio, nr_periodo: periodo, id_ente: ente.id_ente,
        co_tipo_demonstrativo: "RREO",
      });
      todas.push(r);
      logProbe(r);
      if (r.itens > 0) {
        return { ente, exercicio, periodo, tipo: "RREO", esfera_usada: null,
                 anexos_observados: r.no_anexos_distintos, todas_sondas: todas };
      }
    }

    // Sem hit com RREO puro: tenta RREO Simplificado (típico de municípios pequenos) no período mais recente.
    const rSimpl = await sondarRreo({
      an_exercicio: exercicio, nr_periodo: 6, id_ente: ente.id_ente,
      co_tipo_demonstrativo: "RREO Simplificado",
    });
    todas.push(rSimpl);
    logProbe(rSimpl);
    if (rSimpl.itens > 0) {
      return { ente, exercicio, periodo: 6, tipo: "RREO Simplificado", esfera_usada: null,
               anexos_observados: rSimpl.no_anexos_distintos, todas_sondas: todas };
    }

    // Sem hit ainda: tenta com co_esfera explícita (alguns clientes alegam que muda o roteamento).
    const esferaTest: "M" | "E" = ente.esfera_real;
    const rEsf = await sondarRreo({
      an_exercicio: exercicio, nr_periodo: 6, id_ente: ente.id_ente,
      co_tipo_demonstrativo: "RREO", co_esfera: esferaTest,
    });
    todas.push(rEsf);
    logProbe(rEsf);
    if (rEsf.itens > 0) {
      return { ente, exercicio, periodo: 6, tipo: "RREO", esfera_usada: esferaTest,
               anexos_observados: rEsf.no_anexos_distintos, todas_sondas: todas };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// 4) Confirmação: testar filtro literal por no_anexo
// ---------------------------------------------------------------------------

async function confirmarFiltroAnexo(
  hit: HitEnte, anexosCandidatos: string[],
): Promise<{ anexoQueFunciona: string | null; tentativas: ProbeResult[] }> {
  if (!anexosCandidatos.length) return { anexoQueFunciona: null, tentativas: [] };
  console.log(`\n    ── Confirmando filtro no_anexo para ${hit.ente.no_ente} (${hit.exercicio}/${hit.periodo}/${hit.tipo}) ──`);
  const tentativas: ProbeResult[] = [];
  for (const noAnexo of anexosCandidatos.slice(0, 3)) {
    const r = await sondarRreo({
      an_exercicio: hit.exercicio, nr_periodo: hit.periodo, id_ente: hit.ente.id_ente,
      co_tipo_demonstrativo: hit.tipo, co_esfera: hit.esfera_usada ?? undefined,
      no_anexo: noAnexo,
    });
    tentativas.push(r);
    logProbe(r);
    if (r.itens > 0) return { anexoQueFunciona: noAnexo, tentativas };
  }
  return { anexoQueFunciona: null, tentativas };
}

// ---------------------------------------------------------------------------
// 5) Síntese e recomendação
// ---------------------------------------------------------------------------

function escolherAnexosEducacao(observados: string[], catalogo: AnexoCatalogo[]): string[] {
  const set = new Set<string>();
  for (const a of observados) {
    if (KEYWORDS_EDUCACAO.some((rx) => rx.test(a))) set.add(a);
  }
  // Inclui o nome presumido e os relevantes do catálogo, sem duplicar.
  set.add(ANEXO_PRESUMIDO);
  for (const a of catalogo) if (a.no_anexo) set.add(a.no_anexo);
  return [...set];
}

interface Recomendacoes {
  exercicio_prioritario_atual: number | null;
  exercicio_prioritario_anterior: number | null;
  exercicio_fallback: number;
  periodo_mais_recente_com_dados_por_exercicio: Record<number, number | null>;
  co_tipo_demonstrativo_estado: string;
  co_tipo_demonstrativo_municipio: string;
  co_esfera_estado: "E" | null;
  co_esfera_municipio: "M" | null;
  no_anexo_exato: string | null;
  aplicar_filtro_no_anexo_na_api: boolean;
  aplicar_filtro_no_anexo_localmente: boolean;
  usar_exercicio_fallback_apenas_se_atual_e_anterior_estiverem_sem_dados: boolean;
}

function imprimirRecomendacoes(rec: Recomendacoes) {
  console.log("\n══════════════════════ PARÂMETROS RECOMENDADOS ══════════════════════");
  for (const [k, v] of Object.entries(rec)) {
    const val = typeof v === "object" ? JSON.stringify(v) : String(v);
    console.log(`  ${k.padEnd(60)} ${val}`);
  }
}

function imprimirPatch(rec: Recomendacoes) {
  console.log("\n══════════════════════════ PATCH SUGERIDO ═══════════════════════════");
  console.log("  Arquivo: etl/jobs/siope-rreo-anexo8-incremental-postgres.ts");
  console.log();

  const anoAtual = new Date().getFullYear();
  console.log("  1) Constantes de exercício/período — usar anos correntes por padrão:");
  console.log(`     const ANO_ATUAL = new Date().getFullYear();   // hoje = ${anoAtual}`);
  console.log("     const EXERCICIOS = (process.env.SIOPE_EXERCICIOS");
  console.log("         || `${ANO_ATUAL},${ANO_ATUAL - 1}`)");
  console.log("       .split(\",\").map((s) => parseInt(s.trim(), 10)).filter(Number.isFinite);");
  console.log("     const PERIODOS = (process.env.SIOPE_PERIODOS || \"6,5,4,3,2,1\")");
  console.log("       .split(\",\").map((s) => parseInt(s.trim(), 10)).filter(Number.isFinite);");
  console.log();

  console.log("  2) Tipo de demonstrativo por ente (Estado vs Município):");
  console.log(`     const TIPO_ESTADO    = ${JSON.stringify(rec.co_tipo_demonstrativo_estado)};`);
  console.log(`     const TIPO_MUNICIPIO = ${JSON.stringify(rec.co_tipo_demonstrativo_municipio)};`);
  console.log("     // dentro de carregarEnte:");
  console.log("     const tipo = alvo.esfera === \"E\" ? TIPO_ESTADO : TIPO_MUNICIPIO;");
  console.log("     // se TIPO_MUNICIPIO falhar para um município, tentar fallback para \"RREO Simplificado\".");
  console.log();

  const enviarEsfera = (rec.co_esfera_estado !== null) || (rec.co_esfera_municipio !== null);
  console.log("  3) co_esfera:");
  if (enviarEsfera) {
    console.log(`     Enviar co_esfera (Estado=${rec.co_esfera_estado ?? "omitir"}, Município=${rec.co_esfera_municipio ?? "omitir"}).`);
  } else {
    console.log("     OMITIR co_esfera — a API filtra demais quando presente.");
    console.log("     Em fetchRreoAnexo8Page(), NÃO inclua co_esfera na URL.");
  }
  console.log();

  console.log("  4) no_anexo:");
  if (rec.aplicar_filtro_no_anexo_na_api && rec.no_anexo_exato) {
    console.log(`     Enviar no_anexo=${JSON.stringify(rec.no_anexo_exato)} na chamada à API.`);
    console.log("     (atualizar a constante ANEXO no topo do incremental).");
  } else {
    console.log("     NÃO enviar no_anexo na URL — a API ignora ou retorna vazio.");
    console.log("     Em vez disso, consultar /rreo sem no_anexo e FILTRAR LOCALMENTE:");
    console.log("       if (item.anexo && /(anexo\\s*0?8|VIII|MDE|manuten[çc][ãa]o.*desenvolvimento.*ensino)/i.test(item.anexo)) { ...persistir... }");
    console.log("     A coluna no_anexo da raw passa a vir do payload, não do parâmetro de consulta.");
  }
  console.log();

  console.log("  5) Ordem de tentativa de exercício/período (anti-vazio):");
  console.log("     for (const exercicio of EXERCICIOS) {");
  console.log("       for (const periodo of PERIODOS) { /* 6→1 */");
  console.log("         const r = await carregarEnte(exercicio, periodo, alvo);");
  console.log("         if (r.registros_recebidos > 0) break;  // achou esse exercício, próximo");
  console.log("       }");
  console.log("     }");
  console.log("     // Só descer ao EXERCICIO_FALLBACK (2024) se nenhum dos prioritários retornou dado.");
  console.log();

  console.log("  6) Rastreabilidade — manter fonte = \"SICONFI_RREO_ANEXO8\".");
  console.log("     Mesmo quando o filtro de anexo for local, gravar em raw com fonte fixa.");
  console.log("     Adicionar coluna informativa em log: anexo_filtrado_localmente=true|false.");
}

function decisaoFase16C2(
  hits: Map<number, HitEnte>, recs: Recomendacoes,
): "CORRIGIR_INCREMENTAL" | "AJUSTAR_DIAGNOSTICO" | "BUSCAR_FONTE_COMPLEMENTAR" {
  const totalHits = hits.size;
  if (totalHits === 0) return "BUSCAR_FONTE_COMPLEMENTAR";
  // Se temos hit em ente Estado E Município, e algum exercício prioritário trouxe dados, recomendamos corrigir.
  const temEstado    = [...hits.values()].some((h) => h.ente.esfera_real === "E");
  const temMunicipio = [...hits.values()].some((h) => h.ente.esfera_real === "M");
  const algumPrioritario = !!recs.exercicio_prioritario_atual || !!recs.exercicio_prioritario_anterior;
  if (temEstado && temMunicipio && algumPrioritario) return "CORRIGIR_INCREMENTAL";
  return "AJUSTAR_DIAGNOSTICO";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("════════════════════════════════════════════════════════════════════════");
  console.log("  Fase 16C.1 — Diagnóstico de parâmetros SICONFI RREO Anexo 8 / MDE");
  console.log(`  Base API   : ${BASE_URL}`);
  console.log(`  Exercícios : prioritários=${EXERCICIOS_PRIORITARIOS.join(",")} | fallback=${EXERCICIO_FALLBACK}`);
  console.log(`  Períodos   : ${PERIODOS_DESC.join(",")}  (do mais recente p/ o mais antigo)`);
  console.log(`  Tipos      : ${TIPOS_DEMONSTRATIVO.join(" | ")}`);
  console.log(`  Rate limit : ${RATE_LIMIT}ms`);
  console.log("════════════════════════════════════════════════════════════════════════");

  // ── 1. Catálogo de anexos ──
  const catalogoAnexos = await consultarAnexosRelatorios();
  await sleep(RATE_LIMIT);

  // ── 2. Sondagem por ente, exercícios prioritários primeiro ──
  console.log("\n══════ 2. Sondagem /rreo por ente ══════");
  const hits = new Map<number, HitEnte>();   // id_ente -> primeiro hit
  const usouFallback = new Set<number>();

  for (const ente of ENTES) {
    let hit = await sondarEnteCompleto(ente, EXERCICIOS_PRIORITARIOS);
    if (!hit) {
      console.log(`    (sem dados em ${EXERCICIOS_PRIORITARIOS.join("/")} — tentando fallback ${EXERCICIO_FALLBACK})`);
      hit = await sondarEnteCompleto(ente, [EXERCICIO_FALLBACK]);
      if (hit) usouFallback.add(ente.id_ente);
    }
    if (hit) {
      hits.set(ente.id_ente, hit);
      console.log(`    ✓ hit: exercicio=${hit.exercicio} periodo=${hit.periodo} tipo="${hit.tipo}"` +
                  ` esfera=${hit.esfera_usada ?? "∅"}  anexos=${hit.anexos_observados.length}`);
    } else {
      console.log(`    ✗ NENHUM dado para ${ente.no_ente} em nenhum exercício/período.`);
    }
  }

  // ── 3. Confirmação de filtro no_anexo ──
  console.log("\n══════ 3. Confirmando comportamento do filtro no_anexo ══════");
  const anexoFunciona = new Map<number, string | null>();
  for (const hit of hits.values()) {
    const candidatos = escolherAnexosEducacao(hit.anexos_observados, catalogoAnexos);
    const { anexoQueFunciona } = await confirmarFiltroAnexo(hit, candidatos);
    anexoFunciona.set(hit.ente.id_ente, anexoQueFunciona);
  }

  // ── 4. Síntese ──
  console.log("\n══════ 4. Síntese ══════");
  const exerciciosComDado = new Set<number>();
  const periodosPorExercicio: Record<number, number | null> = {};
  for (const hit of hits.values()) {
    exerciciosComDado.add(hit.exercicio);
    const atual = periodosPorExercicio[hit.exercicio];
    if (atual === undefined || (atual !== null && hit.periodo > atual)) {
      periodosPorExercicio[hit.exercicio] = hit.periodo;
    }
  }
  for (const ano of [...EXERCICIOS_PRIORITARIOS, EXERCICIO_FALLBACK]) {
    if (!(ano in periodosPorExercicio)) periodosPorExercicio[ano] = null;
  }

  const hitsEstado    = [...hits.values()].filter((h) => h.ente.esfera_real === "E");
  const hitsMunicipio = [...hits.values()].filter((h) => h.ente.esfera_real === "M");

  const tipoEstado    = hitsEstado[0]?.tipo    ?? "RREO";
  const tipoMunicipio = hitsMunicipio[0]?.tipo ?? "RREO";

  const esferaEstadoEnviada    = hitsEstado.some((h) => h.esfera_usada === "E")    ? "E" : null;
  const esferaMunicipioEnviada = hitsMunicipio.some((h) => h.esfera_usada === "M") ? "M" : null;

  // Anexo exato: prefere o que funcionou em filtro literal; senão, o nome do payload que casa com educação.
  const anexosFiltroQueFuncionou = [...anexoFunciona.values()].filter((x): x is string => !!x);
  const anexosObservadosTodos    = [...hits.values()].flatMap((h) => h.anexos_observados);
  const anexosObservadosEducacao = [...new Set(anexosObservadosTodos.filter((a) => KEYWORDS_EDUCACAO.some((rx) => rx.test(a))))];
  const aplicarFiltroNaApi = anexosFiltroQueFuncionou.length > 0;
  const noAnexoExato =
    anexosFiltroQueFuncionou[0] ??
    anexosObservadosEducacao[0] ??
    null;

  console.log(`  hits totais: ${hits.size}/${ENTES.length} entes`);
  console.log(`  exercícios com dado: ${[...exerciciosComDado].join(", ") || "(nenhum)"}`);
  console.log(`  período mais recente por exercício: ${JSON.stringify(periodosPorExercicio)}`);
  console.log(`  Estado     — tipo dominante: "${tipoEstado}"     esfera enviada: ${esferaEstadoEnviada ?? "∅"}`);
  console.log(`  Município  — tipo dominante: "${tipoMunicipio}"  esfera enviada: ${esferaMunicipioEnviada ?? "∅"}`);
  console.log(`  anexos com correspondência educacional no payload: ${anexosObservadosEducacao.join(" | ") || "(nenhum)"}`);
  console.log(`  filtro no_anexo na API funcionou para: ${[...anexoFunciona.entries()]
    .filter(([, v]) => v).map(([id, v]) => `${id}=${JSON.stringify(v)}`).join(", ") || "(nenhum)"}`);
  console.log(`  municípios pequenos precisaram de RREO Simplificado: ${
    hitsMunicipio.filter((h) => h.tipo === "RREO Simplificado").map((h) => h.ente.no_ente).join(", ") || "(não)"
  }`);

  const exerciciosComDadoOrdenados = [...exerciciosComDado].sort((a, b) => b - a);
  const exercicioPrioAtual     = exerciciosComDadoOrdenados.find((a) => EXERCICIOS_PRIORITARIOS.includes(a)) ?? null;
  const exercicioPrioAnterior  = exerciciosComDadoOrdenados.find((a) => EXERCICIOS_PRIORITARIOS.includes(a) && a !== exercicioPrioAtual) ?? null;

  const recs: Recomendacoes = {
    exercicio_prioritario_atual: exercicioPrioAtual,
    exercicio_prioritario_anterior: exercicioPrioAnterior,
    exercicio_fallback: EXERCICIO_FALLBACK,
    periodo_mais_recente_com_dados_por_exercicio: periodosPorExercicio,
    co_tipo_demonstrativo_estado: tipoEstado,
    co_tipo_demonstrativo_municipio: tipoMunicipio,
    co_esfera_estado: esferaEstadoEnviada as "E" | null,
    co_esfera_municipio: esferaMunicipioEnviada as "M" | null,
    no_anexo_exato: noAnexoExato,
    aplicar_filtro_no_anexo_na_api: aplicarFiltroNaApi,
    aplicar_filtro_no_anexo_localmente: !aplicarFiltroNaApi && (!!noAnexoExato || anexosObservadosEducacao.length > 0),
    usar_exercicio_fallback_apenas_se_atual_e_anterior_estiverem_sem_dados: true,
  };

  imprimirRecomendacoes(recs);
  imprimirPatch(recs);

  const decisao = decisaoFase16C2(hits, recs);
  console.log("\n═════════════════════ DECISÃO PARA A FASE 16C.2 ═════════════════════");
  console.log(`  ${decisao}`);
  if (decisao === "CORRIGIR_INCREMENTAL") {
    console.log("  → Aplicar PATCH SUGERIDO em siope-rreo-anexo8-incremental-postgres.ts");
    console.log("    e reexecutar a carga. Validar com siope-rreo-anexo8-validar-postgres.ts.");
  } else if (decisao === "AJUSTAR_DIAGNOSTICO") {
    console.log("  → Há dados mas a combinação ainda é ambígua (faltou Estado OU Município, ou só veio");
    console.log("    via fallback). Ampliar a amostra de entes ou variar mais combinações antes de");
    console.log("    fechar o patch.");
  } else {
    console.log("  → Nem 2026, nem 2025, nem 2024 retornaram dados para Anexo 8/MDE. Voltar à Fase 16A");
    console.log("    e avaliar SIOPE/FNDE legado (scraping) ou Painel SIOPE / dados.gov.br.");
  }
  console.log();
}

main().catch((err) => {
  console.error("[siope-rreo-anexo8:diagnosticar] Erro fatal:", (err as Error).message);
  process.exit(1);
});
