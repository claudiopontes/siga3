import type { Metadata } from "next";
import HomeClient from "@/components/home/HomeClient";

export const metadata: Metadata = {
  title: "Painel Cobertura Florestal | Varadouro Digital",
  description: "Painel de cobertura florestal e desmatamento nos municípios do Acre.",
};

export default function PainelCoberturaFlorestalPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-1 sm:p-2">
      <HomeClient />
    </div>
  );
}
