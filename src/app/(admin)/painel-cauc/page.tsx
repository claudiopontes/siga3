import type { Metadata } from "next";
import { Suspense } from "react";
import PainelCaucClient from "@/components/cauc/PainelCaucClient";

export const metadata: Metadata = {
  title: "Painel CAUC | Varadouro Digital",
  description:
    "Situação dos requisitos CAUC dos municípios do Acre. Dado gerencial para alerta interno — não substitui o extrato oficial do CAUC.",
};

export default function PainelCaucPage() {
  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-gray-50 p-[5px] dark:bg-gray-900">
      <Suspense
        fallback={
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            Carregando painel CAUC...
          </div>
        }
      >
        <PainelCaucClient />
      </Suspense>
    </div>
  );
}
