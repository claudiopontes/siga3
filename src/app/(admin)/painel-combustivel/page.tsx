import type { Metadata } from "next";
import { Suspense } from "react";
import PainelCombustivelClient from "@/components/combustivel/PainelCombustivelClient";

export const metadata: Metadata = {
  title: "Painel de Combustível | Varadouro Digital",
  description: "Painel analítico de gastos com combustível (NFE)",
};

export default function PainelCombustivelPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-1 sm:p-2 dark:bg-gray-900">
      <Suspense
        fallback={
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            Carregando painel de combustível...
          </div>
        }
      >
        <PainelCombustivelClient />
      </Suspense>
    </div>
  );
}
