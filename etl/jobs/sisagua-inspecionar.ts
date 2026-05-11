/**
 * sisagua-inspecionar.ts
 *
 * Inspeciona os endpoints da API SISAGUA (Qualidade da Água / DATASUS)
 * para identificar formato real dos campos e disponibilidade dos dados.
 *
 * Endpoints testados:
 *   /sisagua/controle-mensal?uf=AC&ano=2024&limit=3
 *   /sisagua/vigilancia?uf=AC&ano=2024&limit=3
 *   /sisagua/fora-padrao?uf=AC&ano=2024&limit=3
 *   /sisagua/populacao-abastecida?uf=AC&ano=2024&limit=3
 *
 * Se SISAGUA_*_RESOURCE_ID estiver definido, também testa via CKAN
 * (/api/3/action/datastore_search?resource_id=xxx&limit=3).
 *
 * Uso: cd etl && npm run sisagua:inspecionar
 */

import "dotenv/config";
import { pgQuery, closePgPool } from "../connectors/postgres";

// ---------------------------------------------------------------------------
// Configuração via variáveis de ambiente
// ---------------------------------------------------------------------------

const API_BASE         = (process.env.SISAGUA_API_BASE_URL ?? "https://apidadosabertos.saude.gov.br").replace(/\/$/, "");
const UF               = process.env.SISAGUA_UF          ?? "AC";
const ANO              = parseInt(process.env.SISAGUA_ANO_INICIO ?? "2024", 10);
const TIMEOUT_MS       = parseInt(process.env.SISAGUA_TIMEOUT_MS ?? "30000", 10);

const RESOURCE_IDS: Record<string, string | undefined> = {
  controle_mensal:      process.env.SISAGUA_CONTROLE_MENSAL_RESOURCE_ID,
  vigilancia:           process.env.SISAGUA_VIGILANCIA_RESOURCE_ID,
  fora_padrao:          process.env.SISAGUA_FORA_PADRAO_RESOURCE_ID,
  populacao_abastecida: process.env.SISAGUA_POPULACAO_ABASTECIDA_RESOURCE_ID,
};

// Endpoints REST a testar
const ENDPOINTS_REST = [
  { nome: "controle_mensal",      path: `/sisagua/controle-mensal?uf=${UF}&ano=${ANO}&limit=3`      },
  { nome: "vigilancia",           path: `/sisagua/vigilancia?uf=${UF}&ano=${ANO}&limit=3`           },
  { nome: "fora_padrao",          path: `/sisagua/fora-padrao?uf=${UF}&ano=${ANO}&limit=3`          },
  { nome: "populacao_abastecida", path: `/sisagua/populacao-abastecida?uf=${UF}&ano=${ANO}&limit=3` },
];

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
    const resp = await fetch(url, { signal: controller.signal });
    return resp;
  } finally {
    clearTimeout(timer);
  }
}

function extrairPrimeiroRegistro(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  // Formatos comuns: { items: [...] }, { data: [...] }, { results: [...] }, array direto
  for (const chave of ["items", "data", "result", "results", "records"]) {
    const arr = d[chave];
    if (Array.isArray(arr) && arr.length > 0) return arr[0] as Record<string, unknown>;
  }
  if (Array.isArray(data) && (data as unknown[]).length > 0) return (data as unknown[])[0] as Record<string, unknown>;
  return null;
}

function identificarCampos(registro: Record<string, unknown>): void {
  const campos = Object.keys(registro);
  console.log(`   Campos encontrados (${campos.length}): ${campos.join(", ")}`);

  // Identifica candidatos para campos de interesse
  const camposDeInteresse: Record<string, string[]> = {
    "codigo_ibge":      campos.filter(c => /ibge|municipio.*cod|co_mun|codigo_mun/i.test(c)),
    "nome_municipio":   campos.filter(c => /nome.*mun|no_mun|municipio(?!.*cod)/i.test(c)),
    "ano":              campos.filter(c => /^(ano|nu_ano|an_|ano_ref)/i.test(c)),
    "mes":              campos.filter(c => /^(mes|nu_mes|mes_ref)/i.test(c)),
    "competencia":      campos.filter(c => /competencia|co_competencia/i.test(c)),
    "parametro":        campos.filter(c => /parametro|no_param|ds_param/i.test(c)),
    "resultado":        campos.filter(c => /resultado|ds_result|vl_result/i.test(c)),
    "valor":            campos.filter(c => /^(valor|nu_valor|vl_param)/i.test(c)),
    "unidade":          campos.filter(c => /unidade|ds_unid|no_unid/i.test(c)),
    "fora_padrao":      campos.filter(c => /fora_padrao|in_fora|nao_conform/i.test(c)),
    "data_coleta":      campos.filter(c => /data_col|dt_col|data_amos/i.test(c)),
    "forma_abast":      campos.filter(c => /forma_abast|ds_forma/i.test(c)),
    "sistema_abast":    campos.filter(c => /sistema|no_sistema/i.test(c)),
    "ponto_coleta":     campos.filter(c => /ponto|ds_ponto|no_ponto/i.test(c)),
    "populacao":        campos.filter(c => /populacao|pop_abast/i.test(c)),
  };

  console.log("   Campos de interesse identificados:");
  for (const [chave, candidatos] of Object.entries(camposDeInteresse)) {
    if (candidatos.length > 0) {
      const valores = candidatos.map(c => `${c}=${JSON.stringify(registro[c])}`).join(", ");
      console.log(`     ${chave.padEnd(18)}: ${valores}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Salva amostra no banco
// ---------------------------------------------------------------------------

async function salvarAmostra(endpoint: string, ano: number, mes: number | null, payload: Record<string, unknown>): Promise<void> {
  try {
    await pgQuery(
      `INSERT INTO raw.sisagua_raw (endpoint, uf, ano, mes, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [endpoint, UF, ano, mes, JSON.stringify(payload)]
    );
  } catch (err) {
    console.log(`   [aviso] Não foi possível salvar amostra no banco: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Testa endpoint REST
// ---------------------------------------------------------------------------

async function testarEndpointRest(nome: string, path: string): Promise<{ ok: boolean; data: unknown }> {
  const url = `${API_BASE}${path}`;
  console.log(`\n${"=".repeat(70)}`);
  console.log(`Endpoint: ${nome}`);
  console.log(`URL: ${url}`);

  try {
    const resp = await fetchComTimeout(url);
    console.log(`Status HTTP: ${resp.status} ${resp.statusText}`);

    if (!resp.ok) {
      const texto = await resp.text().catch(() => "(sem corpo)");
      console.log(`Resposta: ${texto.slice(0, 300)}`);
      return { ok: false, data: null };
    }

    const contentType = resp.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) {
      const texto = await resp.text().catch(() => "(sem corpo)");
      console.log(`Content-Type: ${contentType}`);
      console.log(`Resposta (não JSON): ${texto.slice(0, 500)}`);
      return { ok: false, data: null };
    }

    const data: unknown = await resp.json();
    console.log(`Resposta obtida com sucesso.`);

    const primeiro = extrairPrimeiroRegistro(data);
    if (primeiro) {
      console.log(`Primeiro registro:`);
      console.log(JSON.stringify(primeiro, null, 2).split("\n").slice(0, 40).join("\n"));
      identificarCampos(primeiro);

      // Salva amostra no banco
      const mes: number | null = (primeiro["mes"] as number | null) ?? (primeiro["nu_mes"] as number | null) ?? null;
      await salvarAmostra(nome, ANO, mes, primeiro);
      console.log(`   ✓ Amostra salva em raw.sisagua_raw`);
    } else {
      console.log(`Estrutura da resposta: ${JSON.stringify(data, null, 2).slice(0, 500)}`);
    }

    return { ok: true, data };
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("aborted") || msg.includes("timeout")) {
      console.log(`Timeout após ${TIMEOUT_MS}ms.`);
    } else {
      console.log(`Erro ao chamar endpoint: ${msg}`);
    }
    return { ok: false, data: null };
  }
}

// ---------------------------------------------------------------------------
// Testa via CKAN (resource_id)
// ---------------------------------------------------------------------------

async function testarCkan(nome: string, resourceId: string): Promise<void> {
  const url = `${API_BASE}/api/3/action/datastore_search?resource_id=${resourceId}&limit=3`;
  console.log(`\n  [CKAN] ${nome} resource_id=${resourceId}`);
  console.log(`  URL: ${url}`);

  try {
    const resp = await fetchComTimeout(url);
    console.log(`  Status: ${resp.status}`);

    if (!resp.ok) {
      const texto = await resp.text().catch(() => "(sem corpo)");
      console.log(`  Resposta: ${texto.slice(0, 200)}`);
      return;
    }

    const data = await resp.json() as Record<string, unknown>;
    const resultado = data["result"] as Record<string, unknown> | undefined;
    const registros = resultado?.["records"] as unknown[] | undefined;

    if (registros && registros.length > 0) {
      console.log(`  Registros via CKAN: ${registros.length}`);
      console.log(`  Primeiro: ${JSON.stringify(registros[0], null, 2).slice(0, 500)}`);
    } else {
      console.log(`  Nenhum registro retornado via CKAN.`);
      console.log(`  Resposta: ${JSON.stringify(data, null, 2).slice(0, 300)}`);
    }
  } catch (err) {
    console.log(`  Erro CKAN: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function executarSisaguaInspecionar(): Promise<void> {
  console.log("=".repeat(70));
  console.log("SISAGUA — Inspeção de endpoints e formato dos dados");
  console.log("=".repeat(70));
  console.log(`API base:      ${API_BASE}`);
  console.log(`UF filtrada:   ${UF}`);
  console.log(`Ano de teste:  ${ANO}`);
  console.log(`Timeout:       ${TIMEOUT_MS}ms`);
  console.log(`Resource IDs configurados:`);
  for (const [k, v] of Object.entries(RESOURCE_IDS)) {
    console.log(`  ${k.padEnd(24)}: ${v ?? "(não configurado)"}`);
  }

  const resultados: Array<{ nome: string; ok: boolean }> = [];

  for (const ep of ENDPOINTS_REST) {
    const { ok } = await testarEndpointRest(ep.nome, ep.path);
    resultados.push({ nome: ep.nome, ok });

    // Testa via CKAN se resource_id configurado
    const resourceId = RESOURCE_IDS[ep.nome];
    if (resourceId) {
      await testarCkan(ep.nome, resourceId);
    }

    await delay(500);
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log("Resumo da inspeção:");
  for (const r of resultados) {
    console.log(`  ${r.ok ? "✓" : "✗"} ${r.nome}`);
  }

  const disponiveis = resultados.filter(r => r.ok).map(r => r.nome);
  if (disponiveis.length > 0) {
    console.log(`\nEndpoints disponíveis: ${disponiveis.join(", ")}`);
    console.log(`Próximo passo: copie os nomes de campos corretos e execute:`);
    console.log(`  npm run sisagua:full:postgres`);
  } else {
    console.log(`\nNenhum endpoint respondeu com sucesso.`);
    console.log(`Verifique SISAGUA_API_BASE_URL e conectividade com a internet.`);
  }

  console.log(`\nAmostras salvas em: raw.sisagua_raw`);
}

if (require.main === module) {
  executarSisaguaInspecionar()
    .then(() => closePgPool())
    .catch((err) => {
      console.error("[sisagua:inspecionar] Erro:", (err as Error).message);
      closePgPool().catch(() => void 0);
      process.exit(1);
    });
}
