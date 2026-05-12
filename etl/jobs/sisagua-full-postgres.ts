/**
 * sisagua-full-postgres.ts
 *
 * Carga completa do SISAGUA (Qualidade da Água) para PostgreSQL local.
 *
 * Fontes:
 *   /sisagua/controle-mensal?uf=AC&ano={ano}&limit=200&offset={n}
 *   /sisagua/vigilancia?uf=AC&ano={ano}&limit=200&offset={n}
 *
 * Fluxo:
 *   1. Pagina a API por ano e endpoint
 *   2. Salva payload bruto em raw.sisagua_raw
 *   3. Normaliza defensivamente para stage.sisagua_parametros_stg
 *   4. Promove stage → dw.fato_sisagua_parametro (INSERT)
 *   5. (Opcional) Carrega populacao_abastecida → dw.fato_sisagua_populacao
 *   6. Registra auditoria em audit.etl_log / audit.etl_carga
 *
 * Uso: cd etl && npm run sisagua:full:postgres
 */

import "dotenv/config";
import { pgQuery, withPgTransaction, closePgPool } from "../connectors/postgres";

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

const API_BASE       = (process.env.SISAGUA_API_BASE_URL ?? "https://apidadosabertos.saude.gov.br").replace(/\/$/, "");
const UF             = process.env.SISAGUA_UF            ?? "AC";
const ANO_INICIO     = parseInt(process.env.SISAGUA_ANO_INICIO ?? "2024", 10);
const ANO_FIM        = parseInt(process.env.SISAGUA_ANO_FIM    ?? "2026", 10);
const TIMEOUT_MS     = parseInt(process.env.SISAGUA_TIMEOUT_MS ?? "30000", 10);
const RATE_LIMIT_MS  = parseInt(process.env.SISAGUA_RATE_LIMIT_MS ?? "500", 10);
const PAGE_SIZE      = 200;

// ---------------------------------------------------------------------------
// Tipos internos
// ---------------------------------------------------------------------------

interface SisaguaParametro {
  rawId:               number;
  endpoint:            string;
  uf:                  string | null;
  codigoMunicipioIbge: string | null;
  nomeMunicipio:       string | null;
  ano:                 number | null;
  mes:                 number | null;
  competencia:         string | null;
  parametro:           string | null;
  resultado:           string | null;
  valor:               number | null;
  unidade:             string | null;
  foraPadrao:          boolean | null;
  dataColeta:          string | null;
  formaAbastecimento:  string | null;
  sistemaAbastecimento:string | null;
  pontoColeta:         string | null;
}

interface SisaguaPopulacao {
  rawId:               number;
  uf:                  string | null;
  codigoMunicipioIbge: string | null;
  nomeMunicipio:       string | null;
  ano:                 number | null;
  mes:                 number | null;
  competencia:         string | null;
  populacaoAbastecida: number | null;
  formaAbastecimento:  string | null;
  sistemaAbastecimento:string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchComTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Lê um campo de um objeto tentando vários nomes de chave */
function lerCampo<T>(obj: Record<string, unknown>, ...chaves: string[]): T | null {
  for (const chave of chaves) {
    if (chave in obj && obj[chave] !== null && obj[chave] !== undefined && obj[chave] !== "") {
      return obj[chave] as T;
    }
  }
  return null;
}

/** Converte valor para número, retornando null se inválido */
function toNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = typeof valor === "number" ? valor : parseFloat(String(valor).replace(",", "."));
  return isNaN(n) ? null : n;
}

/** Deriva fora_padrao de texto do resultado */
function derivarForaPadrao(resultado: string | null, foraPadraoRaw: unknown): boolean | null {
  if (foraPadraoRaw !== null && foraPadraoRaw !== undefined) {
    const str = String(foraPadraoRaw).toLowerCase();
    if (str === "1" || str === "true" || str === "s" || str === "sim") return true;
    if (str === "0" || str === "false" || str === "n" || str === "nao" || str === "não") return false;
  }
  if (resultado) {
    const r = resultado.toLowerCase();
    if (/fora|insatisf|n[aã]o\s*conforme|reprovad/i.test(r)) return true;
    if (/conforme|satisfat|dentro|aprovad/i.test(r)) return false;
  }
  return null;
}

/** Extrai lista de registros da resposta da API */
function extrairRegistros(data: unknown): Array<Record<string, unknown>> {
  if (!data) return [];
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>;
  const d = data as Record<string, unknown>;
  // SISAGUA usa "parametros" ou "sisagua_populacao_abastecida" como chave raiz
  for (const chave of ["parametros", "sisagua_populacao_abastecida", "items", "data", "result", "results", "records", "content"]) {
    if (Array.isArray(d[chave])) return d[chave] as Array<Record<string, unknown>>;
  }
  return [];
}

// ---------------------------------------------------------------------------
// Normalização defensiva — parâmetros de qualidade
// ---------------------------------------------------------------------------

function normalizarParametro(raw: Record<string, unknown>, rawId: number, endpoint: string): SisaguaParametro {
  const uf   = lerCampo<string>(raw, "uf", "co_uf", "sg_uf", "estado") ?? UF;
  // SISAGUA usa "ano_de_referencia" e "mes_de_referencia" como campos reais
  const ano  = toNumero(lerCampo(raw, "ano_de_referencia", "ano", "ano_referencia", "nu_ano", "an_referencia"));
  const mes  = toNumero(lerCampo(raw, "mes_de_referencia", "mes", "nu_mes", "mes_referencia", "nu_mes_referencia"));

  // Competência: tenta campo direto, ou constrói de ano+mes
  let competencia = lerCampo<string>(raw, "competencia", "co_competencia", "ds_competencia");
  if (!competencia && ano && mes) {
    competencia = `${ano}${String(mes).padStart(2, "0")}`;
  }

  // SISAGUA usa "codigo_ibge" (6 dígitos) como identificador de município
  const codigoMunicipioIbge = lerCampo<string>(
    raw, "codigo_ibge", "codigo_municipio", "co_municipio",
    "co_municipio_ibge", "codigo_municipio_ibge", "co_mun_ibge"
  );
  const nomeMunicipio = lerCampo<string>(
    raw, "municipio", "nome_municipio", "no_municipio", "nm_municipio", "no_mun"
  );
  // SISAGUA: campo "parametro" é o nome do parâmetro; "campo" é sub-descrição; "valor" é numérico
  const parametro = lerCampo<string>(
    raw, "parametro", "no_parametro", "ds_parametro", "nm_parametro"
  );
  // "campo" é descrição adicional (ex: "Número de dados > 9,0") — usa como resultado
  const resultado = lerCampo<string>(
    raw, "campo", "resultado", "ds_resultado", "vl_resultado", "no_resultado"
  );
  const valorRaw = lerCampo(raw, "valor", "nu_valor", "vl_parametro", "vl_resultado_num");
  const valor = toNumero(valorRaw);
  // Unidade vem no nome do parâmetro em parênteses ex: "Turbidez (uT)"
  let unidade = lerCampo<string>(raw, "unidade", "ds_unidade", "no_unidade", "sg_unidade");
  if (!unidade && parametro) {
    const m = parametro.match(/\(([^)]+)\)$/);
    if (m) unidade = m[1];
  }

  const foraPadraoRaw = lerCampo(raw, "fora_padrao", "in_fora_padrao", "nao_conforme");
  const foraPadrao = derivarForaPadrao(resultado, foraPadraoRaw);

  // Data coleta — tenta converter para ISO date
  let dataColeta: string | null = lerCampo<string>(raw, "data_coleta", "dt_coleta", "data_amostra", "dt_amostra");
  if (dataColeta) {
    const partes = dataColeta.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (partes) dataColeta = `${partes[3]}-${partes[2]}-${partes[1]}`;
    else if (dataColeta.length > 10) dataColeta = dataColeta.slice(0, 10);
  }

  // SISAGUA: "nome_da_forma_de_abastecimento" e "tipo_da_forma_de_abastecimento"
  const formaAbastecimento  = lerCampo<string>(raw, "nome_da_forma_de_abastecimento", "forma_abastecimento", "ds_forma_abastecimento", "no_forma_abast");
  const sistemaAbastecimento = lerCampo<string>(raw, "tipo_da_forma_de_abastecimento", "sistema_abastecimento", "no_sistema", "ds_sistema");
  // SISAGUA: "ponto_de_monitoramento"
  const pontoColeta = lerCampo<string>(raw, "ponto_de_monitoramento", "ponto_coleta", "ds_ponto_coleta", "no_ponto", "ds_ponto");

  return {
    rawId, endpoint, uf, codigoMunicipioIbge, nomeMunicipio,
    ano: ano ? Math.trunc(ano) : null,
    mes: mes ? Math.trunc(mes) : null,
    competencia, parametro, resultado, valor, unidade, foraPadrao,
    dataColeta, formaAbastecimento, sistemaAbastecimento, pontoColeta,
  };
}

// ---------------------------------------------------------------------------
// Normalização defensiva — população abastecida
// ---------------------------------------------------------------------------

function normalizarPopulacao(raw: Record<string, unknown>, rawId: number): SisaguaPopulacao {
  const uf   = lerCampo<string>(raw, "uf", "co_uf", "sg_uf") ?? UF;
  const ano  = toNumero(lerCampo(raw, "ano_de_referencia", "ano", "nu_ano", "an_referencia"));
  const mes  = toNumero(lerCampo(raw, "mes_de_referencia", "mes", "nu_mes"));

  let competencia = lerCampo<string>(raw, "competencia", "co_competencia");
  if (!competencia && ano && mes) {
    competencia = `${ano}${String(mes).padStart(2, "0")}`;
  }

  const codigoMunicipioIbge = lerCampo<string>(raw, "codigo_municipio", "co_municipio", "codigo_ibge", "co_mun_ibge");
  const nomeMunicipio = lerCampo<string>(raw, "nome_municipio", "municipio", "no_municipio");
  const populacaoAbastecida = toNumero(lerCampo(raw, "populacao_abastecida", "pop_abastecida", "nu_populacao", "populacao"));
  const formaAbastecimento  = lerCampo<string>(raw, "forma_abastecimento", "ds_forma_abastecimento");
  const sistemaAbastecimento = lerCampo<string>(raw, "sistema_abastecimento", "no_sistema");

  return {
    rawId, uf, codigoMunicipioIbge, nomeMunicipio,
    ano: ano ? Math.trunc(ano) : null,
    mes: mes ? Math.trunc(mes) : null,
    competencia, populacaoAbastecida, formaAbastecimento, sistemaAbastecimento,
  };
}

// ---------------------------------------------------------------------------
// Chamada paginada à API
// ---------------------------------------------------------------------------

async function carregarEndpointPaginado(
  nomeEndpoint: string,
  pathBase: string,
  ano: number
): Promise<number> {
  let offset = 0;
  let totalRegistros = 0;
  let pagina = 1;

  while (true) {
    const url = `${API_BASE}${pathBase}&limit=${PAGE_SIZE}&offset=${offset}`;
    console.log(`[sisagua:full] ${nomeEndpoint} ano=${ano} pág=${pagina} offset=${offset} → ${url}`);

    let registros: Array<Record<string, unknown>> = [];

    try {
      const resp = await fetchComTimeout(url);

      if (!resp.ok) {
        const texto = await resp.text().catch(() => "");
        console.log(`[sisagua:full] HTTP ${resp.status} em ${url}: ${texto.slice(0, 200)}`);
        break;
      }

      const contentType = resp.headers.get("content-type") ?? "";
      if (!contentType.includes("json")) {
        const texto = await resp.text().catch(() => "");
        console.log(`[sisagua:full] Resposta não-JSON (${contentType}): ${texto.slice(0, 200)}`);
        break;
      }

      const data: unknown = await resp.json();
      registros = extrairRegistros(data);

      if (registros.length === 0) {
        console.log(`[sisagua:full] ${nomeEndpoint} ano=${ano}: sem mais registros na pág=${pagina}.`);
        break;
      }

    } catch (err) {
      const msg = (err as Error).message;
      console.log(`[sisagua:full] Erro ao buscar ${nomeEndpoint} ano=${ano} pág=${pagina}: ${msg}`);
      break;
    }

    // Persiste cada registro
    for (const reg of registros) {
      try {
        const [rawRow] = await pgQuery<{ id: number }>(
          `INSERT INTO raw.sisagua_raw (endpoint, uf, ano, payload)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [nomeEndpoint, UF, ano, JSON.stringify(reg)]
        );
        const rawId = rawRow.id;

        // Normaliza e insere na stage
        const norm = normalizarParametro(reg, rawId, nomeEndpoint);
        await pgQuery(
          `INSERT INTO stage.sisagua_parametros_stg
             (raw_id, endpoint, uf, codigo_municipio_ibge, nome_municipio,
              ano, mes, competencia, parametro, resultado, valor, unidade,
              fora_padrao, data_coleta, forma_abastecimento,
              sistema_abastecimento, ponto_coleta)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [
            norm.rawId, norm.endpoint, norm.uf, norm.codigoMunicipioIbge, norm.nomeMunicipio,
            norm.ano, norm.mes, norm.competencia, norm.parametro, norm.resultado,
            norm.valor, norm.unidade, norm.foraPadrao, norm.dataColeta,
            norm.formaAbastecimento, norm.sistemaAbastecimento, norm.pontoColeta,
          ]
        );
      } catch (err) {
        console.log(`[sisagua:full] Erro ao persistir registro: ${(err as Error).message}`);
      }
    }

    totalRegistros += registros.length;
    console.log(`[sisagua:full] ${nomeEndpoint} ano=${ano} pág=${pagina}: ${registros.length} registros inseridos.`);

    if (registros.length < PAGE_SIZE) break; // última página

    offset += PAGE_SIZE;
    pagina++;
    await delay(RATE_LIMIT_MS);
  }

  return totalRegistros;
}

// ---------------------------------------------------------------------------
// Carrega população abastecida (endpoint opcional)
// ---------------------------------------------------------------------------

async function carregarPopulacao(ano: number): Promise<number> {
  // A API ignora o filtro uf= neste endpoint; busca tudo e filtra localmente
  let offset = 0;
  let total = 0;

  while (true) {
    const url = `${API_BASE}/sisagua/populacao-abastecida?ano=${ano}&limit=${PAGE_SIZE}&offset=${offset}`;
    console.log(`[sisagua:full] populacao-abastecida ano=${ano} offset=${offset} → ${url}`);

    try {
      const resp = await fetchComTimeout(url);
      if (!resp.ok) {
        console.log(`[sisagua:full] populacao-abastecida HTTP ${resp.status} — interrompido.`);
        break;
      }
      const data: unknown = await resp.json();
      const todos = extrairRegistros(data);
      if (todos.length === 0) break;

      // Filtra apenas registros da UF configurada
      const registros = todos.filter(r => {
        const ufReg = (r["uf"] as string | undefined ?? "").toUpperCase();
        return ufReg === UF.toUpperCase();
      });

      for (const reg of registros) {
        try {
          const [rawRow] = await pgQuery<{ id: number }>(
            `INSERT INTO raw.sisagua_raw (endpoint, uf, ano, payload)
             VALUES ($1, $2, $3, $4) RETURNING id`,
            ["populacao_abastecida", UF, ano, JSON.stringify(reg)]
          );
          const norm = normalizarPopulacao(reg, rawRow.id);
          await pgQuery(
            `INSERT INTO stage.sisagua_populacao_stg
               (raw_id, uf, codigo_municipio_ibge, nome_municipio,
                ano, mes, competencia, populacao_abastecida,
                forma_abastecimento, sistema_abastecimento)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
              norm.rawId, norm.uf, norm.codigoMunicipioIbge, norm.nomeMunicipio,
              norm.ano, norm.mes, norm.competencia, norm.populacaoAbastecida,
              norm.formaAbastecimento, norm.sistemaAbastecimento,
            ]
          );
          total++;
        } catch (err) {
          console.log(`[sisagua:full] Erro ao inserir populacao: ${(err as Error).message}`);
        }
      }

      console.log(`[sisagua:full] populacao-abastecida ano=${ano} offset=${offset}: ${todos.length} total, ${registros.length} do Acre.`);
      if (todos.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
      await delay(RATE_LIMIT_MS);
    } catch (err) {
      console.log(`[sisagua:full] Erro ao buscar populacao-abastecida: ${(err as Error).message}`);
      break;
    }
  }

  return total;
}

// ---------------------------------------------------------------------------
// Promoção stage → dw
// ---------------------------------------------------------------------------

async function promoverParaDw(): Promise<{ parametros: number; populacao: number }> {
  console.log("[sisagua:full] Promovendo stage → dw...");

  // ── Parâmetros de qualidade ────────────────────────────────────────────────

  // 1. Verifica se a stage tem dados
  const [stageCount] = await pgQuery<{ n: string }>(
    `SELECT count(*)::text AS n FROM stage.sisagua_parametros_stg`
  );
  const totalStage = parseInt(stageCount?.n ?? "0", 10);

  if (totalStage === 0) {
    console.log("[sisagua:full] ALERTA: stage.sisagua_parametros_stg está vazia — nenhum dado para promover ao dw.");
    return { parametros: 0, populacao: 0 };
  }

  // 2. Coleta competências distintas presentes na stage atual
  const competenciasRows = await pgQuery<{ competencia: string | null }>(
    `SELECT DISTINCT competencia FROM stage.sisagua_parametros_stg`
  );
  const competencias = competenciasRows
    .map((r) => r.competencia)
    .filter((c): c is string => c !== null && c !== "");

  if (competencias.length === 0) {
    console.log("[sisagua:full] ALERTA: stage não contém competências válidas — abortando promoção ao dw para evitar limpeza incorreta.");
    return { parametros: 0, populacao: 0 };
  }

  console.log(`[sisagua:full] Competências na stage (${competencias.length}): ${competencias.slice(0, 10).join(", ")}${competencias.length > 10 ? " ..." : ""}`);

  // 3. DELETE + INSERT em transação por competência
  let parametros = 0;
  await withPgTransaction(async (client) => {
    // Remove do dw somente as competências que serão reprocessadas
    const placeholders = competencias.map((_, i) => `$${i + 1}`).join(", ");
    const { rowCount: deletados } = await client.query(
      `DELETE FROM dw.fato_sisagua_parametro WHERE competencia IN (${placeholders})`,
      competencias
    );
    console.log(`[sisagua:full] dw.fato_sisagua_parametro: ${deletados ?? 0} registros removidos (competências reprocessadas).`);

    // Insere os dados limpos da stage atual
    const { rowCount: inseridos } = await client.query(
      `INSERT INTO dw.fato_sisagua_parametro
         (endpoint, uf, codigo_municipio_ibge, nome_municipio,
          ano, mes, competencia, parametro, resultado, valor, unidade,
          fora_padrao, data_coleta, forma_abastecimento, sistema_abastecimento, ponto_coleta)
       SELECT
         endpoint, uf, codigo_municipio_ibge, nome_municipio,
         ano, mes, competencia, parametro, resultado, valor, unidade,
         fora_padrao, data_coleta, forma_abastecimento, sistema_abastecimento, ponto_coleta
       FROM stage.sisagua_parametros_stg`
    );
    parametros = inseridos ?? 0;
  });

  console.log(`[sisagua:full] ✓ dw.fato_sisagua_parametro: ${parametros} registros inseridos.`);

  // ── População abastecida ───────────────────────────────────────────────────

  const [popStageCount] = await pgQuery<{ n: string }>(
    `SELECT count(*)::text AS n FROM stage.sisagua_populacao_stg`
  );
  const totalPopStage = parseInt(popStageCount?.n ?? "0", 10);

  let populacao = 0;
  if (totalPopStage === 0) {
    console.log("[sisagua:full] Aviso: stage.sisagua_populacao_stg vazia — nenhum dado de população para promover.");
  } else {
    const popCompRows = await pgQuery<{ competencia: string | null }>(
      `SELECT DISTINCT competencia FROM stage.sisagua_populacao_stg`
    );
    const popCompetencias = popCompRows
      .map((r) => r.competencia)
      .filter((c): c is string => c !== null && c !== "");

    await withPgTransaction(async (client) => {
      if (popCompetencias.length > 0) {
        const placeholders = popCompetencias.map((_, i) => `$${i + 1}`).join(", ");
        await client.query(
          `DELETE FROM dw.fato_sisagua_populacao WHERE competencia IN (${placeholders})`,
          popCompetencias
        );
      }
      const { rowCount: inseridos } = await client.query(
        `INSERT INTO dw.fato_sisagua_populacao
           (uf, codigo_municipio_ibge, nome_municipio, ano, mes, competencia,
            populacao_abastecida, forma_abastecimento, sistema_abastecimento)
         SELECT
           uf, codigo_municipio_ibge, nome_municipio, ano, mes, competencia,
           populacao_abastecida, forma_abastecimento, sistema_abastecimento
         FROM stage.sisagua_populacao_stg`
      );
      populacao = inseridos ?? 0;
    });
  }

  console.log(`[sisagua:full] ✓ dw.fato_sisagua_populacao: ${populacao} registros inseridos.`);

  return { parametros, populacao };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function executarSisaguaFull(): Promise<void> {
  const inicio = Date.now();
  console.log("[sisagua:full] Iniciando carga completa SISAGUA...");
  console.log(`[sisagua:full] API: ${API_BASE} | UF: ${UF} | Anos: ${ANO_INICIO}–${ANO_FIM}`);

  // Registra início da carga
  const [cargaRow] = await pgQuery<{ id: number }>(
    `INSERT INTO audit.etl_carga (modulo, status, iniciado_em)
     VALUES ('sisagua:full', 'EM_ANDAMENTO', now())
     RETURNING id`
  ).catch(() => [{ id: 0 }] as Array<{ id: number }>);
  const cargaId = cargaRow?.id ?? 0;

  // Limpa a stage antes de cada execução para evitar acúmulo de execuções anteriores
  await pgQuery(`TRUNCATE stage.sisagua_parametros_stg`).catch((err) => {
    console.log(`[sisagua:full] Aviso: não foi possível truncar stage.sisagua_parametros_stg: ${(err as Error).message}`);
  });
  await pgQuery(`TRUNCATE stage.sisagua_populacao_stg`).catch((err) => {
    console.log(`[sisagua:full] Aviso: não foi possível truncar stage.sisagua_populacao_stg: ${(err as Error).message}`);
  });
  console.log("[sisagua:full] Stage truncada. Iniciando coleta da API...");

  let totalParametros = 0;
  let totalPopulacao  = 0;

  // Endpoints reais descobertos na inspeção
  const endpointsParametros = [
    { nome: "controle_mensal", path: `/sisagua/controle-mensal-parametros-basicos?uf=${UF}&ano=` },
    { nome: "vigilancia",      path: `/sisagua/vigilancia-parametros-basicos?uf=${UF}&ano=`      },
  ];

  for (let ano = ANO_INICIO; ano <= ANO_FIM; ano++) {
    for (const ep of endpointsParametros) {
      const total = await carregarEndpointPaginado(ep.nome, `${ep.path}${ano}`, ano);
      totalParametros += total;
      await delay(RATE_LIMIT_MS);
    }

    // Tenta carregar população abastecida
    const totalPop = await carregarPopulacao(ano);
    totalPopulacao += totalPop;
    await delay(RATE_LIMIT_MS);
  }

  console.log(`[sisagua:full] Carga raw+stage concluída: ${totalParametros} parâmetros, ${totalPopulacao} populacao.`);

  // Promoção stage → dw
  const { parametros: dwParametros, populacao: dwPopulacao } = await promoverParaDw();

  const duracao = Date.now() - inicio;

  // Auditoria
  await pgQuery(
    `INSERT INTO audit.etl_log (modulo, status, mensagem, registros, duracao_ms)
     VALUES ('sisagua:full', 'OK', $1, $2, $3)`,
    [
      `Carga SISAGUA: ${totalParametros} raw, ${dwParametros} parâmetros dw, ${dwPopulacao} populacao dw`,
      dwParametros,
      duracao,
    ]
  ).catch(() => void 0);

  if (cargaId > 0) {
    await pgQuery(
      `UPDATE audit.etl_carga
       SET status='OK', finalizado_em=now(), registros=$1, duracao_ms=$2
       WHERE id=$3`,
      [dwParametros, duracao, cargaId]
    ).catch(() => void 0);
  }

  console.log(`[sisagua:full] Carga concluída em ${duracao}ms.`);
}

if (require.main === module) {
  executarSisaguaFull()
    .then(() => closePgPool())
    .catch((err) => {
      console.error("[sisagua:full] Erro:", (err as Error).message);
      closePgPool().catch(() => void 0);
      process.exit(1);
    });
}
