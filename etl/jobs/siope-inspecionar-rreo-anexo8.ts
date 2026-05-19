/**
 * siope-inspecionar-rreo-anexo8.ts
 *
 * Fase 16B — Inspeção real do RREO Anexo 8 (Educação / MDE) via SICONFI.
 *
 * Objetivo: validar se o RREO Anexo 8 do SICONFI é suficiente para iniciar
 * a camada raw/dw de educação do Varadouro (Fase 16C), priorizando AC.
 *
 * NÃO persiste dados, NÃO cria tabelas raw/dw, NÃO altera o frontend.
 * Apenas consulta a API pública e imprime um relatório técnico.
 *
 * O cliente em src/lib/fontes/siconfi/siconfiClient.ts não é importável
 * diretamente pelo ETL (rootDir restrito a etl/), então este job replica
 * o mesmo contrato (endpoint /rreo, parâmetros e formato de resposta),
 * seguindo o padrão dos demais siconfi-*-inspecionar.ts.
 *
 * Variáveis de ambiente:
 *   SICONFI_API_BASE_URL  — base da API (padrão: https://apidatalake.tesouro.gov.br/ords/siconfi/tt)
 *   SICONFI_TIMEOUT_MS    — timeout por requisição (padrão: 30000)
 *   SIOPE_EXERCICIOS      — lista de exercícios a sondar, separados por vírgula (padrão: 2024,2023,2022)
 *
 * Uso: cd etl && npx ts-node jobs/siope-inspecionar-rreo-anexo8.ts
 */

import "dotenv/config";

const BASE_URL   = (process.env.SICONFI_API_BASE_URL || "https://apidatalake.tesouro.gov.br/ords/siconfi/tt").replace(/\/$/, "");
const TIMEOUT_MS = parseInt(process.env.SICONFI_TIMEOUT_MS || "30000", 10);
const EXERCICIOS = (process.env.SIOPE_EXERCICIOS || "2024,2023,2022")
  .split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n));

// Anexo 8 do RREO = Demonstrativo das Receitas e Despesas com MDE
const ANEXO_MDE = "RREO-Anexo 08";

// Último bimestre concentra os totais anuais consolidados de MDE/FUNDEB
const PERIODO_ANUAL = 6;

// Pausa mínima entre requisições (SICONFI: 1 req/s)
const SLEEP_MS = 1100;

// AC = UF id_ente 12; municípios IBGE 7 dígitos começam em 12....
const ENTE_GOV_AC = 12;

interface ItemRreo {
  exercicio?: number;
  demonstrativo?: string;
  periodo?: number;
  periodicidade?: string;
  instituicao?: string;
  cod_ibge?: number;
  uf?: string;
  populacao?: number | null;
  anexo?: string;
  esfera?: string;
  rotulo?: string | null;
  coluna?: string;
  cod_conta?: string;
  conta?: string;
  valor?: number | string | null;
}

interface RespostaRreo {
  items: ItemRreo[];
  hasMore?: boolean;
  count?: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function buildQs(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (!entries.length) return "";
  return "?" + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
}

async function consultarRreo(params: {
  anoExercicio: number;
  periodo: number;
  idEnte: number;
  anexo?: string;
  esfera?: string;
  tipoDemonstrativo?: string;
}): Promise<{ ok: boolean; status: number; resposta: RespostaRreo | null; erro?: string }> {
  const qs = buildQs({
    an_exercicio:          params.anoExercicio,
    nr_periodo:            params.periodo,
    co_tipo_demonstrativo: params.tipoDemonstrativo ?? "RREO",
    id_ente:               params.idEnte,
    no_anexo:              params.anexo,
    co_esfera:             params.esfera,
  });
  const url = `${BASE_URL}/rreo${qs}`;
  try {
    const resp = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Varadouro-Digital-ETL/1.0 (TCE-AC; descoberta SIOPE Fase 16B)",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!resp.ok) return { ok: false, status: resp.status, resposta: null, erro: resp.statusText };
    const json = (await resp.json()) as RespostaRreo;
    return { ok: true, status: resp.status, resposta: json };
  } catch (err) {
    return { ok: false, status: 0, resposta: null, erro: (err as Error).message };
  }
}

// Municípios do Acre — código IBGE 7 dígitos (= id_ente municipal SICONFI)
const MUNICIPIOS_AC: { id: number; nome: string }[] = [
  { id: 1200013, nome: "Acrelândia" },
  { id: 1200054, nome: "Assis Brasil" },
  { id: 1200104, nome: "Brasiléia" },
  { id: 1200138, nome: "Bujari" },
  { id: 1200179, nome: "Capixaba" },
  { id: 1200203, nome: "Cruzeiro do Sul" },
  { id: 1200252, nome: "Epitaciolândia" },
  { id: 1200302, nome: "Feijó" },
  { id: 1200328, nome: "Jordão" },
  { id: 1200336, nome: "Mâncio Lima" },
  { id: 1200344, nome: "Manoel Urbano" },
  { id: 1200351, nome: "Marechal Thaumaturgo" },
  { id: 1200385, nome: "Plácido de Castro" },
  { id: 1200393, nome: "Porto Walter" },
  { id: 1200401, nome: "Rio Branco" },
  { id: 1200427, nome: "Rodrigues Alves" },
  { id: 1200435, nome: "Santa Rosa do Purus" },
  { id: 1200450, nome: "Senador Guiomard" },
  { id: 1200500, nome: "Sena Madureira" },
  { id: 1200609, nome: "Tarauacá" },
  { id: 1200708, nome: "Xapuri" },
  { id: 1200807, nome: "Porto Acre" },
];

// Subconjunto inicial para não estourar quota (1 req/s × 6 chamadas/município × N exercícios)
const MUNICIPIOS_AMOSTRA = [
  MUNICIPIOS_AC.find((m) => m.id === 1200401)!, // Rio Branco — capital
  MUNICIPIOS_AC.find((m) => m.id === 1200203)!, // Cruzeiro do Sul — 2ª maior
  MUNICIPIOS_AC.find((m) => m.id === 1200500)!, // Sena Madureira
];

// Palavras-chave para categorizar contas do Anexo 8 nas dimensões pedidas
const CATEGORIAS: { rotulo: string; padroes: RegExp[] }[] = [
  { rotulo: "MDE — aplicação mínima 25%",
    padroes: [/manutenç[ãa]o.*desenvolvimento.*ensino/i, /\bMDE\b/, /aplicado.*ensino/i, /25\s?%/, /m[íi]nimo.*constitucional/i] },
  { rotulo: "FUNDEB — receita/despesa",
    padroes: [/FUNDEB/i, /complementaç[ãa]o.*uni[ãa]o.*FUNDEB/i] },
  { rotulo: "FUNDEB — remuneração dos profissionais",
    padroes: [/remuneraç[ãa]o.*profissionais/i, /magist[ée]rio/i, /70\s?%.*FUNDEB/i] },
  { rotulo: "Receitas de impostos",
    padroes: [/receita.*imposto/i, /imposto.*pr[óo]prio/i, /\bIPTU\b/, /\bISS\b/, /\bITBI\b/, /\bIRRF\b/, /\bICMS\b/, /\bIPVA\b/, /\bITR\b/, /\bITCMD\b/] },
  { rotulo: "Transferências constitucionais",
    padroes: [/transfer[êe]ncia.*constitucional/i, /\bFPM\b/, /\bFPE\b/, /cota[- ]parte/i, /lei\s*kandir/i, /royalties/i, /\bIPI\b.*export/i] },
  { rotulo: "Despesas com educação (função 12)",
    padroes: [/despesa.*educaç[ãa]o/i, /funç[ãa]o\s*12/i, /ensino\s+(fundamental|m[ée]dio|infantil|superior|profissional)/i] },
  { rotulo: "Restos a pagar",
    padroes: [/restos\s+a\s+pagar/i, /\bRP\b/, /inscritos.*sem.*disponibilidade/i] },
];

interface AmostraConta {
  cod_conta: string;
  conta: string;
  exemplosColuna: Set<string>;
  ocorrencias: number;
}

interface AcumuladorCategoria {
  categoria: string;
  contas: Map<string, AmostraConta>;
}

function classificar(conta: string): string[] {
  const hits: string[] = [];
  for (const c of CATEGORIAS) {
    if (c.padroes.some((p) => p.test(conta))) hits.push(c.rotulo);
  }
  return hits;
}

function imprimirCabecalho() {
  console.log();
  console.log("════════════════════════════════════════════════════════════════════════");
  console.log("  Fase 16B — Inspeção RREO Anexo 8 (Educação/MDE) via SICONFI");
  console.log(`  Base API     : ${BASE_URL}`);
  console.log(`  Anexo alvo   : ${ANEXO_MDE}`);
  console.log(`  Exercícios   : ${EXERCICIOS.join(", ")}`);
  console.log(`  Período      : ${PERIODO_ANUAL} (último bimestre — totais anuais)`);
  console.log(`  Entes alvo   : Governo AC (id_ente=${ENTE_GOV_AC}) + ${MUNICIPIOS_AMOSTRA.length} municípios amostra`);
  console.log(`  Pausa req    : ${SLEEP_MS}ms (limite SICONFI ≈ 1 req/s)`);
  console.log("════════════════════════════════════════════════════════════════════════");
  console.log();
}

async function main() {
  imprimirCabecalho();

  const camposVistos = new Set<string>();
  const colunasUnicas = new Set<string>();
  const contasUnicas = new Map<string, { conta: string; ocorrencias: number }>();
  const entesEncontrados = new Map<number, string>(); // cod_ibge -> instituicao
  const exerciciosComDados = new Set<number>();
  const acumuladorCategorias: Map<string, AmostraConta>[] = CATEGORIAS.map(() => new Map());
  const limitacoes: string[] = [];

  let totalRegistros = 0;
  let totalRequisicoes = 0;
  let totalFalhas = 0;

  const alvosBase: { id: number; nome: string; esfera: "E" | "M" }[] = [
    { id: ENTE_GOV_AC, nome: "Governo do Estado do Acre", esfera: "E" },
    ...MUNICIPIOS_AMOSTRA.map((m) => ({ id: m.id, nome: m.nome, esfera: "M" as const })),
  ];

  for (const exercicio of EXERCICIOS) {
    console.log(`── Exercício ${exercicio} ──`);
    for (const alvo of alvosBase) {
      process.stdout.write(`  ${exercicio}/${PERIODO_ANUAL}  esfera=${alvo.esfera}  id_ente=${alvo.id}  ${alvo.nome}  … `);
      totalRequisicoes++;
      const r = await consultarRreo({
        anoExercicio: exercicio,
        periodo: PERIODO_ANUAL,
        idEnte: alvo.id,
        anexo: ANEXO_MDE,
      });

      if (!r.ok || !r.resposta) {
        console.log(`FALHA (${r.status || r.erro})`);
        totalFalhas++;
        limitacoes.push(`HTTP ${r.status} para ${alvo.nome}/${exercicio} — ${r.erro ?? "sem corpo"}`);
        await sleep(SLEEP_MS);
        continue;
      }

      const items = r.resposta.items || [];
      console.log(`OK — ${items.length} registros${r.resposta.hasMore ? " (hasMore=true)" : ""}`);

      if (items.length === 0) {
        limitacoes.push(`Sem dados para ${alvo.nome}/${exercicio} no anexo ${ANEXO_MDE} — possível atraso de entrega.`);
      } else {
        exerciciosComDados.add(exercicio);
      }

      for (const it of items) {
        totalRegistros++;

        // Coleta de campos (chaves vistas)
        for (const k of Object.keys(it)) camposVistos.add(k);

        if (typeof it.cod_ibge === "number" && it.instituicao) {
          entesEncontrados.set(it.cod_ibge, it.instituicao);
        }
        if (it.coluna) colunasUnicas.add(it.coluna);

        if (it.cod_conta && it.conta) {
          const chave = `${it.cod_conta} | ${it.conta}`;
          const prev = contasUnicas.get(chave);
          contasUnicas.set(chave, { conta: it.conta, ocorrencias: (prev?.ocorrencias ?? 0) + 1 });

          const cats = classificar(it.conta);
          cats.forEach((rotulo) => {
            const idx = CATEGORIAS.findIndex((c) => c.rotulo === rotulo);
            if (idx < 0) return;
            const bucket = acumuladorCategorias[idx];
            const existente = bucket.get(chave);
            if (existente) {
              existente.ocorrencias++;
              if (it.coluna) existente.exemplosColuna.add(it.coluna);
            } else {
              bucket.set(chave, {
                cod_conta: it.cod_conta!,
                conta: it.conta!,
                exemplosColuna: new Set(it.coluna ? [it.coluna] : []),
                ocorrencias: 1,
              });
            }
          });
        }
      }

      await sleep(SLEEP_MS);
    }
    console.log();
  }

  // ─── Amostra de registros bruta (1 da capital, exercício mais recente disponível) ───
  console.log("── Amostra bruta — Rio Branco / exercício mais recente disponível ──");
  for (const exercicio of EXERCICIOS) {
    const r = await consultarRreo({
      anoExercicio: exercicio,
      periodo: PERIODO_ANUAL,
      idEnte: 1200401,
      anexo: ANEXO_MDE,
    });
    if (r.ok && r.resposta && r.resposta.items.length) {
      console.log(`  Exercício ${exercicio} — primeiro registro:`);
      console.log(`    ${JSON.stringify(r.resposta.items[0], null, 2).split("\n").join("\n    ")}`);
      console.log(`  Exercício ${exercicio} — registro intermediário (10):`);
      const meio = r.resposta.items[Math.min(10, r.resposta.items.length - 1)];
      console.log(`    ${JSON.stringify(meio).slice(0, 400)}`);
      break;
    }
    await sleep(SLEEP_MS);
  }
  console.log();

  // ─── Relatório final ───
  console.log("════════════════════════ Síntese técnica ════════════════════════");
  console.log(`  Requisições enviadas : ${totalRequisicoes}`);
  console.log(`  Falhas               : ${totalFalhas}`);
  console.log(`  Total de registros   : ${totalRegistros}`);
  console.log(`  Exercícios com dado  : ${[...exerciciosComDados].sort().join(", ") || "(nenhum)"}`);
  console.log();

  console.log("  Parâmetros exigidos confirmados na chamada /rreo:");
  console.log("    • an_exercicio          (ano: number)");
  console.log("    • nr_periodo            (1–6 bimestral; 6 = último bimestre/anual)");
  console.log("    • co_tipo_demonstrativo (= 'RREO')");
  console.log("    • id_ente               (UF: 12 — Município: IBGE 7 dígitos, ex. 1200401)");
  console.log("    • no_anexo              (= 'RREO-Anexo 08')");
  console.log("    • co_esfera             (opcional — E=Estado, M=Município, D=DF, U=União)");
  console.log();

  console.log("  Campos retornados (chaves observadas no payload):");
  console.log(`    ${[...camposVistos].sort().join(", ") || "(nenhum)"}`);
  console.log();
  console.log("  Mapeamento campos do payload → dimensões/medidas pedidas pelo gabinete:");
  console.log("    exercicio          → dim_tempo.ano");
  console.log("    periodo            → dim_tempo.bimestre");
  console.log("    periodicidade      → dim_tempo.periodicidade (B/Q/S)");
  console.log("    cod_ibge / instituicao → dim_ente (cruza com dim_municipio do DW)");
  console.log("    uf / esfera        → dim_ente.uf / dim_ente.esfera");
  console.log("    populacao          → atributo de dim_ente (snapshot anual)");
  console.log("    anexo              → fato_rreo_educacao.anexo (filtro fixo)");
  console.log("    demonstrativo      → fato_rreo_educacao.demonstrativo (= RREO)");
  console.log("    cod_conta / conta  → dim_conta_rreo_anexo8");
  console.log("    coluna / rotulo    → dim_coluna (Previsão/Realizado, Liquidado/Empenhado, etc.)");
  console.log("    valor              → fato_rreo_educacao.valor (numeric)");
  console.log();

  console.log(`  Colunas distintas (${colunasUnicas.size}):`);
  for (const c of [...colunasUnicas].sort().slice(0, 25)) console.log(`    • ${c}`);
  if (colunasUnicas.size > 25) console.log(`    … +${colunasUnicas.size - 25} colunas`);
  console.log();

  console.log(`  Entes distintos encontrados (${entesEncontrados.size}):`);
  for (const [cod, nome] of entesEncontrados) console.log(`    • ${cod}  ${nome}`);
  console.log();

  console.log(`  Contas distintas (${contasUnicas.size}) — top 15 por ocorrência:`);
  const topContas = [...contasUnicas.entries()]
    .sort((a, b) => b[1].ocorrencias - a[1].ocorrencias)
    .slice(0, 15);
  for (const [chave, info] of topContas) {
    console.log(`    [${info.ocorrencias}x] ${chave.slice(0, 110)}`);
  }
  console.log();

  console.log("  Contas relevantes por categoria do gabinete:");
  for (let i = 0; i < CATEGORIAS.length; i++) {
    const cat = CATEGORIAS[i];
    const bucket = acumuladorCategorias[i];
    console.log(`   ▸ ${cat.rotulo}  (${bucket.size} contas)`);
    if (bucket.size === 0) {
      console.log("       (nenhuma conta casou — revisar regex ou confirmar se a categoria existe no Anexo 8)");
      continue;
    }
    const ordenadas = [...bucket.values()].sort((a, b) => b.ocorrencias - a.ocorrencias).slice(0, 6);
    for (const c of ordenadas) {
      console.log(`       • ${c.cod_conta}  ${c.conta.slice(0, 90)}`);
      if (c.exemplosColuna.size) {
        console.log(`           colunas: ${[...c.exemplosColuna].slice(0, 4).join(" | ")}`);
      }
    }
  }
  console.log();

  if (limitacoes.length) {
    console.log("  Limitações registradas:");
    for (const l of limitacoes.slice(0, 12)) console.log(`    ✗ ${l}`);
    if (limitacoes.length > 12) console.log(`    … +${limitacoes.length - 12} limitações`);
    console.log();
  }

  // ─── Recomendação Fase 16C ───
  console.log("──────────────── Recomendação para a Fase 16C ────────────────");
  const cobriuMde     = acumuladorCategorias[0].size > 0;
  const cobriuFundeb  = acumuladorCategorias[1].size > 0;
  const cobriuRemun   = acumuladorCategorias[2].size > 0;
  const cobriuRec     = acumuladorCategorias[3].size > 0;
  const cobriuTransf  = acumuladorCategorias[4].size > 0;
  const cobriuDespEdu = acumuladorCategorias[5].size > 0;

  const cobertura = [
    ["MDE",                              cobriuMde],
    ["FUNDEB receita/despesa",           cobriuFundeb],
    ["FUNDEB remuneração profissionais", cobriuRemun],
    ["Receitas de impostos",             cobriuRec],
    ["Transferências constitucionais",   cobriuTransf],
    ["Despesas com educação (função 12)", cobriuDespEdu],
  ] as const;

  console.log("  Cobertura das dimensões pedidas:");
  for (const [rot, ok] of cobertura) {
    console.log(`    [${ok ? "✓" : "·"}] ${rot}`);
  }
  console.log();

  const suficienteParaIniciar = cobriuMde && cobriuFundeb && totalRegistros > 0 && exerciciosComDados.size >= 1;
  if (suficienteParaIniciar) {
    console.log("  ✓ RREO Anexo 8 é SUFICIENTE para iniciar a Fase 16C.");
    console.log("    Próximos passos sugeridos:");
    console.log("      1. Criar schema raw.siope_rreo_anexo8 espelhando exatamente o payload.");
    console.log("      2. Job de carga incremental (espelhar siconfi-rreo-incremental-postgres.ts).");
    console.log("      3. Migration de dim_conta_rreo_anexo8 + dim_coluna + fato_rreo_educacao.");
    console.log("      4. Mart consolidado por ente × exercício para alimentar painel de educação.");
    console.log("      5. Reusar dim_municipio existente para cruzar com população (IBGE) e IDEB (futuro).");
    if (!cobriuRemun) {
      console.log("    Atenção: remuneração dos profissionais não casou diretamente —");
      console.log("    talvez o detalhamento esteja em RREO-Anexo 8B ou no SIOPE legado.");
    }
  } else {
    console.log("  ⚠ RREO Anexo 8 ISOLADO NÃO É suficiente. Antes de avançar para a Fase 16C:");
    if (!cobriuMde)    console.log("     • Confirmar variação do nome do anexo (Anexo 08 vs 8 vs RREO-Anexo VIII).");
    if (!cobriuFundeb) console.log("     • Verificar se FUNDEB exige Anexo 8 'distinto' — alguns entes publicam só metade.");
    if (totalRegistros === 0) console.log("     • Nenhum registro veio — checar conectividade ou atraso de entrega na referência.");
    console.log("     • Considerar complementar com SIOPE legado FNDE (scraping) ou aguardar entrega da referência.");
  }
  console.log();
  console.log("══════════════════════════════════════════════════════════════════");
}

main().catch((err) => {
  console.error("[siope:inspecionar-rreo-anexo8] Erro fatal:", (err as Error).message);
  process.exit(1);
});
