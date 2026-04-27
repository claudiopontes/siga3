import type { Metadata } from "next";
import { Suspense } from "react";
import PainelEmpenhoClient from "@/components/combustivel/PainelEmpenhoClient";

export const metadata: Metadata = {
  title: "Painel de Combustível — Empenhos TCE | Varadouro Digital",
  description: "Painel analítico de despesas de combustível com base nos empenhos registrados no TCE-AC.",
};

export default function PainelEmpenhoPage() {
  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-gray-50 p-1 sm:p-2 dark:bg-gray-900">
      <Suspense
        fallback={
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            Carregando painel de empenhos...
          </div>
        }
      >
        <PainelEmpenhoClient />
      </Suspense>
    </div>
  );
}
