/**
 * ETL - População Municipal IBGE (API IBGE -> Supabase)
 *
 * Fontes IBGE SIDRA:
 *   - Tabela 4714 var 93: Estimativas populacionais anuais (2001–2021)
 *   - Tabela 9514 var 93: Censo Demográfico 2022
 *
 * Destinos:
 *   - aux_populacao_ibge  : histórico completo (cod_ibge × ano)
 *   - dim_ente.populacao  : valor vigente resolvido via fallback ao ano
 *                           mais recente disponível <= ano corrente
 *
 * Regra de fallback:
 *   Como o Censo não ocorre todo ano, anos sem dados próprios herdam
 *   automaticamente o dado do ano imediatamente anterior com valor válido.
 *   A view vw_populacao_ibge_vigente implementa esse comportamento no banco.
 *   O ETL aplica a mesma regra em memória ao atualizar dim_ente.populacao.
 *
 * Entes excluídos do per capita consolidado:
 *   O ente "Governo do Estado" não representa uma população própria —
 *   sua população seria a soma duplicada dos municípios. Identificado pelo
 *   campo cod_ibgce nulo ou pela variável IBGE_GOV_ESTADO_COD_IBGE.
 */

import "dotenv/config";
import { getSupabase } from "../connectors/supabase";

// ─── Configuração ─────────────────────────────────────────────────────────────

const MODULO  = "populacao_ibge";
const supabase = getSupabase();

const IBGE_UF = process.env.IBGE_UF_CODE || "12"; // 12 = Acre
const SUPABASE_BATCH = toPositiveInt(Number(process.env.POPULACAO_IBGE_BATCH || "200"), 200);

// cod_ibge do ente "Governo do Estado do Acre" — excluído da soma de população.
// Defina via env se o código for diferente no seu ambiente.
const IBGE_GOV_ESTADO_COD_IBGE = toOptionalInt(process.env.IBGE_GOV_ESTADO_COD_IBGE);

// ─── Tipos ───────────────────────────────────────────────────────────────────

type PopRow = {
  cod_ibge:  number;
  ano:       number;
  populacao: number;
  fonte:     string;
  atualizado_em: string;
};

type DimEnteRow = {
  id_ente:    number;
  cod_ibgce:  number | null;
  populacao:  number | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toPositiveInt(input: number, fallback: number): number {
  if (!Number.isFinite(input) || input < 1) return fallback;
  return Math.trunc(input);
}

function toOptionalInt(input: string | undefined): number | null {
  if (!input) return null;
  const n = Number(input);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

async function gravarLog(status: "sucesso" | "erro", registros: number, duracao: number, mensagem?: string) {
  await supabase.from("etl_log").insert({
    modulo: MODULO,
    status,
    mensagem: mensagem ?? null,
    registros,
    duracao_ms: duracao,
  });
}

// ─── Busca IBGE ───────────────────────────────────────────────────────────────

/**
 * Chama a API IBGE SIDRA e retorna linhas (cod_ibge, ano, populacao).
 * aggregado  : código da tabela SIDRA (ex: "4714" ou "9514")
 * variavel   : código da variável    (ex: "93")
 * periodos   : string de períodos    (ex: "2010|2011|2021" ou "2022")
 * codigos    : lista de códigos IBGE de municípios (7 dígitos)
 * fonte      : texto descritivo para o campo fonte
 */

/**
 * Passo 1 — Busca os códigos IBGE (7 dígitos) dos municípios da UF
 * usando a API de localidades, que é mais estável que o SIDRA.
 */
async function buscarCodigosMunicipios(): Promise<number[]> {
  const url = `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${IBGE_UF}/municipios`;
  const resp = await fetch(url, { headers: { Accept: "application/json" } });
  if (!resp.ok) throw new Error(`IBGE localidades retornou HTTP ${resp.status}: ${url}`);
  const data = (await resp.json()) as Array<{ id: number; nome: string }>; // eslint-disable-line @typescript-eslint/no-explicit-any
  return data.map((m) => m.id);
}

/**
 * Passo 2 — Consulta o SIDRA com os códigos explícitos dos municípios.
 * Evita o filtro "in N3 XX" que causa HTTP 500 em alguns ambientes.
 */
async function buscarSIDRA(
  agregado: string,
  variavel: string,
  periodos: string,
  codigos: number[],
  fonte: string,
): Promise<PopRow[]> {
  const codsStr = codigos.join(",");
  const url =
    `https://servicodados.ibge.gov.br/api/v3/agregados/${agregado}` +
    `/periodos/${periodos}/variaveis/${variavel}` +
    `?localidades=N6[${codsStr}]`;

  const resp = await fetch(url, { headers: { Accept: "application/json" } });
  if (!resp.ok) {
    throw new Error(`IBGE SIDRA ${agregado} retornou HTTP ${resp.status}: ${url}`);
  }

  const data = (await resp.json()) as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  const rows: PopRow[] = [];
  const now = new Date().toISOString();

  for (const variavel_ of data) {
    for (const resultado of variavel_.resultados ?? []) {
      for (const serie of resultado.series ?? []) {
        const codIbge = Number(serie.localidade?.id);
        if (!codIbge || isNaN(codIbge)) continue;

        for (const [anoStr, popStr] of Object.entries(serie.serie ?? {})) {
          const ano = Number(anoStr);
          const pop = Number(String(popStr).replace(/\D/g, ""));
          if (!isNaN(ano) && ano > 0 && !isNaN(pop) && pop > 0) {
            rows.push({ cod_ibge: codIbge, ano, populacao: pop, fonte, atualizado_em: now });
          }
        }
      }
    }
  }

  return rows;
}

// ─── Upsert no Supabase ───────────────────────────────────────────────────────

async function upsertPopulacao(rows: PopRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += SUPABASE_BATCH) {
    const chunk = rows.slice(i, i + SUPABASE_BATCH);
    const { error } = await supabase
      .from("aux_populacao_ibge")
      .upsert(chunk, { onConflict: "cod_ibge,ano" });
    if (error) throw new Error(`Erro no upsert de aux_populacao_ibge: ${error.message}`);
  }
}

// ─── Atualiza dim_ente.populacao com fallback ─────────────────────────────────

/**
 * Para cada ente com cod_ibgce preenchido, encontra o dado de população
 * mais recente disponível (ano <= anoAtual) e atualiza dim_ente.populacao.
 *
 * O ente "Governo do Estado" (sem cod_ibgce ou com cod_ibge configurado)
 * é ignorado — sua população não é somável aos municípios.
 */
async function atualizarDimEnte(historico: PopRow[]): Promise<number> {
  const { data: entes, error } = await supabase
    .from("dim_ente")
    .select("id_ente, cod_ibgce, populacao");

  if (error) throw new Error(`Erro ao buscar dim_ente: ${error.message}`);

  const anoAtual = new Date().getFullYear();

  // Índice: cod_ibge → Map<ano, populacao> (descendente por ano)
  const histMap = new Map<number, Map<number, number>>();
  for (const row of historico) {
    if (!histMap.has(row.cod_ibge)) histMap.set(row.cod_ibge, new Map());
    histMap.get(row.cod_ibge)!.set(row.ano, row.populacao);
  }

  function resolverPopulacao(codIbge: number): number | null {
    const anos = histMap.get(codIbge);
    if (!anos) return null;
    // Busca o ano mais recente <= anoAtual
    const anoValido = [...anos.keys()]
      .filter((a) => a <= anoAtual)
      .sort((a, b) => b - a)[0];
    return anoValido != null ? (anos.get(anoValido) ?? null) : null;
  }

  let atualizados = 0;
  for (const ente of (entes ?? []) as DimEnteRow[]) {
    const codIbge = ente.cod_ibgce;

    // Pula ente sem código IBGE (ex: Governo do Estado sem mapeamento)
    if (!codIbge) continue;
    // Pula se for o ente estadual configurado explicitamente
    if (IBGE_GOV_ESTADO_COD_IBGE && codIbge === IBGE_GOV_ESTADO_COD_IBGE) continue;

    const pop = resolverPopulacao(codIbge);
    if (pop === null) continue;
    if (pop === ente.populacao) continue; // sem mudança

    const { error: updErr } = await supabase
      .from("dim_ente")
      .update({ populacao: pop })
      .eq("id_ente", ente.id_ente);

    if (updErr) throw new Error(`Erro ao atualizar dim_ente id=${ente.id_ente}: ${updErr.message}`);
    atualizados++;
  }

  return atualizados;
}

// ─── Ponto de entrada ─────────────────────────────────────────────────────────

export async function executarETLPopulacaoIBGE(): Promise<void> {
  const inicio = Date.now();
  console.log(`[${new Date().toISOString()}] Iniciando ETL: ${MODULO}`);
  console.log(`  -> UF IBGE: ${IBGE_UF} | Batch: ${SUPABASE_BATCH}`);

  try {
    // 1. Descobre os códigos IBGE dos municípios da UF via API de localidades
    console.log(`  -> Buscando municípios da UF ${IBGE_UF} (API localidades)...`);
    const codigos = await buscarCodigosMunicipios();
    console.log(`     ${codigos.length} municípios encontrados`);

    // Períodos explícitos para tabela 4714 (evita timeout com "all")
    const anosEstimativas = Array.from({ length: 21 }, (_, i) => 2001 + i).join("|"); // 2001–2021

    // 2. Busca estimativas anuais 2001–2021 (tabela 4714, variável 93)
    console.log("  -> Buscando estimativas 2001–2021 (SIDRA 4714)...");
    const estimativas = await buscarSIDRA("4714", "93", anosEstimativas, codigos, "IBGE Estimativas 4714");
    console.log(`     ${estimativas.length} registros`);

    // 3. Busca Censo 2022 (tabela 9514, variável 93)
    console.log("  -> Buscando Censo 2022 (SIDRA 9514)...");
    let censo2022: PopRow[] = [];
    try {
      censo2022 = await buscarSIDRA("9514", "93", "2022", codigos, "IBGE Censo 2022");
      console.log(`     ${censo2022.length} registros`);
    } catch (err) {
      // Censo pode ainda não estar disponível — apenas avisa
      console.warn(`     Aviso: Censo 2022 indisponivel (${err instanceof Error ? err.message : err})`);
    }

    // 4. Consolida e deduplica (Censo tem prioridade sobre estimativa no mesmo ano)
    const todosMapa = new Map<string, PopRow>();
    for (const row of [...estimativas, ...censo2022]) {
      todosMapa.set(`${row.cod_ibge}|${row.ano}`, row); // último vence (censo sobrescreve estimativa)
    }
    const todos = [...todosMapa.values()];
    console.log(`  -> Total consolidado: ${todos.length} registros (${new Set(todos.map(r => r.ano)).size} anos)`);

    // 5. Upsert em aux_populacao_ibge
    console.log("  -> Upserting aux_populacao_ibge...");
    await upsertPopulacao(todos);

    // 6. Atualiza dim_ente.populacao com fallback ao ano mais recente
    console.log("  -> Atualizando dim_ente.populacao com fallback...");
    const atualizados = await atualizarDimEnte(todos);
    console.log(`     ${atualizados} ente(s) atualizado(s)`);

    const duracao = Date.now() - inicio;
    console.log(`  OK - ETL concluido em ${duracao}ms`);
    await gravarLog("sucesso", todos.length, duracao);
  } catch (error) {
    const duracao = Date.now() - inicio;
    const mensagem = error instanceof Error ? error.message : String(error);
    console.error(`  ERRO - ${mensagem}`);
    await gravarLog("erro", 0, duracao, mensagem);
    throw error;
  }
}

if (require.main === module) {
  executarETLPopulacaoIBGE().catch(() => process.exit(1));
}
