// Renderizador HTML local para análise de processo em pauta.
// Todo conteúdo textual é escapado antes de ser inserido no HTML.
// Nenhum trecho HTML vem diretamente da IA — somente texto escapado.

import type { AnaliseProcessoPautaOutput, NivelRisco } from "../tipos";

// Incrementar ao mudar estrutura da linha ou do relatório completo — invalida HTML em cache.
export const VERSAO_FORMATO_HTML_ANALISE_PROCESSO = "1.2.0";

// ---------------------------------------------------------------------------
// Utilitário de escape
// ---------------------------------------------------------------------------

export function escaparHtml(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  return String(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

const RISCO_LABEL: Record<NivelRisco, string> = {
  baixo:   "Baixo",
  medio:   "Médio",
  alto:    "Alto",
  critico: "Crítico",
};

function listaHtml(itens: string[] | undefined): string {
  if (!itens?.length) return "<p><em>Nenhum item registrado.</em></p>";
  return `<ul>${itens.map((i) => `<li>${escaparHtml(i)}</li>`).join("")}</ul>`;
}

function secaoHtml(titulo: string, corpo: string): string {
  return `<div class="secao"><h3>${escaparHtml(titulo)}</h3>${corpo}</div>`;
}

// ---------------------------------------------------------------------------
// Linha da tabela sucinta (para relatório de pauta)
// ---------------------------------------------------------------------------

export interface ContextoLinhaPauta {
  entidade?: string | null;
  responsavel?: string | null;
  advogados?: string | null;
  relator?: string | null;
  objeto_processo?: string | null;  // objeto dos dados estruturados — preferência sobre o campo gerado pela IA
}

function truncar(texto: string | null | undefined, max: number): string {
  if (!texto) return "";
  return texto.length <= max ? texto : texto.slice(0, max - 1) + "…";
}

export function renderizarLinhaRelatorioSucintoHtml(
  analise: AnaliseProcessoPautaOutput,
  numeroOrdem?: number | null,
  contexto?: ContextoLinhaPauta,
): string {
  // objeto: preferir dado estruturado do processo; fallback para campo gerado pela IA.
  const objeto = truncar(
    contexto?.objeto_processo?.trim()
      || analise.objeto?.trim()
      || analise.ponto_central?.trim()
      || "",
    180,
  );

  const resumoTecnico = truncar(
    analise.resumo_tecnico?.trim() || (() => {
      const doc = analise.documentos_analisados?.find((d) => d.tipo === "relatorio_tecnico");
      return doc?.resumo ?? "";
    })(),
    260,
  );

  const resumoMpc = truncar(
    analise.resumo_mpc?.trim() || (() => {
      const doc = analise.documentos_analisados?.find((d) => d.tipo === "parecer_mpc");
      return doc?.resumo ?? "";
    })(),
    260,
  );

  const colunas = [
    numeroOrdem != null ? escaparHtml(numeroOrdem) : "",
    escaparHtml(analise.numero_fmt),
    escaparHtml(truncar(contexto?.entidade, 80)),
    escaparHtml(objeto),
    escaparHtml(truncar(contexto?.responsavel, 120)),
    escaparHtml(truncar(contexto?.advogados, 120)),
    escaparHtml(contexto?.relator ?? ""),
    escaparHtml(resumoTecnico),
    escaparHtml(resumoMpc),
  ];

  return `<tr>${colunas.map((c) => `<td>${c}</td>`).join("")}</tr>`;
}

// ---------------------------------------------------------------------------
// Bloco HTML completo da análise (para impressão individual)
// ---------------------------------------------------------------------------

export function renderizarAnaliseProcessoCompletaHtml(
  analise: AnaliseProcessoPautaOutput,
): string {
  const geradoEm = analise.gerado_em
    ? new Date(analise.gerado_em).toLocaleString("pt-BR")
    : "";

  // Documentos analisados por tipo
  const docPorTipo = (tipo: string): string => {
    const doc = analise.documentos_analisados?.find((d) => d.tipo === tipo);
    return doc ? escaparHtml(doc.resumo) : "<em>Não disponível nos documentos analisados.</em>";
  };

  const blocoDocumentos = analise.documentos_analisados?.length
    ? analise.documentos_analisados.map(
        (d) =>
          `<div class="documento">
            <p class="doc-tipo">${escaparHtml(d.tipo.replace(/_/g, " ").toUpperCase())} &mdash; <span class="doc-nome">${escaparHtml(d.nome)}</span></p>
            <p>${escaparHtml(d.resumo)}</p>
          </div>`,
      ).join("")
    : "<p><em>Nenhum documento analisado.</em></p>";

  const riscoLabel = RISCO_LABEL[analise.risco_percebido] ?? analise.risco_percebido;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Análise do Processo ${escaparHtml(analise.numero_fmt ?? String(analise.processo_id))}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11pt; color: #111; margin: 20mm; }
  h2 { font-size: 13pt; margin-bottom: 4px; color: #1a3a5c; }
  h3 { font-size: 11pt; margin: 12px 0 4px; color: #2c5282; border-bottom: 1px solid #bee3f8; padding-bottom: 2px; }
  p, li { margin: 4px 0; line-height: 1.5; }
  ul { margin: 4px 0 8px 20px; padding: 0; }
  .secao { margin-bottom: 14px; }
  .risco { display: inline-block; padding: 2px 10px; border-radius: 12px; font-weight: bold; font-size: 10pt; }
  .risco-baixo   { background: #c6f6d5; color: #276749; }
  .risco-medio   { background: #fefcbf; color: #744210; }
  .risco-alto    { background: #feebc8; color: #7b341e; }
  .risco-critico { background: #fed7d7; color: #822727; }
  .documento { margin: 6px 0 10px; padding-left: 10px; border-left: 3px solid #bee3f8; }
  .doc-tipo { font-weight: bold; font-size: 9pt; color: #4a5568; margin-bottom: 2px; }
  .doc-nome { font-weight: normal; font-style: italic; }
  .aviso { margin-top: 20px; padding: 8px 12px; background: #fffbeb; border: 1px solid #f6e05e; font-size: 9pt; color: #744210; }
  .rodape { margin-top: 16px; font-size: 8pt; color: #718096; }
  @media print { body { margin: 10mm; } }
</style>
</head>
<body>
<h2>Análise do Processo ${escaparHtml(analise.numero_fmt ?? String(analise.processo_id))}</h2>
<p><span class="risco risco-${escaparHtml(analise.risco_percebido)}">Risco: ${escaparHtml(riscoLabel)}</span></p>

${secaoHtml("Resumo Executivo", `<p>${escaparHtml(analise.resumo_executivo)}</p>`)}
${secaoHtml("Ponto Central", `<p>${escaparHtml(analise.ponto_central)}</p>`)}
${secaoHtml("Motivo do Risco", `<p>${escaparHtml(analise.motivo_do_risco)}</p>`)}

${secaoHtml("Resumo Técnico (Instrução/Relatório)", `<p>${docPorTipo("relatorio_tecnico")}</p>`)}
${secaoHtml("Resumo do Parecer do MPC", `<p>${docPorTipo("parecer_mpc")}</p>`)}
${analise.ha_divergencia ? secaoHtml("Divergência entre Instrução Técnica e MPC", `<p><strong>Tipo:</strong> ${escaparHtml(analise.tipo_divergencia ?? "")} &mdash; ${escaparHtml(analise.motivo_do_risco)}</p>`) : ""}
${(() => {
    const resumoVoto = analise.documentos_analisados?.find(
      (d) => d.tipo === "voto_relator" && !d.resumo.startsWith("Não aplicável nesta fase"),
    );
    return resumoVoto ? secaoHtml("Voto/Relatório do Relator", `<p>${escaparHtml(resumoVoto.resumo)}</p>`) : "";
  })()}

${secaoHtml("Documentos Analisados", blocoDocumentos)}
${secaoHtml("Pontos para Atenção na Sessão", listaHtml(analise.pontos_para_atencao))}
${secaoHtml("Perguntas Sugeridas", listaHtml(analise.perguntas_sugeridas))}
${secaoHtml("Informações Ausentes / Não Disponíveis", listaHtml(analise.informacoes_ausentes))}

<p class="rodape">Emitido em: ${escaparHtml(geradoEm)}</p>
</body>
</html>`;
}
