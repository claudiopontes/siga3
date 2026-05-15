"use client";

import { useState } from "react";
import { X, ExternalLink, AlertTriangle, CheckCircle, Clock, Database, Trash2, Info } from "lucide-react";
import type { RelatorioResumoPautaResult } from "@/lib/ia/relatorios/montarRelatorioResumoPauta";

// TODO: criar ação administrativa protegida para descartar ou reprocessar análises individuais
//       de toda a pauta, com confirmação forte e controle de custo de IA.

interface Props {
  aberto: boolean;
  onFechar: () => void;
  sessaoLabel: string;
  relatorio: RelatorioResumoPautaResult | null;
  onDescartado?: () => void;
}

function BadgeCount({ valor, cor }: { valor: number; cor: "blue" | "green" | "amber" }) {
  const classes = {
    blue:  "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-900/30 dark:text-blue-300",
    green: "bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-900/30 dark:text-green-300",
    amber: "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-900/30 dark:text-amber-300",
  }[cor];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-sm font-semibold ring-1 ring-inset ${classes}`}>
      {valor}
    </span>
  );
}

export default function ModalRelatorioResumoPauta({ aberto, onFechar, sessaoLabel, relatorio, onDescartado }: Props) {
  const [descartando, setDescartando] = useState(false);
  const [erroDescarte, setErroDescarte] = useState<string | null>(null);
  const [descartadoComSucesso, setDescartadoComSucesso] = useState(false);

  if (!aberto) return null;

  function abrirJanelaHtml(html: string) {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
  }

  function abrirRelatorio() {
    if (!relatorio?.html_relatorio) return;
    abrirJanelaHtml(relatorio.html_relatorio);
  }

  async function descartar() {
    if (!relatorio?.relatorio_id) return;

    const motivo = window.prompt(
      "Isso descartará apenas a versão consolidada deste relatório da pauta.\n" +
      "As análises individuais dos processos serão mantidas.\n\n" +
      "Ao abrir o relatório novamente, ele poderá ser remontado com os mesmos dados se nada tiver mudado.\n\n" +
      "Informe o motivo do descarte (opcional):",
    );
    if (motivo === null) return; // cancelou

    setDescartando(true);
    setErroDescarte(null);
    try {
      const res = await fetch("/api/ia/relatorio-resumo-pauta/descartar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relatorioId: relatorio.relatorio_id, motivo }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErroDescarte(json?.error ?? "Erro ao descartar.");
        return;
      }
      setDescartadoComSucesso(true);
      onDescartado?.();
    } catch {
      setErroDescarte("Falha na comunicação com o servidor.");
    } finally {
      setDescartando(false);
    }
  }

  // Tela de confirmação pós-descarte — exibida no lugar do conteúdo normal
  if (descartadoComSucesso) {
    return (
      <>
        <div className="fixed inset-0 z-40 bg-black/40" onClick={onFechar} aria-hidden="true" />
        <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-2xl dark:bg-gray-900">
          <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
            <p className="text-sm font-bold text-gray-900 dark:text-white">Relatório da Pauta</p>
            <button type="button" onClick={onFechar} className="rounded p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
            <CheckCircle className="h-10 w-10 text-green-500" />
            <p className="text-sm font-semibold text-gray-800 dark:text-white">Versão do relatório descartada.</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              As análises individuais dos processos foram mantidas. Ao abrir o relatório novamente, ele será remontado a partir dessas análises.
            </p>
          </div>
          <div className="flex shrink-0 justify-end border-t border-gray-200 px-5 py-3 dark:border-gray-700">
            <button
              type="button"
              onClick={onFechar}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <X className="h-3.5 w-3.5" />
              Fechar
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/40 transition-opacity"
        onClick={onFechar}
        aria-hidden="true"
      />

      {/* Drawer lateral */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-2xl dark:bg-gray-900">

        {/* Cabeçalho */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-gray-900 dark:text-white">Relatório da Pauta</p>
              {relatorio?.origem_cache && (
                <span
                  title="Relatório recuperado do banco de dados"
                  className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600 ring-1 ring-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:ring-blue-800"
                >
                  <Database className="h-2.5 w-2.5" />
                  cache
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500">{sessaoLabel}</p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="rounded p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Conteúdo scrollável */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {!relatorio ? (
            <p className="py-10 text-center text-sm text-gray-400">Nenhum dado disponível.</p>
          ) : (
            <>
              {/* Totais */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-center dark:border-gray-700 dark:bg-gray-800">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Total</p>
                  <div className="mt-1.5 flex justify-center">
                    <BadgeCount valor={relatorio.total_processos} cor="blue" />
                  </div>
                  <p className="mt-1 text-[10px] text-gray-400">processo(s)</p>
                </div>
                <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-center dark:border-green-900/40 dark:bg-green-950/20">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-green-500 dark:text-green-400">Analisados</p>
                  <div className="mt-1.5 flex justify-center">
                    <BadgeCount valor={relatorio.total_analisados} cor="green" />
                  </div>
                  <p className="mt-1 text-[10px] text-green-400">com análise IA</p>
                </div>
                <div className={`rounded-xl border p-3 text-center ${
                  relatorio.total_pendentes > 0
                    ? "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20"
                    : "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800"
                }`}>
                  <p className={`text-[10px] font-semibold uppercase tracking-wide ${
                    relatorio.total_pendentes > 0 ? "text-amber-500 dark:text-amber-400" : "text-gray-400 dark:text-gray-500"
                  }`}>Pendentes</p>
                  <div className="mt-1.5 flex justify-center">
                    <BadgeCount valor={relatorio.total_pendentes} cor={relatorio.total_pendentes > 0 ? "amber" : "blue"} />
                  </div>
                  <p className={`mt-1 text-[10px] ${relatorio.total_pendentes > 0 ? "text-amber-400" : "text-gray-400"}`}>sem análise</p>
                </div>
              </div>

              {/* Alerta de pendentes — explica o que fazer e o que NÃO faz o descarte */}
              {relatorio.total_pendentes > 0 && (
                <div className="space-y-2">
                  <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/20">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <p className="text-xs text-amber-800 dark:text-amber-200">
                      Este relatório contém <strong>{relatorio.total_analisados}</strong> processo(s) analisado(s).{" "}
                      <strong>{relatorio.total_pendentes}</strong> processo(s) ainda {relatorio.total_pendentes === 1 ? "está pendente" : "estão pendentes"} e não {relatorio.total_pendentes === 1 ? "aparece" : "aparecem"} na tabela principal.
                      {" "}Use o botão <strong>Gerar análises pendentes</strong> na tela da pauta para completar o relatório antes de imprimir.
                    </p>
                  </div>
                  <div className="flex gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-2.5 dark:border-blue-900/30 dark:bg-blue-950/20">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-400" />
                    <p className="text-[11px] text-blue-700 dark:text-blue-300">
                      Descartar a versão do relatório não gera nem refaz análises individuais.
                    </p>
                  </div>
                </div>
              )}

              {/* Erro descarte */}
              {erroDescarte && (
                <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                  {erroDescarte}
                  <button type="button" onClick={() => setErroDescarte(null)} className="ml-auto font-bold">×</button>
                </div>
              )}

              {/* Processos analisados */}
              {relatorio.total_analisados > 0 && (
                <section>
                  <h3 className="mb-2.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                    Processos no relatório ({relatorio.total_analisados})
                  </h3>
                  <div className="space-y-1">
                    {relatorio.linhas.map((l, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-700/50 dark:bg-gray-800/40">
                        <div className="flex items-center gap-2">
                          {l.sequencia != null && (
                            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[9px] font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                              {l.sequencia}
                            </span>
                          )}
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{l.numero_processo}</span>
                        </div>
                        <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Processos pendentes */}
              {relatorio.pendentes.length > 0 && (
                <section>
                  <h3 className="mb-2.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    <Clock className="h-3.5 w-3.5 text-amber-500" />
                    Pendentes ({relatorio.pendentes.length})
                  </h3>
                  <div className="space-y-1">
                    {relatorio.pendentes.map((p, i) => (
                      <div key={i} className="flex items-start justify-between rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 dark:border-amber-900/30 dark:bg-amber-950/20">
                        <div className="flex items-center gap-2">
                          {p.sequencia != null && (
                            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[9px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                              {p.sequencia}
                            </span>
                          )}
                          <div>
                            <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{p.numero_processo}</p>
                            <p className="text-[10px] text-amber-600 dark:text-amber-400">{p.motivo_pendente}</p>
                          </div>
                        </div>
                        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {/* Rodapé com botões */}
        <div className="flex shrink-0 items-center justify-between border-t border-gray-200 px-5 py-3 dark:border-gray-700">
          {/* Esquerda: Abrir relatório + Fechar juntos */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={abrirRelatorio}
              disabled={!relatorio?.html_relatorio}
              title="Abre o relatório no modelo da planilha em uma nova janela."
              aria-label="Abrir relatório em nova janela"
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Abrir relatório
            </button>
            <button
              type="button"
              onClick={onFechar}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <X className="h-3.5 w-3.5" />
              Fechar
            </button>
          </div>

          {/* Direita: Descartar — isolado para evitar clique acidental */}
          <div>
            {relatorio?.relatorio_id != null && (
              <button
                type="button"
                onClick={descartar}
                disabled={descartando}
                title="Descarta apenas esta versão consolidada do relatório. As análises individuais dos processos serão mantidas."
                aria-label="Descartar versão do relatório"
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600 shadow-sm hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:bg-gray-800 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                <Trash2 className="h-3 w-3" />
                Descartar versão
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
