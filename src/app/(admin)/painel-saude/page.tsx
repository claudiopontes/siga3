import type { Metadata } from "next";
import { Suspense } from "react";
import PainelSaudeClient from "@/components/saude/PainelSaudeClient";

export const metadata: Metadata = {
  title: "Painel da Saúde | Varadouro Digital",
  description: "Monitoramento de aplicação em saúde, estrutura da rede e alertas dos municípios do Acre.",
};

export default function PainelSaudePage() {
  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-gray-50 p-[5px] dark:bg-gray-900">
      <Suspense
        fallback={
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            Carregando painel...
          </div>
        }
      >
        <PainelSaudeClient />
      </Suspense>
    </div>
  );
}
