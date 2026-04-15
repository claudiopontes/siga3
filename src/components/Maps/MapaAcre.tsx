"use client";

import dynamic from "next/dynamic";

const MapaAcreContent = dynamic(() => import("./MapaAcreContent"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <p className="text-gray-500">Carregando mapa...</p>
    </div>
  ),
});

export default function MapaAcre() {
  return <MapaAcreContent />;
}
