import type { Metadata } from "next";
import { Suspense } from "react";
import PainelEducacaoClient from "@/components/educacao/PainelEducacaoClient";

export const metadata: Metadata = {
  title: "Indicadores Educacionais | Varadouro Digital",
  description:
    "Indicadores educacionais dos municípios do Acre: IDEB (INEP) e Taxas de Rendimento Escolar. Dado gerencial para alerta interno — não substitui as estatísticas oficiais do INEP/MEC.",
};

export default function PainelEducacaoPage() {
  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-gray-50 p-[5px] dark:bg-gray-900">
      <Suspense
        fallback={
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            Carregando indicadores educacionais...
          </div>
        }
      >
        <PainelEducacaoClient />
      </Suspense>
    </div>
  );
}
