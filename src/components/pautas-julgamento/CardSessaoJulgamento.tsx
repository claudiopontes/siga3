"use client";

import type { SessaoJulgamentoView } from "./tipos";

function formatarData(data: string | null): string {
  if (!data) return "—";
  const d = new Date(data);
  if (isNaN(d.getTime())) return data;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function CardSessaoJulgamento({
  sessao,
  selecionada,
  onSelecionar,
}: {
  sessao: SessaoJulgamentoView;
  selecionada: boolean;
  onSelecionar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelecionar}
      className={[
        "w-full rounded-xl border px-4 py-3 text-left transition-colors",
        selecionada
          ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20"
          : "border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/50 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-700 dark:hover:bg-blue-900/10",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
            Sessão {sessao.numero ?? sessao.id}
          </p>
          {sessao.tipo && (
            <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{sessao.tipo}</p>
          )}
        </div>
        <span className="flex-shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          {sessao.situacao ?? "Para Julgamento"}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
        {sessao.dt_realizacao && (
          <span>
            <span className="font-medium text-gray-700 dark:text-gray-300">Data:</span>{" "}
            {formatarData(sessao.dt_realizacao)}
          </span>
        )}
        {sessao.local_sessao && (
          <span>
            <span className="font-medium text-gray-700 dark:text-gray-300">Local:</span>{" "}
            {sessao.local_sessao}
          </span>
        )}
        {sessao.numero_publicacao && (
          <span>
            <span className="font-medium text-gray-700 dark:text-gray-300">Publicação:</span>{" "}
            {sessao.numero_publicacao}
            {sessao.data_publicacao ? ` — ${formatarData(sessao.data_publicacao)}` : ""}
          </span>
        )}
      </div>
    </button>
  );
}
