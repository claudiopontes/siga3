import { Suspense } from "react";
import type { Metadata } from "next";
import MortalidadeClient from "@/components/saude/MortalidadeClient";

export const metadata: Metadata = {
  title: "Mortalidade e Nascidos Vivos | Varadouro Digital",
};

export default function MortalidadePage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-gray-500">Carregando...</div>}>
      <MortalidadeClient />
    </Suspense>
  );
}
