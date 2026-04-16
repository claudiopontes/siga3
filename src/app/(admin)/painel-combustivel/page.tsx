import type { Metadata } from "next";
import PainelCombustivelClient from "@/components/combustivel/PainelCombustivelClient";

export const metadata: Metadata = {
  title: "Painel de Combustível | Varadouro Digital",
  description: "Painel analítico de gastos com combustível (NFE)",
};

export default function PainelCombustivelPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-1 sm:p-2 dark:bg-gray-900">
      <PainelCombustivelClient />
    </div>
  );
}
