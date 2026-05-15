import type { Metadata } from "next";
import { Suspense } from "react";
import ProcessoDetalheClient from "@/components/processos/ProcessoDetalheClient";

export const metadata: Metadata = {
  title: "Detalhe do Processo | eProcessos CE | Varadouro Digital",
};

export default async function ProcessoDetalhePage({
  params,
}: {
  params: Promise<{ processoId: string }>;
}) {
  const { processoId } = await params;
  const id = Number(processoId);

  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-gray-50 p-[5px] dark:bg-gray-900">
      <Suspense
        fallback={
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            Carregando processo...
          </div>
        }
      >
        <ProcessoDetalheClient processoId={id} />
      </Suspense>
    </div>
  );
}
