import type { Metadata } from "next";
import { Suspense } from "react";
import EntregasSiconfiClient from "@/components/siconfi/EntregasSiconfiClient";

export const metadata: Metadata = {
  title: "Entregas e Pendências | Execução Orçamentária | Varadouro Digital",
  description:
    "Acompanhamento da presença de dados RREO dos municípios do Acre no SICONFI.",
};

export default function EntregasSiconfiPage() {
  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-gray-50 p-[5px] dark:bg-gray-900">
      <Suspense
        fallback={
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            Carregando Entregas e Pendências...
          </div>
        }
      >
        <EntregasSiconfiClient />
      </Suspense>
    </div>
  );
}
