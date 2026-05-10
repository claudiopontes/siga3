/**
 * cnes-ubs-full-postgres.ts
 *
 * Carga de estabelecimentos CNES e UBS do Acre para PostgreSQL local.
 * Fonte: API CKAN do OpenDataSUS — https://opendatasus.saude.gov.br/api/3/action
 *
 * Endpoint CKAN: /datastore_search?resource_id={id}&filters={...}&limit={n}&offset={n}
 * Filtro por UF: campo identificado na inspeção (ex: "CO_UF", "UF", "SG_UF").
 *
 * Estratégia idempotente:
 *   - TRUNCATE stage; INSERT normalizado
 *   - UPSERT em dw por cnes (PK)
 *
 * Variáveis de ambiente:
 *   CNES_API_BASE_URL   — base da API CKAN
 *   CNES_RESOURCE_ID    — resource_id do dataset CNES
 *   UBS_RESOURCE_ID     — resource_id do dataset UBS
 *   CNES_UF             — UF para filtrar (padrão: AC)
 *   CNES_TIMEOUT_MS     — timeout por requisição
 *   CNES_RATE_LIMIT_MS  — intervalo entre páginas
 *
 * Uso: cd etl && npm run cnes-ubs:full:postgres
 */

import "dotenv/config";
import { pgQuery, withPgTransaction, closePgPool } from "../connectors/postgres";

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

const BASE_URL      = (process.env.CNES_API_BASE_URL || "https://opendatasus.saude.gov.br/api/3/action").replace(/\/$/, "");
const CNES_UF       = process.env.CNES_UF || "AC";
const TIMEOUT_MS    = parseInt(process.env.CNES_TIMEOUT_MS    || "30000", 10);
const RATE_LIMIT    = parseInt(process.env.CNES_RATE_LIMIT_MS || "500",   10);
const CNES_RES_ID   = process.env.CNES_RESOURCE_ID || "";
const UBS_RES_ID    = process.env.UBS_RESOURCE_ID  || "";
const PAGE_SIZE     = 1000;

// Código IBGE de 6 dígitos dos municípios do Acre — para filtro local quando API não suportar UF
const IBGE_AC_PREFIXO = "12";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface DatastorePage {
  success: boolean;
  result?: {
    total:   number;
    fields:  Array<{ id: string; type: string }>;
    records: Record<string, unknown>[];
  };
  error?: { message: string };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchPage(resourceId: string, offset: number, ufFilter?: string): Promise<DatastorePage | null> {
  let url = `${BASE_URL}/datastore_search?resource_id=${resourceId}&limit=${PAGE_SIZE}&offset=${offset}`;
  if (ufFilter) {
    // tenta filtrar por UF no CKAN (campo mais comum: SG_UF ou CO_UF)
    // será verificado na primeira página; se não funcionar, filtra localmente
    url += `&q=${encodeURIComponent(ufFilter)}`;
  }

  try {
    const resp = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "Varadouro-Digital-ETL/1.0 (interno TCE-AC)" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!resp.ok) {
      console.error(`  ✗ HTTP ${resp.status} em ${url}`);
      return null;
    }
    return await resp.json() as DatastorePage;
  } catch (err) {
    console.error(`  ✗ Erro de rede: ${(err as Error).message}`);
    return null;
  }
}

// Detecta o nome do campo UF nos registros retornados
function detectarCampoUf(fields: Array<{ id: string }>): string | null {
  const candidatos = ["SG_UF", "CO_ESTADO_GESTOR", "sg_uf", "UF", "uf", "CO_UF", "co_uf", "SG_UF_GEOGRAFICA"];
  for (const c of candidatos) {
    if (fields.some(f => f.id === c)) return c;
  }
  return null;
}

function detectarCampoCnes(fields: Array<{ id: string }>): string | null {
  const candidatos = ["CO_CNES", "co_cnes", "CNES", "cnes", "CO_UNIDADE", "co_unidade"];
  for (const c of candidatos) {
    if (fields.some(f => f.id === c)) return c;
  }
  return null;
}

function detectarCampoIbge(fields: Array<{ id: string }>): string | null {
  const candidatos = ["CO_MUNICIPIO_GESTOR", "CO_MUNICIPIO", "co_municipio", "CO_IBGE", "co_ibge", "MUNICIPIO_IBGE"];
  for (const c of candidatos) {
    if (fields.some(f => f.id === c)) return c;
  }
  return null;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v).trim() || null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? null : n;
}

function dateParse(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  // formatos: YYYYMMDD, YYYY-MM-DD, DD/MM/YYYY
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) return `${s.slice(6, 10)}-${s.slice(3, 5)}-${s.slice(0, 2)}`;
  return null;
}

function boolSus(v: unknown): boolean | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().toUpperCase();
  if (s === "S" || s === "SIM" || s === "1" || s === "TRUE") return true;
  if (s === "N" || s === "NAO" || s === "NÃO" || s === "0" || s === "FALSE") return false;
  return null;
}

// ---------------------------------------------------------------------------
// Normalização CNES
// ---------------------------------------------------------------------------

interface EstabNormalizado {
  cnes:                  string | null;
  nome_estabelecimento:  string | null;
  codigo_municipio_ibge: string | null;
  nome_municipio:        string | null;
  uf:                    string | null;
  tipo_estabelecimento:  string | null;
  natureza_juridica:     string | null;
  gestao:                string | null;
  esfera_administrativa: string | null;
  atende_sus:            boolean | null;
  situacao:              string | null;
  data_atualizacao:      string | null;
  latitude:              number | null;
  longitude:             number | null;
  endereco:              string | null;
  bairro:                string | null;
  cep:                   string | null;
  telefone:              string | null;
}

function normalizarEstab(rec: Record<string, unknown>): EstabNormalizado {
  // mapeamento defensivo — campos variam conforme versão do dataset
  return {
    cnes:                  str(rec.CO_CNES ?? rec.co_cnes ?? rec.CNES ?? rec.cnes ?? rec.CO_UNIDADE ?? rec.co_unidade),
    nome_estabelecimento:  str(rec.NO_FANTASIA ?? rec.no_fantasia ?? rec.NO_RAZAO_SOCIAL ?? rec.no_razao_social ?? rec.NOME ?? rec.nome),
    codigo_municipio_ibge: str(rec.CO_MUNICIPIO_GESTOR ?? rec.CO_MUNICIPIO ?? rec.co_municipio ?? rec.CO_IBGE ?? rec.co_ibge),
    nome_municipio:        str(rec.NO_MUNICIPIO ?? rec.no_municipio ?? rec.MUNICIPIO ?? rec.municipio),
    uf:                    str(rec.SG_UF_GEOGRAFICA ?? rec.SG_UF ?? rec.sg_uf ?? rec.UF ?? rec.uf ?? rec.CO_ESTADO_GESTOR ?? rec.co_estado_gestor),
    tipo_estabelecimento:  str(rec.DS_TIPO_UNIDADE ?? rec.ds_tipo_unidade ?? rec.TP_UNIDADE ?? rec.tp_unidade ?? rec.TIPO ?? rec.tipo),
    natureza_juridica:     str(rec.DS_NATUREZA_JUR ?? rec.ds_natureza_jur ?? rec.NATUREZA_JURIDICA ?? rec.natureza_juridica),
    gestao:                str(rec.DS_GESTAO ?? rec.ds_gestao ?? rec.GESTAO ?? rec.gestao),
    esfera_administrativa: str(rec.DS_ESFERA_ADM ?? rec.ds_esfera_adm ?? rec.ESFERA_ADM ?? rec.esfera_adm),
    atende_sus:            boolSus(rec.ST_ADESAO_FILANTROP ?? rec.CO_NIVEL_HIER ?? rec.SUS ?? rec.sus ?? rec.ATENDE_SUS),
    situacao:              str(rec.TP_UNIDADE_SITUACAO ?? rec.DS_SITUACAO ?? rec.SITUACAO ?? rec.situacao),
    data_atualizacao:      dateParse(rec.DT_ATUALIZACAO ?? rec.DATA_ATUALIZACAO ?? rec.data_atualizacao),
    latitude:              num(rec.NU_LATITUDE ?? rec.LATITUDE ?? rec.latitude),
    longitude:             num(rec.NU_LONGITUDE ?? rec.LONGITUDE ?? rec.longitude),
    endereco:              str(rec.DS_LOGRADOURO ?? rec.ENDERECO ?? rec.endereco),
    bairro:                str(rec.NO_BAIRRO ?? rec.BAIRRO ?? rec.bairro),
    cep:                   str(rec.CO_CEP ?? rec.CEP ?? rec.cep),
    telefone:              str(rec.NU_TELEFONE ?? rec.TELEFONE ?? rec.telefone),
  };
}

// ---------------------------------------------------------------------------
// Carga genérica por resource_id
// ---------------------------------------------------------------------------

async function carregarResource(
  resourceId: string,
  label: string,
): Promise<Array<{ rec: Record<string, unknown>; norm: EstabNormalizado }>> {
  const todos: Array<{ rec: Record<string, unknown>; norm: EstabNormalizado }> = [];

  console.log(`\n[cnes-ubs:full] Carregando ${label} (resource_id=${resourceId})...`);

  let offset = 0;
  let total = 0;
  let campoUf: string | null = null;
  let campoIbge: string | null = null;
  let filtrarLocalmente = false;

  while (true) {
    const page = await fetchPage(resourceId, offset);
    if (!page || !page.success || !page.result) {
      console.error(`  ✗ Falha ao buscar página offset=${offset}: ${page?.error?.message ?? "sem resposta"}`);
      break;
    }

    // Detecta campos na primeira página
    if (offset === 0) {
      total = page.result.total;
      console.log(`  Total de registros no dataset: ${total}`);
      campoUf   = detectarCampoUf(page.result.fields);
      campoIbge = detectarCampoIbge(page.result.fields);
      const campoCnes = detectarCampoCnes(page.result.fields);
      console.log(`  Campos detectados — UF: ${campoUf ?? "n/d"}, IBGE: ${campoIbge ?? "n/d"}, CNES: ${campoCnes ?? "n/d"}`);
      console.log(`  Todos os campos: ${page.result.fields.map(f => f.id).join(", ")}`);
      filtrarLocalmente = !campoUf; // se não encontrou campo UF, filtra localmente
    }

    const records = page.result.records;
    if (records.length === 0) break;

    for (const rec of records) {
      // Filtra por UF localmente
      const ufRec = campoUf ? str(rec[campoUf]) : null;
      const ibgeRec = campoIbge ? str(rec[campoIbge]) : null;

      const isAcre = ufRec === CNES_UF ||
        (ibgeRec && ibgeRec.startsWith(IBGE_AC_PREFIXO)) ||
        (!filtrarLocalmente && !campoUf);

      if (!isAcre && filtrarLocalmente) continue;
      if (!isAcre && campoUf) continue;

      const norm = normalizarEstab(rec);
      // Confirma UF via ibge se campo UF não encontrado
      if (!norm.uf && ibgeRec?.startsWith(IBGE_AC_PREFIXO)) norm.uf = CNES_UF;

      todos.push({ rec, norm });
    }

    offset += records.length;
    process.stdout.write(`\r  Lidos: ${offset}/${total} — do Acre: ${todos.length}    `);

    if (offset >= total || records.length < PAGE_SIZE) break;
    await sleep(RATE_LIMIT);
  }

  console.log(`\n  ✓ ${todos.length} registros do Acre carregados de ${label}`);
  return todos;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function executarCnesUbsFullPostgres(): Promise<void> {
  const inicio = Date.now();
  console.log("[cnes-ubs:full] Iniciando carga CNES/UBS...");

  if (!CNES_RES_ID && !UBS_RES_ID) {
    console.warn("[cnes-ubs:full] ATENÇÃO: CNES_RESOURCE_ID e UBS_RESOURCE_ID não configurados.");
    console.warn("  Execute: npm run cnes-ubs:inspecionar");
    console.warn("  Depois configure os IDs no etl/.env e rode novamente.");
  }

  let totalCnes = 0;
  let totalUbs  = 0;

  // ── CNES ──
  if (CNES_RES_ID) {
    const dados = await carregarResource(CNES_RES_ID, "CNES Estabelecimentos");

    if (dados.length > 0) {
      // Salva raw em lote (uma linha por página/municipio não tem muito sentido aqui;
      // salva uma linha agregada por UF para não explodir a tabela)
      await pgQuery(`
        INSERT INTO raw.cnes_estabelecimentos_raw (uf, endpoint, payload)
        VALUES ($1, $2, $3)
      `, [CNES_UF, `/datastore_search?resource_id=${CNES_RES_ID}`, JSON.stringify(dados.map(d => d.rec))]);

      // Stage: TRUNCATE + INSERT
      await pgQuery(`TRUNCATE stage.cnes_estabelecimentos_stg`);
      await withPgTransaction(async (client) => {
        for (const { rec, norm } of dados) {
          await client.query(`
            INSERT INTO stage.cnes_estabelecimentos_stg
              (cnes, nome_estabelecimento, codigo_municipio_ibge, nome_municipio, uf,
               tipo_estabelecimento, natureza_juridica, gestao, esfera_administrativa,
               atende_sus, situacao, data_atualizacao, latitude, longitude,
               endereco, bairro, cep, telefone, payload)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
          `, [
            norm.cnes, norm.nome_estabelecimento, norm.codigo_municipio_ibge, norm.nome_municipio, norm.uf,
            norm.tipo_estabelecimento, norm.natureza_juridica, norm.gestao, norm.esfera_administrativa,
            norm.atende_sus, norm.situacao, norm.data_atualizacao, norm.latitude, norm.longitude,
            norm.endereco, norm.bairro, norm.cep, norm.telefone, JSON.stringify(rec),
          ]);
        }
      });

      // DW: UPSERT por cnes
      await withPgTransaction(async (client) => {
        for (const { rec, norm } of dados) {
          if (!norm.cnes) continue;
          await client.query(`
            INSERT INTO dw.dim_estabelecimento_saude
              (cnes, nome_estabelecimento, codigo_municipio_ibge, nome_municipio, uf,
               tipo_estabelecimento, natureza_juridica, gestao, esfera_administrativa,
               atende_sus, situacao, data_atualizacao, latitude, longitude,
               endereco, bairro, cep, telefone, payload, atualizado_em)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,now())
            ON CONFLICT (cnes) DO UPDATE SET
              nome_estabelecimento   = EXCLUDED.nome_estabelecimento,
              codigo_municipio_ibge  = EXCLUDED.codigo_municipio_ibge,
              nome_municipio         = EXCLUDED.nome_municipio,
              uf                     = EXCLUDED.uf,
              tipo_estabelecimento   = EXCLUDED.tipo_estabelecimento,
              natureza_juridica      = EXCLUDED.natureza_juridica,
              gestao                 = EXCLUDED.gestao,
              esfera_administrativa  = EXCLUDED.esfera_administrativa,
              atende_sus             = EXCLUDED.atende_sus,
              situacao               = EXCLUDED.situacao,
              data_atualizacao       = EXCLUDED.data_atualizacao,
              latitude               = EXCLUDED.latitude,
              longitude              = EXCLUDED.longitude,
              endereco               = EXCLUDED.endereco,
              bairro                 = EXCLUDED.bairro,
              cep                    = EXCLUDED.cep,
              telefone               = EXCLUDED.telefone,
              payload                = EXCLUDED.payload,
              atualizado_em          = now()
          `, [
            norm.cnes, norm.nome_estabelecimento, norm.codigo_municipio_ibge, norm.nome_municipio, norm.uf,
            norm.tipo_estabelecimento, norm.natureza_juridica, norm.gestao, norm.esfera_administrativa,
            norm.atende_sus, norm.situacao, norm.data_atualizacao, norm.latitude, norm.longitude,
            norm.endereco, norm.bairro, norm.cep, norm.telefone, JSON.stringify(rec),
          ]);
        }
      });

      totalCnes = dados.length;
      console.log(`[cnes-ubs:full] ✓ CNES: ${totalCnes} estabelecimentos carregados.`);
    }
  } else {
    console.log("[cnes-ubs:full] CNES_RESOURCE_ID não configurado — pulando CNES.");
  }

  // ── UBS ──
  if (UBS_RES_ID) {
    const dados = await carregarResource(UBS_RES_ID, "UBS");

    if (dados.length > 0) {
      await pgQuery(`
        INSERT INTO raw.ubs_raw (uf, endpoint, payload)
        VALUES ($1, $2, $3)
      `, [CNES_UF, `/datastore_search?resource_id=${UBS_RES_ID}`, JSON.stringify(dados.map(d => d.rec))]);

      await pgQuery(`TRUNCATE stage.ubs_stg`);
      await withPgTransaction(async (client) => {
        for (const { rec, norm } of dados) {
          await client.query(`
            INSERT INTO stage.ubs_stg
              (cnes, nome_estabelecimento, codigo_municipio_ibge, nome_municipio, uf,
               tipo_estabelecimento, situacao, data_atualizacao, latitude, longitude,
               endereco, bairro, cep, telefone, payload)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
          `, [
            norm.cnes, norm.nome_estabelecimento, norm.codigo_municipio_ibge, norm.nome_municipio, norm.uf,
            norm.tipo_estabelecimento, norm.situacao, norm.data_atualizacao, norm.latitude, norm.longitude,
            norm.endereco, norm.bairro, norm.cep, norm.telefone, JSON.stringify(rec),
          ]);
        }
      });

      await withPgTransaction(async (client) => {
        for (const { rec, norm } of dados) {
          if (!norm.cnes) continue;
          await client.query(`
            INSERT INTO dw.dim_ubs
              (cnes, nome_estabelecimento, codigo_municipio_ibge, nome_municipio, uf,
               tipo_estabelecimento, situacao, data_atualizacao, latitude, longitude,
               endereco, bairro, cep, telefone, payload, atualizado_em)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now())
            ON CONFLICT (cnes) DO UPDATE SET
              nome_estabelecimento  = EXCLUDED.nome_estabelecimento,
              codigo_municipio_ibge = EXCLUDED.codigo_municipio_ibge,
              nome_municipio        = EXCLUDED.nome_municipio,
              uf                    = EXCLUDED.uf,
              tipo_estabelecimento  = EXCLUDED.tipo_estabelecimento,
              situacao              = EXCLUDED.situacao,
              data_atualizacao      = EXCLUDED.data_atualizacao,
              latitude              = EXCLUDED.latitude,
              longitude             = EXCLUDED.longitude,
              endereco              = EXCLUDED.endereco,
              bairro                = EXCLUDED.bairro,
              cep                   = EXCLUDED.cep,
              telefone              = EXCLUDED.telefone,
              payload               = EXCLUDED.payload,
              atualizado_em         = now()
          `, [
            norm.cnes, norm.nome_estabelecimento, norm.codigo_municipio_ibge, norm.nome_municipio, norm.uf,
            norm.tipo_estabelecimento, norm.situacao, norm.data_atualizacao, norm.latitude, norm.longitude,
            norm.endereco, norm.bairro, norm.cep, norm.telefone, JSON.stringify(rec),
          ]);
        }
      });

      totalUbs = dados.length;
      console.log(`[cnes-ubs:full] ✓ UBS: ${totalUbs} unidades carregadas.`);
    }
  } else {
    console.log("[cnes-ubs:full] UBS_RESOURCE_ID não configurado — pulando UBS.");
  }

  const duracao = Date.now() - inicio;
  console.log(`\n[cnes-ubs:full] Concluído em ${duracao}ms — CNES: ${totalCnes}, UBS: ${totalUbs}`);

  await pgQuery(`
    INSERT INTO audit.etl_log (modulo, status, mensagem, registros, duracao_ms)
    VALUES ('cnes_ubs_full', 'OK', 'Carga CNES/UBS concluída', $1, $2)
  `, [totalCnes + totalUbs, duracao]);
}

if (require.main === module) {
  executarCnesUbsFullPostgres()
    .then(() => closePgPool())
    .catch((err) => {
      console.error("[cnes-ubs:full] Erro fatal:", (err as Error).message);
      closePgPool().catch(() => void 0);
      process.exit(1);
    });
}
