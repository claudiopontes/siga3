import type { Metadata } from "next";
import { Suspense } from "react";
import CensoEscolarClient from "@/components/educacao/CensoEscolarClient";

export const metadata: Metadata = {
  title: "Censo Escolar — Indicadores Educacionais | Varadouro Digital",
  description:
    "Painel analítico do Censo Escolar do Acre: matrículas, docentes e infraestrutura das escolas em atividade.",
};

export default function PainelCensoPage() {
  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-gray-50 p-[5px] dark:bg-gray-900">
      <Suspense
        fallback={
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            Carregando Censo Escolar...
          </div>
        }
      >
        <CensoEscolarClient />
      </Suspense>
    </div>
  );
}
