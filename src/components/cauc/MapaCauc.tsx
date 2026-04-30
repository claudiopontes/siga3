"use client";

import dynamic from "next/dynamic";
import type { AlertaMapRow } from "./MapaCaucContent";

const MapaCaucContent = dynamic(() => import("./MapaCaucContent"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
        <p className="text-sm text-gray-500">Carregando mapa...</p>
      </div>
    </div>
  ),
});

interface Props {
  dados: Record<string, AlertaMapRow>;
  onSelect?: (row: AlertaMapRow | null) => void;
  bloqueado?: boolean;
}

export default function MapaCauc({ dados, onSelect, bloqueado }: Props) {
  return <MapaCaucContent dados={dados} onSelect={onSelect} bloqueado={bloqueado} />;
}
