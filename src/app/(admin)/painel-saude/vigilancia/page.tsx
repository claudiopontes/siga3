import type { Metadata } from "next";
import { Suspense } from "react";
import VigilanciaEpidemiologicaClient from "@/components/saude/VigilanciaEpidemiologicaClient";

export const metadata: Metadata = {
  title: "Vigilância Epidemiológica | Saúde Pública | Varadouro Digital",
  description: "Monitoramento de dengue, chikungunya e zika com base nos alertas do InfoDengue nos municípios do Acre.",
};

export default function VigilanciaEpidemiologicaPage() {
  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-gray-50 p-[5px] dark:bg-gray-900">
      <Suspense
        fallback={
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            Carregando vigilância epidemiológica...
          </div>
        }
      >
        <VigilanciaEpidemiologicaClient />
      </Suspense>
    </div>
  );
}
