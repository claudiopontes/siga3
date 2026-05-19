/**
 * siope-rreo-anexo8-validar-postgres.ts
 *
 * Fase 16C — Validação da camada raw/dw do RREO Anexo 8 (Educação/MDE).
 *
 * Somente leitura. Imprime:
 *   1. Total raw e total DW.
 *   2. Exercícios disponíveis.
 *   3. Entes carregados e cobertura dos 22 municípios + Estado AC.
 *   4. Categorias encontradas.
 *   5. Top contas MDE / FUNDEB / Remuneração dos profissionais.
 *   6. Entes esperados sem dados.
 *   7. Amostra de 20 registros relevantes.
 *   8. Veredicto final: OK / PARCIAL / INSUFICIENTE.
 *
 * Uso: cd etl && npx ts-node jobs/siope-rreo-anexo8-validar-postgres.ts
 */

import "dotenv/config";
import { pgQuery, closePgPool } from "../connectors/postgres";

// Mesma lista canônica usada na carga incremental.
const ENTES_ESPERADOS: { id_ente: string; no_ente: string }[] = [
  { id_ente: "12",      no_ente: "Governo do Estado do Acre" },
  { id_ente: "1200013", no_ente: "Acrelândia" },
  { id_ente: "1200054", no_ente: "Assis Brasil" },
  { id_ente: "1200104", no_ente: "Brasiléia" },
  { id_ente: "1200138", no_ente: "Bujari" },
  { id_ente: "1200179", no_ente: "Capixaba" },
  { id_ente: "1200203", no_ente: "Cruzeiro do Sul" },
  { id_ente: "1200252", no_ente: "Epitaciolândia" },
  { id_ente: "1200302", no_ente: "Feijó" },
  { id_ente: "1200328", no_ente: "Jordão" },
  { id_ente: "1200336", no_ente: "Mâncio Lima" },
  { id_ente: "1200344", no_ente: "Manoel Urbano" },
  { id_ente: "1200351", no_ente: "Marechal Thaumaturgo" },
  { id_ente: "1200385", no_ente: "Plácido de Castro" },
  { id_ente: "1200393", no_ente: "Porto Walter" },
  { id_ente: "1200401", no_ente: "Rio Branco" },
  { id_ente: "1200427", no_ente: "Rodrigues Alves" },
  { id_ente: "1200435", no_ente: "Santa Rosa do Purus" },
  { id_ente: "1200450", no_ente: "Senador Guiomard" },
  { id_ente: "1200500", no_ente: "Sena Madureira" },
  { id_ente: "1200609", no_ente: "Tarauacá" },
  { id_ente: "1200708", no_ente: "Xapuri" },
  { id_ente: "1200807", no_ente: "Porto Acre" },
];

function sep(titulo: string) {
  console.log(`\n── ${titulo} ${"─".repeat(Math.max(0, 60 - titulo.length))}`);
}

function fmt(n: number | string | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const num = typeof n === "string" ? parseFloat(n) : n;
  return isNaN(num) ? String(n) : num.toLocaleString("pt-BR");
}

async function totaisGerais(): Promise<{ totalRaw: number; totalDw: number; totalMart: number }> {
  sep("1. Totais gerais");
  const [r1] = await pgQuery<{ n: string }>("SELECT COUNT(*)::text AS n FROM raw.siope_rreo_anexo8_raw");
  const [r2] = await pgQuery<{ n: string }>("SELECT COUNT(*)::text AS n FROM dw.fato_siope_rreo_anexo8");
  const [r3] = await pgQuery<{ n: string }>("SELECT COUNT(*)::text AS n FROM mart.siope_risco_educacao_basico");
  const totalRaw  = parseInt(r1?.n ?? "0", 10);
  const totalDw   = parseInt(r2?.n ?? "0", 10);
  const totalMart = parseInt(r3?.n ?? "0", 10);
  console.log(`  raw.siope_rreo_anexo8_raw      : ${fmt(totalRaw)} linhas`);
  console.log(`  dw.fato_siope_rreo_anexo8      : ${fmt(totalDw)} linhas`);
  console.log(`  mart.siope_risco_educacao_basico: ${fmt(totalMart)} linhas (ente × exercício × período)`);
  return { totalRaw, totalDw, totalMart };
}

async function exerciciosDisponiveis(): Promise<number[]> {
  sep("2. Exercícios disponíveis");
  const rows = await pgQuery<{ an_exercicio: number; n: string }>(`
    SELECT an_exercicio, COUNT(*)::text AS n
    FROM dw.fato_siope_rreo_anexo8
    GROUP BY an_exercicio
    ORDER BY an_exercicio DESC
  `);
  if (!rows.length) {
    console.log("  (nenhum exercício)");
    return [];
  }
  for (const r of rows) console.log(`  ${r.an_exercicio}: ${fmt(r.n)} registros`);
  return rows.map((r) => r.an_exercicio);
}

async function entesCarregados(): Promise<Set<string>> {
  sep("3. Entes carregados");
  const rows = await pgQuery<{ id_ente: string; no_ente: string | null; n: string }>(`
    SELECT id_ente, MAX(no_ente) AS no_ente, COUNT(*)::text AS n
    FROM dw.fato_siope_rreo_anexo8
    GROUP BY id_ente
    ORDER BY id_ente
  `);
  for (const r of rows) {
    console.log(`  [${r.id_ente.padEnd(7)}] ${(r.no_ente ?? "").padEnd(34)} ${fmt(r.n)} registros`);
  }
  console.log(`  Total de entes distintos: ${rows.length}`);
  return new Set(rows.map((r) => r.id_ente));
}

function cobertura(entesCarregadosSet: Set<string>): { faltantes: { id_ente: string; no_ente: string }[]; cobertosPct: number } {
  sep("4. Cobertura — 22 municípios + Estado AC");
  const faltantes = ENTES_ESPERADOS.filter((e) => !entesCarregadosSet.has(e.id_ente));
  const cobertos  = ENTES_ESPERADOS.length - faltantes.length;
  const pct       = (cobertos / ENTES_ESPERADOS.length) * 100;
  console.log(`  ${cobertos}/${ENTES_ESPERADOS.length} entes esperados carregados (${pct.toFixed(1)}%)`);
  if (faltantes.length) {
    console.log("  Faltantes:");
    for (const f of faltantes) console.log(`    ✗ [${f.id_ente}] ${f.no_ente}`);
  }
  return { faltantes, cobertosPct: pct };
}

async function categoriasEncontradas(): Promise<{ categoria: string; n: number }[]> {
  sep("5. Categorias encontradas");
  const rows = await pgQuery<{ categoria_gabinete: string | null; n: string }>(`
    SELECT categoria_gabinete, COUNT(*)::text AS n
    FROM dw.fato_siope_rreo_anexo8
    GROUP BY categoria_gabinete
    ORDER BY n DESC NULLS LAST
  `);
  for (const r of rows) {
    console.log(`  ${(r.categoria_gabinete ?? "(sem categoria)").padEnd(32)} ${fmt(r.n)} registros`);
  }
  return rows.map((r) => ({ categoria: r.categoria_gabinete ?? "_SEM_CATEGORIA_", n: parseInt(r.n, 10) }));
}

async function topContasFlag(flag: "eh_mde" | "eh_fundeb" | "eh_remuneracao_profissionais", rotulo: string) {
  sep(`6. Top contas — ${rotulo}`);
  const rows = await pgQuery<{ conta_nome: string | null; n: string }>(`
    SELECT conta_nome, COUNT(*)::text AS n
    FROM dw.fato_siope_rreo_anexo8
    WHERE ${flag}
    GROUP BY conta_nome
    ORDER BY n DESC
    LIMIT 8
  `);
  if (!rows.length) {
    console.log("  (nenhuma conta casou esta classificação)");
    return 0;
  }
  for (const r of rows) console.log(`  [${r.n.padStart(5)}x] ${(r.conta_nome ?? "—").slice(0, 100)}`);
  return rows.length;
}

async function amostraRelevante() {
  sep("7. Amostra — 20 registros relevantes");
  const rows = await pgQuery<{
    an_exercicio: number; nr_periodo: number; no_ente: string | null; categoria_gabinete: string | null;
    conta_nome: string | null; coluna: string | null; valor: string | null;
  }>(`
    SELECT an_exercicio, nr_periodo, no_ente, categoria_gabinete, conta_nome, coluna, valor
    FROM dw.fato_siope_rreo_anexo8
    WHERE categoria_gabinete IS NOT NULL
    ORDER BY an_exercicio DESC, nr_periodo DESC, no_ente, categoria_gabinete, id
    LIMIT 20
  `);
  if (!rows.length) {
    console.log("  (sem registros classificados)");
    return;
  }
  for (const r of rows) {
    const valor = r.valor === null ? "—" : Number(r.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
    console.log(`  ${r.an_exercicio}/${r.nr_periodo}  ${(r.no_ente ?? "—").padEnd(26)}  ${(r.categoria_gabinete ?? "—").padEnd(28)}  ${(r.conta_nome ?? "—").slice(0, 50).padEnd(50)}  ${(r.coluna ?? "—").slice(0, 20).padEnd(20)}  ${valor}`);
  }
}

// Regex que define o que conta como "anexo educacional" (mesmo conjunto do incremental).
const REGEX_ANEXO_EDUCACIONAL: RegExp[] = [
  /\banexo\s*0?8\b/i,
  /\banexo\s*VIII\b/i,
  /manuten[çc][ãa]o\s+e\s+desenvolvimento\s+do\s+ensino/i,
  /\bMDE\b/,
  /receitas?\s+e\s+despesas?\s+com\s+manuten[çc][ãa]o/i,
  /\beduca[çc][ãa]o\b/i,
  /\bFUNDEB\b/i,
];

interface PurezaRaw {
  totalAnexos: number;
  anexosEducacionais: { no_anexo: string; n: number }[];
  anexosNaoEducacionais: { no_anexo: string; n: number }[];
}

async function pureza(): Promise<PurezaRaw> {
  sep("7b. Pureza da raw — anexos persistidos");
  const rows = await pgQuery<{ no_anexo: string | null; n: string }>(`
    SELECT no_anexo, COUNT(*)::text AS n
    FROM raw.siope_rreo_anexo8_raw
    GROUP BY no_anexo
    ORDER BY n DESC NULLS LAST
  `);
  const educ: { no_anexo: string; n: number }[] = [];
  const naoEduc: { no_anexo: string; n: number }[] = [];
  for (const r of rows) {
    const nome = r.no_anexo ?? "(sem nome)";
    const item = { no_anexo: nome, n: parseInt(r.n, 10) };
    const eEduc = REGEX_ANEXO_EDUCACIONAL.some((rx) => rx.test(nome));
    (eEduc ? educ : naoEduc).push(item);
  }
  if (!rows.length) {
    console.log("  (raw vazia)");
  } else {
    console.log("  Anexos educacionais (ok):");
    for (const a of educ) console.log(`    ✓ ${a.no_anexo}  (${fmt(a.n)})`);
    if (!educ.length) console.log("    (nenhum)");
    console.log("  Anexos NÃO educacionais (não deveriam estar na raw):");
    for (const a of naoEduc) console.log(`    ✗ ${a.no_anexo}  (${fmt(a.n)})`);
    if (!naoEduc.length) console.log("    (nenhum — raw limpa)");
  }
  return { totalAnexos: rows.length, anexosEducacionais: educ, anexosNaoEducacionais: naoEduc };
}

interface Cobertura {
  totalRaw: number;
  totalDw: number;
  totalMart: number;
  exercicios: number[];
  cobertosPct: number;
  categorias: { categoria: string; n: number }[];
  mdeCount: number;
  fundebCount: number;
  remunCount: number;
  faltantes: number;
  pureza: PurezaRaw;
}

function veredictoFinal(c: Cobertura) {
  sep("8. Veredicto final");
  const temMde       = c.mdeCount > 0;
  const temFundeb    = c.fundebCount > 0;
  const temDw        = c.totalDw > 0;
  const cobertura    = c.cobertosPct;
  const rawSuja      = c.pureza.anexosNaoEducacionais.length > 0;
  const rawSemEduc   = c.totalRaw > 0 && c.pureza.anexosEducacionais.length === 0;

  let status: "OK" | "PARCIAL" | "INSUFICIENTE" = "INSUFICIENTE";
  if (temDw && temMde && temFundeb && cobertura >= 80 && !rawSuja && !rawSemEduc) status = "OK";
  else if (temDw && (temMde || temFundeb) && cobertura >= 30 && !rawSuja && !rawSemEduc) status = "PARCIAL";

  console.log(`  Total DW            : ${fmt(c.totalDw)}`);
  console.log(`  Exercícios          : ${c.exercicios.join(", ") || "(nenhum)"}`);
  console.log(`  Cobertura de entes  : ${c.cobertosPct.toFixed(1)}%  (${c.faltantes} ente(s) faltando)`);
  console.log(`  Contas MDE          : ${c.mdeCount}`);
  console.log(`  Contas FUNDEB       : ${c.fundebCount}`);
  console.log(`  Contas remuneração  : ${c.remunCount}`);
  console.log(`  Anexos na raw       : ${c.pureza.anexosEducacionais.length} educacionais, ${c.pureza.anexosNaoEducacionais.length} NÃO educacionais`);
  if (rawSuja)    console.log("    ⚠ Raw contém anexos não educacionais — incremental anterior gravou lixo (ex.: Anexo 01).");
  if (rawSemEduc) console.log("    ⚠ Raw tem registros, mas nenhum anexo casa com Educação/MDE.");
  console.log();

  if (status === "OK") {
    console.log("  ✓ OK — Camada raw/dw está pronta para alimentar o painel inicial de Educação.");
    console.log("    Próximos passos: criar painel /painel-educacao consumindo");
    console.log("    mart.siope_risco_educacao_basico + drill-down em dw.fato_siope_rreo_anexo8.");
  } else if (status === "PARCIAL") {
    console.log("  ⚠ PARCIAL — Base utilizável mas com lacunas. Antes de liberar o painel:");
    if (c.faltantes > 0)  console.log(`     • Recarregar os ${c.faltantes} entes faltantes (verificar entrega SICONFI).`);
    if (!temMde)          console.log("     • Refinar regex de MDE — nenhuma conta casou eh_mde.");
    if (!temFundeb)       console.log("     • Refinar regex de FUNDEB — nenhuma conta casou eh_fundeb.");
    if (c.remunCount === 0) console.log("     • Remuneração 70% provavelmente requer Anexo 8 detalhado ou SIOPE legado.");
  } else {
    console.log("  ✗ INSUFICIENTE — Não há base mínima para iniciar o painel.");
    if (!temDw)          console.log("     • DW vazio: rodar `npx ts-node jobs/siope-rreo-anexo8-incremental-postgres.ts`.");
    if (c.faltantes > 0) console.log(`     • ${c.faltantes} ente(s) sem dados.`);
    if (!temMde && !temFundeb) console.log("     • Nenhum indicador-chave classificado: revisar regex e Anexo alvo.");
    if (rawSuja)               console.log("     • Limpar raw de anexos não educacionais (TRUNCATE raw.siope_rreo_anexo8_raw e recarregar com o incremental 16C.2).");
    if (rawSemEduc)            console.log("     • Raw sem correspondência educacional — recarregar após confirmar que o ente publicou Anexo 8 no período.");
  }
}

async function main() {
  console.log("════════════════════════════════════════════════════════════════════════");
  console.log("  Fase 16C — Validação da camada SIOPE RREO Anexo 8 (Educação/MDE)");
  console.log("════════════════════════════════════════════════════════════════════════");

  const { totalRaw, totalDw, totalMart } = await totaisGerais();
  const exercicios       = await exerciciosDisponiveis();
  const entesSet         = await entesCarregados();
  const { faltantes, cobertosPct } = cobertura(entesSet);
  const categorias       = await categoriasEncontradas();
  const mdeCount         = await topContasFlag("eh_mde", "MDE");
  const fundebCount      = await topContasFlag("eh_fundeb", "FUNDEB");
  const remunCount       = await topContasFlag("eh_remuneracao_profissionais", "Remuneração dos profissionais");
  await amostraRelevante();
  const purezaRaw = await pureza();
  veredictoFinal({
    totalRaw, totalDw, totalMart, exercicios,
    cobertosPct, categorias, mdeCount, fundebCount, remunCount,
    faltantes: faltantes.length,
    pureza: purezaRaw,
  });
}

main()
  .then(() => closePgPool())
  .catch((err) => {
    console.error("[siope-rreo-anexo8:validar] Erro fatal:", (err as Error).message);
    closePgPool().catch(() => void 0);
    process.exit(1);
  });
