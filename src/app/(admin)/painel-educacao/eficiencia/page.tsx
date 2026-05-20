import type { Metadata } from "next";
import { Suspense } from "react";
import EficienciaClient from "@/components/educacao/EficienciaClient";

export const metadata: Metadata = {
  title: "Eficiência Educacional | Varadouro Digital",
  description:
    "Cruzamento de gasto público em educação (SICONFI RREO Anexo 8) com IDEB e matrículas (INEP) para análise de eficiência por município do Acre.",
};

export default function PainelEficienciaPage() {
  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-gray-50 p-[5px] dark:bg-gray-900">
      <Suspense
        fallback={
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            Carregando eficiência educacional...
          </div>
        }
      >
        <EficienciaClient />
      </Suspense>
    </div>
  );
}
