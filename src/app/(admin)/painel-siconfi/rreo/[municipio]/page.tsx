import type { Metadata } from "next";
import { Suspense } from "react";
import RreoMunicipioClient from "@/components/siconfi/RreoMunicipioClient";

export const metadata: Metadata = {
  title: "Detalhe Municipal RREO | Execução Orçamentária | Varadouro Digital",
};

export default async function RreoMunicipioPage({
  params,
}: {
  params: Promise<{ municipio: string }>;
}) {
  const { municipio } = await params;

  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-gray-50 p-[5px] dark:bg-gray-900">
      <Suspense
        fallback={
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            Carregando dados do município...
          </div>
        }
      >
        <RreoMunicipioClient idMunicipio={municipio} />
      </Suspense>
    </div>
  );
}
