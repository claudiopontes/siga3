import type { Metadata } from "next";
import { Suspense } from "react";
import PainelFolhaClient from "@/components/folha/PainelFolhaClient";

export const metadata: Metadata = {
  title: "Painel da Folha de Pessoal | Varadouro Digital",
  description:
    "Painel analítico da folha de pessoal das entidades estaduais e municipais do Acre, com inteligência de controle externo (alertas de qualidade, acúmulo de cargos, teto constitucional, variação anormal).",
};

export default function PainelFolhaPage() {
  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-gray-50 p-[5px] dark:bg-gray-900">
      <Suspense
        fallback={
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            Carregando painel da folha de pessoal...
          </div>
        }
      >
        <PainelFolhaClient />
      </Suspense>
    </div>
  );
}
