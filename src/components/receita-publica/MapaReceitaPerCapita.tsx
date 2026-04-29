"use client";

import dynamic from "next/dynamic";

export type ReceitaPerCapitaItem = {
  codIbge: string;
  nome: string;
  populacao: number;
  receitaTotal: number;
  perCapita: number;
};

const MapaReceitaPerCapitaContent = dynamic(
  () => import("./MapaReceitaPerCapitaContent"),
  { ssr: false },
);

export default function MapaReceitaPerCapita({ dados }: { dados: Record<string, ReceitaPerCapitaItem> }) {
  return <MapaReceitaPerCapitaContent dados={dados} />;
}

