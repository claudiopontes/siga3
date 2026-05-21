import type { Metadata } from "next";
import { Suspense } from "react";
import ServidorDetalheClient from "@/components/folha/ServidorDetalheClient";

export const metadata: Metadata = {
  title: "Servidor — Folha de Pessoal | Varadouro Digital",
};

type Params = { params: Promise<{ idCadastroUnico: string }> };

export default async function ServidorFolhaPage({ params }: Params) {
  const { idCadastroUnico } = await params;
  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-gray-50 p-[5px] dark:bg-gray-900">
      <Suspense fallback={
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          Carregando ficha do servidor...
        </div>
      }>
        <ServidorDetalheClient idCadastroUnico={idCadastroUnico} />
      </Suspense>
    </div>
  );
}
