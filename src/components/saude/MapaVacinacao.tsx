"use client";

import dynamic from "next/dynamic";
import type { VacinacaoMapRow } from "./MapaVacinacaoContent";

const MapaVacinacaoContent = dynamic(() => import("./MapaVacinacaoContent"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
        <p className="text-sm text-gray-500">Carregando mapa...</p>
      </div>
    </div>
  ),
});

interface Props {
  dados: Record<string, VacinacaoMapRow>;
  munSel?: string;
  onSelect?: (nome: string | null) => void;
}

export default function MapaVacinacao({ dados, munSel, onSelect }: Props) {
  return <MapaVacinacaoContent dados={dados} munSel={munSel} onSelect={onSelect} />;
}
