import type { Metadata } from "next";
import { Suspense } from "react";
import PainelDespesaClient from "@/components/despesa/PainelDespesaClient";

export const metadata: Metadata = {
  title: "Painel da Despesa Pública | Varadouro Digital",
  description:
    "Painel analítico de despesas públicas com indicadores de empenho, liquidação, pagamento e execução orçamentária.",
};

export default function PainelDespesaPage() {
  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-gray-50 p-[5px] dark:bg-gray-900">
      <Suspense
        fallback={
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            Carregando painel da despesa pública...
          </div>
        }
      >
        <PainelDespesaClient />
      </Suspense>
    </div>
  );
}
