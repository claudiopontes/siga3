/**
 * cnes-ubs-inspecionar.ts
 *
 * Job exploratório: inspeciona a API CNES/DATASUS e exibe campos e totais.
 *
 * API descoberta: https://apidadosabertos.saude.gov.br/cnes
 * Endpoint: GET /estabelecimentos?codigo_uf={codigo}&limit={n}&offset={n}
 * UBS: adicionar &codigo_tipo_unidade=02
 *
 * Campos-chave identificados:
 *   codigo_cnes               — código CNES (PK)
 *   nome_razao_social         — nome razão social
 *   nome_fantasia             — nome fantasia
 *   codigo_uf                 — código UF (12 = Acre)
 *   codigo_municipio          — código IBGE 6 dígitos
 *   codigo_tipo_unidade       — tipo (02 = UBS, 05 = Hospital, etc.)
 *   codigo_cep_estabelecimento — CEP
 *   endereco_estabelecimento  — logradouro
 *   numero_estabelecimento    — número
 *   bairro_estabelecimento    — bairro
 *   numero_telefone_estabelecimento — telefone
 *   latitude_estabelecimento_decimo_grau  — latitude
 *   longitude_estabelecimento_decimo_grau — longitude
 *   estabelecimento_faz_atendimento_ambulatorial_sus — SIM/NAO
 *   descricao_esfera_administrativa — MUNICIPAL/ESTADUAL/FEDERAL
 *   data_atualizacao          — data ISO (YYYY-MM-DD)
 *
 * Variáveis de ambiente:
 *   CNES_API_BASE_URL  — base da API (padrão: https://apidadosabertos.saude.gov.br/cnes)
 *   CNES_UF            — código numérico da UF (padrão: 12 = Acre)
 *   CNES_TIMEOUT_MS    — timeout (padrão: 30000)
 *
 * Uso: cd etl && npm run cnes-ubs:inspecionar
 */

import "dotenv/config";
import { pgQuery, closePgPool } from "../connectors/postgres";

const BASE_URL   = (process.env.CNES_API_BASE_URL || "https://apidadosabertos.saude.gov.br/cnes").replace(/\/$/, "");
const CNES_UF    = process.env.CNES_UF || "12"; // código IBGE numérico (12 = Acre)
const TIMEOUT_MS = parseInt(process.env.CNES_TIMEOUT_MS || "30000", 10);

interface EstabItem {
  codigo_cnes:                                  number | string;
  nome_razao_social?:                           string;
  nome_fantasia?:                               string;
  codigo_uf?:                                   number | string;
  codigo_municipio?:                            number | string;
  codigo_tipo_unidade?:                         number | string;
  descricao_esfera_administrativa?:             string;
  estabelecimento_faz_atendimento_ambulatorial_sus?: string;
  data_atualizacao?:                            string;
  [key: string]: unknown;
}

interface ApiResponse {
  estabelecimentos: EstabItem[];
}

async function get(path: string): Promise<ApiResponse | null> {
  const url = `${BASE_URL}${path}`;
  try {
    const resp = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "Varadouro-Digital-ETL/1.0 (interno TCE-AC)" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!resp.ok) {
      console.log(`  ✗ HTTP ${resp.status} — ${url}`);
      return null;
    }
    return await resp.json() as ApiResponse;
  } catch (err) {
    console.log(`  ✗ Erro: ${(err as Error).message}`);
    return null;
  }
}

async function contarTotal(endpoint: string): Promise<number> {
  let total = 0;
  let offset = 0;
  const limit = 200;
  while (true) {
    const r = await get(`${endpoint}&limit=${limit}&offset=${offset}`);
    if (!r || r.estabelecimentos.length === 0) break;
    total += r.estabelecimentos.length;
    if (r.estabelecimentos.length < limit) break;
    offset += limit;
  }
  return total;
}

async function main() {
  console.log("[cnes-ubs:inspecionar] API CNES/DATASUS — Inspeção de endpoints e formatos");
  console.log(`  Base URL : ${BASE_URL}`);
  console.log(`  UF código: ${CNES_UF} (Acre=12)`);
  console.log();

  // 1. Todos os estabelecimentos do Acre — amostra
  console.log(`── 1. Estabelecimentos do Acre (amostra de 3) ──`);
  const r1 = await get(`/estabelecimentos?codigo_uf=${CNES_UF}&limit=3&offset=0`);
  if (r1 && r1.estabelecimentos.length > 0) {
    const first = r1.estabelecimentos[0];
    console.log(`  Campos disponíveis:`);
    for (const [k, v] of Object.entries(first)) {
      console.log(`    ${k}: ${JSON.stringify(v)}`);
    }
    console.log();
    console.log(`  Outros registros:`);
    for (const e of r1.estabelecimentos.slice(1)) {
      console.log(`    CNES=${e.codigo_cnes} — ${e.nome_razao_social} — mun=${e.codigo_municipio}`);
    }
  } else {
    console.log(`  Nenhum registro. Verifique CNES_UF e CNES_API_BASE_URL.`);
  }
  console.log();

  // 2. UBS (tipo_unidade=02) do Acre
  console.log(`── 2. UBS tipo 02 (Centro de Saúde/UBS) no Acre ──`);
  const r2 = await get(`/estabelecimentos?codigo_uf=${CNES_UF}&codigo_tipo_unidade=02&limit=5`);
  if (r2 && r2.estabelecimentos.length > 0) {
    console.log(`  ${r2.estabelecimentos.length} registros na amostra:`);
    for (const e of r2.estabelecimentos) {
      console.log(`    CNES=${e.codigo_cnes} — ${e.nome_razao_social} — mun=${e.codigo_municipio} — atualizado=${e.data_atualizacao}`);
    }
  } else {
    console.log(`  Nenhum registro de UBS encontrado.`);
  }
  console.log();

  // 3. Estimativa de total (amostra rápida — 2 páginas)
  console.log(`── 3. Estimativa de registros disponíveis (primeiras 2 páginas de 200) ──`);
  let count = 0;
  for (let offset = 0; offset < 400; offset += 200) {
    const r = await get(`/estabelecimentos?codigo_uf=${CNES_UF}&limit=200&offset=${offset}`);
    const n = r?.estabelecimentos.length ?? 0;
    count += n;
    console.log(`  offset=${offset}: ${n} registros`);
    if (n < 200) break;
  }
  console.log(`  Estimativa mínima: ${count} estabelecimentos no Acre`);
  console.log();

  // 4. Salva amostra no raw
  if (r1 && r1.estabelecimentos.length > 0) {
    try {
      for (const rec of r1.estabelecimentos) {
        await pgQuery(`
          INSERT INTO raw.cnes_estabelecimentos_raw (uf, codigo_municipio_ibge, cnes, endpoint, payload)
          VALUES ($1, $2, $3, $4, $5)
        `, [
          String(CNES_UF),
          rec.codigo_municipio ? String(rec.codigo_municipio) : null,
          rec.codigo_cnes ? String(rec.codigo_cnes) : null,
          `/estabelecimentos?codigo_uf=${CNES_UF}&limit=3`,
          JSON.stringify(rec),
        ]);
      }
      console.log(`  ✓ ${r1.estabelecimentos.length} amostra(s) CNES salva(s) em raw.cnes_estabelecimentos_raw`);
    } catch (e) {
      console.log(`  ✗ Falha ao salvar amostra: ${(e as Error).message}`);
    }
  }

  if (r2 && r2.estabelecimentos.length > 0) {
    try {
      for (const rec of r2.estabelecimentos) {
        await pgQuery(`
          INSERT INTO raw.ubs_raw (uf, codigo_municipio_ibge, cnes, endpoint, payload)
          VALUES ($1, $2, $3, $4, $5)
        `, [
          String(CNES_UF),
          rec.codigo_municipio ? String(rec.codigo_municipio) : null,
          rec.codigo_cnes ? String(rec.codigo_cnes) : null,
          `/estabelecimentos?codigo_uf=${CNES_UF}&codigo_tipo_unidade=02&limit=5`,
          JSON.stringify(rec),
        ]);
      }
      console.log(`  ✓ ${r2.estabelecimentos.length} amostra(s) UBS salva(s) em raw.ubs_raw`);
    } catch (e) {
      console.log(`  ✗ Falha ao salvar amostra UBS: ${(e as Error).message}`);
    }
  }

  console.log();
  console.log("── Resumo ──");
  console.log(`  API base  : ${BASE_URL}`);
  console.log(`  Endpoint  : /estabelecimentos?codigo_uf={uf_ibge}&limit={n}&offset={n}`);
  console.log(`  UBS       : adicionar &codigo_tipo_unidade=02`);
  console.log(`  codigo_uf : código IBGE numérico da UF (Acre=12)`);
  console.log();
  console.log("  Configure no etl/.env:");
  console.log(`    CNES_API_BASE_URL=https://apidadosabertos.saude.gov.br/cnes`);
  console.log(`    CNES_UF=12`);
  console.log();
  console.log("  Para carregar os dados execute:");
  console.log("    npm run carga-cnes-ubs:postgres");
}

main()
  .then(() => closePgPool())
  .catch((err) => {
    console.error("[cnes-ubs:inspecionar] Erro:", (err as Error).message);
    closePgPool().catch(() => void 0);
    process.exit(1);
  });
