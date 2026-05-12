/**
 * ingest-pni.ts
 *
 * Carga completa PNI doses aplicadas → PostgreSQL (raw → stage → dw).
 * Fonte: API oficial https://apidadosabertos.saude.gov.br/v1/
 * Endpoints: GET /vacinacao/doses-aplicadas/pni-{ano}
 *
 * Fluxo:
 *   1. Para cada ano configurado em PNI_ANOS:
 *      a. Pagina a API filtrando por UF (co_uf)
 *      b. Grava payload sem campos sensíveis em raw.pni_doses_raw
 *      c. Normaliza e upsert em stage.pni_doses_stg
 *      d. Upsert em dw.fato_pni_dose (deduplicado por co_dose_id + ano)
 *   2. Registra audit.etl_log
 *
 * Privacidade: co_paciente, co_documento e campos equivalentes
 * NÃO são gravados em nenhuma camada.
 *
 * Idempotente: ON CONFLICT (co_dose_id, ano) DO UPDATE em dw.fato_pni_dose.
 *
 * Uso: cd etl && npm run pni:ingest
 */

import "dotenv/config";
import * as https from "https";
import * as http from "http";
import { pgQuery, withPgTransaction, closePgPool } from "../connectors/postgres";

// ─── Configuração ─────────────────────────────────────────────────────────────

const MODULO     = "pni_ingest";
const BASE_URL   = (process.env.PNI_API_BASE_URL  ?? "https://apidadosabertos.saude.gov.br/v1").replace(/\/$/, "");
const ANOS       = (process.env.PNI_ANOS          ?? "2025,2026").split(",").map(s => s.trim()).filter(Boolean);
const UF         = process.env.PNI_UF             ?? "AC";
const PAGE_SIZE  = parseInt(process.env.PNI_PAGE_SIZE ?? "1000", 10);
const MAX_PAGES  = process.env.PNI_MAX_PAGES ? parseInt(process.env.PNI_MAX_PAGES, 10) : 0; // 0 = sem limite
const TIMEOUT_MS = parseInt(process.env.PNI_TIMEOUT_MS  ?? "30000", 10);
const RATE_LIMIT = parseInt(process.env.PNI_RATE_LIMIT_MS ?? "500", 10);

const UA = "Varadouro-Digital-ETL/1.0 (TCE-AC PNI ingest)";

// Campos que NUNCA devem ser gravados
const CAMPOS_SENSIVEIS = new Set([
  "co_paciente", "co_documento", "nu_cpf", "nu_cns", "nu_pis",
  "nome_paciente", "ds_nome", "no_paciente",
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
  doses?: AnyRecord[];
  [key: string]: unknown;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizar6(cod: string | null | undefined): string | null {
  if (!cod) return null;
  const s = String(cod).trim();
  if (s.length >= 7) return s.slice(0, 6);
  return s.padStart(6, "0");
}

function toDate(val: unknown): string | null {
  if (!val) return null;
  const s = String(val).trim();
  if (!s || s === "null") return null;
  // ISO: 2025-01-15, ou 15/01/2025
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split("/");
    return `${y}-${m}-${d}`;
  }
  return null;
}

function toStr(val: unknown): string | null {
  if (val === null || val === undefined || val === "") return null;
  return String(val).trim() || null;
}

function calcularIdade(dtNasc: string | null, dtAplic: string | null): number | null {
  if (!dtNasc || !dtAplic) return null;
  try {
    const nasc = new Date(dtNasc);
    const aplic = new Date(dtAplic);
    if (isNaN(nasc.getTime()) || isNaN(aplic.getTime())) return null;
    let idade = aplic.getFullYear() - nasc.getFullYear();
    const mesAntes = aplic.getMonth() < nasc.getMonth() ||
      (aplic.getMonth() === nasc.getMonth() && aplic.getDate() < nasc.getDate());
    if (mesAntes) idade--;
    return idade >= 0 && idade < 150 ? idade : null;
  } catch {
    return null;
  }
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

// ─── HTTP ─────────────────────────────────────────────────────────────────────

async function fetchPage(ano: string, page: number): Promise<{ body: string; status: number }> {
  const endpoint = `/vacinacao/doses-aplicadas/pni-${ano}`;
  const params = new URLSearchParams({ co_uf: UF, page: String(page), pageSize: String(PAGE_SIZE) });
  const url = `${BASE_URL}${endpoint}?${params}`;

  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, { headers: { "User-Agent": UA, "Accept": "application/json" } }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve({ body: data, status: res.statusCode ?? 0 }));
    });
    req.setTimeout(TIMEOUT_MS, () => { req.destroy(); reject(new Error(`Timeout após ${TIMEOUT_MS}ms`)); });
    req.on("error", reject);
  });
}

function extrairRegistros(parsed: RespostaApi): AnyRecord[] {
  for (const campo of ["data", "items", "registros", "result", "doses", "content"]) {
    if (Array.isArray(parsed[campo])) return parsed[campo] as AnyRecord[];
  }
  if (Array.isArray(parsed)) return parsed as AnyRecord[];
  return [];
}

function extrairTotal(parsed: RespostaApi): number | null {
  for (const campo of ["totalRegistros", "total", "count", "totalElements"]) {
    if (typeof parsed[campo] === "number") return parsed[campo] as number;
  }
  return null;
}

// ─── ETL por ano ──────────────────────────────────────────────────────────────

async function processarAno(ano: string): Promise<number> {
  console.log(`\n[${MODULO}] ── Ano ${ano} ──`);
  let totalGravado = 0;
  let pagina = 1;

  while (true) {
    if (MAX_PAGES > 0 && pagina > MAX_PAGES) {
      console.log(`[${MODULO}] Limite de páginas atingido (${MAX_PAGES})`);
      break;
    }

    console.log(`[${MODULO}]   Buscando página ${pagina}...`);
    const { body, status } = await fetchPage(ano, pagina);

    if (status !== 200) {
      console.error(`[${MODULO}] HTTP ${status} na página ${pagina} — abortando ano ${ano}`);
      break;
    }

    let parsed: RespostaApi;
    try {
      parsed = JSON.parse(body) as RespostaApi;
    } catch {
      console.error(`[${MODULO}] Resposta não é JSON (possível WAF) — abortando ano ${ano}`);
      console.error(`  Preview: ${body.slice(0, 200)}`);
      break;
    }

    const registros = extrairRegistros(parsed);
    if (registros.length === 0) {
      console.log(`[${MODULO}]   Nenhum registro na página ${pagina} — fim.`);
      break;
    }

    if (pagina === 1) {
      const total = extrairTotal(parsed);
      const totalPages = total ? Math.ceil(total / PAGE_SIZE) : "?";
      console.log(`[${MODULO}]   Total API: ${total ?? "?"} registros ≈ ${totalPages} páginas`);
    }

    await withPgTransaction(async (client) => {
      for (const rec of registros) {
        const payload = sanitizarPayload(rec);

        // raw
        const rawRes = await client.query<{ id: number }>(`
          INSERT INTO raw.pni_doses_raw (
            ano, co_dose_id, co_uf, co_municipio_ibge, ds_municipio,
            dt_aplicacao, no_imunobiologico, ds_dose, ds_grupo_atendimento,
            dt_nascimento_paciente, nu_cnes_estabelecimento,
            nu_lote, ds_fabricante, no_raca_cor, sistema_origem, payload_json
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
          RETURNING id
        `, [
          parseInt(ano, 10),
          toStr(rec.co_dose_id ?? rec.id_dose ?? rec.nu_dose),
          toStr(rec.co_uf ?? rec.sg_uf ?? rec.uf),
          toStr(rec.co_municipio_ibge ?? rec.co_ibge ?? rec.co_municipio),
          toStr(rec.ds_municipio ?? rec.no_municipio),
          toDate(rec.dt_aplicacao ?? rec.data_aplicacao),
          toStr(rec.no_imunobiologico ?? rec.ds_imunobiologico ?? rec.vacina),
          toStr(rec.ds_dose ?? rec.nu_dose_descricao ?? rec.dose),
          toStr(rec.ds_grupo_atendimento ?? rec.grupo_atendimento),
          toDate(rec.dt_nascimento_paciente ?? rec.dt_nascimento),
          toStr(rec.nu_cnes_estabelecimento ?? rec.co_cnes ?? rec.cnes),
          toStr(rec.nu_lote ?? rec.lote),
          toStr(rec.ds_fabricante ?? rec.fabricante),
          toStr(rec.no_raca_cor ?? rec.raca_cor),
          toStr(rec.sistema_origem ?? rec.ds_sistema_origem),
          JSON.stringify(payload),
        ]);

        const rawId = rawRes.rows[0].id;
        const dtAplic = toDate(rec.dt_aplicacao ?? rec.data_aplicacao);
        const dtNasc  = toDate(rec.dt_nascimento_paciente ?? rec.dt_nascimento);
        const coMun   = toStr(rec.co_municipio_ibge ?? rec.co_ibge ?? rec.co_municipio);
        const coMun6  = normalizar6(coMun);
        const doseId  = toStr(rec.co_dose_id ?? rec.id_dose ?? rec.nu_dose);

        // stage
        const stgRes = await client.query<{ id: number }>(`
          INSERT INTO stage.pni_doses_stg (
            raw_id, ano, co_dose_id, co_uf, co_municipio_ibge_6, ds_municipio,
            dt_aplicacao, no_imunobiologico, ds_dose, ds_grupo_atendimento,
            idade_anos, nu_cnes_estabelecimento, ds_fabricante, no_raca_cor, sistema_origem
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
          RETURNING id
        `, [
          rawId,
          parseInt(ano, 10),
          doseId,
          toStr(rec.co_uf ?? rec.sg_uf ?? rec.uf),
          coMun6,
          toStr(rec.ds_municipio ?? rec.no_municipio),
          dtAplic,
          toStr(rec.no_imunobiologico ?? rec.ds_imunobiologico ?? rec.vacina),
          toStr(rec.ds_dose ?? rec.nu_dose_descricao ?? rec.dose),
          toStr(rec.ds_grupo_atendimento ?? rec.grupo_atendimento),
          calcularIdade(dtNasc, dtAplic),
          toStr(rec.nu_cnes_estabelecimento ?? rec.co_cnes ?? rec.cnes),
          toStr(rec.ds_fabricante ?? rec.fabricante),
          toStr(rec.no_raca_cor ?? rec.raca_cor),
          toStr(rec.sistema_origem ?? rec.ds_sistema_origem),
        ]);

        void stgRes; // confirmação de insert

        // dw — idempotente por co_dose_id + ano
        if (doseId) {
          await client.query(`
            INSERT INTO dw.fato_pni_dose (
              ano, co_dose_id, co_uf, co_municipio_ibge_6, ds_municipio,
              dt_aplicacao, no_imunobiologico, ds_dose, ds_grupo_atendimento,
              idade_anos, nu_cnes_estabelecimento, ds_fabricante, no_raca_cor, sistema_origem
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
            ON CONFLICT (co_dose_id, ano) DO UPDATE SET
              co_municipio_ibge_6     = EXCLUDED.co_municipio_ibge_6,
              ds_municipio            = EXCLUDED.ds_municipio,
              dt_aplicacao            = EXCLUDED.dt_aplicacao,
              no_imunobiologico       = EXCLUDED.no_imunobiologico,
              ds_dose                 = EXCLUDED.ds_dose,
              ds_grupo_atendimento    = EXCLUDED.ds_grupo_atendimento,
              idade_anos              = EXCLUDED.idade_anos,
              nu_cnes_estabelecimento = EXCLUDED.nu_cnes_estabelecimento,
              ds_fabricante           = EXCLUDED.ds_fabricante,
              no_raca_cor             = EXCLUDED.no_raca_cor,
              sistema_origem          = EXCLUDED.sistema_origem,
              atualizado_em           = now()
          `, [
            parseInt(ano, 10),
            doseId,
            toStr(rec.co_uf ?? rec.sg_uf ?? rec.uf),
            coMun6,
            toStr(rec.ds_municipio ?? rec.no_municipio),
            dtAplic,
            toStr(rec.no_imunobiologico ?? rec.ds_imunobiologico ?? rec.vacina),
            toStr(rec.ds_dose ?? rec.nu_dose_descricao ?? rec.dose),
            toStr(rec.ds_grupo_atendimento ?? rec.grupo_atendimento),
            calcularIdade(dtNasc, dtAplic),
            toStr(rec.nu_cnes_estabelecimento ?? rec.co_cnes ?? rec.cnes),
            toStr(rec.ds_fabricante ?? rec.fabricante),
            toStr(rec.no_raca_cor ?? rec.raca_cor),
            toStr(rec.sistema_origem ?? rec.ds_sistema_origem),
          ]);
        } else {
          // Sem co_dose_id: insere sem deduplicação
          await client.query(`
            INSERT INTO dw.fato_pni_dose (
              ano, co_dose_id, co_uf, co_municipio_ibge_6, ds_municipio,
              dt_aplicacao, no_imunobiologico, ds_dose, ds_grupo_atendimento,
              idade_anos, nu_cnes_estabelecimento, ds_fabricante, no_raca_cor, sistema_origem
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
          `, [
            parseInt(ano, 10), null,
            toStr(rec.co_uf ?? rec.sg_uf ?? rec.uf),
            coMun6,
            toStr(rec.ds_municipio ?? rec.no_municipio),
            dtAplic,
            toStr(rec.no_imunobiologico ?? rec.ds_imunobiologico ?? rec.vacina),
            toStr(rec.ds_dose ?? rec.nu_dose_descricao ?? rec.dose),
            toStr(rec.ds_grupo_atendimento ?? rec.grupo_atendimento),
            calcularIdade(dtNasc, dtAplic),
            toStr(rec.nu_cnes_estabelecimento ?? rec.co_cnes ?? rec.cnes),
            toStr(rec.ds_fabricante ?? rec.fabricante),
            toStr(rec.no_raca_cor ?? rec.raca_cor),
            toStr(rec.sistema_origem ?? rec.ds_sistema_origem),
          ]);
        }
      }
    });

    totalGravado += registros.length;
    console.log(`[${MODULO}]   Página ${pagina}: ${registros.length} registros (total: ${totalGravado})`);

    if (registros.length < PAGE_SIZE) break; // última página
    pagina++;
    await sleep(RATE_LIMIT);
  }

  return totalGravado;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function executarETLPni(): Promise<void> {
  const inicio = Date.now();
  console.log(`[${MODULO}] Iniciando carga PNI doses aplicadas — UF=${UF} Anos=${ANOS.join(",")}`);

  let totalGlobal = 0;
  for (const ano of ANOS) {
    totalGlobal += await processarAno(ano);
  }

  const duracao = Date.now() - inicio;
  console.log(`\n[${MODULO}] Carga concluída: ${totalGlobal} registros em ${duracao}ms`);

  await pgQuery(`
    INSERT INTO audit.etl_log (modulo, status, mensagem, registros, duracao_ms)
    VALUES ($1, 'OK', $2, $3, $4)
  `, [MODULO, `PNI doses aplicadas UF=${UF} anos=${ANOS.join(",")}`, totalGlobal, duracao]);
}

if (require.main === module) {
  executarETLPni()
    .then(() => closePgPool())
    .catch((err) => {
      console.error(`[${MODULO}] Erro fatal:`, (err as Error).message);
      closePgPool().catch(() => void 0);
      process.exit(1);
    });
}
