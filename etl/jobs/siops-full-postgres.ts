/**
 * siops-full-postgres.ts
 *
 * Carga de dados SIOPS para municípios do Acre no PostgreSQL local.
 * Fonte: API pública SIOPS — https://siops-consulta-publica-api.saude.gov.br
 *
 * Estrutura da API:
 *   GET /v1/indicador/municipal/{co_municipio6}/{ano}/{nu_periodo}
 *   co_municipio6 : código IBGE 6 dígitos (IBGE 7 dígitos sem o último/dígito verificador)
 *   nu_periodo    : 1 = 1º semestre, 2 = anual
 *   Retorna       : array de { numero_indicador, ds_indicador, numerador, denominador, indicador_calculado }
 *
 * Indicador ASPS: numero_indicador = "3.2"
 *   "% da receita própria aplicada em ASPS conforme LC 141"
 *   Mínimo municipal: 15%
 *
 * Estratégia idempotente: DELETE por (ano, periodo, codigo_municipio_ibge) antes de INSERT.
 *
 * Variáveis de ambiente:
 *   SIOPS_API_BASE_URL      — base da API
 *   SIOPS_UF_CODIGO         — código IBGE numérico da UF (padrão: 12 = Acre)
 *   SIOPS_ANO_INICIO        — primeiro ano (padrão: 2022)
 *   SIOPS_ANO_FIM           — último ano (padrão: ano corrente)
 *   SIOPS_TIMEOUT_MS        — timeout por requisição (padrão: 30000)
 *   SIOPS_RATE_LIMIT_MS     — intervalo entre requisições (padrão: 500)
 *
 * Uso: cd etl && npm run siops:full:postgres
 */

import "dotenv/config";
import { pgQuery, withPgTransaction, closePgPool } from "../connectors/postgres";

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

const MODULO     = "siops_full_postgres";
const BASE_URL   = (process.env.SIOPS_API_BASE_URL || "https://siops-consulta-publica-api.saude.gov.br").replace(/\/$/, "");
const UF_CODIGO  = process.env.SIOPS_UF_CODIGO || "12"; // Acre = 12
const ANO_INICIO = parseInt(process.env.SIOPS_ANO_INICIO || "2022", 10);
const ANO_FIM    = parseInt(process.env.SIOPS_ANO_FIM    || String(new Date().getFullYear()), 10);
const TIMEOUT_MS = parseInt(process.env.SIOPS_TIMEOUT_MS    || "30000", 10);
const RATE_LIMIT = parseInt(process.env.SIOPS_RATE_LIMIT_MS || "500",   10);

// Períodos são dinâmicos — buscados via /v1/ano-periodo antes de cada carga.
// Nos anos 2002–2020 era semestral (nu_periodo 1=1S, 2=Anual).
// A partir de 2021 passou a bimestral com IDs numéricos variáveis no banco da API.

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface IndicadorRaw {
  numero_indicador: string;
  ds_indicador: string;
  numerador: number | null;
  denominador: number | null;
  indicador_calculado: string | null;
}

interface MunicipioSiops {
  co_municipio: string; // 6 dígitos
  no_municipio: string;
  co_ibge7: string;     // 7 dígitos (co_municipio + dígito verificador estimado via listagem)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", ".").replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? null : n;
}

// Extrai percentual do campo indicador_calculado (ex: "15,23 %" -> 15.23)
function extrairPercentual(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.replace(",", ".").match(/[\d.]+/);
  return m ? parseFloat(m[0]) : null;
}

// ---------------------------------------------------------------------------
// Buscar períodos disponíveis via API
// ---------------------------------------------------------------------------

interface AnoPeriodo {
  nu_periodo: string;
  ds_periodo: string;
  ds_ano: string;
}

async function buscarPeriodos(): Promise<AnoPeriodo[]> {
  const url = `${BASE_URL}/v1/ano-periodo`;
  const resp = await fetch(url, {
    headers: { "Accept": "application/json", "User-Agent": "Varadouro-Digital-ETL/1.0 (interno TCE-AC)" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!resp.ok) throw new Error(`Erro ao buscar períodos: HTTP ${resp.status}`);
  return await resp.json() as AnoPeriodo[];
}

// ---------------------------------------------------------------------------
// Buscar municípios da UF via API
// ---------------------------------------------------------------------------

async function buscarMunicipios(): Promise<MunicipioSiops[]> {
  const url = `${BASE_URL}/v1/ente/municipal/${UF_CODIGO}`;
  const resp = await fetch(url, {
    headers: { "Accept": "application/json", "User-Agent": "Varadouro-Digital-ETL/1.0 (interno TCE-AC)" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!resp.ok) throw new Error(`Erro ao buscar municípios: HTTP ${resp.status} — ${url}`);
  const lista = await resp.json() as Array<{ co_municipio: string; no_municipio: string }>;

  return lista.map(m => ({
    co_municipio: m.co_municipio,
    no_municipio: m.no_municipio,
    // IBGE 7 dígitos: prefixo da UF (2 dígitos) + co_municipio (4 restantes) + "0" como placeholder
    // O código real de 7 dígitos é obtido concatenando co_municipio com o dígito verificador
    // que não é fornecido diretamente pela API — usamos co_municipio padded como identificador interno
    co_ibge7: m.co_municipio.padEnd(7, "0"),
  }));
}

// ---------------------------------------------------------------------------
// Buscar indicadores de um município/ano/período
// ---------------------------------------------------------------------------

async function buscarIndicadores(
  coMunicipio: string, ano: number, nuPeriodo: string
): Promise<{ ok: boolean; status: number; dados: IndicadorRaw[] | null; naoHomologado: boolean }> {
  const url = `${BASE_URL}/v1/indicador/municipal/${coMunicipio}/${ano}/${nuPeriodo}`;
  try {
    const resp = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "Varadouro-Digital-ETL/1.0 (interno TCE-AC)" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!resp.ok) return { ok: false, status: resp.status, dados: null, naoHomologado: false };
    const dados = await resp.json() as unknown;

    // API retorna [{ error, message }] quando dados não homologados
    if (Array.isArray(dados) && dados.length > 0 && (dados[0] as Record<string, unknown>).error) {
      return { ok: true, status: resp.status, dados: null, naoHomologado: true };
    }

    return { ok: true, status: resp.status, dados: dados as IndicadorRaw[], naoHomologado: false };
  } catch {
    return { ok: false, status: 0, dados: null, naoHomologado: false };
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function executarSiopsFullPostgres(): Promise<void> {
  const inicio = Date.now();
  console.log(`[siops:full:postgres] Iniciando carga SIOPS`);
  console.log(`  URL base  : ${BASE_URL}`);
  console.log(`  UF código : ${UF_CODIGO}`);
  console.log(`  Anos      : ${ANO_INICIO} – ${ANO_FIM}`);

  // Busca períodos e municípios
  let todosPeriodos: AnoPeriodo[];
  let municipios: MunicipioSiops[];
  try {
    [todosPeriodos, municipios] = await Promise.all([buscarPeriodos(), buscarMunicipios()]);
    console.log(`  Municípios: ${municipios.length}`);
    console.log(`  Períodos disponíveis na API: ${todosPeriodos.length}`);
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`[siops:full:postgres] ❌ ${msg}`);
    console.error(`  Verifique SIOPS_API_BASE_URL e SIOPS_UF_CODIGO no .env`);
    console.error(`  Execute npm run siops:inspecionar para diagnóstico.`);
    await pgQuery(`
      INSERT INTO audit.etl_log (modulo, status, mensagem, registros, duracao_ms)
      VALUES ($1, 'ERRO', $2, 0, $3)
    `, [MODULO, msg, Date.now() - inicio]);
    return;
  }

  let totalRaw = 0;
  let totalIndicadores = 0;
  let totalNaoHomologado = 0;
  let totalErros = 0;

  // TRUNCATE stage antes da carga
  await pgQuery("TRUNCATE TABLE stage.siops_indicadores_stg");

  // Coleta chaves a deletar do DW antes de inserir
  const chavesParaDeletar = new Set<string>();

  // Filtra períodos dentro do intervalo de anos configurado
  const periodosNaFaixa = todosPeriodos.filter(p => {
    const ano = parseInt(p.ds_ano, 10);
    return ano >= ANO_INICIO && ano <= ANO_FIM;
  });
  console.log(`  Períodos na faixa ${ANO_INICIO}–${ANO_FIM}: ${periodosNaFaixa.length}`);

  for (const periodo of periodosNaFaixa) {
    const ano = parseInt(periodo.ds_ano, 10);
    const periodoLabel = periodo.ds_periodo.slice(0, 30).trim();
      for (const municipio of municipios) {
        const resultado = await buscarIndicadores(municipio.co_municipio, ano, periodo.nu_periodo);

        if (resultado.naoHomologado) {
          totalNaoHomologado++;
          if (RATE_LIMIT > 0) await sleep(RATE_LIMIT);
          continue;
        }

        if (!resultado.ok || !resultado.dados) {
          if (resultado.status !== 404 && resultado.status !== 0) totalErros++;
          if (RATE_LIMIT > 0) await sleep(RATE_LIMIT);
          continue;
        }

        const indicadores = resultado.dados;
        const chave = `${ano}|${periodoLabel}|${municipio.co_municipio}`;
        chavesParaDeletar.add(chave);

        // Salva raw
        await pgQuery(`
          INSERT INTO raw.siops_indicadores_raw
            (ano, periodo, uf, codigo_municipio_ibge, nome_municipio, endpoint, payload)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [ano, periodoLabel, "AC", municipio.co_municipio, municipio.no_municipio,
            `/v1/indicador/municipal/${municipio.co_municipio}/${ano}/${periodo.nu_periodo}`,
            JSON.stringify(indicadores)]);
        totalRaw++;

        // Normaliza e insere no stage
        for (const ind of indicadores) {
          const perc = extrairPercentual(ind.indicador_calculado);
          await pgQuery(`
            INSERT INTO stage.siops_indicadores_stg
              (ano, periodo, codigo_municipio_ibge, nome_municipio,
               indicador, valor, percentual, unidade, payload)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          `, [
            ano, periodoLabel, municipio.co_municipio, municipio.no_municipio,
            `${ind.numero_indicador} — ${ind.ds_indicador.trim()}`,
            toNum(ind.numerador),
            perc,
            ind.indicador_calculado?.includes("%") ? "%" : null,
            JSON.stringify({ numerador: ind.numerador, denominador: ind.denominador, calculado: ind.indicador_calculado }),
          ]);
          totalIndicadores++;
        }

        if (RATE_LIMIT > 0) await sleep(RATE_LIMIT);
      }
  }

  if (totalRaw === 0) {
    console.warn("[siops:full:postgres] ⚠ Nenhum dado coletado (tudo não homologado ou erro).");
    console.warn(`  Não homologados: ${totalNaoHomologado} | Erros: ${totalErros}`);
    await pgQuery(`
      INSERT INTO audit.etl_log (modulo, status, mensagem, registros, duracao_ms)
      VALUES ($1, 'AVISO', $2, 0, $3)
    `, [MODULO, `Nenhum dado coletado. nao_homologado=${totalNaoHomologado} erros=${totalErros}`, Date.now() - inicio]);
    return;
  }

  // Promove stage -> DW (idempotente)
  console.log(`[siops:full:postgres] Promovendo ${totalIndicadores} indicadores para DW...`);
  await withPgTransaction(async (client) => {
    await client.query(`
      DELETE FROM dw.fato_siops_indicador
      WHERE (ano::text || '|' || periodo || '|' || codigo_municipio_ibge) = ANY($1)
    `, [Array.from(chavesParaDeletar)]);

    await client.query(`
      INSERT INTO dw.fato_siops_indicador
        (ano, periodo, codigo_municipio_ibge, nome_municipio,
         indicador, valor, percentual, unidade, fonte, coletado_em, atualizado_em)
      SELECT ano, periodo, codigo_municipio_ibge, nome_municipio,
             indicador, valor, percentual, unidade, fonte, coletado_em, now()
      FROM stage.siops_indicadores_stg
    `);
  });

  const duracao = Date.now() - inicio;
  console.log(`[siops:full:postgres] Concluído em ${duracao}ms — raw: ${totalRaw}, indicadores: ${totalIndicadores}, não_homologados: ${totalNaoHomologado}, erros: ${totalErros}.`);

  await pgQuery(`
    INSERT INTO audit.etl_log (modulo, status, mensagem, registros, duracao_ms)
    VALUES ($1, 'OK', $2, $3, $4)
  `, [MODULO, `raw=${totalRaw} ind=${totalIndicadores} nao_hom=${totalNaoHomologado} err=${totalErros}`, totalIndicadores, duracao]);

  await pgQuery(`
    INSERT INTO audit.etl_carga (modulo, registros_inseridos, registros_total, duracao_ms, status)
    VALUES ($1, $2, $3, $4, 'OK')
  `, [MODULO, totalIndicadores, totalIndicadores, duracao]).catch(() => void 0);
}

if (require.main === module) {
  executarSiopsFullPostgres()
    .then(() => closePgPool())
    .catch((err) => {
      console.error("[siops:full:postgres] Erro:", (err as Error).message);
      closePgPool().catch(() => void 0);
      process.exit(1);
    });
}
