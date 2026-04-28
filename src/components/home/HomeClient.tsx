"use client";

import { useState } from "react";
import Image from "next/image";
import MapaDesmatamento, { type MunicipioSelecionado } from "./MapaDesmatamento";
import GraficoDesmatamento from "./GraficoDesmatamento";
import GraficoCobertura from "./GraficoCobertura";

export default function HomeClient() {
  const [municipioSelecionado, setMunicipioSelecionado] = useState<MunicipioSelecionado | null>(null);

  return (
    <div className="flex flex-col gap-4">
      {/* Linha 1: imagem + cobertura florestal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:items-stretch">
        <div className="flex items-center justify-start p-2 sm:p-3">
          <Image
            src="/images/logo/varadouro-digital.png"
            alt="Varadouro Digital"
            width={256}
            height={192}
            className="object-contain"
            priority
            unoptimized
          />
        </div>
        <GraficoCobertura municipioSelecionado={municipioSelecionado} />
      </div>

      {/* Linha 2: mapa + desmatamento */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:items-stretch">
        <MapaDesmatamento
          onSelect={setMunicipioSelecionado}
          municipioSelecionado={municipioSelecionado}
        />
        <GraficoDesmatamento municipioSelecionado={municipioSelecionado} />
      </div>
    </div>
  );
}
