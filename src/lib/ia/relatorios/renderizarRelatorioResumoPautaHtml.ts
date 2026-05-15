import { escaparHtml } from "./renderizarAnaliseProcessoHtml";

// Incrementar ao mudar layout ou colunas — invalida cache em ia_relatorio_resumo_pauta.
export const VERSAO_TEMPLATE_RELATORIO_RESUMO_PAUTA = "1.1.0";

export type LinhaRelatorioResumoPauta = {
  processo_id: string | number;
  numero_processo: string;
  sequencia?: number | null;
  analisado: boolean;
  html_linha_sucinta?: string | null;
  motivo_pendente?: string | null;
};

export type RelatorioResumoPautaInput = {
  sessao: {
    id: string | number;
    numero?: string | number | null;
    dt_realizacao?: string | Date | null;
    tipo?: string | null;
    local_sessao?: string | null;
    situacao?: string | null;
  };
  linhas: LinhaRelatorioResumoPauta[];
  pendentes: LinhaRelatorioResumoPauta[];
};

function formatarData(valor: string | Date | null | undefined): string {
  if (!valor) return "—";
  const d = valor instanceof Date ? valor : new Date(valor);
  if (isNaN(d.getTime())) return String(valor);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function renderizarRelatorioResumoPautaHtml(
  input: RelatorioResumoPautaInput,
): string {
  const { sessao, linhas, pendentes } = input;

  const numeroSessao = sessao.numero ? `${sessao.numero}ª Sessão` : `Sessão #${sessao.id}`;

  const cabecalhoTabela = `
    <tr>
      <th>Nº</th>
      <th>Processo</th>
      <th>Entidade</th>
      <th>Objeto</th>
      <th>Respons.</th>
      <th>Advog.(s)</th>
      <th>Relator</th>
      <th>Resumo Técnico</th>
      <th>Resumo MPC</th>
    </tr>`;

  const corpoTabela = linhas.length > 0
    ? linhas.map((l) => l.html_linha_sucinta ?? `<tr><td colspan="9"><em>Linha não gerada — processo ${escaparHtml(l.numero_processo)}</em></td></tr>`).join("\n")
    : `<tr><td colspan="9"><em>Nenhum processo analisado.</em></td></tr>`;

  const secaoPendentes = pendentes.length > 0
    ? `
<div class="pendentes">
  <h3>Processos pendentes de análise IA (${pendentes.length})</h3>
  <table class="tabela-pendentes">
    <thead>
      <tr>
        <th>Seq.</th>
        <th>Processo</th>
        <th>Motivo</th>
      </tr>
    </thead>
    <tbody>
      ${pendentes.map((p) => `
      <tr>
        <td>${escaparHtml(p.sequencia ?? "—")}</td>
        <td>${escaparHtml(p.numero_processo)}</td>
        <td>${escaparHtml(p.motivo_pendente ?? "Sem análise IA registrada")}</td>
      </tr>`).join("")}
    </tbody>
  </table>
</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Resumo da Pauta — ${escaparHtml(numeroSessao)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm 10mm; }
  * { box-sizing: border-box; }
  body {
    font-family: Arial, sans-serif;
    font-size: 8pt;
    color: #111;
    margin: 0;
    padding: 0;
  }
  h1 {
    font-size: 12pt;
    margin: 0 0 4px;
    color: #1a3a5c;
  }
  h2 {
    font-size: 9pt;
    font-weight: normal;
    margin: 0 0 10px;
    color: #4a5568;
  }
  h3 {
    font-size: 9pt;
    margin: 16px 0 6px;
    color: #744210;
    border-bottom: 1px solid #f6e05e;
    padding-bottom: 3px;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 12px;
    font-size: 8pt;
    color: #4a5568;
  }
  .meta-item strong { color: #2d3748; }
  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    page-break-inside: auto;
  }
  thead tr { page-break-inside: avoid; page-break-after: avoid; }
  tr { page-break-inside: avoid; }
  th {
    background-color: #2b4c7e;
    color: #fff;
    font-size: 7pt;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 5px 4px;
    text-align: left;
    border: 1px solid #1a3a5c;
  }
  td {
    border: 1px solid #cbd5e0;
    padding: 4px;
    vertical-align: top;
    font-size: 7.5pt;
    line-height: 1.4;
  }
  tr:nth-child(even) td { background-color: #f7fafc; }
  /* Larguras das 9 colunas: Nº | Proc. | Entidade | Objeto | Respons. | Advog. | Relator | Téc. | MPC */
  table colgroup col:nth-child(1)  { width: 3%; }
  table colgroup col:nth-child(2)  { width: 8%; }
  table colgroup col:nth-child(3)  { width: 10%; }
  table colgroup col:nth-child(4)  { width: 12%; }
  table colgroup col:nth-child(5)  { width: 7%; }
  table colgroup col:nth-child(6)  { width: 7%; }
  table colgroup col:nth-child(7)  { width: 8%; }
  table colgroup col:nth-child(8)  { width: 22.5%; }
  table colgroup col:nth-child(9)  { width: 22.5%; }
  .tabela-pendentes { margin-top: 4px; }
  .tabela-pendentes th { background-color: #744210; border-color: #744210; }
  .tabela-pendentes td { font-size: 7.5pt; }
  .pendentes { margin-top: 16px; }
  .rodape {
    margin-top: 14px;
    padding-top: 6px;
    border-top: 1px solid #e2e8f0;
    font-size: 7pt;
    color: #718096;
    font-style: italic;
  }
  @media print {
    .no-print { display: none; }
    body { margin: 0; }
  }
</style>
</head>
<body>

<h1>Resumo dos Processos da Pauta</h1>
<h2>${escaparHtml(numeroSessao)}</h2>

<div class="meta">
  <span class="meta-item"><strong>Data:</strong> ${escaparHtml(formatarData(sessao.dt_realizacao))}</span>
  ${sessao.tipo ? `<span class="meta-item"><strong>Tipo:</strong> ${escaparHtml(sessao.tipo)}</span>` : ""}
  ${sessao.local_sessao ? `<span class="meta-item"><strong>Local:</strong> ${escaparHtml(sessao.local_sessao)}</span>` : ""}
  ${sessao.situacao ? `<span class="meta-item"><strong>Situação:</strong> ${escaparHtml(sessao.situacao)}</span>` : ""}
  <span class="meta-item"><strong>Total:</strong> ${linhas.length + pendentes.length} processo(s) — ${linhas.length} analisado(s) / ${pendentes.length} pendente(s)</span>
</div>

<table>
  <colgroup>
    <col><col><col><col><col><col><col><col><col>
  </colgroup>
  <thead>${cabecalhoTabela}</thead>
  <tbody>
    ${corpoTabela}
  </tbody>
</table>

${secaoPendentes}

<p class="rodape">
  Relatório para apoio preliminar do gabinete. Revise antes de utilizar em manifestação, voto ou decisão oficial.
  Emitido em: ${escaparHtml(new Date().toLocaleString("pt-BR"))}.
</p>

</body>
</html>`;
}
