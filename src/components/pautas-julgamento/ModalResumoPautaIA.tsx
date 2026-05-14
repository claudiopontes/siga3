"use client";

import type { ResumoPautaOutput, NivelRisco } from "@/lib/ia/tipos";

function BadgeRisco({ nivel }: { nivel: NivelRisco }) {
  const estilos: Record<NivelRisco, string> = {
    baixo: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    medio: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    alto: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    critico: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };
  const labels: Record<NivelRisco, string> = {
    baixo: "Baixo",
    medio: "Médio",
    alto: "Alto",
    critico: "Crítico",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${estilos[nivel] ?? estilos.medio}`}>
      {labels[nivel] ?? nivel}
    </span>
  );
}

export default function ModalResumoPautaIA({
  aberto,
  onFechar,
  resumo,
}: {
  aberto: boolean;
  onFechar: () => void;
  resumo: ResumoPautaOutput | null;
}) {
  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-[200000] flex items-start justify-center overflow-y-auto p-3 sm:p-6">
      <button
        type="button"
        aria-label="Fechar resumo de pauta"
        className="absolute inset-0 bg-gray-900/75 backdrop-blur-[2px]"
        onClick={onFechar}
      />

      <div className="relative z-10 my-4 w-full max-w-3xl overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-2xl dark:border-blue-800/50 dark:bg-gray-900">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-white px-5 py-4 dark:border-gray-700 dark:from-blue-900/20 dark:to-gray-900">
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">
              Resumo de Pauta — Análise de IA
            </h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Apoio preliminar ao gabinete do conselheiro
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Fechar
          </button>
        </div>

        <div className="space-y-5 overflow-auto p-5">
          {resumo ? (
            <>
              {/* Resumo geral */}
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/60">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Resumo geral da pauta
                </p>
                <p className="text-sm text-gray-800 dark:text-gray-200">{resumo.resumo_geral_da_pauta}</p>
              </div>

              {/* Observações gerais */}
              {resumo.observacoes_gerais.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Observações gerais
                  </p>
                  <ul className="space-y-1.5">
                    {resumo.observacoes_gerais.map((obs, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-400" />
                        {obs}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Processos */}
              {resumo.processos.length > 0 && (
                <div className="space-y-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Processos ({resumo.processos.length})
                  </p>
                  {resumo.processos.map((proc, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800/40"
                    >
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-gray-900 dark:text-white">
                          {proc.numero || `Processo ${i + 1}`}
                        </span>
                        <BadgeRisco nivel={proc.risco_percebido} />
                      </div>

                      <p className="mb-3 text-sm text-gray-700 dark:text-gray-300">
                        {proc.resumo_para_conselheiro}
                      </p>

                      <div className="space-y-2 text-xs">
                        <div>
                          <span className="font-semibold text-gray-500 dark:text-gray-400">Ponto central: </span>
                          <span className="text-gray-700 dark:text-gray-300">{proc.ponto_central}</span>
                        </div>

                        <div>
                          <span className="font-semibold text-gray-500 dark:text-gray-400">Motivo do risco: </span>
                          <span className="text-gray-700 dark:text-gray-300">{proc.motivo_do_risco}</span>
                        </div>

                        {proc.pontos_para_atencao_na_sessao.length > 0 && (
                          <div>
                            <p className="mb-1 font-semibold text-gray-500 dark:text-gray-400">Pontos de atenção:</p>
                            <ul className="space-y-0.5">
                              {proc.pontos_para_atencao_na_sessao.map((p, j) => (
                                <li key={j} className="flex items-start gap-1.5 text-gray-700 dark:text-gray-300">
                                  <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-amber-400" />
                                  {p}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {proc.perguntas_sugeridas.length > 0 && (
                          <div>
                            <p className="mb-1 font-semibold text-gray-500 dark:text-gray-400">Perguntas sugeridas:</p>
                            <ul className="space-y-0.5">
                              {proc.perguntas_sugeridas.map((p, j) => (
                                <li key={j} className="flex items-start gap-1.5 text-gray-700 dark:text-gray-300">
                                  <span className="mt-0.5 text-violet-400">?</span>
                                  {p}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {proc.informacoes_ausentes.length > 0 && (
                          <div>
                            <p className="mb-1 font-semibold text-gray-500 dark:text-gray-400">Informações ausentes:</p>
                            <ul className="space-y-0.5">
                              {proc.informacoes_ausentes.map((p, j) => (
                                <li key={j} className="flex items-start gap-1.5 text-gray-500 dark:text-gray-400">
                                  <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-gray-300 dark:bg-gray-600" />
                                  {p}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              Nenhum resumo disponível.
            </p>
          )}
        </div>

        {/* Rodapé com aviso */}
        <div className="border-t border-amber-100 bg-amber-50 px-5 py-3 dark:border-amber-900/40 dark:bg-amber-900/20">
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            ⚠ {resumo?.aviso_revisao ?? "Análise gerada por IA para apoio preliminar do gabinete. Revise antes de utilizar em manifestação, voto ou decisão oficial."}
          </p>
        </div>
      </div>
    </div>
  );
}
