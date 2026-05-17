import type { Metadata } from "next";
import { Suspense } from "react";
import RgfClient from "@/components/siconfi/RgfClient";

export const metadata: Metadata = {
  title: "RGF | Execução Orçamentária | Varadouro Digital",
  description: "Acompanhamento do Relatório de Gestão Fiscal dos municípios do Acre com dados do SICONFI.",
};

export default function RgfPage() {
  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-gray-50 p-[5px] dark:bg-gray-900">
      <Suspense
        fallback={
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            Carregando painel RGF...
          </div>
        }
      >
        <RgfClient />
      </Suspense>
    </div>
  );
}
