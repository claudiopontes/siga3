/**
 * siope-descobrir-fontes.ts
 *
 * Fase 16A — Descoberta técnica das fontes públicas do SIOPE/FNDE.
 *
 * Objetivo: sondar endpoints conhecidos do SIOPE/FNDE e do portal dados.gov.br,
 * identificar quais respondem, em que formato e com qual granularidade, e
 * recomendar quais servem para alimentar os painéis de educação do Varadouro
 * (regularidade/entrega, MDE, FUNDEB, remuneração dos profissionais, receitas,
 * despesas e indicadores constitucionais).
 *
 * Este job NÃO cria tabelas raw, NÃO persiste dados e NÃO altera o frontend.
 * Imprime apenas um relatório em terminal.
 *
 * Variáveis de ambiente:
 *   SIOPE_TIMEOUT_MS — timeout por requisição (padrão: 20000)
 *   SIOPE_UF         — UF prioritária (padrão: AC)
 *
 * Uso: cd etl && npx ts-node jobs/siope-descobrir-fontes.ts
 */

import "dotenv/config";

const TIMEOUT_MS = parseInt(process.env.SIOPE_TIMEOUT_MS || "20000", 10);
const UF_ALVO    = (process.env.SIOPE_UF || "AC").toUpperCase();

type Formato = "JSON" | "HTML" | "CSV" | "XLSX" | "ZIP" | "PDF" | "XML" | "DESCONHECIDO";

interface Sonda {
  rotulo: string;
  url: string;
  metodo?: "GET" | "HEAD";
  observacao?: string;
}

interface Resultado extends Sonda {
  ok: boolean;
  status: number;
  contentType: string;
  formato: Formato;
  tamanhoBytes: number | null;
  amostra: string | null;
  erro?: string;
}

function detectarFormato(contentType: string, url: string, amostra: string | null): Formato {
  const ct = contentType.toLowerCase();
  if (ct.includes("application/json") || ct.includes("text/json")) return "JSON";
  if (ct.includes("text/csv") || url.toLowerCase().endsWith(".csv")) return "CSV";
  if (ct.includes("spreadsheetml") || ct.includes("vnd.ms-excel") || /\.xlsx?$/i.test(url)) return "XLSX";
  if (ct.includes("zip") || url.toLowerCase().endsWith(".zip")) return "ZIP";
  if (ct.includes("pdf") || url.toLowerCase().endsWith(".pdf")) return "PDF";
  if (ct.includes("xml")) return "XML";
  if (ct.includes("html")) return "HTML";
  if (amostra) {
    const t = amostra.trimStart();
    if (t.startsWith("{") || t.startsWith("[")) return "JSON";
    if (t.startsWith("<!DOCTYPE") || t.startsWith("<html") || t.startsWith("<HTML")) return "HTML";
    if (t.startsWith("<?xml")) return "XML";
  }
  return "DESCONHECIDO";
}

async function sondar(s: Sonda): Promise<Resultado> {
  const metodo = s.metodo || "GET";
  try {
    const resp = await fetch(s.url, {
      method: metodo,
      redirect: "follow",
      headers: {
        "Accept": "application/json, text/csv, text/html;q=0.8, */*;q=0.5",
        "User-Agent": "Varadouro-Digital-ETL/1.0 (descoberta SIOPE; TCE-AC interno)",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const contentType = resp.headers.get("content-type") || "";
    const contentLength = resp.headers.get("content-length");
    let amostra: string | null = null;

    if (metodo === "GET" && resp.ok) {
      // Lê só os primeiros 4 KB para não baixar arquivos grandes
      const reader = resp.body?.getReader();
      if (reader) {
        const chunks: Uint8Array[] = [];
        let lidos = 0;
        while (lidos < 4096) {
          const { done, value } = await reader.read();
          if (done || !value) break;
          chunks.push(value);
          lidos += value.length;
        }
        try { await reader.cancel(); } catch { /* ignore */ }
        const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
        amostra = buf.toString("utf8").slice(0, 600);
      }
    }

    return {
      ...s,
      ok: resp.ok,
      status: resp.status,
      contentType,
      formato: detectarFormato(contentType, s.url, amostra),
      tamanhoBytes: contentLength ? parseInt(contentLength, 10) : null,
      amostra,
    };
  } catch (err) {
    return {
      ...s,
      ok: false,
      status: 0,
      contentType: "",
      formato: "DESCONHECIDO",
      tamanhoBytes: null,
      amostra: null,
      erro: (err as Error).message,
    };
  }
}

/**
 * Conjunto de candidatos a sondar. Cada entrada representa uma hipótese
 * de fonte pública SIOPE/FNDE ou um caminho equivalente para os mesmos
 * indicadores (RREO Anexo 8 via SICONFI, dados.gov.br, painéis FNDE).
 */
const SONDAS: Sonda[] = [
  // 1) SIOPE legado (FNDE) — páginas e formulários
  {
    rotulo: "SIOPE — Página institucional",
    url: "https://www.fnde.gov.br/siope/o-siope.jsp",
    observacao: "Portal histórico do SIOPE; serve como ponte para os relatórios.",
  },
  {
    rotulo: "SIOPE — Relatórios municipais (form)",
    url: "https://www.fnde.gov.br/siope/dadosInformadosMunicipio.do",
    observacao: "Endpoint do formulário que gera RREO/RGF/Indicadores por município.",
  },
  {
    rotulo: "SIOPE — Indicadores municipais Brasil",
    url: "https://www.fnde.gov.br/siope/indicadoresMunicipaisBrasil.do",
    observacao: "Lista de indicadores agregados nacionais; HTML/tabela.",
  },
  {
    rotulo: "SIOPE — Dados Abertos (FNDE)",
    url: "https://www.fnde.gov.br/index.php/programas/siope/dados-abertos",
    observacao: "Página da FNDE com referência a dados abertos do SIOPE.",
  },

  // 2) gov.br / FNDE — novo portal
  {
    rotulo: "FNDE gov.br — SIOPE relatórios",
    url: "https://www.gov.br/fnde/pt-br/acesso-a-informacao/acoes-e-programas/financiamento-da-educacao/siope/relatorios-do-siope",
    observacao: "Página oficial atual com relatórios e painéis SIOPE.",
  },
  {
    rotulo: "FNDE gov.br — SIOPE página raiz",
    url: "https://www.gov.br/fnde/pt-br/acesso-a-informacao/acoes-e-programas/financiamento-da-educacao/siope",
  },

  // 3) Portal dados.gov.br (CKAN) — busca por SIOPE
  {
    rotulo: "dados.gov.br — package_search q=siope",
    url: "https://dados.gov.br/api/publico/conjuntos-dados?q=siope&pagina=1",
    observacao: "API pública do portal de dados abertos federal (CKAN).",
  },
  {
    rotulo: "dados.gov.br — package_search q=fnde+educacao",
    url: "https://dados.gov.br/api/publico/conjuntos-dados?q=fnde+educacao&pagina=1",
  },

  // 4) SICONFI — RREO Anexo 8 (Educação) é a melhor fonte estável para MDE/FUNDEB
  {
    rotulo: "SICONFI — Anexos RREO disponíveis (educação está em RREO-Anexo 08)",
    url: "https://apidatalake.tesouro.gov.br/ords/siconfi/tt/rreo?an_exercicio=2024&nr_periodo=6&co_tipo_demonstrativo=RREO&id_ente=12&anexo=RREO-Anexo%2008",
    observacao: "Alternativa estável: RREO Anexo 8 da União; permite filtrar por id_ente da UF.",
  },
  {
    rotulo: "SICONFI — RREO Anexo 8 Município (Rio Branco / 6º bim 2024)",
    url: "https://apidatalake.tesouro.gov.br/ords/siconfi/tt/rreo?an_exercicio=2024&nr_periodo=6&co_tipo_demonstrativo=RREO&id_ente=1200401&anexo=RREO-Anexo%2008",
  },

  // 5) INEP — auxiliar (Censo Escolar / IDEB) para correlação com despesa educacional
  {
    rotulo: "INEP — Dados Abertos (raiz)",
    url: "https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos",
    observacao: "INEP fornece Censo Escolar e IDEB — úteis para cruzar com SIOPE.",
  },
];

function recomendar(r: Resultado): string {
  if (!r.ok) return "Indisponível no momento — registrar como limitação.";
  if (r.url.includes("apidatalake.tesouro.gov.br")) {
    return "ALTO — usar como fonte primária estável (JSON, filtro por id_ente, exercício e período). Já há cliente SICONFI no projeto.";
  }
  if (r.url.includes("dados.gov.br/api")) {
    return "MÉDIO — usar para enumerar datasets SIOPE/FNDE oficiais e seguir até a URL do recurso (CSV/XLSX/ZIP).";
  }
  if (r.url.includes("fnde.gov.br/siope")) {
    return r.formato === "HTML"
      ? "BAIXO/MÉDIO — exige scraping; viável só como complemento ao SICONFI."
      : "AVALIAR — possível endpoint estruturado dentro do SIOPE legado.";
  }
  if (r.url.includes("gov.br/fnde")) {
    return "MÉDIO — página institucional; servirá de hub para localizar painéis/Power BI e CSVs publicados.";
  }
  if (r.url.includes("gov.br/inep")) {
    return "AUXILIAR — não substitui SIOPE, mas enriquece análise de efetividade (IDEB, matrículas).";
  }
  return "Avaliar caso a caso.";
}

function granularidade(r: Resultado): string {
  if (r.url.includes("apidatalake.tesouro.gov.br")) return "Ente (UF/Município) × exercício × período (bimestre RREO)";
  if (r.url.includes("dados.gov.br")) return "Datasets nacionais; depende do recurso";
  if (r.url.includes("fnde.gov.br/siope/dadosInformadosMunicipio")) return "Município × exercício × período (semestre/anual)";
  if (r.url.includes("fnde.gov.br/siope/indicadoresMunicipaisBrasil")) return "Nacional/UF agregado";
  if (r.url.includes("gov.br/inep")) return "Escola / Município / UF (depende do dataset)";
  return "—";
}

function camposPrincipais(r: Resultado): string {
  if (r.url.includes("apidatalake.tesouro.gov.br") && r.url.includes("Anexo%2008")) {
    return "ente, exercicio, periodo, conta (Receita Resultante de Impostos, MDE, FUNDEB, Remuneração 70%), valor, coluna";
  }
  if (r.url.includes("dados.gov.br")) return "id_dataset, nome, organizacao, recursos[].url, recursos[].formato";
  if (r.url.includes("fnde.gov.br/siope")) return "cnpj_ente, exercicio, periodo, indicadores (MDE %, FUNDEB %, Remuneração 60/70%)";
  if (r.url.includes("gov.br/inep")) return "co_municipio, ideb, matriculas, etapa";
  return "—";
}

function exerciciosProvaveis(r: Resultado): string {
  if (r.url.includes("apidatalake.tesouro.gov.br")) return "2013 → atual";
  if (r.url.includes("fnde.gov.br/siope")) return "2006 → atual (varia por município)";
  if (r.url.includes("gov.br/inep")) return "2005 → atual (IDEB bienal)";
  return "—";
}

function imprimirRelatorio(rs: Resultado[]) {
  console.log();
  console.log("════════════════════════════════════════════════════════════════════════");
  console.log("  Fase 16A — Descoberta de fontes SIOPE/FNDE — Varadouro Digital Aquiry");
  console.log(`  UF prioritária: ${UF_ALVO}   Timeout: ${TIMEOUT_MS}ms`);
  console.log("════════════════════════════════════════════════════════════════════════");
  console.log();

  for (const r of rs) {
    console.log(`▸ ${r.rotulo}`);
    console.log(`  URL          : ${r.url}`);
    console.log(`  HTTP         : ${r.status} ${r.ok ? "OK" : "FALHA"}${r.erro ? ` — ${r.erro}` : ""}`);
    console.log(`  Content-Type : ${r.contentType || "—"}`);
    console.log(`  Formato      : ${r.formato}`);
    console.log(`  Granularidade: ${granularidade(r)}`);
    console.log(`  Campos       : ${camposPrincipais(r)}`);
    console.log(`  Exercícios   : ${exerciciosProvaveis(r)}`);
    if (r.observacao) console.log(`  Observação   : ${r.observacao}`);
    console.log(`  Recomendação : ${recomendar(r)}`);
    if (r.amostra && (r.formato === "JSON" || r.formato === "XML")) {
      console.log(`  Amostra      : ${r.amostra.replace(/\s+/g, " ").slice(0, 200)}…`);
    }
    console.log();
  }

  const ok = rs.filter((r) => r.ok);
  const falhas = rs.filter((r) => !r.ok);

  console.log("──────────────────────────── Síntese ────────────────────────────");
  console.log(`  Sondas respondendo: ${ok.length}/${rs.length}`);
  if (falhas.length) {
    console.log("  Indisponíveis no momento (registrar como limitação):");
    for (const f of falhas) console.log(`   • ${f.rotulo} — ${f.status || "timeout/erro"}`);
  }
  console.log();
  console.log("  Mapeamento por necessidade do gabinete:");
  console.log("   • Situação de entrega / regularidade  → SICONFI extrato (já no ETL) + SIOPE legado (complemento)");
  console.log("   • Indicadores constitucionais (25% MDE) → SICONFI RREO Anexo 8 (fonte primária) + SIOPE (validação)");
  console.log("   • FUNDEB (total e 70% remuneração)     → SICONFI RREO Anexo 8 + SIOPE indicadores");
  console.log("   • Remuneração dos profissionais        → SIOPE indicadores municipais (HTML/scrape) — sem API pública direta");
  console.log("   • Receitas e despesas educacionais     → SICONFI RREO Anexo 8 (preferencial) ou dados.gov.br/FNDE");
  console.log("   • Consolidado por município            → cruzamento SICONFI × dim_municipio do DW");
  console.log("   • Efetividade do gasto                 → INEP (IDEB/Censo) como camada auxiliar");
  console.log();
  console.log("  Próximos passos sugeridos (Fase 16B):");
  console.log("   1. Aproveitar cliente SICONFI existente para puxar RREO Anexo 8 (id_ente UF 12 + 22 municípios AC).");
  console.log("   2. Criar schema raw.siope_* apenas se a API CKAN dados.gov.br expuser CSV/XLSX SIOPE estruturado.");
  console.log("   3. Para indicadores legados do SIOPE, decidir entre scraping HTML (Playwright já está em devDeps) ou abandonar em favor do RREO Anexo 8.");
  console.log("   4. Avaliar INEP como dimensão de efetividade — fora do escopo SIOPE puro.");
  console.log();
}

async function main() {
  console.log(`[siope:descobrir] Iniciando sondagem de ${SONDAS.length} fontes…`);
  const resultados: Resultado[] = [];
  for (const s of SONDAS) {
    process.stdout.write(`  • ${s.rotulo} … `);
    const r = await sondar(s);
    console.log(r.ok ? `OK (${r.status})` : `FALHA (${r.status || r.erro || "erro"})`);
    resultados.push(r);
  }
  imprimirRelatorio(resultados);
}

main().catch((err) => {
  console.error("[siope:descobrir] Erro fatal:", (err as Error).message);
  process.exit(1);
});
