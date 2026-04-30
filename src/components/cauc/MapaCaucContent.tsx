"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import type { GeoJsonObject, Geometry, Feature } from "geojson";
import type { Layer, Path, LeafletMouseEvent } from "leaflet";
import "leaflet/dist/leaflet.css";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type AlertaMapRow = {
  codigo_ibge: string;
  nome_ente: string;
  total_itens: number;
  total_pendencias: number;
  total_regulares: number;
  nivel_alerta: string;
};

interface Props {
  dados: Record<string, AlertaMapRow>;
  onSelect?: (row: AlertaMapRow | null) => void;
  bloqueado?: boolean;
}

type AcreFeature = Feature<Geometry, { codarea?: string }>;

// ─── Escala de cor: 0 pendências = verde, mais = vermelho ──────────��────────

function getColor(pendencias: number, maxPendencias: number): string {
  if (pendencias === 0) return "#22c55e";
  const ratio = Math.min(pendencias / Math.max(maxPendencias, 1), 1);
  // Interpola verde → amarelo → laranja → vermelho
  if (ratio < 0.25) return "#a3e635";
  if (ratio < 0.5)  return "#eab308";
  if (ratio < 0.75) return "#f97316";
  return "#ef4444";
}

function buildStyle(pendencias: number, maxPendencias: number, isSelected: boolean) {
  return {
    fillColor: getColor(pendencias, maxPendencias),
    weight: isSelected ? 3 : 1,
    color: isSelected ? "#1d4ed8" : "#ffffff",
    fillOpacity: isSelected ? 0.95 : 0.75,
  };
}

// ─── Componente ─────────────────────────────���──────────────────────────��─────

export default function MapaCaucContent({ dados, onSelect, bloqueado = false }: Props) {
  const [geoData, setGeoData] = useState<GeoJsonObject | null>(null);
  const [loadingGeo, setLoadingGeo] = useState(true);
  const [geoError, setGeoError] = useState(false);
  const [selected, setSelected] = useState<AlertaMapRow | null>(null);

  const selectedRef = useRef<AlertaMapRow | null>(null);
  const layersRef = useRef<Record<string, Path>>({});

  const maxPendencias = Math.max(1, ...Object.values(dados).map((d) => d.total_pendencias));

  // Quando o mapa é bloqueado (modal aberto), limpa o painel interno de seleção
  // sem disparar onSelect para não criar loop com o pai.
  useEffect(() => {
    if (bloqueado && selectedRef.current) {
      const prev = layersRef.current[selectedRef.current.codigo_ibge];
      if (prev) prev.setStyle(buildStyle(selectedRef.current.total_pendencias, maxPendencias, false));
      selectedRef.current = null;
      setSelected(null);
    }
  }, [bloqueado, maxPendencias]);

  useEffect(() => {
    fetch(
      "https://servicodados.ibge.gov.br/api/v3/malhas/estados/12?intrarregiao=municipio&formato=application/vnd.geo+json"
    )
      .then((r) => {
        if (!r.ok) throw new Error("Falha ao buscar GeoJSON");
        return r.json();
      })
      .then((data) => { setGeoData(data); setLoadingGeo(false); })
      .catch(() => { setGeoError(true); setLoadingGeo(false); });
  }, []);

  const handleSelect = useCallback(
    (row: AlertaMapRow) => {
      if (selectedRef.current) {
        const prev = layersRef.current[selectedRef.current.codigo_ibge];
        if (prev) prev.setStyle(buildStyle(selectedRef.current.total_pendencias, maxPendencias, false));
      }
      const layer = layersRef.current[row.codigo_ibge];
      if (layer) layer.setStyle(buildStyle(row.total_pendencias, maxPendencias, true));
      selectedRef.current = row;
      setSelected(row);
      onSelect?.(row);
    },
    [maxPendencias, onSelect],
  );

  const handleDeselect = useCallback(() => {
    if (selectedRef.current) {
      const prev = layersRef.current[selectedRef.current.codigo_ibge];
      if (prev) prev.setStyle(buildStyle(selectedRef.current.total_pendencias, maxPendencias, false));
    }
    selectedRef.current = null;
    setSelected(null);
    onSelect?.(null);
  }, [maxPendencias, onSelect]);

  const styleFeature = useCallback(
    (feature?: AcreFeature) => {
      const cod = feature?.properties?.codarea;
      const row = cod ? dados[cod] : undefined;
      return buildStyle(row?.total_pendencias ?? 0, maxPendencias, false);
    },
    [dados, maxPendencias],
  );

  const onEachFeature = useCallback(
    (feature: AcreFeature, layer: Layer) => {
      const cod = feature?.properties?.codarea;
      if (!cod) return;
      const row = dados[cod];
      if (!row) return;

      const pathLayer = layer as Path;
      layersRef.current[row.codigo_ibge] = pathLayer;

      const tooltipHtml = `
        <strong>${row.nome_ente}</strong><br/>
        Pendências: <strong style="color:${row.total_pendencias > 0 ? "#ef4444" : "#22c55e"}">${row.total_pendencias}</strong>
        de ${row.total_itens} itens
      `;
      pathLayer.bindTooltip(tooltipHtml, { sticky: true, opacity: 0.97 });

      pathLayer.on({
        click: () => handleSelect(row),
        mouseover: (e: LeafletMouseEvent) => {
          if (selectedRef.current?.codigo_ibge !== row.codigo_ibge) {
            (e.target as Path).setStyle({ fillOpacity: 0.92, weight: 2, color: "#94a3b8" });
          }
        },
        mouseout: (e: LeafletMouseEvent) => {
          if (selectedRef.current?.codigo_ibge !== row.codigo_ibge) {
            (e.target as Path).setStyle(buildStyle(row.total_pendencias, maxPendencias, false));
          }
        },
      });
    },
    [dados, maxPendencias, handleSelect],
  );

  const legendaItems = [
    { label: "0 pendências",  color: "#22c55e" },
    { label: "1 – 25%",       color: "#a3e635" },
    { label: "26 – 50%",      color: "#eab308" },
    { label: "51 – 75%",      color: "#f97316" },
    { label: "76 – 100%",     color: "#ef4444" },
  ];

  return (
    <div className="relative h-full w-full">
      {/* Loading */}
      {loadingGeo && (
        <div className="absolute inset-0 z-1000 flex items-center justify-center bg-white/80 dark:bg-gray-900/80">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
            <p className="text-sm text-gray-500">Carregando mapa...</p>
          </div>
        </div>
      )}

      {/* Erro */}
      {geoError && (
        <div className="absolute inset-0 z-1000 flex items-center justify-center bg-white/90 dark:bg-gray-900/90">
          <p className="text-sm text-red-500">Não foi possível carregar os limites municipais.</p>
        </div>
      )}

      {/* Overlay de bloqueio — impede interação com o mapa enquanto o modal está aberto */}
      {bloqueado && (
        <div className="absolute inset-0 z-1000 cursor-not-allowed" />
      )}

      <MapContainer
        center={[-9.0, -70.0]}
        zoom={7}
        minZoom={7}
        style={{ height: "100%", width: "100%" }}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          opacity={0.5}
        />
        {geoData && (
          <GeoJSON
            key={JSON.stringify(Object.keys(dados))}
            data={geoData}
            style={styleFeature}
            onEachFeature={onEachFeature}
          />
        )}
      </MapContainer>

      {/* Legenda */}
      <div className="absolute bottom-6 left-4 z-1000 rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-800">
        <p className="mb-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
          Pendências CAUC
        </p>
        {legendaItems.map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
            <span
              className="inline-block h-3 w-3 shrink-0 rounded-sm border border-white/50"
              style={{ backgroundColor: item.color }}
            />
            {item.label}
          </div>
        ))}
        <p className="mt-2 text-[10px] text-gray-400">
          Máx. na carga: {maxPendencias} pendência(s)
        </p>
      </div>

      {/* Painel do município selecionado */}
      {selected && (
        <div className="absolute right-4 top-4 z-1000 w-64 rounded-xl border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-3 flex items-start justify-between gap-2">
            <h3 className="font-bold text-gray-800 dark:text-white">{selected.nome_ente}</h3>
            <button
              onClick={handleDeselect}
              className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>

          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
            <div className="flex items-center justify-between">
              <span>Pendências</span>
              <strong style={{ color: getColor(selected.total_pendencias, maxPendencias) }}>
                {selected.total_pendencias}
              </strong>
            </div>

            {/* Barra de progresso */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
              <div
                className="h-2 rounded-full transition-all"
                style={{
                  width: `${(selected.total_pendencias / selected.total_itens) * 100}%`,
                  backgroundColor: getColor(selected.total_pendencias, maxPendencias),
                }}
              />
            </div>

            <div className="flex items-center justify-between">
              <span>Regulares</span>
              <strong className="text-green-600 dark:text-green-400">{selected.total_regulares}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span>Total itens</span>
              <strong className="text-gray-700 dark:text-gray-200">{selected.total_itens}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span>Alerta</span>
              <span className={`font-semibold capitalize ${
                selected.nivel_alerta === "alto" ? "text-red-600 dark:text-red-400"
                : selected.nivel_alerta === "medio" ? "text-yellow-600 dark:text-yellow-400"
                : "text-green-600 dark:text-green-400"
              }`}>
                {selected.nivel_alerta}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
