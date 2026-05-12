/**
 * ingest-sim-api.ts
 *
 * Carga SIM (Sistema de Informação sobre Mortalidade) via API Dados Abertos Saúde v1.
 * Fluxo: API → raw.sim_obitos_raw → stage.sim_obitos_stg → dw.fato_sim_obito
 *
 * Dicionário SIM 2025: campos TIPOBITO, DTOBITO, IDADE, SEXO, RACACOR, CODMUNRES,
 * LOCOCOR, CODESTAB, CODMUNOCOR, IDADEMAE, SEMAGESTAC, GRAVIDEZ, PARTO, OBITOPARTO,
 * PESO, TPMORTEOCO, ASSISTMED, NECROPSIA, CID e derivados.
 *
 * Privacidade: nomes de paciente, CPF, CNS e equivalentes NÃO são gravados.
 * Idempotente por ano: DELETE + INSERT por ano/fonte dentro de transação.
 *
 * Uso: cd etl && npm run sim:api:ingest
 */

import "dotenv/config";
import * as https from "https";
import * as http from "http";
import { pgQuery, withPgTransaction, closePgPool } from "../connectors/postgres";

// ─── Configuração ─────────────────────────────────────────────────────────────

const MODULO     = "sim_ingest";
const BASE_URL   = (process.env.SIM_API_BASE_URL  ?? "https://apidadosabertos.saude.gov.br").replace(/\/$/, "");
const ENDPOINT   = process.env.SIM_ENDPOINT_MORTALIDADE ?? "/vigilancia-e-meio-ambiente/sistema-de-informacao-sobre-mortalidade";
const ANOS       = (process.env.SIM_ANOS          ?? "2024,2025,2026").split(",").map(s => s.trim()).filter(Boolean);
const UF         = process.env.SIM_UF             ?? "AC";
const PAGE_SIZE  = parseInt(process.env.SIM_PAGE_SIZE ?? "1000", 10);
const MAX_PAGES  = process.env.SIM_MAX_PAGES ? parseInt(process.env.SIM_MAX_PAGES, 10) : 0;
const TIMEOUT_MS = parseInt(process.env.SIM_TIMEOUT_MS   ?? "30000", 10);
const RATE_LIMIT = parseInt(process.env.SIM_RATE_LIMIT_MS ?? "500", 10);

const UA = "Varadouro-Digital-ETL/1.0 (TCE-AC SIM ingest)";

const CAMPOS_SENSIVEIS = new Set([
  "nu_cpf", "nm_paciente", "ds_nome_paciente", "nu_cns",
  "co_paciente", "no_paciente", "nm_mae",
]);

// ─── Tipos ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

interface RespostaApi {
  totalRegistros?: number;
  total?: number;
  count?: number;
  data?: AnyRecord[];
  items?: AnyRecord[];
  registros?: AnyRecord[];
  result?: AnyRecord[];
  obitos?: AnyRecord[];
  [key: string]: unknown;
}

interface IdadeParsed {
  idade_dias: number | null;
  idade_anos: number | null;
  faixa_etaria: string;
  is_idade_ignorada: boolean;
  is_obito_infantil: boolean;
  is_obito_neonatal: boolean;
  is_obito_pos_neonatal: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function toDate(val: unknown): string | null {
  if (!val) return null;
  const s = String(val).trim();
  if (!s || s === "null") return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split("/");
    return `${y}-${m}-${d}`;
  }
  // YYYYMMDD
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  return null;
}

function toStr(val: unknown): string | null {
  if (val === null || val === undefined || val === "") return null;
  return String(val).trim() || null;
}

function toInt(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const n = parseInt(String(val), 10);
  return isNaN(n) ? null : n;
}

function sanitizarPayload(rec: AnyRecord): AnyRecord {
  const saida: AnyRecord = {};
  for (const [k, v] of Object.entries(rec)) {
    if (!CAMPOS_SENSIVEIS.has(k.toLowerCase())) {
      saida[k] = v;
    }
  }
  return saida;
}

// ─── parseSimIdade ────────────────────────────────────────────────────────────
// Campo IDADE do SIM: primeiro dígito = unidade, 2 últimos = quantidade
// 1=minuto, 2=hora, 3=mês, 4=ano, 5=≥100anos, 9=ignorado

function parseSimIdade(idade: string | null | undefined): IdadeParsed {
  const vazio: IdadeParsed = {
    idade_dias: null, idade_anos: null,
    faixa_etaria: "Ignorado", is_idade_ignorada: true,
    is_obito_infantil: false, is_obito_neonatal: false, is_obito_pos_neonatal: false,
  };
  if (!idade) return vazio;
  const s = String(idade).trim().padStart(3, "0");
  if (s.length < 3) return vazio;
  const unidade = s[0];
  const qtd = parseInt(s.slice(1), 10);
  if (isNaN(qtd)) return vazio;

  if (unidade === "9") return vazio;

  let idadeDias: number | null = null;
  let idadeAnos: number | null = null;

  if (unidade === "1") { idadeDias = 0; }
  else if (unidade === "2") { idadeDias = 0; }
  else if (unidade === "3") { idadeDias = qtd * 30; }
  else if (unidade === "4") { idadeAnos = qtd; idadeDias = qtd * 365; }
  else if (unidade === "5") { idadeAnos = 100 + qtd; idadeDias = (100 + qtd) * 365; }

  const isInfantil = idadeDias !== null && idadeAnos === null;
  const isNeonatal = idadeDias !== null && idadeDias < 28;
  const isPosNeonatal = idadeDias !== null && idadeDias >= 28 && idadeAnos === null;

  let faixa = "≥ 1 ano";
  if (isNeonatal) faixa = "Neonatal (< 28 dias)";
  else if (isPosNeonatal) faixa = "Pós-neonatal (28–364 dias)";
  else if (idadeAnos !== null) {
    if (idadeAnos < 5) faixa = "1–4 anos";
    else if (idadeAnos < 15) faixa = "5–14 anos";
    else if (idadeAnos < 30) faixa = "15–29 anos";
    else if (idadeAnos < 50) faixa = "30–49 anos";
    else if (idadeAnos < 70) faixa = "50–69 anos";
    else faixa = "≥ 70 anos";
  }

  return {
    idade_dias: idadeDias,
    idade_anos: idadeAnos,
    faixa_etaria: faixa,
    is_idade_ignorada: false,
    is_obito_infantil: isInfantil,
    is_obito_neonatal: isNeonatal,
    is_obito_pos_neonatal: isPosNeonatal,
  };
}

// ─── Lógica de óbito fetal/materno ───────────────────────────────────────────

function isFetal(rec: AnyRecord): boolean {
  const tipobito = toStr(rec.TIPOBITO ?? rec.tipobito ?? rec.tipo_obito ?? rec.tp_obito);
  return tipobito === "1";
}

function parseTpMorteoco(rec: AnyRecord): {
  tpmorteoco: string | null;
  is_obito_materno: boolean;
  is_obito_materno_tardio: boolean;
  morte_relacao_gravidez_parto: string | null;
} {
  const raw = toStr(rec.TPMORTEOCO ?? rec.tpmorteoco ?? rec.tp_morte_oco);
  const cod = raw ? parseInt(raw, 10) : null;
  const labels: Record<number, string> = {
    1: "Na gravidez",
    2: "No parto",
    3: "No abortamento",
    4: "Até 42 dias após parto",
    5: "43 dias a 1 ano após gestação",
    8: "Não ocorreu",
    9: "Ignorado",
  };
  return {
    tpmorteoco: raw,
    is_obito_materno: cod !== null && [1, 2, 3, 4].includes(cod),
    is_obito_materno_tardio: cod === 5,
    morte_relacao_gravidez_parto: cod !== null ? (labels[cod] ?? null) : null,
  };
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────

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
    req.setTimeout(TIMEOUT_MS, () => { req.destroy(); reject(new Error(`Timeout ${TIMEOUT_MS}ms`)); });
    req.on("error", reject);
  });
}

// ─── Paginação ───────────────────────────────────────────────────────────────
// API SIM usa limit/offset (confirmado via Swagger).
// Não suporta filtro de UF ou ano — filtrar em processo por CODMUNRES começando com '12'.

function montarParams(offset: number): Record<string, string> {
  return { limit: String(PAGE_SIZE), offset: String(offset) };
}

function extrairRegistros(parsed: unknown): AnyRecord[] {
  const obj = parsed as Record<string, unknown>;
  for (const c of ["sim", "data", "items", "registros", "result", "results", "obitos", "content"]) {
    if (Array.isArray(obj[c])) return obj[c] as AnyRecord[];
  }
  if (Array.isArray(parsed)) return parsed as AnyRecord[];
  return [];
}

function extrairTotal(parsed: unknown): number | null {
  const obj = parsed as Record<string, unknown>;
  for (const c of ["totalRegistros", "total", "count", "totalElements"]) {
    if (typeof obj[c] === "number") return obj[c] as number;
  }
  return null;
}

// ─── Normalização de registro ─────────────────────────────────────────────────

function normalizarRegistro(rec: AnyRecord, rawId: number, ano: number, apiEndpoint: string): AnyRecord {
  const idadeRaw = toStr(rec.IDADE ?? rec.idade ?? rec.nu_idade ?? null);
  const idadeParsed = parseSimIdade(idadeRaw);
  const { tpmorteoco, is_obito_materno, is_obito_materno_tardio, morte_relacao_gravidez_parto } = parseTpMorteoco(rec);
  const fetal = isFetal(rec);
  const tipoObito = fetal ? "fetal" : "nao_fetal";

  const pesoRaw = toInt(rec.PESO ?? rec.peso ?? rec.nu_peso ?? null);
  const isBaixoPeso = pesoRaw !== null ? pesoRaw < 2500 : null;

  const ufResidencia = toStr(rec.CODMUNRES
    ? String(rec.CODMUNRES).slice(0, 2) === "12" ? "AC" : null
    : rec.uf_residencia ?? rec.sg_uf_residencia ?? rec.uf ?? null
  );

  const codMunRes = toStr(rec.CODMUNRES ?? rec.codmunres ?? rec.co_municipio_residencia ?? null);

  // Filtro de UF: só AC (residência começa com 12 ou uf=AC)
  const ehAC = ufResidencia === "AC" || (codMunRes !== null && codMunRes.startsWith("12"));

  const dtObitoRaw = toStr(rec.DTOBITO ?? rec.dt_obito ?? rec.data_obito ?? null);
  const dtObito = toDate(dtObitoRaw);
  const anoObito = dtObito ? parseInt(dtObito.slice(0, 4), 10) : ano;

  return {
    raw_id: rawId,
    ano_obito: anoObito,
    data_obito: dtObito,
    tipo_obito: tipoObito,
    codigo_municipio_residencia: codMunRes ? codMunRes.slice(0, 6) : null,
    uf_residencia: ufResidencia,
    codigo_municipio_ocorrencia: toStr(rec.CODMUNOCOR ?? rec.co_municipio_ocorrencia ?? null),
    nome_municipio_ocorrencia: toStr(rec.nm_municipio_ocorrencia ?? null),
    uf_ocorrencia: toStr(rec.CODESTUF ?? rec.uf_ocorrencia ?? null),
    local_ocorrencia: toStr(rec.LOCOCOR ?? rec.local_ocorrencia ?? null),
    cnes_ocorrencia: toStr(rec.CODESTAB ?? rec.co_cnes ?? null),
    idade_original: idadeRaw,
    idade_dias: idadeParsed.idade_dias,
    idade_anos: idadeParsed.idade_anos,
    faixa_etaria: idadeParsed.faixa_etaria,
    is_idade_ignorada: idadeParsed.is_idade_ignorada,
    is_obito_infantil: idadeParsed.is_obito_infantil,
    is_obito_neonatal: idadeParsed.is_obito_neonatal,
    is_obito_pos_neonatal: idadeParsed.is_obito_pos_neonatal,
    sexo: toStr(rec.SEXO ?? rec.sexo ?? null),
    raca_cor: toStr(rec.RACACOR ?? rec.raca_cor ?? null),
    idade_mae: toInt(rec.IDADEMAE ?? rec.idade_mae ?? null),
    semanas_gestacao: toInt(rec.SEMAGESTAC ?? rec.semanas_gestacao ?? null),
    tipo_gravidez: toStr(rec.GRAVIDEZ ?? rec.tipo_gravidez ?? null),
    tipo_parto: toStr(rec.PARTO ?? rec.tipo_parto ?? null),
    obito_parto: toStr(rec.OBITOPARTO ?? rec.obito_parto ?? null),
    peso_gramas: pesoRaw,
    tpmorteoco,
    morte_relacao_gravidez_parto,
    is_obito_materno,
    is_obito_materno_tardio,
    assistencia_medica: toStr(rec.ASSISTMED ?? rec.assistencia_medica ?? null),
    necropsia: toStr(rec.NECROPSIA ?? rec.necropsia ?? null),
    causa_basica: toStr(rec.CAUSABAS ?? rec.causa_basica ?? null),
    cid: toStr(rec.CID ?? rec.cid ?? null),
    is_baixo_peso: isBaixoPeso,
    eh_ac: ehAC,
    fonte_dado: "SIM_API_V1",
    ano_fonte: ano,
    api_endpoint: apiEndpoint,
  };
}

// ─── Carga por ano ────────────────────────────────────────────────────────────

async function carregarAno(ano: string): Promise<number> {
  const anoInt = parseInt(ano, 10);
  const url = `${BASE_URL}${ENDPOINT}`;
  console.log(`\n── Carregando ano ${ano} ──`);
  console.log(`  Nota: API SIM não filtra por UF/ano — filtrando por CODMUNRES='12...' e ano_obito em processo`);

  // Idempotência: apagar dados existentes do ano
  await withPgTransaction(async (client) => {
    await client.query(
      `DELETE FROM dw.fato_sim_obito WHERE ano_obito = $1 AND fonte_dado = 'SIM_API_V1'`,
      [anoInt]
    );
    await client.query(
      `DELETE FROM raw.sim_obitos_raw WHERE ano_fonte = $1`,
      [anoInt]
    );
  });

  let offset = 0;
  let totalInserido = 0;
  let continuar = true;
  let pagina = 1;

  while (continuar) {
    if (MAX_PAGES > 0 && pagina > MAX_PAGES) {
      console.log(`  Limite de páginas atingido (${MAX_PAGES})`);
      break;
    }

    const params = montarParams(offset);

    let parsed: unknown;
    try {
      const resp = await fetchJson(url, params);
      if (resp.status !== 200) {
        console.log(`  HTTP ${resp.status} na página ${pagina} — encerrando`);
        break;
      }
      parsed = JSON.parse(resp.body);
    } catch (err) {
      console.log(`  Erro na página ${pagina}: ${(err as Error).message}`);
      break;
    }

    const registros = extrairRegistros(parsed);
    const total = extrairTotal(parsed);

    if (pagina === 1) {
      console.log(`  Total na API: ${total ?? "desconhecido"}`);
    }

    if (registros.length === 0) {
      continuar = false;
      break;
    }

    // Inserir na raw e processar
    await withPgTransaction(async (client) => {
      for (const rec of registros) {
        const payload = sanitizarPayload(rec);

        // raw
        const rawRes = await client.query<{ id: number }>(
          `INSERT INTO raw.sim_obitos_raw (ano_fonte, api_endpoint, payload_json)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [anoInt, ENDPOINT, JSON.stringify(payload)]
        );
        const rawId = rawRes.rows[0].id;

        const norm = normalizarRegistro(rec, rawId, anoInt, ENDPOINT);

        // Pular registros de fora do AC
        if (!norm.eh_ac) continue;

        // stage
        const stgRes = await client.query<{ id: number }>(
          `INSERT INTO stage.sim_obitos_stg (
            raw_id, ano_obito, data_obito, tipo_obito,
            codigo_municipio_residencia, uf_residencia,
            codigo_municipio_ocorrencia, nome_municipio_ocorrencia, uf_ocorrencia,
            local_ocorrencia, cnes_ocorrencia,
            idade_original, idade_dias, idade_anos, faixa_etaria,
            is_idade_ignorada, is_obito_infantil, is_obito_neonatal, is_obito_pos_neonatal,
            sexo, raca_cor, idade_mae, semanas_gestacao, tipo_gravidez, tipo_parto,
            obito_parto, peso_gramas, tpmorteoco, morte_relacao_gravidez_parto,
            is_obito_materno, is_obito_materno_tardio, assistencia_medica, necropsia,
            causa_basica, cid, fonte_dado, ano_fonte, api_endpoint
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
            $20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38
          ) RETURNING id`,
          [
            norm.raw_id, norm.ano_obito, norm.data_obito, norm.tipo_obito,
            norm.codigo_municipio_residencia, norm.uf_residencia,
            norm.codigo_municipio_ocorrencia, norm.nome_municipio_ocorrencia, norm.uf_ocorrencia,
            norm.local_ocorrencia, norm.cnes_ocorrencia,
            norm.idade_original, norm.idade_dias, norm.idade_anos, norm.faixa_etaria,
            norm.is_idade_ignorada, norm.is_obito_infantil, norm.is_obito_neonatal, norm.is_obito_pos_neonatal,
            norm.sexo, norm.raca_cor, norm.idade_mae, norm.semanas_gestacao, norm.tipo_gravidez, norm.tipo_parto,
            norm.obito_parto, norm.peso_gramas, norm.tpmorteoco, norm.morte_relacao_gravidez_parto,
            norm.is_obito_materno, norm.is_obito_materno_tardio, norm.assistencia_medica, norm.necropsia,
            norm.causa_basica, norm.cid, norm.fonte_dado, norm.ano_fonte, norm.api_endpoint,
          ]
        );
        const stgId = stgRes.rows[0].id;

        // dw
        await client.query(
          `INSERT INTO dw.fato_sim_obito (
            ano_obito, data_obito, tipo_obito,
            codigo_municipio_residencia, uf_residencia,
            codigo_municipio_ocorrencia, uf_ocorrencia,
            local_ocorrencia, cnes_ocorrencia,
            idade_dias, idade_anos, faixa_etaria,
            is_obito_infantil, is_obito_neonatal, is_obito_pos_neonatal,
            sexo, raca_cor, idade_mae, semanas_gestacao, tipo_gravidez, tipo_parto,
            peso_gramas, is_baixo_peso,
            is_obito_materno, is_obito_materno_tardio, morte_relacao_gravidez_parto,
            tpmorteoco, assistencia_medica, necropsia, causa_basica, cid,
            fonte_dado, ano_fonte, api_endpoint
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
            $22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34
          )`,
          [
            norm.ano_obito, norm.data_obito, norm.tipo_obito,
            norm.codigo_municipio_residencia, norm.uf_residencia,
            norm.codigo_municipio_ocorrencia, norm.uf_ocorrencia,
            norm.local_ocorrencia, norm.cnes_ocorrencia,
            norm.idade_dias, norm.idade_anos, norm.faixa_etaria,
            norm.is_obito_infantil, norm.is_obito_neonatal, norm.is_obito_pos_neonatal,
            norm.sexo, norm.raca_cor, norm.idade_mae, norm.semanas_gestacao, norm.tipo_gravidez, norm.tipo_parto,
            norm.peso_gramas, norm.is_baixo_peso,
            norm.is_obito_materno, norm.is_obito_materno_tardio, norm.morte_relacao_gravidez_parto,
            norm.tpmorteoco, norm.assistencia_medica, norm.necropsia, norm.causa_basica, norm.cid,
            norm.fonte_dado, norm.ano_fonte, norm.api_endpoint,
          ]
        );

        totalInserido++;
        void stgId; // usado para garantir inserção sequencial
      }
    });

    console.log(`  Offset ${offset}: ${registros.length} registros baixados (AC inseridos: ${totalInserido})`);

    if (registros.length < PAGE_SIZE) {
      continuar = false;
    } else {
      offset += PAGE_SIZE;
      pagina++;
      await sleep(RATE_LIMIT);
    }
  }

  console.log(`  ✓ Ano ${ano}: ${totalInserido} registros AC inseridos na DW`);
  return totalInserido;
}

// ─── ETL principal ────────────────────────────────────────────────────────────

export async function executarETL(): Promise<void> {
  const inicio = Date.now();
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  SIM — Ingestão API Dados Abertos Saúde v1           ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`Base URL : ${BASE_URL}`);
  console.log(`Endpoint : ${ENDPOINT}`);
  console.log(`Anos     : ${ANOS.join(", ")}`);
  console.log(`UF filtro: ${UF}`);

  let totalGeral = 0;

  try {
    for (const ano of ANOS) {
      const qtd = await carregarAno(ano);
      totalGeral += qtd;
    }

    const duracao = Date.now() - inicio;
    await pgQuery(
      `INSERT INTO audit.etl_log (modulo, status, mensagem, registros, duracao_ms)
       VALUES ($1, 'OK', $2, $3, $4)`,
      [MODULO, `Anos: ${ANOS.join(", ")} | UF: ${UF}`, totalGeral, duracao]
    );

    console.log(`\n✓ ETL concluído — ${totalGeral} registros em ${Math.round(duracao / 1000)}s`);
  } catch (err) {
    const duracao = Date.now() - inicio;
    await pgQuery(
      `INSERT INTO audit.etl_log (modulo, status, mensagem, duracao_ms)
       VALUES ($1, 'ERRO', $2, $3)`,
      [MODULO, (err as Error).message, duracao]
    ).catch(() => { /* não bloquear em falha de log */ });
    throw err;
  } finally {
    await closePgPool();
  }
}

if (require.main === module) {
  executarETL().then(() => process.exit(0)).catch((err) => {
    console.error("Erro fatal:", (err as Error).message);
    process.exit(1);
  });
}
