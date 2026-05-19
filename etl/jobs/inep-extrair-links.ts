/**
 * inep-extrair-links.ts
 *
 * Fase 17A.1 — Extrai links reais de download (XLSX/ZIP/CSV) a partir das
 * páginas-hub do INEP (IDEB, Taxas de Rendimento, Censo Escolar) e testa
 * cada link com headers de browser para destravar o domínio
 * download.inep.gov.br, que bloqueou todas as tentativas anônimas da Fase 17A.
 *
 * NÃO persiste dados, NÃO mexe em migration/DW/frontend.
 *
 * Variáveis de ambiente:
 *   INEP_TIMEOUT_MS — timeout por requisição (padrão: 25000)
 *
 * Uso: cd etl && npx ts-node jobs/inep-extrair-links.ts
 */

import "dotenv/config";

const TIMEOUT_MS = parseInt(process.env.INEP_TIMEOUT_MS || "25000", 10);

// User-Agent realista de Chrome — INEP costuma exigir UA de navegador.
const UA_BROWSER =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

interface Hub {
  grupo: "IDEB" | "RENDIMENTO" | "CENSO";
  rotulo: string;
  url: string;
}

const HUBS: Hub[] = [
  {
    grupo: "IDEB",
    rotulo: "IDEB — resultados",
    url: "https://www.gov.br/inep/pt-br/areas-de-atuacao/pesquisas-estatisticas-e-indicadores/ideb/resultados",
  },
  {
    grupo: "RENDIMENTO",
    rotulo: "Taxas de Rendimento Escolar",
    url: "https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/indicadores-educacionais/taxas-de-rendimento-escolar",
  },
  {
    grupo: "CENSO",
    rotulo: "Censo Escolar — microdados",
    url: "https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/microdados/censo-escolar",
  },
];

// Padrões considerados "link de dado" e não de navegação.
const REGEX_LINK_DOWNLOAD = /\.(xlsx|xls|csv|zip|7z|json)(?:\?[^"'\s>]*)?/i;
const REGEX_LINK_INEP_DOWNLOAD_DOMAIN = /\/\/download\.inep\.gov\.br\//i;

interface LinkExtraido {
  hub: Hub;
  href: string;
  texto: string;
}

interface TesteLink {
  link: LinkExtraido;
  status: number;
  ok: boolean;
  contentType: string;
  tamanhoMb: number | null;
  erro: string | null;
}

async function baixarHtml(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": UA_BROWSER,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
    });
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  }
}

/**
 * Varre o HTML por tags <a> e extrai href + texto. Sem cheerio — regex
 * tolerante o suficiente para o markup gerado pelo Plone (CMS do gov.br).
 */
function extrairLinks(html: string, hub: Hub): LinkExtraido[] {
  const links: LinkExtraido[] = [];
  // Regex captura: href="..." [...]>texto</a>
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const visto = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const hrefBruto = m[1].trim();
    if (!hrefBruto || hrefBruto.startsWith("#") || hrefBruto.startsWith("mailto:")) continue;

    // Só interessa: link de arquivo (xlsx/zip/etc) OU caminho em download.inep.gov.br
    const ehArquivo = REGEX_LINK_DOWNLOAD.test(hrefBruto);
    const ehDownloadInep = REGEX_LINK_INEP_DOWNLOAD_DOMAIN.test(hrefBruto);
    if (!ehArquivo && !ehDownloadInep) continue;

    let href: string;
    try { href = new URL(hrefBruto, hub.url).toString(); }
    catch { continue; }

    if (visto.has(href)) continue;
    visto.add(href);

    const texto = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 90);
    links.push({ hub, href, texto });
  }
  return links;
}

async function testarLink(link: LinkExtraido): Promise<TesteLink> {
  try {
    const resp = await fetch(link.href, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": UA_BROWSER,
        Accept: "application/octet-stream,application/zip,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*;q=0.5",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        Referer: link.hub.url,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const contentType = resp.headers.get("content-type") || "";
    const cl = resp.headers.get("content-length");
    const tamanhoMb = cl ? parseInt(cl, 10) / 1024 / 1024 : null;

    // Cancela o corpo — só queríamos cabeçalhos.
    try { await resp.body?.cancel(); } catch { /* ignore */ }

    return {
      link, status: resp.status, ok: resp.ok,
      contentType, tamanhoMb, erro: null,
    };
  } catch (err) {
    return {
      link, status: 0, ok: false, contentType: "",
      tamanhoMb: null, erro: (err as Error).message,
    };
  }
}

function formatoSugerido(t: TesteLink): string {
  const ct = t.contentType.toLowerCase();
  const u = t.link.href.toLowerCase();
  if (u.endsWith(".xlsx") || ct.includes("spreadsheetml")) return "XLSX";
  if (u.endsWith(".xls"))                                  return "XLS";
  if (u.endsWith(".csv") || ct.includes("csv"))            return "CSV";
  if (u.endsWith(".zip") || ct.includes("zip"))            return "ZIP";
  if (u.endsWith(".json") || ct.includes("json"))          return "JSON";
  return "—";
}

async function main() {
  console.log("════════════════════════════════════════════════════════════════════════");
  console.log("  Fase 17A.1 — Extrator de links INEP a partir das páginas-hub");
  console.log(`  Hubs alvo: ${HUBS.length}   Timeout: ${TIMEOUT_MS}ms`);
  console.log("════════════════════════════════════════════════════════════════════════\n");

  const todosLinks: LinkExtraido[] = [];
  for (const hub of HUBS) {
    process.stdout.write(`▸ Baixando hub ${hub.grupo} — ${hub.rotulo}… `);
    const html = await baixarHtml(hub.url);
    if (!html) { console.log("FALHA"); continue; }
    const links = extrairLinks(html, hub);
    console.log(`OK — ${links.length} links candidatos`);
    for (const l of links.slice(0, 10)) console.log(`    • ${l.texto.slice(0, 60).padEnd(60)}  →  ${l.href}`);
    if (links.length > 10) console.log(`    … +${links.length - 10} links`);
    todosLinks.push(...links);
  }

  if (!todosLinks.length) {
    console.log("\n✗ Nenhum link de download encontrado nos hubs.");
    console.log("  Diagnóstico provável: os hubs renderizam links via JavaScript (Plone/SPA)");
    console.log("  e o HTML estático não contém os hrefs. Próximo passo: usar Playwright");
    console.log("  (já em devDependencies) para renderizar a página antes de extrair, ou");
    console.log("  baixar manualmente o XLSX da edição atual e ingerir local.");
    return;
  }

  // ─── Testa cada link com headers de browser ───
  console.log(`\n══════ Testando ${todosLinks.length} links com Referer + UA Chrome ══════\n`);
  const testes: TesteLink[] = [];
  for (const link of todosLinks) {
    process.stdout.write(`  ${link.hub.grupo.padEnd(10)} ${link.href.slice(0, 90).padEnd(92)} … `);
    const t = await testarLink(link);
    testes.push(t);
    if (t.ok) {
      const sz = t.tamanhoMb !== null ? ` ${t.tamanhoMb.toFixed(1)}MB` : "";
      console.log(`OK (${t.status}, ${formatoSugerido(t)}${sz})`);
    } else {
      console.log(`FALHA (${t.status || t.erro || "erro"})`);
    }
    // Sem rate-limit forte: INEP não documenta um, mas 300ms é cortês.
    await new Promise((r) => setTimeout(r, 300));
  }

  // ─── Síntese por grupo ───
  console.log("\n════════════════════════════ Síntese ════════════════════════════\n");
  for (const grupo of ["IDEB", "RENDIMENTO", "CENSO"] as const) {
    const doGrupo = testes.filter((t) => t.link.hub.grupo === grupo);
    const okGrupo = doGrupo.filter((t) => t.ok);
    console.log(`▸ ${grupo}: ${okGrupo.length}/${doGrupo.length} links responderam`);
    for (const t of okGrupo.slice(0, 8)) {
      const sz = t.tamanhoMb !== null ? `${t.tamanhoMb.toFixed(1)}MB` : "—";
      console.log(`    [${formatoSugerido(t).padEnd(4)}] ${sz.padStart(7)}  ${t.link.texto.slice(0, 50).padEnd(50)}  ${t.link.href}`);
    }
    if (okGrupo.length > 8) console.log(`    … +${okGrupo.length - 8} links válidos`);
  }

  const totalOk = testes.filter((t) => t.ok).length;
  console.log(`\n  Total geral: ${totalOk}/${testes.length} links disponíveis.`);

  if (totalOk === 0) {
    console.log();
    console.log("  ⚠ Todos os links extraídos falharam mesmo com Referer + UA Chrome.");
    console.log("    Indica bloqueio adicional (rede TCE, WAF do INEP, ou link expirado).");
    console.log("    Próximo passo: testar fora da rede TCE OU baixar manualmente o XLSX");
    console.log("    do IDEB municípios da edição atual e colocar em etl/data/ideb/.");
  } else {
    console.log();
    console.log("  ✓ Há links viáveis. Próximos passos sugeridos para a Fase 17B:");
    console.log("    1. Selecionar o link IDEB 'municípios' edição mais recente entre os OK.");
    console.log("    2. Repetir para Taxas de Rendimento.");
    console.log("    3. Iniciar migration 262_inep_ideb.sql + job ingestão por URL+UA browser.");
    console.log("    4. Manter este extrator como heurística para descobrir o link de cada edição.");
  }
}

main().catch((err) => {
  console.error("[inep:extrair-links] Erro fatal:", (err as Error).message);
  process.exit(1);
});
