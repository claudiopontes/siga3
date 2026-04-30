import type { Metadata } from "next";
import { Suspense } from "react";
import AlertasGabineteClient from "@/components/alertas-gabinete/AlertasGabineteClient";

export const metadata: Metadata = {
  title: "Alertas do Gabinete | Varadouro Digital",
  description:
    "Central de alertas e prioridades para os gabinetes dos conselheiros do TCE/AC.",
};

export default function Home() {
  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-gray-50 p-[5px] dark:bg-gray-900">
      <Suspense
        fallback={
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            Carregando alertas do gabinete...
          </div>
        }
      >
        <AlertasGabineteClient />
      </Suspense>
    </div>
  );
}
