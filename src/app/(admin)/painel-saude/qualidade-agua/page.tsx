import type { Metadata } from "next";
import { Suspense } from "react";
import QualidadeAguaClient from "@/components/saude/QualidadeAguaClient";

export const metadata: Metadata = {
  title: "Qualidade da Água | Saúde Pública | Varadouro Digital",
  description: "Monitoramento de amostras, parâmetros fora do padrão e risco sanitário nos municípios do Acre — SISAGUA.",
};

export default function QualidadeAguaPage() {
  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-gray-50 p-[5px] dark:bg-gray-900">
      <Suspense
        fallback={
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            Carregando qualidade da água...
          </div>
        }
      >
        <QualidadeAguaClient />
      </Suspense>
    </div>
  );
}
