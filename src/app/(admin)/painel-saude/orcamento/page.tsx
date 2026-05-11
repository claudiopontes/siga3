import type { Metadata } from "next";
import { Suspense } from "react";
import OrcamentoSaudeClient from "@/components/saude/OrcamentoSaudeClient";

export const metadata: Metadata = {
  title: "Orçamento e Aplicação da Saúde | Varadouro Digital",
  description: "Acompanhamento da aplicação mínima em saúde, despesa total e alertas orçamentários dos municípios do Acre — SIOPS.",
};

export default function OrcamentoSaudePage() {
  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-gray-50 p-[5px] dark:bg-gray-900">
      <Suspense
        fallback={
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            Carregando orçamento e aplicação...
          </div>
        }
      >
        <OrcamentoSaudeClient />
      </Suspense>
    </div>
  );
}
