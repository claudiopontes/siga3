"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface EscolaPonto {
  cod_escola: number;
  nome: string | null;
  cod_municipio: number | null;
  no_municipio: string | null;
  dependencia: string | null;
  localizacao: string | null;
  porte: string | null;
  etapas_atendidas: string | null;
  situacao: string | null;
  endereco: string | null;
  latitude: number | null;
  longitude: number | null;
  edicao_ideb: number | null;
  ideb_ai: number | null; meta_ai: number | null;
  ideb_af: number | null; meta_af: number | null;
  ideb_em: number | null; meta_em: number | null;
  ideb_composite: number | null;
}

interface Props {
  escolas: EscolaPonto[];
  onSelect?: (e: EscolaPonto | null) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const COR_SEM_DADO = "#94a3b8";

function getColor(ideb: number | null): string {
  if (ideb === null) return COR_SEM_DADO;
  if (ideb >= 5.0) return "#22c55e";
  if (ideb >= 4.5) return "#84cc16";
  if (ideb >= 4.0) return "#eab308";
  if (ideb >= 3.5) return "#f97316";
  return "#ef4444";
}

function fmt(n: number | null, dec = 1): string {
  if (n === null) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export default function MapaEscolasContent({ escolas, onSelect }: Props) {
  const mapRef = useRef<LeafletMap | null>(null);

  // Filtra escolas com coordenadas válidas
  const pontos = useMemo(
    () => escolas.filter((e) => e.latitude !== null && e.longitude !== null),
    [escolas],
  );

  // Centro automático com base nos pontos (se houver) ou fallback Acre
  const center: [number, number] = useMemo(() => {
    if (!pontos.length) return [-9.0, -70.0];
    const lat = pontos.reduce((a, p) => a + (p.latitude as number), 0) / pontos.length;
    const lng = pontos.reduce((a, p) => a + (p.longitude as number), 0) / pontos.length;
    return [lat, lng];
  }, [pontos]);

  // Fit bounds quando escolas mudam (filtros aplicados)
  useEffect(() => {
    if (!mapRef.current || !pontos.length) return;
    const lats = pontos.map((p) => p.latitude as number);
    const lngs = pontos.map((p) => p.longitude as number);
    const sw: [number, number] = [Math.min(...lats), Math.min(...lngs)];
    const ne: [number, number] = [Math.max(...lats), Math.max(...lngs)];
    mapRef.current.fitBounds([sw, ne], { padding: [30, 30], maxZoom: 11 });
  }, [pontos]);

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={center}
        zoom={7}
        style={{ height: "100%", width: "100%" }}
        zoomControl={true}
        ref={(instance) => { mapRef.current = instance; }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          opacity={0.7}
        />
        {pontos.map((e) => {
          const ideb = e.ideb_composite;
          return (
            <CircleMarker
              key={e.cod_escola}
              center={[e.latitude as number, e.longitude as number]}
              radius={ideb !== null ? 6 : 4}
              pathOptions={{
                color: "#ffffff",
                weight: 1,
                fillColor: getColor(ideb),
                fillOpacity: ideb !== null ? 0.85 : 0.5,
              }}
              eventHandlers={{ click: () => onSelect?.(e) }}
            >
              <Popup closeButton={false} autoPan={false}>
                <div className="text-xs">
                  <p className="font-bold text-gray-900">{e.nome ?? "(sem nome)"}</p>
                  <p className="text-gray-500">{e.no_municipio} · {e.dependencia ?? "—"} · {e.localizacao ?? "—"}</p>
                  <div className="mt-1 grid grid-cols-3 gap-2">
                    <div><span className="text-gray-400">AI</span> <strong style={{ color: getColor(e.ideb_ai) }}>{fmt(e.ideb_ai)}</strong></div>
                    <div><span className="text-gray-400">AF</span> <strong style={{ color: getColor(e.ideb_af) }}>{fmt(e.ideb_af)}</strong></div>
                    <div><span className="text-gray-400">EM</span> <strong style={{ color: getColor(e.ideb_em) }}>{fmt(e.ideb_em)}</strong></div>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* Legenda */}
      <div className="absolute bottom-3 left-3 z-1000 rounded-lg bg-white p-2 shadow-md dark:bg-gray-800">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          IDEB (média)
        </p>
        {[
          { label: "≥ 5.0",     color: "#22c55e" },
          { label: "4.5–4.9",   color: "#84cc16" },
          { label: "4.0–4.4",   color: "#eab308" },
          { label: "3.5–3.9",   color: "#f97316" },
          { label: "< 3.5",     color: "#ef4444" },
          { label: "Sem dado",  color: COR_SEM_DADO },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-300">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </div>
        ))}
      </div>

      {/* Contador */}
      <div className="absolute top-3 right-3 z-1000 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-md dark:bg-gray-800 dark:text-gray-200">
        {pontos.length} de {escolas.length} escolas no mapa
        {escolas.length > pontos.length && (
          <span className="ml-1 text-[10px] text-gray-400">({escolas.length - pontos.length} sem geo)</span>
        )}
      </div>
    </div>
  );
}
