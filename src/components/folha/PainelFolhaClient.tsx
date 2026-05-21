"use client";

import { useState } from "react";
import { BarChart3, AlertTriangle, Search } from "lucide-react";
import FolhaHeaderFilters from "./FolhaHeaderFilters";
import PainelExecutivoTab from "./PainelExecutivoTab";
import AlertasTab from "./AlertasTab";
import PesquisaServidoresTab from "./PesquisaServidoresTab";

type Tab = "executivo" | "alertas" | "servidores";

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "executivo",   label: "Visão executiva",        icon: BarChart3 },
  { id: "alertas",     label: "Alertas",                icon: AlertTriangle },
  { id: "servidores",  label: "Pesquisa de servidores", icon: Search },
];

export default function PainelFolhaClient() {
  const [tab, setTab] = useState<Tab>("executivo");

  return (
    <div className="space-y-4">
      <FolhaHeaderFilters />

      <div className="flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-700">
        {TABS.map((t) => {
          const Icon = t.icon;
          const ativo = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={[
                "flex items-center gap-1 rounded-t-md border-b-2 px-3 py-2 text-sm",
                ativo
                  ? "border-blue-600 text-blue-600 dark:border-blue-300 dark:text-blue-300"
                  : "border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200",
              ].join(" ")}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div>
        {tab === "executivo"  && <PainelExecutivoTab />}
        {tab === "alertas"    && <AlertasTab />}
        {tab === "servidores" && <PesquisaServidoresTab />}
      </div>
    </div>
  );
}
