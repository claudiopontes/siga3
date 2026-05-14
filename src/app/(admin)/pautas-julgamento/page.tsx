import type { Metadata } from "next";
import { Suspense } from "react";
import PautasJulgamentoClient from "@/components/pautas-julgamento/PautasJulgamentoClient";

export const metadata: Metadata = {
  title: "Pautas para Julgamento | Varadouro Digital",
  description: "Consulta de pautas de sessões em situação PARA JULGAMENTO no TCE/AC.",
};

export default function PautasJulgamentoPage() {
  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-gray-50 p-[5px] dark:bg-gray-900">
      <Suspense
        fallback={
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            Carregando pautas para julgamento...
          </div>
        }
      >
        <PautasJulgamentoClient />
      </Suspense>
    </div>
  );
}
