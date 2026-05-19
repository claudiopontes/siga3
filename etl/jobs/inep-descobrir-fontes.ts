/**
 * inep-descobrir-fontes.ts
 *
 * Fase 17A — Descoberta técnica das fontes públicas do INEP para integrar
 * IDEB, Taxas de Rendimento e Censo Escolar ao Varadouro Digital Aquiry.
 *
 * Substitui no painel /gabinete-digital/mapa o IDEB hardcoded
 * (src/components/Maps/MapaAcreContent.tsx) e a série ilustrativa
 * em src/components/home/GraficoIdeb.tsx.
 *
 * NÃO persiste dados, NÃO cria tabelas, NÃO altera o frontend.
 * Imprime apenas relatório no terminal — formato_status / formato / granularidade
 * / cobertura AC / recomendação por fonte.
 *
 * Variáveis de ambiente:
 *   INEP_TIMEOUT_MS — timeout por requisição (padrão: 20000)
 *
 * Uso: cd etl && npx ts-node jobs/inep-descobrir-fontes.ts
 */

import "dotenv/config";

const TIMEOUT_MS = parseInt(process.env.INEP_TIMEOUT_MS || "20000", 10);

type Formato = "JSON" | "HTML" | "CSV" | "XLSX" | "ZIP" | "PDF" | "XML" | "DESCONHECIDO";

interface Sonda {
  rotulo: string;
  url: string;
  observacao?: string;
  grupo: "IDEB" | "RENDIMENTO" | "CENSO" | "CATALOGO" | "AUXILIAR";
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
  if (ct.includes("text/csv") || /\.csv($|\?)/i.test(url)) return "CSV";
  if (ct.includes("spreadsheetml") || ct.includes("vnd.ms-excel") || /\.xlsx?($|\?)/i.test(url)) return "XLSX";
  if (ct.includes("zip") || /\.zip($|\?)/i.test(url)) return "ZIP";
  if (ct.includes("pdf") || /\.pdf($|\?)/i.test(url)) return "PDF";
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
  try {
    const resp = await fetch(s.url, {
      method: "GET",
      redirect: "follow",
      headers: {
        Accept: "application/json, text/csv, application/zip, text/html;q=0.8, */*;q=0.5",
        "User-Agent": "Varadouro-Digital-ETL/1.0 (descoberta INEP; TCE-AC interno)",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const contentType = resp.headers.get("content-type") || "";
    const contentLength = resp.headers.get("content-length");
    let amostra: string | null = null;

    if (resp.ok) {
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
      ...s, ok: false, status: 0, contentType: "", formato: "DESCONHECIDO",
      tamanhoBytes: null, amostra: null, erro: (err as Error).message,
    };
  }
}

/**
 * Candidatos prioritários. O INEP publica os indicadores em:
 *   - "Indicadores Educacionais" (IDEB + Taxas de Rendimento), em planilhas
 *     XLSX/ZIP por edição;
 *   - "Microdados" (Censo Escolar), em ZIP anual de grande porte;
 *   - O domínio download.inep.gov.br historicamente serve os arquivos brutos.
 * Páginas de catálogo no portal gov.br servem como hub para encontrar os
 * recursos mais novos quando os links diretos mudam de edição.
 */
const SONDAS: Sonda[] = [
  // ─── IDEB ──────────────────────────────────────────────────────────────
  { grupo: "IDEB",
    rotulo: "IDEB — Página oficial INEP (resultados)",
    url: "https://www.gov.br/inep/pt-br/areas-de-atuacao/pesquisas-estatisticas-e-indicadores/ideb/resultados",
    observacao: "Hub institucional do IDEB; lista as edições e links de download." },
  { grupo: "IDEB",
    rotulo: "IDEB — Dados abertos (indicadores educacionais)",
    url: "https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/indicadores-educacionais/indice-de-desenvolvimento-da-educacao-basica-ideb",
    observacao: "Página oficial com download das planilhas por edição." },
  { grupo: "IDEB",
    rotulo: "IDEB 2023 — Planilha municípios (download direto, candidato)",
    url: "https://download.inep.gov.br/educacao_basica/portal_ideb/planilhas_para_download/2023/divulgacao_ideb_2023_municipios.xlsx",
    observacao: "URL histórica do INEP; pode mudar a cada edição. Validar antes de fixar." },
  { grupo: "IDEB",
    rotulo: "IDEB 2021 — Planilha municípios (download direto)",
    url: "https://download.inep.gov.br/educacao_basica/portal_ideb/planilhas_para_download/2021/divulgacao_ideb_2021_municipios.xlsx",
    observacao: "Edição 2021 — última antes da 2023; baseline histórico." },
  { grupo: "IDEB",
    rotulo: "IDEB 2019 — Planilha municípios (download direto)",
    url: "https://download.inep.gov.br/educacao_basica/portal_ideb/planilhas_para_download/2019/divulgacao_ideb_2019_municipios.xlsx" },

  // ─── Taxas de Rendimento (Aprovação / Reprovação / Abandono) ──────────
  { grupo: "RENDIMENTO",
    rotulo: "Taxas de Rendimento — Página oficial",
    url: "https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/indicadores-educacionais/taxas-de-rendimento-escolar",
    observacao: "Anuais; cobrem aprovação/reprovação/abandono por etapa." },
  { grupo: "RENDIMENTO",
    rotulo: "Taxas de Rendimento 2023 — ZIP (download direto, candidato)",
    url: "https://download.inep.gov.br/informacoes_estatisticas/indicadores_educacionais/2023/tx_rend_municipios_2023.zip",
    observacao: "Padrão histórico do nome; validar a edição mais recente disponível." },
  { grupo: "RENDIMENTO",
    rotulo: "Taxas de Rendimento 2022 — ZIP (download direto)",
    url: "https://download.inep.gov.br/informacoes_estatisticas/indicadores_educacionais/2022/tx_rend_municipios_2022.zip" },

  // ─── Censo Escolar ────────────────────────────────────────────────────
  { grupo: "CENSO",
    rotulo: "Censo Escolar — Página oficial",
    url: "https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/microdados/censo-escolar",
    observacao: "Microdados anuais (matrículas/escolas/turmas/docentes). Arquivos grandes (centenas de MB)." },
  { grupo: "CENSO",
    rotulo: "Censo Escolar 2023 — Microdados ZIP (candidato)",
    url: "https://download.inep.gov.br/microdados/microdados_censo_escolar_2023.zip",
    observacao: "Padrão histórico; arquivo de ~300-700MB. Verificar antes de baixar em produção." },
  { grupo: "CENSO",
    rotulo: "Censo Escolar 2022 — Sinopse estatística (XLSX agregado, candidato)",
    url: "https://download.inep.gov.br/informacoes_estatisticas/sinopses_estatisticas/sinopses_educacao_basica/2022/sinopse_estatistica_censo_escolar_2022.zip",
    observacao: "Sinopse já agregada — mais leve que microdados, útil quando só precisamos de totais." },

  // ─── Catálogo / busca alternativa ─────────────────────────────────────
  { grupo: "CATALOGO",
    rotulo: "dados.gov.br — busca q=IDEB",
    url: "https://dados.gov.br/api/publico/conjuntos-dados?q=ideb&pagina=1",
    observacao: "Catálogo federal CKAN; útil quando o link direto INEP mudar." },
  { grupo: "CATALOGO",
    rotulo: "dados.gov.br — busca q=censo+escolar",
    url: "https://dados.gov.br/api/publico/conjuntos-dados?q=censo+escolar&pagina=1" },

  // ─── Auxiliares para cruzamento ───────────────────────────────────────
  { grupo: "AUXILIAR",
    rotulo: "INEP — Dados abertos (raiz)",
    url: "https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos",
    observacao: "Página guarda-chuva de todos os datasets INEP." },
];

function granularidade(r: Resultado): string {
  switch (r.grupo) {
    case "IDEB":       return "Município × edição (bienal) × etapa (Anos Iniciais / Finais / Ensino Médio)";
    case "RENDIMENTO": return "Município × ano × etapa × situação (aprovação/reprovação/abandono)";
    case "CENSO":      return "Escola / Turma / Matrícula / Docente (microdado anual)";
    case "CATALOGO":   return "Datasets nacionais — depende do recurso";
    case "AUXILIAR":   return "—";
  }
}

function camposPrincipais(r: Resultado): string {
  switch (r.grupo) {
    case "IDEB":
      return "cod_municipio, no_municipio, uf, rede (Estadual/Municipal/Pública), ideb_<ano>_AI, ideb_<ano>_AF, ideb_<ano>_EM, meta_<ano>";
    case "RENDIMENTO":
      return "cod_municipio, dependencia (Estadual/Municipal/Pública), etapa, ano, tx_aprov, tx_reprov, tx_abandono";
    case "CENSO":
      return "CO_ENTIDADE, NO_ENTIDADE, CO_MUNICIPIO, NU_MATRICULAS, TP_ETAPA_ENSINO, TP_DEPENDENCIA, … (centenas de colunas)";
    default: return "—";
  }
}

function periodicidade(r: Resultado): string {
  switch (r.grupo) {
    case "IDEB":       return "Bienal (2005, 2007, 2009, 2011, 2013, 2015, 2017, 2019, 2021, 2023)";
    case "RENDIMENTO": return "Anual";
    case "CENSO":      return "Anual";
    default:           return "—";
  }
}

function recomendar(r: Resultado): string {
  if (!r.ok) return "Indisponível agora — registrar como limitação e revisitar link na Fase 17B.";
  switch (r.grupo) {
    case "IDEB":
      return r.formato === "XLSX"
        ? "ALTO — fonte primária para o mapa /gabinete-digital/mapa. Carga incremental por edição."
        : "MÉDIO — página HTML; usar como hub para encontrar a URL XLSX da edição atual.";
    case "RENDIMENTO":
      return r.formato === "ZIP" || r.formato === "CSV"
        ? "ALTO — anual, fecha o gap entre edições bienais do IDEB. Ingestão semelhante ao IDEB."
        : "MÉDIO — página HTML; obter URL real do ZIP por edição.";
    case "CENSO":
      return r.formato === "ZIP"
        ? "MÉDIO — pesado (~centenas de MB). Adiar para Fase 17D; priorizar SINOPSE agregada antes."
        : "AUXILIAR — usar SINOPSE para totais; microdados só se houver demanda do gabinete por gasto/aluno.";
    case "CATALOGO":
      return "MÉDIO — fallback quando o link direto INEP mudar de edição.";
    case "AUXILIAR":
      return "INFO — manter como referência.";
  }
}

function imprimirRelatorio(rs: Resultado[]) {
  console.log();
  console.log("════════════════════════════════════════════════════════════════════════");
  console.log("  Fase 17A — Descoberta de fontes INEP (IDEB / Rendimento / Censo)");
  console.log(`  Timeout: ${TIMEOUT_MS}ms`);
  console.log("════════════════════════════════════════════════════════════════════════");

  const grupos: Array<Resultado["grupo"]> = ["IDEB", "RENDIMENTO", "CENSO", "CATALOGO", "AUXILIAR"];
  for (const g of grupos) {
    const itens = rs.filter((r) => r.grupo === g);
    if (!itens.length) continue;
    console.log(`\n── Grupo ${g} ──`);
    for (const r of itens) {
      console.log(`▸ ${r.rotulo}`);
      console.log(`  URL          : ${r.url}`);
      console.log(`  HTTP         : ${r.status} ${r.ok ? "OK" : "FALHA"}${r.erro ? ` — ${r.erro}` : ""}`);
      console.log(`  Content-Type : ${r.contentType || "—"}`);
      console.log(`  Formato      : ${r.formato}`);
      if (r.tamanhoBytes !== null) console.log(`  Tamanho      : ${(r.tamanhoBytes / 1024 / 1024).toFixed(1)} MB`);
      console.log(`  Granularidade: ${granularidade(r)}`);
      console.log(`  Periodicidade: ${periodicidade(r)}`);
      console.log(`  Campos       : ${camposPrincipais(r)}`);
      if (r.observacao) console.log(`  Observação   : ${r.observacao}`);
      console.log(`  Recomendação : ${recomendar(r)}`);
      console.log();
    }
  }

  const ok = rs.filter((r) => r.ok);
  const falhas = rs.filter((r) => !r.ok);

  console.log("──────────────────────────── Síntese ────────────────────────────");
  console.log(`  Sondas respondendo: ${ok.length}/${rs.length}`);
  if (falhas.length) {
    console.log("  Indisponíveis no momento:");
    for (const f of falhas) console.log(`   • ${f.rotulo} — HTTP ${f.status || f.erro || "timeout"}`);
  }
  console.log();
  console.log("  Mapeamento por necessidade do gabinete (TCE-AC):");
  console.log("   • Substituir IDEB mock em MapaAcreContent.tsx (22 municípios) → planilha XLSX IDEB municípios");
  console.log("   • Substituir GraficoIdeb.tsx da home (8 valores ilustrativos)  → mesma fonte, filtro UF=12");
  console.log("   • Fechar gap entre edições bienais                              → Taxas de Rendimento anuais");
  console.log("   • Métrica gasto/aluno (futuro)                                  → Censo Escolar (microdado OU sinopse)");
  console.log();
  console.log("  Próximos passos sugeridos (Fase 17B):");
  console.log("   1. Migration 262_inep_ideb.sql: raw.inep_ideb_raw + dw.fato_ideb_municipal + mart.painel_educacao_municipio.");
  console.log("   2. Job ingestão IDEB: baixar XLSX por edição, filtrar UF=AC (cod_uf=12), persistir por município/edição/etapa.");
  console.log("   3. Job ingestão Taxas de Rendimento: ZIP anual, filtrar AC.");
  console.log("   4. Endpoint /api/educacao/mapa-acre alimentando o painel atual sem IDEB hardcoded.");
  console.log("   5. Censo Escolar: avaliar SINOPSE agregada antes de microdado pesado.");
  console.log();
}

async function main() {
  console.log(`[inep:descobrir] Iniciando sondagem de ${SONDAS.length} fontes…`);
  const resultados: Resultado[] = [];
  for (const s of SONDAS) {
    process.stdout.write(`  • ${s.rotulo} … `);
    const r = await sondar(s);
    console.log(r.ok ? `OK (${r.status}, ${r.formato})` : `FALHA (${r.status || r.erro || "erro"})`);
    resultados.push(r);
  }
  imprimirRelatorio(resultados);
}

main().catch((err) => {
  console.error("[inep:descobrir] Erro fatal:", (err as Error).message);
  process.exit(1);
});
