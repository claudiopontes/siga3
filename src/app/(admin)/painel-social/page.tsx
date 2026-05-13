import { Metadata } from "next";
import { Suspense } from "react";
import TransferenciaRendaClient from "@/components/social/TransferenciaRendaClient";

export const metadata: Metadata = {
  title: "Vulnerabilidade Social e Transferência de Renda | Varadouro Digital",
};

export default function PainelSocialPage() {
  return (
    <Suspense fallback={null}>
      <TransferenciaRendaClient />
    </Suspense>
  );
}
