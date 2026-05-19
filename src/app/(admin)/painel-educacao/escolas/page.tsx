import type { Metadata } from "next";
import { Suspense } from "react";
import EscolasClient from "@/components/educacao/EscolasClient";

export const metadata: Metadata = {
  title: "Escolas — Indicadores Educacionais | Varadouro Digital",
  description:
    "Mapa e tabela de escolas do Acre com IDEB, meta INEP e metadados do Censo Escolar (rede, localização, situação, etapas).",
};

export default function PainelEscolasPage() {
  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-gray-50 p-[5px] dark:bg-gray-900">
      <Suspense
        fallback={
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            Carregando escolas...
          </div>
        }
      >
        <EscolasClient />
      </Suspense>
    </div>
  );
}
