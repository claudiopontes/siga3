import type { Metadata } from "next";
import { Suspense } from "react";
import VacinacaoClient from "@/components/saude/VacinacaoClient";

export const metadata: Metadata = {
  title: "Vacinação | Saúde Pública | Varadouro Digital",
  description: "Acompanhamento de cobertura vacinal, doses aplicadas e sinais de queda nos municípios do Acre.",
};

export default function VacinacaoPage() {
  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-gray-50 p-[5px] dark:bg-gray-900">
      <Suspense
        fallback={
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            Carregando vacinação...
          </div>
        }
      >
        <VacinacaoClient />
      </Suspense>
    </div>
  );
}
