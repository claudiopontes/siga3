"use client";

import type { ProcessoPautaJulgamentoView } from "./tipos";

function normalizarBool(valor: boolean | number | string | null | undefined): boolean {
  if (valor === null || valor === undefined) return false;
  if (typeof valor === "boolean") return valor;
  if (typeof valor === "number") return valor !== 0;
  const v = valor.toString().toLowerCase().trim();
  return v === "true" || v === "1" || v === "sim" || v === "s";
}

function SimNao({ valor }: { valor: boolean }) {
  return valor ? (
    <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
      Sim
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500 dark:bg-gray-700 dark:text-gray-400">
      Não
    </span>
  );
}

export default function TabelaProcessosPauta({
  processos,
}: {
  processos: ProcessoPautaJulgamentoView[];
}) {
  if (processos.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
        Nenhum processo encontrado para esta sessão.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40">
            <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Seq.</th>
            <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Processo</th>
            <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Relator</th>
            <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Revisor</th>
            <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Situação</th>
            <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">MPC</th>
            <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Eletrônico</th>
            <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Julgado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
          {processos.map((p) => (
            <tr
              key={p.id}
              className="hover:bg-gray-50 dark:hover:bg-gray-800/60"
            >
              <td className="px-3 py-3 text-center text-xs text-gray-500 dark:text-gray-400">
                {p.sequencia ?? "—"}
              </td>
              <td className="px-3 py-3 font-medium text-gray-900 dark:text-white">
                {p.numero_processo ?? "—"}
              </td>
              <td className="max-w-[160px] px-3 py-3 text-xs text-gray-700 dark:text-gray-300">
                {p.nome_relator ?? "—"}
              </td>
              <td className="max-w-[160px] px-3 py-3 text-xs text-gray-500 dark:text-gray-400">
                {p.nome_revisor ?? "—"}
              </td>
              <td className="px-3 py-3 text-xs text-gray-500 dark:text-gray-400">
                {p.situacao ?? "—"}
              </td>
              <td className="px-3 py-3 text-center">
                <SimNao valor={(p.qtde_pron ?? 0) > 0} />
              </td>
              <td className="px-3 py-3 text-center">
                <SimNao valor={normalizarBool(p.eletronico)} />
              </td>
              <td className="px-3 py-3 text-center">
                <SimNao valor={normalizarBool(p.julgado)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
