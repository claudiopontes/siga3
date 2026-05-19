"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { EscolaPonto } from "./MapaEscolasContent";

interface Props {
  escolas: EscolaPonto[];
  onSelect?: (e: EscolaPonto | null) => void;
}

const MapaEscolasContent = dynamic<Props>(
  () => import("./MapaEscolasContent") as Promise<{ default: ComponentType<Props> }>,
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-gray-50 dark:bg-gray-800">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
          <p className="text-sm text-gray-500">Carregando mapa de escolas...</p>
        </div>
      </div>
    ),
  },
);

export default function MapaEscolas(props: Props) {
  return <MapaEscolasContent {...props} />;
}
