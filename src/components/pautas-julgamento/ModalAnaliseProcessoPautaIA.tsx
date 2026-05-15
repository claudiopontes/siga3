"use client";

import { useState, useCallback, useEffect } from "react";
import { Bot, Loader2, X, Printer, RefreshCw, AlertTriangle, CheckCircle, Info, XCircle, Trash2 } from "lucide-react";
import type { AnaliseProcessoPautaOutput, NivelRisco } from "@/lib/ia/tipos";

interface Props {
  processoId: number;
  numeroFmt: string | null;
}

const RISCO_CONFIG: Record<NivelRisco, { label: string; cor: string; icone: React.ReactNode }> = {
  baixo:   { label: "Risco Baixo",   cor: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300",   icone: <CheckCircle className="h-4 w-4" /> },
  medio:   { label: "Risco Médio",   cor: "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300", icone: <Info className="h-4 w-4" /> },
  alto:    { label: "Risco Alto",    cor: "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300", icone: <AlertTriangle className="h-4 w-4" /> },
  critico: { label: "Risco Crítico", cor: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300",             icone: <XCircle className="h-4 w-4" /> },
};

export default function ModalAnaliseProcessoPautaIA({ processoId, numeroFmt }: Props) {
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [analise, setAnalise] = useState<AnaliseProcessoPautaOutput | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [descartando, setDescartando] = useState(false);
  const [descartado, setDescartado] = useState(false);

  const executarAnalise = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const resp = await fetch("/api/ia/analisar-processo-pauta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processoId }),
      });
      const json = await resp.json();
      if (!resp.ok) { setErro(json?.error ?? "Erro desconhecido."); return; }
      setAnalise(json as AnaliseProcessoPautaOutput);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha na comunicação com o servidor.");
    } finally {
      setCarregando(false);
    }
  }, [processoId]);

  const abrir = useCallback(() => {
    setAberto(true);
    if (!analise && !carregando) executarAnalise();
  }, [analise, carregando, executarAnalise]);

  async function descartarAnalise() {
    if (!analise?.analise_id) return;
    const motivo = window.prompt("Motivo do descarte (opcional):");
    if (motivo === null) return;

    setDescartando(true);
    try {
      const res = await fetch("/api/ia/analise-processo-pauta/descartar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analiseId: analise.analise_id, motivo }),
      });
      if (res.ok) {
        setDescartado(true);
        setAnalise(null);
      } else {
        const json = await res.json();
        setErro(json?.error ?? "Erro ao descartar análise.");
      }
    } catch {
      setErro("Falha na comunicação com o servidor.");
    } finally {
      setDescartando(false);
    }
  }

  const fechar = () => setAberto(false);

  // Fecha com Escape
  useEffect(() => {
    if (!aberto) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") fechar(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [aberto]);

  const imprimir = () => {
    if (analise?.html_relatorio) {
      const janela = window.open("/api/ia/relatorio-processo/" + processoId, "_blank", "noopener,noreferrer");
      janela?.focus();
    } else {
      window.print();
    }
  };

  const riscoCfg = analise ? (RISCO_CONFIG[analise.risco_percebido] ?? RISCO_CONFIG.medio) : null;

  return (
    <>
      {/* Botão disparador — analisa este processo para compor futuramente o relatório da pauta */}
      <button
        type="button"
        onClick={abrir}
        title="Gera ou recupera a análise deste processo para preparação da pauta de julgamento."
        aria-label="Gerar análise da pauta"
        className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-700 transition hover:border-purple-300 hover:bg-purple-100 dark:border-purple-900/70 dark:bg-purple-950/30 dark:text-purple-400 dark:hover:bg-purple-900/40"
      >
        <Bot className="h-3.5 w-3.5" />
        Gerar análise da pauta
      </button>

      {/* Overlay escurecido clicável para fechar */}
      {aberto && (
        <div
          className="fixed inset-0 z-40 bg-black/30 transition-opacity"
          onClick={fechar}
          aria-hidden="true"
        />
      )}

      {/*
        Mobile  → bottom sheet: sobe do fundo, largura total, altura ~88vh, cantos arredondados no topo
        Desktop → drawer lateral: desliza da direita, largura fixa (max-w-xl), altura total
      */}
      <div
        className={`
          fixed z-50 flex flex-col bg-white shadow-2xl transition-transform duration-300 dark:bg-gray-900
          bottom-0 left-0 right-0 max-h-[88vh] rounded-t-2xl
          md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-full md:max-w-xl md:rounded-none
          ${aberto
            ? "translate-y-0 md:translate-y-0 md:translate-x-0"
            : "translate-y-full md:translate-y-0 md:translate-x-full"
          }
        `}
      >
        {/* Alça de arrasto — visível só no mobile */}
        <div className="flex shrink-0 justify-center pt-2.5 pb-1 md:hidden">
          <div className="h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-600" />
        </div>

        {/* Cabeçalho fixo */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-3.5 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-white">
                Análise para a pauta
              </p>
              <p className="text-[10px] text-gray-400">
                {numeroFmt ?? `Processo ${processoId}`}
                {analise?.do_cache && " · cache"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {!carregando && (
              <button type="button" onClick={executarAnalise} title="Reanalisar"
                className="rounded p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                <RefreshCw className="h-4 w-4" />
              </button>
            )}
            <button type="button" onClick={fechar}
              className="rounded p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Conteúdo com scroll */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Aviso de análise descartada */}
          {descartado && !carregando && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Análise descartada</p>
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-300">
                A análise foi marcada como descartada. A próxima vez que clicar em <strong>Reanalisar</strong>, uma nova análise será gerada.
              </p>
            </div>
          )}

          {/* Loading */}
          {carregando && (
            <div className="flex flex-col items-center gap-3 py-16">
              <Loader2 className="h-7 w-7 animate-spin text-purple-500" />
              <p className="text-sm text-gray-500">Analisando documentos do processo...</p>
              <p className="text-xs text-gray-400">Isso pode levar alguns segundos.</p>
            </div>
          )}

          {/* Erro */}
          {erro && !carregando && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/30">
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">Erro na análise</p>
              <p className="mt-1 text-xs text-red-600 dark:text-red-300">{erro}</p>
            </div>
          )}

          {/* Resultado */}
          {analise && !carregando && (
            <>
              {/* Badge risco */}
              <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${riscoCfg?.cor}`}>
                {riscoCfg?.icone}
                {riscoCfg?.label}
              </div>

              {/* Resumo executivo */}
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
                <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Resumo Executivo</h3>
                <p className="text-sm leading-relaxed text-gray-800 dark:text-gray-200">{analise.resumo_executivo}</p>
              </div>

              {/* Ponto central */}
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
                <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Ponto Central</h3>
                <p className="text-sm text-blue-800 dark:text-blue-200">{analise.ponto_central}</p>
              </div>

              {/* Motivo do risco */}
              <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Motivo do Risco</h3>
                <p className="text-sm text-gray-700 dark:text-gray-300">{analise.motivo_do_risco}</p>
              </div>

              {/* Divergência instrução × MPC */}
              {analise.ha_divergencia && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
                  <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                    Divergência: Instrução Técnica × MPC
                  </h3>
                  {analise.tipo_divergencia && (
                    <span className="mb-1.5 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      {analise.tipo_divergencia}
                    </span>
                  )}
                  <p className="text-sm text-amber-800 dark:text-amber-200">{analise.motivo_do_risco}</p>
                </div>
              )}

              {/* Documentos analisados — voto "não aplicável" é ocultado */}
              {(() => {
                const docsVisiveis = (analise.documentos_analisados ?? []).filter(
                  (d) => !(d.tipo === "voto_relator" && d.resumo.startsWith("Não aplicável nesta fase")),
                );
                return docsVisiveis.length > 0 ? (
                  <section>
                    <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Documentos Analisados ({docsVisiveis.length})
                    </h3>
                    <div className="space-y-1.5">
                      {docsVisiveis.map((doc, i) => (
                        <details key={i} className="rounded-xl border border-gray-200 dark:border-gray-700">
                          <summary className="cursor-pointer select-none rounded-xl px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700/50">
                            <span className="capitalize">{doc.tipo.replace(/_/g, " ")}</span>
                            {" — "}
                            <span className="font-normal text-gray-500 dark:text-gray-400">{doc.nome}</span>
                          </summary>
                          <div className="border-t border-gray-200 px-4 py-3 dark:border-gray-700">
                            <p className="text-xs leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-line">{doc.resumo}</p>
                          </div>
                        </details>
                      ))}
                    </div>
                  </section>
                ) : null;
              })()}

              {/* Pontos de atenção */}
              {analise.pontos_para_atencao?.length > 0 && (
                <section>
                  <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Pontos para Atenção</h3>
                  <ul className="space-y-1.5">
                    {analise.pontos_para_atencao.map((p, i) => (
                      <li key={i} className="flex gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Perguntas sugeridas */}
              {analise.perguntas_sugeridas?.length > 0 && (
                <section>
                  <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Perguntas Sugeridas</h3>
                  <ul className="space-y-1.5">
                    {analise.perguntas_sugeridas.map((p, i) => (
                      <li key={i} className="flex gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <span className="shrink-0 font-bold text-purple-500">{i + 1}.</span>
                        {p}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Informações ausentes */}
              {analise.informacoes_ausentes?.length > 0 && (
                <section>
                  <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Informações Ausentes</h3>
                  <ul className="space-y-1">
                    {analise.informacoes_ausentes.map((p, i) => (
                      <li key={i} className="flex gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <span className="shrink-0">—</span>{p}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Falhas de extração */}
              {analise.documentos_com_falha_extracao && analise.documentos_com_falha_extracao.length > 0 && (
                <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 dark:border-orange-900/40 dark:bg-orange-950/20">
                  <p className="text-[11px] font-semibold text-orange-700 dark:text-orange-400">
                    ⚠️ {analise.documentos_com_falha_extracao.length} documento(s) não puderam ser lidos
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {analise.documentos_com_falha_extracao.map((f, i) => (
                      <li key={i} className="text-[10px] text-orange-600 dark:text-orange-300">
                        <span className="font-semibold capitalize">{f.tipo.replace(/_/g, " ")}</span> — {f.nome}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Data de geração */}
              {analise.gerado_em && (
                <p className="text-[10px] text-gray-400 dark:text-gray-500">
                  Emitido em: {new Date(analise.gerado_em).toLocaleString("pt-BR")}
                </p>
              )}
            </>
          )}
        </div>

        {/* Rodapé fixo com botão imprimir e descartar */}
        {analise && !carregando && (
          <div className="flex shrink-0 items-center justify-between border-t border-gray-200 px-5 py-3 dark:border-gray-700">
            <button
              type="button"
              onClick={descartarAnalise}
              disabled={descartando || !analise.analise_id}
              title={analise.analise_id ? "Marcar análise como descartada (não apaga o registro)" : "ID da análise indisponível"}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600 shadow-sm hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:bg-gray-800 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              {descartando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Descartar análise
            </button>
            <button
              type="button"
              onClick={imprimir}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <Printer className="h-3.5 w-3.5" />
              Imprimir análise
            </button>
          </div>
        )}
      </div>
    </>
  );
}
