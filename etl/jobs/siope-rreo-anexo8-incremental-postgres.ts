/**
 * siope-rreo-anexo8-incremental-postgres.ts
 *
 * Fase 16C.2 — Carga incremental do RREO Anexo 8 (Educação/MDE) via SICONFI,
 * usando o endpoint /rreo conforme a documentação oficial:
 *
 *   GET https://apidatalake.tesouro.gov.br/ords/siconfi/tt/rreo
 *   Obrigatórios: an_exercicio, nr_periodo, co_tipo_demonstrativo, id_ente
 *   Opcionais  : no_anexo, co_esfera (M=Município, E=Estado/DF, U=União, C=Consórcio)
 *   co_tipo_demonstrativo: "RREO" (padrão) ou "RREO Simplificado"
 *     — "RREO Simplificado" só para municípios com menos de 50 mil habitantes.
 *   Paginação padrão da API: 5.000 itens por página.
 *   Rate limit: 1 requisição por segundo.
 *
 * Fluxo:
 *   1. Para cada (ente, exercício), itera períodos do mais recente (6) para
 *      o mais antigo (1) e PARA NO PRIMEIRO período com itens.
 *   2. Consulta /rreo SEM no_anexo e SEM co_esfera, paginando completamente.
 *   3. Descobre o nome real do anexo no payload via obterNomeAnexo().
 *   4. Identifica o(s) anexo(s) educacionais (Anexo 8 / MDE / FUNDEB) por
 *      regex sobre o nome real e sobre a descrição da conta.
 *   5. Opcionalmente reconsulta /rreo passando no_anexo=<nome literal real>
 *      para confirmar que o filtro funciona; mantém o filtro local como
 *      fallback se a API ignorar o parâmetro.
 *   6. Persiste em raw.siope_rreo_anexo8_raw APENAS os registros educacionais.
 *   7. Reconstrói dw.fato_siope_rreo_anexo8 e mart.siope_risco_educacao_basico
 *      apenas para as fatias com registros educacionais persistidos.
 *
 * Variáveis de ambiente:
 *   SICONFI_API_BASE_URL  — base da API (padrão: https://apidatalake.tesouro.gov.br/ords/siconfi/tt)
 *   SICONFI_TIMEOUT_MS    — timeout por requisição (padrão: 30000)
 *   SICONFI_RATE_LIMIT_MS — intervalo entre requisições (padrão: 1100)
 *   SIOPE_EXERCICIOS      — exercícios alvo (padrão: ANO_ATUAL,ANO_ATUAL-1)
 *   SIOPE_PERIODOS        — períodos alvo (padrão: 6,5,4,3,2,1)
 *
 * Uso: cd etl && npx ts-node jobs/siope-rreo-anexo8-incremental-postgres.ts
 */

import "dotenv/config";
import { createHash } from "crypto";
import { pgQuery, withPgTransaction, closePgPool } from "../connectors/postgres";

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

const BASE_URL   = (process.env.SICONFI_API_BASE_URL || "https://apidatalake.tesouro.gov.br/ords/siconfi/tt").replace(/\/$/, "");
const TIMEOUT_MS = parseInt(process.env.SICONFI_TIMEOUT_MS    || "30000", 10);
const RATE_LIMIT = parseInt(process.env.SICONFI_RATE_LIMIT_MS || "1100",  10);

const FONTE      = "SICONFI_RREO_ANEXO8";
const TIPO_DEMO  = "RREO";
// Documentação oficial: "Por padrão nossas consultas retornam 5.000 itens por página".
// Mantemos 5000 para minimizar paginação e respeitar o rate-limit de 1 req/s.
const PAGE_LIMIT = 5000;

const ANO_ATUAL  = new Date().getFullYear();

const EXERCICIOS = (process.env.SIOPE_EXERCICIOS || `${ANO_ATUAL},${ANO_ATUAL - 1}`)
  .split(",").map((s) => parseInt(s.trim(), 10)).filter(Number.isFinite);

const PERIODOS = (process.env.SIOPE_PERIODOS || "6,5,4,3,2,1")
  .split(",").map((s) => parseInt(s.trim(), 10)).filter(Number.isFinite);

const ENTES_ALVO: Array<{ id_ente: number; no_ente: string; esfera: "E" | "M" }> = [
  { id_ente: 12,      no_ente: "Governo do Estado do Acre", esfera: "E" },
  { id_ente: 1200013, no_ente: "Acrelândia",                esfera: "M" },
  { id_ente: 1200054, no_ente: "Assis Brasil",              esfera: "M" },
  { id_ente: 1200104, no_ente: "Brasiléia",                 esfera: "M" },
  { id_ente: 1200138, no_ente: "Bujari",                    esfera: "M" },
  { id_ente: 1200179, no_ente: "Capixaba",                  esfera: "M" },
  { id_ente: 1200203, no_ente: "Cruzeiro do Sul",           esfera: "M" },
  { id_ente: 1200252, no_ente: "Epitaciolândia",            esfera: "M" },
  { id_ente: 1200302, no_ente: "Feijó",                     esfera: "M" },
  { id_ente: 1200328, no_ente: "Jordão",                    esfera: "M" },
  { id_ente: 1200336, no_ente: "Mâncio Lima",               esfera: "M" },
  { id_ente: 1200344, no_ente: "Manoel Urbano",             esfera: "M" },
  { id_ente: 1200351, no_ente: "Marechal Thaumaturgo",      esfera: "M" },
  { id_ente: 1200385, no_ente: "Plácido de Castro",         esfera: "M" },
  { id_ente: 1200393, no_ente: "Porto Walter",              esfera: "M" },
  { id_ente: 1200401, no_ente: "Rio Branco",                esfera: "M" },
  { id_ente: 1200427, no_ente: "Rodrigues Alves",           esfera: "M" },
  { id_ente: 1200435, no_ente: "Santa Rosa do Purus",       esfera: "M" },
  { id_ente: 1200450, no_ente: "Senador Guiomard",          esfera: "M" },
  { id_ente: 1200500, no_ente: "Sena Madureira",            esfera: "M" },
  { id_ente: 1200609, no_ente: "Tarauacá",                  esfera: "M" },
  { id_ente: 1200708, no_ente: "Xapuri",                    esfera: "M" },
  { id_ente: 1200807, no_ente: "Porto Acre",                esfera: "M" },
];

// Regex para identificar anexo educacional / MDE
const REGEX_ANEXO_EDUCACIONAL: RegExp[] = [
  /\banexo\s*0?8\b/i,
  /\banexo\s*VIII\b/i,
  /manuten[çc][ãa]o\s+e\s+desenvolvimento\s+do\s+ensino/i,
  /\bMDE\b/,
  /receitas?\s+e\s+despesas?\s+com\s+manuten[çc][ãa]o/i,
  /\beduca[çc][ãa]o\b/i,
  /\bFUNDEB\b/i,
];

// Regex de classificação por categoria (mantidas iguais às Fases 16B/16C)
const CATEGORIAS: { rotulo: string; flag: keyof FlagsCategoria; padroes: RegExp[] }[] = [
  { rotulo: "MDE",
    flag: "eh_mde",
    padroes: [/manuten[çc][ãa]o.*desenvolvimento.*ensino/i, /\bMDE\b/, /aplicado.*ensino/i, /25\s?%/, /m[íi]nimo.*constitucional/i] },
  { rotulo: "FUNDEB",
    flag: "eh_fundeb",
    padroes: [/FUNDEB/i, /complementa[çc][ãa]o.*uni[ãa]o.*FUNDEB/i] },
  { rotulo: "FUNDEB_REMUNERACAO",
    flag: "eh_remuneracao_profissionais",
    padroes: [/remunera[çc][ãa]o.*profissionais/i, /magist[ée]rio/i, /70\s?%.*FUNDEB/i] },
  { rotulo: "RECEITA_IMPOSTOS",
    flag: "eh_receita_impostos",
    padroes: [/receita.*imposto/i, /imposto.*pr[óo]prio/i, /\bIPTU\b/, /\bISS\b/, /\bITBI\b/, /\bIRRF\b/, /\bICMS\b/, /\bIPVA\b/, /\bITR\b/, /\bITCMD\b/] },
  { rotulo: "TRANSFERENCIA_CONSTITUCIONAL",
    flag: "eh_transferencia_constitucional",
    padroes: [/transfer[êe]ncia.*constitucional/i, /\bFPM\b/, /\bFPE\b/, /cota[- ]parte/i, /lei\s*kandir/i, /royalties/i, /\bIPI\b.*export/i] },
  { rotulo: "DESPESA_EDUCACAO",
    flag: "eh_despesa_educacao",
    padroes: [/despesa.*educa[çc][ãa]o/i, /fun[çc][ãa]o\s*12/i, /ensino\s+(fundamental|m[ée]dio|infantil|superior|profissional)/i] },
  { rotulo: "RESTOS_A_PAGAR",
    flag: "eh_resto_pagar",
    padroes: [/restos\s+a\s+pagar/i, /inscritos.*sem.*disponibilidade/i] },
];

interface FlagsCategoria {
  eh_mde: boolean;
  eh_fundeb: boolean;
  eh_remuneracao_profissionais: boolean;
  eh_receita_impostos: boolean;
  eh_transferencia_constitucional: boolean;
  eh_despesa_educacao: boolean;
  eh_resto_pagar: boolean;
}

// Item retornado pela API — campos textuais são tratados como opcionais, pois
// a documentação não fixa nomes; obterNomeAnexo() faz a normalização.
interface RreoItem {
  exercicio?:      number;
  demonstrativo?:  string;
  periodo?:        number;
  periodicidade?:  string;
  instituicao?:    string;
  cod_ibge?:       number;
  uf?:             string;
  populacao?:      number | null;
  anexo?:          string;
  no_anexo?:       string;
  nome_anexo?:     string;
  ds_anexo?:       string;
  esfera?:         string;
  rotulo?:         string | null;
  coluna?:         string;
  cod_conta?:      string;
  conta?:          string;
  no_conta?:       string;
  ds_conta?:       string;
  valor?:          number | string | null;
  [k: string]:     unknown;
}

interface RreoResponse {
  items:   RreoItem[];
  hasMore: boolean;
  count?:  number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function parseValor(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v).replace(/,/g, "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Descobre o nome real do anexo no payload. A API SICONFI pode retornar o
 * nome do anexo em campos com nomes diferentes ao longo do tempo. Tenta as
 * variantes conhecidas e, em último caso, varre todos os valores textuais
 * em busca de algo que comece por "RREO-Anexo".
 */
function obterNomeAnexo(item: RreoItem): string | null {
  const candidatos = [item.anexo, item.no_anexo, item.nome_anexo, item.ds_anexo];
  for (const c of candidatos) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  for (const v of Object.values(item)) {
    if (typeof v === "string" && /RREO[-\s]?Anexo/i.test(v)) return v.trim();
  }
  return null;
}

function obterDescricaoConta(item: RreoItem): string | null {
  for (const c of [item.conta, item.no_conta, item.ds_conta]) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

function ehAnexoEducacional(nomeAnexo: string | null, descricaoConta: string | null): boolean {
  const texto = `${nomeAnexo ?? ""} ${descricaoConta ?? ""}`;
  if (!texto.trim()) return false;
  return REGEX_ANEXO_EDUCACIONAL.some((rx) => rx.test(texto));
}

function classificarConta(conta: string | null | undefined): { categoria: string | null; flags: FlagsCategoria } {
  const flags: FlagsCategoria = {
    eh_mde: false, eh_fundeb: false, eh_remuneracao_profissionais: false,
    eh_receita_impostos: false, eh_transferencia_constitucional: false,
    eh_despesa_educacao: false, eh_resto_pagar: false,
  };
  let categoria: string | null = null;
  if (!conta) return { categoria, flags };
  for (const c of CATEGORIAS) {
    if (c.padroes.some((p) => p.test(conta))) {
      flags[c.flag] = true;
      if (!categoria) categoria = c.rotulo;
    }
  }
  return { categoria, flags };
}

function hashRegistro(p: {
  an_exercicio: number; nr_periodo: number; id_ente: string;
  no_anexo: string | null; conta: string | null; coluna: string | null; valor: number | null;
}): string {
  const canonical = JSON.stringify({
    an_exercicio: p.an_exercicio, nr_periodo: p.nr_periodo, id_ente: p.id_ente,
    no_anexo: p.no_anexo ?? "", conta: p.conta ?? "", coluna: p.coluna ?? "", valor: p.valor ?? null,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

// ---------------------------------------------------------------------------
// Camada de rede
// ---------------------------------------------------------------------------

async function fetchRreoPage(
  params: { an_exercicio: number; nr_periodo: number; id_ente: number; no_anexo?: string; co_esfera?: string },
  offset: number,
  retries = 0,
): Promise<RreoResponse | null> {
  if (retries >= 3) return null;
  const sp = new URLSearchParams();
  sp.append("an_exercicio",          String(params.an_exercicio));
  sp.append("nr_periodo",            String(params.nr_periodo));
  sp.append("co_tipo_demonstrativo", TIPO_DEMO);
  sp.append("id_ente",               String(params.id_ente));
  if (params.no_anexo)  sp.append("no_anexo",  params.no_anexo);
  if (params.co_esfera) sp.append("co_esfera", params.co_esfera);
  sp.append("limit",  String(PAGE_LIMIT));
  sp.append("offset", String(offset));

  const url = `${BASE_URL}/rreo?${sp.toString()}`;
  try {
    const resp = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Varadouro-Digital-ETL/1.0 (TCE-AC; SIOPE 16C.2)" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (resp.status === 429) {
      const wait = 30000 * (retries + 1);
      console.log(`    [429] rate limit — aguardando ${wait / 1000}s`);
      await sleep(wait);
      return fetchRreoPage(params, offset, retries + 1);
    }
    if (!resp.ok) return null;
    return (await resp.json()) as RreoResponse;
  } catch {
    return null;
  }
}

async function fetchRreoAll(
  params: { an_exercicio: number; nr_periodo: number; id_ente: number; no_anexo?: string; co_esfera?: string },
): Promise<{ items: RreoItem[] | null; paginas: number }> {
  const all: RreoItem[] = [];
  let offset = 0;
  let pages = 0;
  while (true) {
    const page = await fetchRreoPage(params, offset);
    if (page === null) return { items: null, paginas: pages };
    pages++;
    if (!page.items?.length) break;
    all.push(...page.items);
    if (!page.hasMore) break;
    offset += page.items.length;
    await sleep(RATE_LIMIT);
    if (pages > 100) break; // sanity
  }
  return { items: all, paginas: pages };
}

// ---------------------------------------------------------------------------
// Processamento por ente
// ---------------------------------------------------------------------------

interface ResultadoEnte {
  exercicio: number;
  periodo: number | null;       // período onde efetivamente houve itens (ou null)
  id_ente: string;
  no_ente: string;
  paginas_lidas: number;
  registros_recebidos: number;
  anexos_distintos: string[];
  contagem_por_anexo: Record<string, number>;
  anexo_educacional_encontrado: string | null;
  filtro_no_anexo_api_funciona: boolean | null; // null = não testado
  registros_educacionais: number;
  registros_raw_novos: number;
  registros_raw_tocados: number;
  registros_dw: number;
  status: "OK_ANEXO8_LOCALIZADO" | "API_OK_SEM_ANEXO8" | "SEM_DADOS_RREO" | "ERRO_PARAMETRIZACAO";
  erro: string | null;
}

async function processarEnte(
  exercicio: number,
  alvo: { id_ente: number; no_ente: string; esfera: "E" | "M" },
): Promise<ResultadoEnte> {
  const idEnteStr = String(alvo.id_ente);
  const r: ResultadoEnte = {
    exercicio, periodo: null, id_ente: idEnteStr, no_ente: alvo.no_ente,
    paginas_lidas: 0, registros_recebidos: 0,
    anexos_distintos: [], contagem_por_anexo: {},
    anexo_educacional_encontrado: null, filtro_no_anexo_api_funciona: null,
    registros_educacionais: 0, registros_raw_novos: 0, registros_raw_tocados: 0, registros_dw: 0,
    status: "SEM_DADOS_RREO", erro: null,
  };

  // 1) Encontrar o primeiro período com dados (6 → 1)
  let periodoOk: number | null = null;
  let items: RreoItem[] | null = null;
  let paginas = 0;
  let erroParam = false;

  for (const periodo of PERIODOS) {
    const resp = await fetchRreoAll({ an_exercicio: exercicio, nr_periodo: periodo, id_ente: alvo.id_ente });
    paginas += resp.paginas;
    if (resp.items === null) {
      erroParam = true; // falha de rede / 4xx — tenta próximo período
      await sleep(RATE_LIMIT);
      continue;
    }
    if (resp.items.length > 0) {
      periodoOk = periodo;
      items = resp.items;
      break;
    }
    await sleep(RATE_LIMIT);
  }

  r.paginas_lidas = paginas;

  if (periodoOk === null || items === null) {
    r.status = erroParam ? "ERRO_PARAMETRIZACAO" : "SEM_DADOS_RREO";
    r.erro = erroParam ? "Falha de rede / parametrização — sem resposta válida em nenhum período." : "API respondeu mas sem itens em nenhum período.";
    return r;
  }

  r.periodo = periodoOk;
  r.registros_recebidos = items.length;

  // 2) Inventário de anexos
  const contagem: Record<string, number> = {};
  for (const it of items) {
    const nome = obterNomeAnexo(it) ?? "(sem nome)";
    contagem[nome] = (contagem[nome] ?? 0) + 1;
  }
  r.contagem_por_anexo = contagem;
  r.anexos_distintos = Object.keys(contagem);

  // 3) Localiza anexo educacional (pelo nome do anexo no payload)
  const anexoEducacional = r.anexos_distintos.find((a) => REGEX_ANEXO_EDUCACIONAL.some((rx) => rx.test(a))) ?? null;
  r.anexo_educacional_encontrado = anexoEducacional;

  // 4) Teste opcional: filtrar por no_anexo literal na API
  let itemsEducacionais: RreoItem[] = [];
  if (anexoEducacional) {
    const respFiltro = await fetchRreoAll({
      an_exercicio: exercicio, nr_periodo: periodoOk, id_ente: alvo.id_ente, no_anexo: anexoEducacional,
    });
    await sleep(RATE_LIMIT);
    if (respFiltro.items && respFiltro.items.length > 0) {
      r.filtro_no_anexo_api_funciona = true;
      itemsEducacionais = respFiltro.items.filter((it) => ehAnexoEducacional(obterNomeAnexo(it), obterDescricaoConta(it)));
    } else {
      r.filtro_no_anexo_api_funciona = false;
      itemsEducacionais = items.filter((it) => ehAnexoEducacional(obterNomeAnexo(it), obterDescricaoConta(it)));
    }
  } else {
    // Sem anexo educacional pelo nome — ainda assim tenta encontrar por conteúdo da conta
    itemsEducacionais = items.filter((it) => ehAnexoEducacional(obterNomeAnexo(it), obterDescricaoConta(it)));
  }

  r.registros_educacionais = itemsEducacionais.length;

  if (itemsEducacionais.length === 0) {
    r.status = "API_OK_SEM_ANEXO8";
    return r;
  }

  // 5) Persistência (somente registros educacionais)
  try {
    await withPgTransaction(async (client) => {
      for (const it of itemsEducacionais) {
        const valor       = parseValor(it.valor);
        const conta_cod   = it.cod_conta ?? null;
        const conta_nome  = obterDescricaoConta(it);
        const coluna      = it.coluna ?? null;
        const nomeAnexo   = obterNomeAnexo(it);
        const hash = hashRegistro({
          an_exercicio: exercicio, nr_periodo: periodoOk!, id_ente: idEnteStr,
          no_anexo: nomeAnexo, conta: conta_cod, coluna, valor,
        });

        const up = await client.query<{ inseriu: boolean }>(`
          INSERT INTO raw.siope_rreo_anexo8_raw
            (fonte, an_exercicio, nr_periodo, co_tipo_demonstrativo, no_anexo, co_esfera,
             id_ente, no_ente, uf, periodicidade,
             conta, descricao_conta, coluna, valor,
             payload, hash_registro, coletado_em, atualizado_em)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, now(), now())
          ON CONFLICT (an_exercicio, nr_periodo, id_ente, no_anexo, conta, coluna, hash_registro)
          DO UPDATE SET atualizado_em = now(),
                        descricao_conta = EXCLUDED.descricao_conta,
                        no_ente         = COALESCE(EXCLUDED.no_ente, raw.siope_rreo_anexo8_raw.no_ente),
                        uf              = COALESCE(EXCLUDED.uf, raw.siope_rreo_anexo8_raw.uf),
                        periodicidade   = COALESCE(EXCLUDED.periodicidade, raw.siope_rreo_anexo8_raw.periodicidade)
          RETURNING (xmax = 0) AS inseriu
        `, [
          FONTE, exercicio, periodoOk, TIPO_DEMO, nomeAnexo, it.esfera ?? alvo.esfera,
          idEnteStr, it.instituicao ?? alvo.no_ente, it.uf ?? "AC", it.periodicidade ?? null,
          conta_cod, conta_nome, coluna, valor,
          JSON.stringify(it), hash,
        ]);

        if (up.rows[0]?.inseriu) r.registros_raw_novos++;
        else                      r.registros_raw_tocados++;
      }

      // Reconstrói fatia DW para esta tupla
      await client.query(
        `DELETE FROM dw.fato_siope_rreo_anexo8 WHERE an_exercicio = $1 AND nr_periodo = $2 AND id_ente = $3`,
        [exercicio, periodoOk, idEnteStr],
      );

      const ultimas = await client.query<{
        id: string; an_exercicio: number; nr_periodo: number;
        id_ente: string; no_ente: string | null; uf: string | null;
        co_esfera: string | null; periodicidade: string | null; no_anexo: string | null;
        conta: string | null; descricao_conta: string | null; coluna: string | null; valor: string | null;
      }>(`
        SELECT DISTINCT ON (conta, coluna)
               id, an_exercicio, nr_periodo, id_ente, no_ente, uf,
               co_esfera, periodicidade, no_anexo,
               conta, descricao_conta, coluna, valor
        FROM raw.siope_rreo_anexo8_raw
        WHERE an_exercicio = $1 AND nr_periodo = $2 AND id_ente = $3
        ORDER BY conta, coluna, atualizado_em DESC, id DESC
      `, [exercicio, periodoOk, idEnteStr]);

      for (const u of ultimas.rows) {
        const { categoria, flags } = classificarConta(u.descricao_conta);
        await client.query(`
          INSERT INTO dw.fato_siope_rreo_anexo8
            (fonte, an_exercicio, nr_periodo, id_ente, no_ente, uf, esfera, periodicidade,
             anexo, conta_codigo, conta_nome, coluna, valor,
             categoria_gabinete, eh_mde, eh_fundeb, eh_remuneracao_profissionais,
             eh_receita_impostos, eh_transferencia_constitucional, eh_despesa_educacao, eh_resto_pagar,
             raw_id, criado_em, atualizado_em)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22, now(), now())
        `, [
          FONTE, u.an_exercicio, u.nr_periodo, u.id_ente, u.no_ente, u.uf, u.co_esfera, u.periodicidade,
          u.no_anexo, u.conta, u.descricao_conta, u.coluna, u.valor,
          categoria,
          flags.eh_mde, flags.eh_fundeb, flags.eh_remuneracao_profissionais,
          flags.eh_receita_impostos, flags.eh_transferencia_constitucional, flags.eh_despesa_educacao, flags.eh_resto_pagar,
          u.id,
        ]);
        r.registros_dw++;
      }

      // Reconstrói mart desta tupla
      await client.query(
        `DELETE FROM mart.siope_risco_educacao_basico WHERE an_exercicio = $1 AND nr_periodo = $2 AND id_ente = $3`,
        [exercicio, periodoOk, idEnteStr],
      );
      await client.query(`
        INSERT INTO mart.siope_risco_educacao_basico
          (an_exercicio, nr_periodo, id_ente, no_ente, uf, esfera,
           total_registros, total_mde, total_fundeb, total_remuneracao_profissionais,
           total_receita_impostos, total_transferencias, total_despesa_educacao, total_restos_pagar,
           atualizado_em)
        SELECT
          an_exercicio, nr_periodo, id_ente,
          MAX(no_ente), MAX(uf), MAX(esfera),
          COUNT(*),
          SUM(valor) FILTER (WHERE eh_mde),
          SUM(valor) FILTER (WHERE eh_fundeb),
          SUM(valor) FILTER (WHERE eh_remuneracao_profissionais),
          SUM(valor) FILTER (WHERE eh_receita_impostos),
          SUM(valor) FILTER (WHERE eh_transferencia_constitucional),
          SUM(valor) FILTER (WHERE eh_despesa_educacao),
          SUM(valor) FILTER (WHERE eh_resto_pagar),
          now()
        FROM dw.fato_siope_rreo_anexo8
        WHERE an_exercicio = $1 AND nr_periodo = $2 AND id_ente = $3
        GROUP BY an_exercicio, nr_periodo, id_ente
      `, [exercicio, periodoOk, idEnteStr]);
    });

    r.status = "OK_ANEXO8_LOCALIZADO";
  } catch (err) {
    r.status = "ERRO_PARAMETRIZACAO";
    r.erro = (err as Error).message;
  }

  return r;
}

// ---------------------------------------------------------------------------
// Resumo
// ---------------------------------------------------------------------------

function imprimirResumoEnte(r: ResultadoEnte) {
  console.log(`  [${r.id_ente}] ${r.no_ente}`);
  console.log(`     exercício=${r.exercicio}  período=${r.periodo ?? "—"}  páginas=${r.paginas_lidas}`);
  console.log(`     recebidos=${r.registros_recebidos}  educacionais=${r.registros_educacionais}  persistidos=${r.registros_raw_novos}+~${r.registros_raw_tocados}  dw=${r.registros_dw}`);
  if (r.anexos_distintos.length) {
    const top = Object.entries(r.contagem_por_anexo).sort((a, b) => b[1] - a[1]).slice(0, 4);
    console.log(`     anexos no payload: ${top.map(([n, c]) => `"${n}" (${c})`).join(" | ")}${r.anexos_distintos.length > 4 ? ` … +${r.anexos_distintos.length - 4}` : ""}`);
  }
  console.log(`     anexo_educacional=${r.anexo_educacional_encontrado ? `"${r.anexo_educacional_encontrado}"` : "—"}` +
              `  filtro_api=${r.filtro_no_anexo_api_funciona === null ? "não testado" : r.filtro_no_anexo_api_funciona ? "✓" : "✗"}`);
  console.log(`     descartados=${r.registros_recebidos - r.registros_educacionais}  status=${r.status}${r.erro ? `  erro="${r.erro.slice(0, 100)}"` : ""}`);
}

function imprimirResumoGeral(resultados: ResultadoEnte[], inicio: number) {
  const totReq        = resultados.length;
  const totRecebidos  = resultados.reduce((a, r) => a + r.registros_recebidos, 0);
  const totEducacao   = resultados.reduce((a, r) => a + r.registros_educacionais, 0);
  const totRawNovos   = resultados.reduce((a, r) => a + r.registros_raw_novos, 0);
  const totRawTocados = resultados.reduce((a, r) => a + r.registros_raw_tocados, 0);
  const totDw         = resultados.reduce((a, r) => a + r.registros_dw, 0);

  const porStatus = new Map<string, number>();
  for (const r of resultados) porStatus.set(r.status, (porStatus.get(r.status) ?? 0) + 1);

  console.log("\n══════════════════════════ Resumo geral ══════════════════════════");
  console.log(`  Duração total       : ${Math.round((Date.now() - inicio) / 1000)}s`);
  console.log(`  Requisições/ entes  : ${totReq}`);
  console.log(`  Registros recebidos : ${totRecebidos}`);
  console.log(`  Educacionais        : ${totEducacao}`);
  console.log(`  Descartados (≠ MDE) : ${totRecebidos - totEducacao}`);
  console.log(`  Raw — inseridos     : ${totRawNovos}`);
  console.log(`  Raw — atualizados   : ${totRawTocados}`);
  console.log(`  DW  — registros     : ${totDw}`);
  console.log(`  Status por ente     :`);
  for (const [s, n] of porStatus) console.log(`     ${s}: ${n}`);

  const limitacoes = resultados.filter((r) => r.erro || r.status !== "OK_ANEXO8_LOCALIZADO");
  if (limitacoes.length) {
    console.log("\n  Limitações por ente:");
    for (const l of limitacoes) {
      console.log(`     ✗ [${l.exercicio}] ${l.no_ente.padEnd(34)} status=${l.status}${l.erro ? ` — ${l.erro.slice(0, 80)}` : ""}`);
    }
  }
}

function veredictoFinal(resultados: ResultadoEnte[]): "OK_ANEXO8_LOCALIZADO" | "API_OK_SEM_ANEXO8" | "SEM_DADOS_RREO" | "ERRO_PARAMETRIZACAO" {
  if (resultados.some((r) => r.status === "OK_ANEXO8_LOCALIZADO")) return "OK_ANEXO8_LOCALIZADO";
  if (resultados.some((r) => r.status === "API_OK_SEM_ANEXO8"))    return "API_OK_SEM_ANEXO8";
  if (resultados.some((r) => r.status === "ERRO_PARAMETRIZACAO"))  return "ERRO_PARAMETRIZACAO";
  return "SEM_DADOS_RREO";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function executarSiopeRreoAnexo8Incremental(): Promise<void> {
  const inicio = Date.now();
  console.log("[siope-rreo-anexo8] Carga incremental (Fase 16C.2)");
  console.log(`  Base API     : ${BASE_URL}`);
  console.log(`  Exercícios   : ${EXERCICIOS.join(", ")}   (ANO_ATUAL=${ANO_ATUAL})`);
  console.log(`  Períodos     : ${PERIODOS.join(", ")}   (6=mais recente → 1=mais antigo)`);
  console.log(`  Entes alvo   : ${ENTES_ALVO.length} (1 estado + ${ENTES_ALVO.length - 1} municípios)`);
  console.log(`  Rate limit   : ${RATE_LIMIT}ms entre requisições\n`);

  const resultados: ResultadoEnte[] = [];

  for (const exercicio of EXERCICIOS) {
    console.log(`══════ Exercício ${exercicio} ══════`);
    for (const alvo of ENTES_ALVO) {
      const r = await processarEnte(exercicio, alvo);
      resultados.push(r);
      imprimirResumoEnte(r);
      await sleep(RATE_LIMIT);
    }
    console.log();
  }

  imprimirResumoGeral(resultados, inicio);

  const status = veredictoFinal(resultados);
  console.log("\n══════════════════════ Veredito do incremental ══════════════════════");
  console.log(`  ${status}`);
  switch (status) {
    case "OK_ANEXO8_LOCALIZADO":
      console.log("  ✓ Pelo menos um ente teve Anexo 8/MDE carregado em raw/DW/mart.");
      console.log("  Próximo: rodar siope-rreo-anexo8-validar-postgres.ts para conferir cobertura.");
      break;
    case "API_OK_SEM_ANEXO8":
      console.log("  ⚠ A API respondeu com dados, mas nenhum ente expôs Anexo 8/MDE no payload.");
      console.log("  Possíveis causas: anexo não publicado para o período corrente; nome do anexo");
      console.log("  fora dos padrões esperados — revisar REGEX_ANEXO_EDUCACIONAL.");
      break;
    case "SEM_DADOS_RREO":
      console.log("  ⚠ A API não retornou dados para nenhum ente em nenhum período/exercício.");
      console.log("  Próximo: confirmar agenda de entregas SICONFI ou usar EXERCICIO mais antigo.");
      break;
    case "ERRO_PARAMETRIZACAO":
      console.log("  ✗ Falhas persistentes de rede ou parametrização. Conferir BASE_URL/credenciais.");
      break;
  }

  // Log de auditoria (best-effort)
  try {
    await pgQuery(`
      INSERT INTO audit.etl_log (modulo, status, mensagem, registros, duracao_ms)
      VALUES ('siope_rreo_anexo8', $1, $2, $3, $4)
    `, [
      status,
      `Carga 16C.2 — exercícios=${EXERCICIOS.join("/")} períodos=${PERIODOS.join("/")} entes=${ENTES_ALVO.length}`,
      resultados.reduce((a, r) => a + r.registros_dw, 0),
      Date.now() - inicio,
    ]);
  } catch {
    /* audit.etl_log pode não existir — silencioso */
  }
}

if (require.main === module) {
  executarSiopeRreoAnexo8Incremental()
    .then(() => closePgPool())
    .catch((err) => {
      console.error("[siope-rreo-anexo8] Erro fatal:", (err as Error).message);
      closePgPool().catch(() => void 0);
      process.exit(1);
    });
}
