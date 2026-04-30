import type { Metadata } from "next";
import { Suspense } from "react";
import PainelReceitaPublicaClient from "@/components/receita-publica/PainelReceitaPublicaClient";

export const metadata: Metadata = {
  title: "Painel da Receita Pública | Varadouro Digital",
  description:
    "Painel analítico de receitas públicas com indicadores de previsão, realização e execução.",
};

export default function PainelReceitaPublicaPage() {
  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-gray-50 p-[5px] dark:bg-gray-900">
      <Suspense
        fallback={
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            Carregando painel da receita pública...
          </div>
        }
      >
        <PainelReceitaPublicaClient />
      </Suspense>
    </div>
  );
}
