"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { Municipio, DadosMunicipioIdeb } from "@/components/Maps/MapaAcreContent";

interface Props {
  dados?: Record<string, DadosMunicipioIdeb>;
  etapa?: "composite" | "AI" | "AF" | "EM";
  onSelect?: (m: Municipio | null) => void;
}

// dynamic import com ssr: false — padrão obrigatório para componentes Leaflet
const MapaAcreContent = dynamic<Props>(
  () => import("@/components/Maps/MapaAcreContent") as Promise<{ default: ComponentType<Props> }>,
  { ssr: false, loading: () => (
    <div className="flex h-full items-center justify-center bg-gray-50 dark:bg-gray-800">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
        <p className="text-sm text-gray-500">Carregando mapa...</p>
      </div>
    </div>
  ) },
);

export default function MapaEducacao(props: Props) {
  return <MapaAcreContent {...props} />;
}
