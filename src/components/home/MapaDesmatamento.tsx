"use client";

import dynamic from "next/dynamic";
import type { MunicipioSelecionado } from "./MapaDesmatamentoContent";

const MapaDesmatamentoContent = dynamic(
  () => import("./MapaDesmatamentoContent"),
  {
    ssr: false,
    loading: () => (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5" style={{ height: 530 }}>
        <div className="h-4 w-56 bg-gray-200 dark:bg-gray-700 rounded mb-2 animate-pulse" />
        <div className="h-3 w-80 bg-gray-100 dark:bg-gray-600 rounded mb-4 animate-pulse" />
        <div className="rounded-lg animate-pulse bg-gray-100 dark:bg-gray-700" style={{ height: 320 }} />
      </div>
    ),
  }
);

interface Props {
  onSelect?: (municipio: MunicipioSelecionado | null) => void;
  municipioSelecionado?: MunicipioSelecionado | null;
}

export default function MapaDesmatamento({ onSelect, municipioSelecionado }: Props) {
  return <MapaDesmatamentoContent onSelect={onSelect} municipioSelecionado={municipioSelecionado} />;
}

export type { MunicipioSelecionado };
