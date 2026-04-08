"use client";

import SeletorMunicipio, { type MunicipioBase } from "@/components/Maps/SeletorMunicipioWrapper";
import { useState } from "react";

export default function SeletorMunicipioPage() {
  const [municipio, setMunicipio] = useState<MunicipioBase | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
          Selecionar Município
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Clique no mapa ou use a lista para selecionar um município do Acre.
        </p>
      </div>

      <div className="h-[calc(100vh-220px)]">
        <SeletorMunicipio onSelect={setMunicipio} />
      </div>

      {municipio && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm dark:border-blue-800 dark:bg-blue-900/20">
          <span className="text-blue-500 dark:text-blue-400">Município selecionado: </span>
          <strong className="text-blue-700 dark:text-blue-300">{municipio.nome}</strong>
          <span className="ml-2 font-mono text-xs text-blue-400">({municipio.codIBGE})</span>
        </div>
      )}
    </div>
  );
}
