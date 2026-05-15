"use client";

import type { ProcessoPautaJulgamentoView } from "./tipos";


export default function TabelaProcessosPauta({ processos }: { processos: ProcessoPautaJulgamentoView[] }) {
  if (processos.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
        Nenhum processo encontrado para esta sessão.
      </p>
    );
  }

  return (
    <div className="max-h-[60vh] overflow-auto rounded-xl border border-gray-200 dark:border-gray-700">
      <table className="w-full min-w-[1050px] text-sm">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/60">
            <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Seq.</th>
            <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Processo</th>
            <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Objeto / Classe</th>
            <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Parte</th>
            <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Relator</th>
            <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Entidade/Órgão</th>
            <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Situação Pauta</th>
          </tr>
        </thead>
        <tbody>
          {processos.map((p, i) => (
            <tr
              key={p.id}
              className={`border-t border-gray-100 dark:border-gray-700/50 hover:bg-blue-50/40 dark:hover:bg-blue-900/10 ${
                i % 2 !== 0 ? "bg-slate-50 dark:bg-slate-800/30" : "bg-white dark:bg-gray-800"
              }`}
            >
              <td className="px-3 py-2.5 text-center text-xs text-gray-400 dark:text-gray-500">
                {p.sequencia ?? "—"}
              </td>
              <td className="px-3 py-2.5">
                <span className="block font-semibold text-blue-700 dark:text-blue-400">
                  {p.numero_processo_fmt ?? `ID ${p.processo_id ?? "—"}`}
                </span>
                {p.situacao_funcional && (
                  <span className="mt-0.5 block text-[10px] text-gray-400 dark:text-gray-500">
                    {p.situacao_funcional}
                  </span>
                )}
              </td>
              <td className="max-w-60 px-3 py-2.5">
                {p.objeto && (
                  <p className="truncate text-xs text-gray-700 dark:text-gray-300" title={p.objeto}>
                    {p.objeto}
                  </p>
                )}
                {p.nome_classe && (
                  <p className="mt-0.5 truncate text-[10px] text-gray-400 dark:text-gray-500" title={p.nome_classe}>
                    {p.nome_classe}
                  </p>
                )}
                {!p.objeto && !p.nome_classe && <span className="text-xs text-gray-400">—</span>}
              </td>
              <td className="max-w-40 px-3 py-2.5 text-xs text-gray-600 dark:text-gray-300">
                {p.nome_1_parte ?? "—"}
              </td>
              <td className="max-w-40 px-3 py-2.5 text-xs text-gray-700 dark:text-gray-300">
                {p.relator_tratamento ?? p.nome_relator ?? "—"}
                {p.nome_revisor && (
                  <span className="mt-0.5 block text-[10px] text-gray-400 dark:text-gray-500">
                    Rev.: {p.nome_revisor}
                  </span>
                )}
              </td>
              <td className="max-w-48 px-3 py-2.5 text-xs text-gray-600 dark:text-gray-300">
                {p.nome_orgao ? <p className="truncate" title={p.nome_orgao}>{p.nome_orgao}</p> : "—"}
              </td>
              <td className="px-3 py-2.5 text-xs text-gray-500 dark:text-gray-400">
                {p.situacao ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
