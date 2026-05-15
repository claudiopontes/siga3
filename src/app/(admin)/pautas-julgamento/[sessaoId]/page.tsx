import type { Metadata } from "next";
import { Suspense } from "react";
import SessaoDetalheClient from "@/components/pautas-julgamento/SessaoDetalheClient";

export const metadata: Metadata = {
  title: "Processos da Sessão | Pautas para Julgamento | Varadouro Digital",
};

export default async function SessaoDetalhePage({
  params,
}: {
  params: Promise<{ sessaoId: string }>;
}) {
  const { sessaoId } = await params;

  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-gray-50 p-[5px] dark:bg-gray-900">
      <Suspense
        fallback={
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            Carregando sessão...
          </div>
        }
      >
        <SessaoDetalheClient sessaoId={Number(sessaoId)} />
      </Suspense>
    </div>
  );
}
