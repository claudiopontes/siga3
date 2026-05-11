/**
 * infodengue-full-postgres.ts
 *
 * Carga completa InfoDengue/AlertaDengue → PostgreSQL (raw → stage → dw).
 *
 * Fluxo:
 *   1. Busca municípios do Acre em public.dim_ente (fallback: lista fixa)
 *   2. Para cada município × doença × janela de anos:
 *      a. Chama API InfoDengue (format=json)
 *      b. Grava payload bruto em raw.infodengue_raw
 *      c. Normaliza e upsert em stage.infodengue_stg
 *      d. Upsert em dw.fato_infodengue_semana
 *   3. Registra audit.etl_log
 *
 * Idempotente: usa ON CONFLICT (codigo_municipio_ibge, doenca, ano_epidemiologico,
 * semana_epidemiologica) DO UPDATE em stage e dw.
 *
 * Variáveis de ambiente (.env):
 *   INFODENGUE_API_BASE_URL   — base da API
 *   INFODENGUE_UF             — sigla UF (padrão: AC)
 *   INFODENGUE_ANO_INICIO     — ano inicial
 *   INFODENGUE_ANO_FIM        — ano final
 *   INFODENGUE_SEMANA_INICIO  — semana início (padrão: 1)
 *   INFODENGUE_SEMANA_FIM     — semana fim    (padrão: 53)
 *   INFODENGUE_DOENCAS        — lista separada por vírgula (padrão: dengue,chikungunya,zika)
 *   INFODENGUE_TIMEOUT_MS     — timeout por requisição
 *   INFODENGUE_RATE_LIMIT_MS  — pausa entre requisições
 *
 * Uso: cd etl && npm run infodengue:full:postgres
 */

import "dotenv/config";
import { pgQuery, closePgPool } from "../connectors/postgres";

// ─── Configuração ─────────────────────────────────────────────────────────────

const MODULO     = "infodengue_full";
const BASE_URL   = (process.env.INFODENGUE_API_BASE_URL ?? "https://info.dengue.mat.br/api/alertcity").replace(/\/$/, "");
const UF         = process.env.INFODENGUE_UF            ?? "AC";
const ANO_INICIO = Number(process.env.INFODENGUE_ANO_INICIO    ?? "2024");
const ANO_FIM    = Number(process.env.INFODENGUE_ANO_FIM       ?? "2026");
const SEM_INICIO = Number(process.env.INFODENGUE_SEMANA_INICIO ?? "1");
const SEM_FIM    = Number(process.env.INFODENGUE_SEMANA_FIM    ?? "53");
const TIMEOUT_MS = Number(process.env.INFODENGUE_TIMEOUT_MS    ?? "30000");
const RATE_LIMIT = Number(process.env.INFODENGUE_RATE_LIMIT_MS ?? "500");
const DOENCAS    = (process.env.INFODENGUE_DOENCAS ?? "dengue,chikungunya,zika")
  .split(",").map(d => d.trim()).filter(Boolean);

// ─── Municípios do Acre — fallback fixo (22 municípios, códigos IBGE 7 dígitos) ──

const MUNICIPIOS_ACRE_FALLBACK: Array<{ codigo: string; nome: string }> = [
  { codigo: "1200013", nome: "Acrelândia" },
  { codigo: "1200054", nome: "Assis Brasil" },
  { codigo: "1200104", nome: "Brasiléia" },
  { codigo: "1200138", nome: "Bujari" },
  { codigo: "1200179", nome: "Capixaba" },
  { codigo: "1200203", nome: "Cruzeiro do Sul" },
  { codigo: "1200252", nome: "Epitaciolândia" },
  { codigo: "1200302", nome: "Feijó" },
  { codigo: "1200328", nome: "Jordão" },
  { codigo: "1200336", nome: "Mâncio Lima" },
  { codigo: "1200344", nome: "Manoel Urbano" },
  { codigo: "1200351", nome: "Marechal Thaumaturgo" },
  { codigo: "1200385", nome: "Plácido de Castro" },
  { codigo: "1200393", nome: "Porto Walter" },
  { codigo: "1200401", nome: "Rio Branco" },
  { codigo: "1200427", nome: "Rodrigues Alves" },
  { codigo: "1200435", nome: "Santa Rosa do Purus" },
  { codigo: "1200450", nome: "Senador Guiomard" },
  { codigo: "1200500", nome: "Sena Madureira" },
  { codigo: "1200609", nome: "Tarauacá" },
  { codigo: "1200708", nome: "Xapuri" },
  { codigo: "1200807", nome: "Porto Acre" },
];

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Municipio { codigo: string; nome: string; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InfoDengueRow = Record<string, any>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

function toDate(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  // InfoDengue retorna "YYYY-MM-DDTHH:MM:SS" ou "YYYY-MM-DD"
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function toInt(v: unknown): number | null {
  const n = toNum(v);
  if (n === null) return null;
  return Math.round(n);
}

// ─── Busca municípios do banco ────────────────────────────────────────────────

async function buscarMunicipios(): Promise<Municipio[]> {
  try {
    // Tenta buscar de dim_ente filtrando pela UF (cod_ibge começa com 12 = Acre)
    const rows = await pgQuery<{ cod_ibge: string; nome_ente: string }>(
      `SELECT DISTINCT cod_ibge::text AS cod_ibge, nome_ente
       FROM public.dim_ente
       WHERE cod_ibge IS NOT NULL
         AND cod_ibge::text LIKE '12%'
         AND length(cod_ibge::text) = 7
       ORDER BY nome_ente`,
    );
    if (rows.length > 0) {
      console.log(`  Municípios carregados de dim_ente: ${rows.length}`);
      return rows.map(r => ({ codigo: r.cod_ibge, nome: r.nome_ente }));
    }
  } catch {
    // Fallback silencioso
  }
  console.log(`  Usando lista fixa de municípios do Acre (${MUNICIPIOS_ACRE_FALLBACK.length})`);
  return MUNICIPIOS_ACRE_FALLBACK;
}

// ─── Chamada API InfoDengue ───────────────────────────────────────────────────

async function chamarApi(
  geocode: string,
  doenca: string,
): Promise<{ ok: boolean; dados: InfoDengueRow[]; url: string; erro?: string }> {
  const url = `${BASE_URL}?geocode=${geocode}&disease=${doenca}&format=json` +
    `&ew_start=${SEM_INICIO}&ew_end=${SEM_FIM}&ey_start=${ANO_INICIO}&ey_end=${ANO_FIM}`;

  try {
    const resp = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Varadouro-Digital-ETL/1.0 (TCE-AC)" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!resp.ok) {
      return { ok: false, dados: [], url, erro: `HTTP ${resp.status}` };
    }

    const texto = await resp.text();
    try {
      const dados = JSON.parse(texto);
      if (!Array.isArray(dados)) {
        return { ok: false, dados: [], url, erro: `Resposta não é array: ${texto.slice(0, 80)}` };
      }
      return { ok: true, dados, url };
    } catch {
      return { ok: false, dados: [], url, erro: `JSON inválido: ${texto.slice(0, 80)}` };
    }
  } catch (e) {
    return { ok: false, dados: [], url, erro: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Persistência raw ─────────────────────────────────────────────────────────

async function gravarRaw(
  geocode: string, nome: string, doenca: string, url: string, payload: InfoDengueRow[],
): Promise<void> {
  await pgQuery(
    `INSERT INTO raw.infodengue_raw
       (codigo_municipio_ibge, nome_municipio, uf, doenca,
        ano_inicio, ano_fim, semana_inicio, semana_fim, endpoint, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [geocode, nome, UF, doenca, ANO_INICIO, ANO_FIM, SEM_INICIO, SEM_FIM, url, JSON.stringify(payload)],
  );
}

// ─── Normalização e upsert stage + dw ────────────────────────────────────────

async function processarLinhas(
  geocode: string,
  nome: string,
  doenca: string,
  linhas: InfoDengueRow[],
): Promise<number> {
  let upsertados = 0;

  for (const row of linhas) {
    // Extrai semana e ano do campo SE (formato: YYYYWW)
    const seRaw = String(row.SE ?? "");
    const anoEpi = seRaw.length >= 4 ? Number(seRaw.slice(0, 4)) : null;
    const semEpi = seRaw.length >= 6 ? Number(seRaw.slice(4, 6)) : null;

    const payload = JSON.stringify(row);

    // Upsert stage
    await pgQuery(
      `INSERT INTO stage.infodengue_stg
         (codigo_municipio_ibge, nome_municipio, uf, doenca,
          data_inicio_semana, semana_epidemiologica, ano_epidemiologico,
          casos, casos_est, casos_est_min, casos_est_max,
          p_rt1, p_inc100k, nivel, rt, populacao,
          receptivo, transmissao, nivel_inc, notif_accum_year,
          payload, coletado_em)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,now())
       ON CONFLICT (codigo_municipio_ibge, doenca, ano_epidemiologico, semana_epidemiologica)
       DO UPDATE SET
         data_inicio_semana    = EXCLUDED.data_inicio_semana,
         casos                 = EXCLUDED.casos,
         casos_est             = EXCLUDED.casos_est,
         casos_est_min         = EXCLUDED.casos_est_min,
         casos_est_max         = EXCLUDED.casos_est_max,
         p_rt1                 = EXCLUDED.p_rt1,
         p_inc100k             = EXCLUDED.p_inc100k,
         nivel                 = EXCLUDED.nivel,
         rt                    = EXCLUDED.rt,
         populacao             = EXCLUDED.populacao,
         receptivo             = EXCLUDED.receptivo,
         transmissao           = EXCLUDED.transmissao,
         nivel_inc             = EXCLUDED.nivel_inc,
         notif_accum_year      = EXCLUDED.notif_accum_year,
         payload               = EXCLUDED.payload,
         coletado_em           = now()`,
      [
        geocode, nome, UF, doenca,
        toDate(row.data_iniSE), toInt(semEpi), toInt(anoEpi),
        toNum(row.casos), toNum(row.casos_est), toNum(row.casos_est_min), toNum(row.casos_est_max),
        toNum(row.p_rt1), toNum(row.p_inc100k), toInt(row.nivel), toNum(row.Rt), toNum(row.pop),
        toInt(row.receptivo), toInt(row.transmissao), toInt(row.nivel_inc), toNum(row.notif_accum_year),
        payload,
      ],
    );

    // Upsert dw
    await pgQuery(
      `INSERT INTO dw.fato_infodengue_semana
         (codigo_municipio_ibge, nome_municipio, uf, doenca,
          data_inicio_semana, semana_epidemiologica, ano_epidemiologico,
          casos, casos_est, casos_est_min, casos_est_max,
          p_rt1, p_inc100k, nivel, rt, populacao,
          receptivo, transmissao, nivel_inc, notif_accum_year,
          payload, coletado_em, atualizado_em)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,now(),now())
       ON CONFLICT (codigo_municipio_ibge, doenca, ano_epidemiologico, semana_epidemiologica)
       DO UPDATE SET
         data_inicio_semana    = EXCLUDED.data_inicio_semana,
         casos                 = EXCLUDED.casos,
         casos_est             = EXCLUDED.casos_est,
         casos_est_min         = EXCLUDED.casos_est_min,
         casos_est_max         = EXCLUDED.casos_est_max,
         p_rt1                 = EXCLUDED.p_rt1,
         p_inc100k             = EXCLUDED.p_inc100k,
         nivel                 = EXCLUDED.nivel,
         rt                    = EXCLUDED.rt,
         populacao             = EXCLUDED.populacao,
         receptivo             = EXCLUDED.receptivo,
         transmissao           = EXCLUDED.transmissao,
         nivel_inc             = EXCLUDED.nivel_inc,
         notif_accum_year      = EXCLUDED.notif_accum_year,
         payload               = EXCLUDED.payload,
         atualizado_em         = now()`,
      [
        geocode, nome, UF, doenca,
        toDate(row.data_iniSE), toInt(semEpi), toInt(anoEpi),
        toNum(row.casos), toNum(row.casos_est), toNum(row.casos_est_min), toNum(row.casos_est_max),
        toNum(row.p_rt1), toNum(row.p_inc100k), toInt(row.nivel), toNum(row.Rt), toNum(row.pop),
        toInt(row.receptivo), toInt(row.transmissao), toInt(row.nivel_inc), toNum(row.notif_accum_year),
        payload,
      ],
    );

    upsertados++;
  }

  return upsertados;
}

// ─── Log de auditoria ─────────────────────────────────────────────────────────

async function gravarLog(
  status: "sucesso" | "erro",
  registros: number,
  duracao: number,
  mensagem?: string,
): Promise<void> {
  await pgQuery(
    `INSERT INTO audit.etl_log (modulo, status, registros, duracao_ms, mensagem)
     VALUES ($1,$2,$3,$4,$5)`,
    [MODULO, status, registros, duracao, mensagem ?? null],
  ).catch(() => void 0);
}

// ─── Ponto de entrada ─────────────────────────────────────────────────────────

export async function executarETLInfoDengue(): Promise<void> {
  const inicio = Date.now();
  console.log(`[${new Date().toISOString()}] Iniciando ETL: ${MODULO}`);
  console.log(`  Base URL : ${BASE_URL}`);
  console.log(`  UF       : ${UF}`);
  console.log(`  Anos     : ${ANO_INICIO}–${ANO_FIM} | Semanas: ${SEM_INICIO}–${SEM_FIM}`);
  console.log(`  Doenças  : ${DOENCAS.join(", ")}`);

  let totalRegistros = 0;
  let totalErros     = 0;

  const municipios = await buscarMunicipios();
  console.log(`  Municípios: ${municipios.length}\n`);

  for (const mun of municipios) {
    for (const doenca of DOENCAS) {
      process.stdout.write(`  ${mun.nome} / ${doenca} ... `);

      const { ok, dados, url, erro } = await chamarApi(mun.codigo, doenca);
      await sleep(RATE_LIMIT);

      if (!ok) {
        console.log(`ERRO: ${erro}`);
        console.log(`    URL: ${url}`);
        totalErros++;
        continue;
      }

      if (dados.length === 0) {
        console.log(`sem dados`);
        continue;
      }

      try {
        await gravarRaw(mun.codigo, mun.nome, doenca, url, dados);
        const n = await processarLinhas(mun.codigo, mun.nome, doenca, dados);
        totalRegistros += n;
        console.log(`${n} semanas`);
      } catch (e) {
        console.log(`ERRO ao persistir: ${e instanceof Error ? e.message : String(e)}`);
        totalErros++;
      }
    }
  }

  const duracao = Date.now() - inicio;
  console.log(`\n[${new Date().toISOString()}] ETL concluído em ${duracao}ms`);
  console.log(`  Registros gravados: ${totalRegistros} | Erros: ${totalErros}`);

  const status = totalErros > 0 && totalRegistros === 0 ? "erro" : "sucesso";
  const msg    = totalErros > 0 ? `${totalErros} erros de API` : undefined;
  await gravarLog(status, totalRegistros, duracao, msg);
}

if (require.main === module) {
  executarETLInfoDengue()
    .catch((err) => {
      console.error("[infodengue:full] Erro fatal:", (err as Error).message);
      process.exit(1);
    })
    .finally(() => closePgPool());
}
