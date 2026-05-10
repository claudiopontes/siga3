/**
 * cnes-ubs-full-postgres.ts
 *
 * Carga de estabelecimentos CNES e UBS do Acre para PostgreSQL local.
 * Fonte: API CNES/DATASUS — https://apidadosabertos.saude.gov.br/cnes
 *
 * Endpoint: GET /estabelecimentos?codigo_uf={uf}&limit={n}&offset={n}
 * UBS: adicionar &codigo_tipo_unidade=02
 *
 * Campos principais da API:
 *   codigo_cnes, nome_razao_social, nome_fantasia, codigo_uf, codigo_municipio,
 *   codigo_tipo_unidade, codigo_cep_estabelecimento, endereco_estabelecimento,
 *   numero_estabelecimento, bairro_estabelecimento, numero_telefone_estabelecimento,
 *   latitude_estabelecimento_decimo_grau, longitude_estabelecimento_decimo_grau,
 *   estabelecimento_faz_atendimento_ambulatorial_sus, descricao_esfera_administrativa,
 *   data_atualizacao
 *
 * Estratégia idempotente:
 *   - TRUNCATE stage; INSERT normalizado
 *   - UPSERT em dw por cnes (PK)
 *
 * Variáveis de ambiente:
 *   CNES_API_BASE_URL   — base da API (padrão: https://apidadosabertos.saude.gov.br/cnes)
 *   CNES_UF             — código numérico da UF (padrão: 12 = Acre)
 *   CNES_TIMEOUT_MS     — timeout por requisição (padrão: 30000)
 *   CNES_RATE_LIMIT_MS  — intervalo entre páginas (padrão: 500)
 *
 * Uso: cd etl && npm run cnes-ubs:full:postgres
 */

import "dotenv/config";
import { pgQuery, withPgTransaction, closePgPool } from "../connectors/postgres";

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

const MODULO      = "cnes_ubs_full";
const BASE_URL    = (process.env.CNES_API_BASE_URL || "https://apidadosabertos.saude.gov.br/cnes").replace(/\/$/, "");
const CNES_UF     = process.env.CNES_UF || "12"; // código IBGE numérico (Acre=12)
const TIMEOUT_MS  = parseInt(process.env.CNES_TIMEOUT_MS    || "30000", 10);
const RATE_LIMIT  = parseInt(process.env.CNES_RATE_LIMIT_MS || "500",   10);
const PAGE_SIZE   = 20; // API limita a 20 registros por página

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface EstabItem {
  codigo_cnes:                                       number | string | null;
  nome_razao_social?:                                string | null;
  nome_fantasia?:                                    string | null;
  numero_cnpj_entidade?:                             string | null;
  natureza_organizacao_entidade?:                    string | null;
  tipo_gestao?:                                      string | null;
  descricao_nivel_hierarquia?:                       string | null;
  descricao_esfera_administrativa?:                  string | null;
  codigo_tipo_unidade?:                              number | string | null;
  codigo_cep_estabelecimento?:                       string | null;
  endereco_estabelecimento?:                         string | null;
  numero_estabelecimento?:                           string | null;
  bairro_estabelecimento?:                           string | null;
  numero_telefone_estabelecimento?:                  string | null;
  latitude_estabelecimento_decimo_grau?:             number | null;
  longitude_estabelecimento_decimo_grau?:            number | null;
  estabelecimento_faz_atendimento_ambulatorial_sus?: string | null;
  codigo_uf?:                                        number | string | null;
  codigo_municipio?:                                 number | string | null;
  descricao_natureza_juridica_estabelecimento?:      string | null;
  codigo_motivo_desabilitacao_estabelecimento?:      string | null;
  data_atualizacao?:                                 string | null;
  [key: string]: unknown;
}

interface ApiResponse {
  estabelecimentos: EstabItem[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchPage(endpoint: string, offset: number): Promise<EstabItem[] | null> {
  const url = `${BASE_URL}${endpoint}&limit=${PAGE_SIZE}&offset=${offset}`;
  try {
    const resp = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "Varadouro-Digital-ETL/1.0 (interno TCE-AC)" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!resp.ok) {
      console.error(`  ✗ HTTP ${resp.status} — ${url}`);
      return null;
    }
    const json = await resp.json() as ApiResponse;
    return json.estabelecimentos ?? [];
  } catch (err) {
    console.error(`  ✗ Erro de rede: ${(err as Error).message}`);
    return null;
  }
}

async function carregarTodos(endpoint: string, label: string): Promise<EstabItem[]> {
  const todos: EstabItem[] = [];
  let offset = 0;
  console.log(`\n[cnes-ubs:full] Carregando ${label}...`);

  while (true) {
    const page = await fetchPage(endpoint, offset);
    if (page === null) {
      console.error(`  ✗ Falha na página offset=${offset}`);
      break;
    }
    if (page.length === 0) break;

    todos.push(...page);
    process.stdout.write(`\r  Carregados: ${todos.length}    `);

    if (page.length < PAGE_SIZE) break;
    offset += page.length;
    await sleep(RATE_LIMIT);
  }

  console.log(`\n  ✓ Total: ${todos.length} registros de ${label}`);
  return todos;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return isNaN(v) ? null : v;
  const n = parseFloat(String(v));
  return isNaN(n) ? null : n;
}

function boolSus(v: unknown): boolean | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().toUpperCase();
  if (s === "SIM" || s === "S" || s === "1") return true;
  if (s === "NAO" || s === "NÃO" || s === "N" || s === "0") return false;
  return null;
}

// Código IBGE: a API retorna 6 dígitos sem dígito verificador.
// Exemplos: 120040 = Rio Branco (IBGE 7 dígitos: 1200401)
function ibge6para7(cod: string): string {
  // Mantemos o código de 6 dígitos como recebido — o sistema usa 6 dígitos no SIOPS
  return cod.padStart(6, "0");
}

// ---------------------------------------------------------------------------
// Normalização
// ---------------------------------------------------------------------------

interface Normalizado {
  cnes:                  string;
  nome_estabelecimento:  string | null;
  codigo_municipio_ibge: string | null;
  nome_municipio:        null; // não disponível diretamente na API
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

function normalizar(e: EstabItem): Normalizado | null {
  const cnes = str(e.codigo_cnes);
  if (!cnes) return null;

  const motivo = str(e.codigo_motivo_desabilitacao_estabelecimento);
  const situacao = motivo ? "INATIVO" : "ATIVO";

  const ibge = e.codigo_municipio ? ibge6para7(String(e.codigo_municipio)) : null;

  return {
    cnes,
    nome_estabelecimento: str(e.nome_fantasia) ?? str(e.nome_razao_social),
    codigo_municipio_ibge: ibge,
    nome_municipio: null,
    uf: e.codigo_uf ? String(e.codigo_uf).padStart(2, "0") : null,
    tipo_estabelecimento: e.codigo_tipo_unidade ? String(e.codigo_tipo_unidade) : null,
    natureza_juridica: str(e.descricao_natureza_juridica_estabelecimento),
    gestao: str(e.tipo_gestao),
    esfera_administrativa: str(e.descricao_esfera_administrativa),
    atende_sus: boolSus(e.estabelecimento_faz_atendimento_ambulatorial_sus),
    situacao,
    data_atualizacao: str(e.data_atualizacao),
    latitude: numOrNull(e.latitude_estabelecimento_decimo_grau),
    longitude: numOrNull(e.longitude_estabelecimento_decimo_grau),
    endereco: [str(e.endereco_estabelecimento), str(e.numero_estabelecimento)]
      .filter(Boolean).join(", ") || null,
    bairro: str(e.bairro_estabelecimento),
    cep: str(e.codigo_cep_estabelecimento),
    telefone: str(e.numero_telefone_estabelecimento),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function executarCnesUbsFullPostgres(): Promise<void> {
  const inicio = Date.now();
  console.log("[cnes-ubs:full] Iniciando carga CNES/UBS...");
  console.log(`[cnes-ubs:full] UF: ${CNES_UF}, API: ${BASE_URL}`);

  // ── CNES: todos os estabelecimentos da UF ──
  const endpointCnes = `/estabelecimentos?codigo_uf=${CNES_UF}`;
  const cnesDados = await carregarTodos(endpointCnes, "CNES Estabelecimentos");

  // ── UBS: apenas tipo_unidade=02 ──
  const endpointUbs = `/estabelecimentos?codigo_uf=${CNES_UF}&codigo_tipo_unidade=02`;
  const ubsDados = await carregarTodos(endpointUbs, "UBS (tipo 02)");

  // ── Salva raw ──
  if (cnesDados.length > 0) {
    await pgQuery(`
      INSERT INTO raw.cnes_estabelecimentos_raw (uf, endpoint, payload)
      VALUES ($1, $2, $3)
    `, [CNES_UF, endpointCnes, JSON.stringify(cnesDados)]);
  }
  if (ubsDados.length > 0) {
    await pgQuery(`
      INSERT INTO raw.ubs_raw (uf, endpoint, payload)
      VALUES ($1, $2, $3)
    `, [CNES_UF, endpointUbs, JSON.stringify(ubsDados)]);
  }

  // ── Stage CNES ──
  if (cnesDados.length > 0) {
    await pgQuery(`TRUNCATE stage.cnes_estabelecimentos_stg`);
    await withPgTransaction(async (client) => {
      for (const e of cnesDados) {
        const n = normalizar(e);
        if (!n) continue;
        await client.query(`
          INSERT INTO stage.cnes_estabelecimentos_stg
            (cnes, nome_estabelecimento, codigo_municipio_ibge, nome_municipio, uf,
             tipo_estabelecimento, natureza_juridica, gestao, esfera_administrativa,
             atende_sus, situacao, data_atualizacao, latitude, longitude,
             endereco, bairro, cep, telefone, payload)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        `, [
          n.cnes, n.nome_estabelecimento, n.codigo_municipio_ibge, n.nome_municipio, n.uf,
          n.tipo_estabelecimento, n.natureza_juridica, n.gestao, n.esfera_administrativa,
          n.atende_sus, n.situacao, n.data_atualizacao, n.latitude, n.longitude,
          n.endereco, n.bairro, n.cep, n.telefone, JSON.stringify(e),
        ]);
      }
    });
    console.log(`[cnes-ubs:full] ✓ stage.cnes_estabelecimentos_stg — ${cnesDados.length} registros`);
  }

  // ── Stage UBS ──
  if (ubsDados.length > 0) {
    await pgQuery(`TRUNCATE stage.ubs_stg`);
    await withPgTransaction(async (client) => {
      for (const e of ubsDados) {
        const n = normalizar(e);
        if (!n) continue;
        await client.query(`
          INSERT INTO stage.ubs_stg
            (cnes, nome_estabelecimento, codigo_municipio_ibge, nome_municipio, uf,
             tipo_estabelecimento, situacao, data_atualizacao, latitude, longitude,
             endereco, bairro, cep, telefone, payload)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        `, [
          n.cnes, n.nome_estabelecimento, n.codigo_municipio_ibge, n.nome_municipio, n.uf,
          n.tipo_estabelecimento, n.situacao, n.data_atualizacao, n.latitude, n.longitude,
          n.endereco, n.bairro, n.cep, n.telefone, JSON.stringify(e),
        ]);
      }
    });
    console.log(`[cnes-ubs:full] ✓ stage.ubs_stg — ${ubsDados.length} registros`);
  }

  // ── DW dim_estabelecimento_saude ──
  if (cnesDados.length > 0) {
    await withPgTransaction(async (client) => {
      for (const e of cnesDados) {
        const n = normalizar(e);
        if (!n) continue;
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
          n.cnes, n.nome_estabelecimento, n.codigo_municipio_ibge, n.nome_municipio, n.uf,
          n.tipo_estabelecimento, n.natureza_juridica, n.gestao, n.esfera_administrativa,
          n.atende_sus, n.situacao, n.data_atualizacao, n.latitude, n.longitude,
          n.endereco, n.bairro, n.cep, n.telefone, JSON.stringify(e),
        ]);
      }
    });
    console.log(`[cnes-ubs:full] ✓ dw.dim_estabelecimento_saude — ${cnesDados.length} upserts`);
  }

  // ── DW dim_ubs ──
  if (ubsDados.length > 0) {
    await withPgTransaction(async (client) => {
      for (const e of ubsDados) {
        const n = normalizar(e);
        if (!n) continue;
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
          n.cnes, n.nome_estabelecimento, n.codigo_municipio_ibge, n.nome_municipio, n.uf,
          n.tipo_estabelecimento, n.situacao, n.data_atualizacao, n.latitude, n.longitude,
          n.endereco, n.bairro, n.cep, n.telefone, JSON.stringify(e),
        ]);
      }
    });
    console.log(`[cnes-ubs:full] ✓ dw.dim_ubs — ${ubsDados.length} upserts`);
  }

  const duracao = Date.now() - inicio;
  console.log(`\n[cnes-ubs:full] Concluído em ${duracao}ms — CNES: ${cnesDados.length}, UBS: ${ubsDados.length}`);

  await pgQuery(`
    INSERT INTO audit.etl_log (modulo, status, mensagem, registros, duracao_ms)
    VALUES ($1, 'OK', 'Carga CNES/UBS concluída', $2, $3)
  `, [MODULO, cnesDados.length + ubsDados.length, duracao]);
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
