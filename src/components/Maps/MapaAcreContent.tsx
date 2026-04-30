"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import type { GeoJsonObject, Geometry, Feature } from "geojson";
import type { Layer, Path, LeafletMouseEvent } from "leaflet";
import "leaflet/dist/leaflet.css";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type Municipio = {
  nome: string;
  codIBGE: string;
  lat: number;
  lng: number;
  ideb: number;
  populacao: number;
};

interface Props {
  onSelect?: (municipio: Municipio | null) => void;
}

type AcreFeature = Feature<Geometry, { codarea?: string }>;

// ---------------------------------------------------------------------------
// Dados dos municípios do Acre
// ---------------------------------------------------------------------------

const municipiosAcre: Municipio[] = [
  { nome: "Rio Branco",           codIBGE: "1200401", lat: -9.9754,  lng: -67.8249, ideb: 5.2, populacao: 419452 },
  { nome: "Cruzeiro do Sul",      codIBGE: "1200203", lat: -7.6307,  lng: -72.6732, ideb: 4.8, populacao: 85036  },
  { nome: "Sena Madureira",       codIBGE: "1200500", lat: -9.0659,  lng: -68.6578, ideb: 4.3, populacao: 44928  },
  { nome: "Tarauacá",             codIBGE: "1200609", lat: -8.1608,  lng: -70.7739, ideb: 4.1, populacao: 40330  },
  { nome: "Feijó",                codIBGE: "1200302", lat: -8.1614,  lng: -70.3533, ideb: 4.5, populacao: 35354  },
  { nome: "Brasileia",            codIBGE: "1200104", lat: -11.0089, lng: -68.7411, ideb: 5.0, populacao: 26676  },
  { nome: "Epitaciolândia",       codIBGE: "1200252", lat: -11.0233, lng: -68.7239, ideb: 4.7, populacao: 16634  },
  { nome: "Xapuri",               codIBGE: "1200708", lat: -10.6519, lng: -68.5011, ideb: 4.9, populacao: 18523  },
  { nome: "Plácido de Castro",    codIBGE: "1200385", lat: -10.3322, lng: -67.1808, ideb: 4.6, populacao: 18945  },
  { nome: "Acrelândia",           codIBGE: "1200013", lat: -9.9936,  lng: -66.8969, ideb: 5.1, populacao: 14369  },
  { nome: "Senador Guiomard",     codIBGE: "1200450", lat: -10.1536, lng: -67.7375, ideb: 4.8, populacao: 22081  },
  { nome: "Porto Acre",           codIBGE: "1200393", lat: -9.5836,  lng: -67.5344, ideb: 4.4, populacao: 17533  },
  { nome: "Bujari",               codIBGE: "1200138", lat: -9.8272,  lng: -67.9519, ideb: 4.2, populacao: 9024   },
  { nome: "Capixaba",             codIBGE: "1200179", lat: -10.5597, lng: -67.6908, ideb: 4.6, populacao: 8798   },
  { nome: "Mâncio Lima",          codIBGE: "1200336", lat: -7.6178,  lng: -72.8964, ideb: 3.9, populacao: 16482  },
  { nome: "Rodrigues Alves",      codIBGE: "1200427", lat: -7.7367,  lng: -72.6461, ideb: 4.0, populacao: 15451  },
  { nome: "Porto Walter",         codIBGE: "1200407", lat: -8.2694,  lng: -72.7503, ideb: 3.8, populacao: 10617  },
  { nome: "Marechal Thaumaturgo", codIBGE: "1200351", lat: -8.9361,  lng: -72.7914, ideb: 3.7, populacao: 16973  },
  { nome: "Jordão",               codIBGE: "1200328", lat: -9.1658,  lng: -71.8964, ideb: 3.6, populacao: 7026   },
  { nome: "Santa Rosa do Purus",  codIBGE: "1200435", lat: -9.4744,  lng: -70.5197, ideb: 3.5, populacao: 5841   },
  { nome: "Manoel Urbano",        codIBGE: "1200344", lat: -8.8369,  lng: -69.2578, ideb: 4.0, populacao: 8004   },
  { nome: "Assis Brasil",         codIBGE: "1200054", lat: -10.9358, lng: -69.5733, ideb: 4.3, populacao: 7408   },
];

const municipioByCode = Object.fromEntries(municipiosAcre.map((m) => [m.codIBGE, m]));

// ---------------------------------------------------------------------------
// Helpers de estilo
// ---------------------------------------------------------------------------

function getColor(ideb: number): string {
  if (ideb >= 5.0) return "#22c55e";
  if (ideb >= 4.5) return "#84cc16";
  if (ideb >= 4.0) return "#eab308";
  if (ideb >= 3.5) return "#f97316";
  return "#ef4444";
}

function buildStyle(ideb: number, isSelected: boolean) {
  return {
    fillColor: getColor(ideb),
    weight: isSelected ? 3 : 1,
    color: isSelected ? "#1d4ed8" : "#ffffff",
    fillOpacity: isSelected ? 0.92 : 0.72,
  };
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export default function MapaAcreContent({ onSelect }: Props = {}) {
  const [viewMode, setViewMode] = useState<"mapa" | "lista">("mapa");
  const [selected, setSelected] = useState<Municipio | null>(null);
  const [geoData, setGeoData] = useState<GeoJsonObject | null>(null);
  const [loadingGeo, setLoadingGeo] = useState(true);
  const [geoError, setGeoError] = useState(false);

  // Refs para manipular layers diretamente sem re-render do GeoJSON
  const selectedRef = useRef<Municipio | null>(null);
  const layersRef = useRef<Record<string, Path>>({});

  // Busca os polígonos reais dos municípios no IBGE
  useEffect(() => {
    fetch(
      "https://servicodados.ibge.gov.br/api/v3/malhas/estados/12?intrarregiao=municipio&formato=application/vnd.geo+json"
    )
      .then((r) => {
        if (!r.ok) throw new Error("Falha ao buscar GeoJSON");
        return r.json();
      })
      .then((data) => {
        setGeoData(data);
        setLoadingGeo(false);
      })
      .catch(() => {
        setGeoError(true);
        setLoadingGeo(false);
      });
  }, []);

  const handleSelect = useCallback(
    (municipio: Municipio) => {
      // Remove destaque do município anterior
      if (selectedRef.current) {
        const prev = layersRef.current[selectedRef.current.codIBGE];
        if (prev) prev.setStyle(buildStyle(selectedRef.current.ideb, false));
      }
      // Aplica destaque no novo selecionado
      const layer = layersRef.current[municipio.codIBGE];
      if (layer) layer.setStyle(buildStyle(municipio.ideb, true));

      selectedRef.current = municipio;
      setSelected(municipio);
      onSelect?.(municipio);
    },
    [onSelect]
  );

  const handleDeselect = useCallback(() => {
    if (selectedRef.current) {
      const prev = layersRef.current[selectedRef.current.codIBGE];
      if (prev) prev.setStyle(buildStyle(selectedRef.current.ideb, false));
    }
    selectedRef.current = null;
    setSelected(null);
    onSelect?.(null);
  }, [onSelect]);

  // Estilo inicial de cada feature
  const styleFeature = useCallback((feature?: AcreFeature) => {
    const cod = feature?.properties?.codarea;
    const municipio = cod ? municipioByCode[cod] : undefined;
    return buildStyle(municipio?.ideb ?? 3.0, false);
  }, []);

  // Registra handlers em cada polígono
  const onEachFeature = useCallback(
    (feature: AcreFeature, layer: Layer) => {
      const cod = feature?.properties?.codarea;
      if (!cod) return;
      const municipio = municipioByCode[cod];
      if (!municipio) return;

      const pathLayer = layer as Path;
      layersRef.current[municipio.codIBGE] = pathLayer;

      pathLayer.bindTooltip(municipio.nome, { sticky: true, opacity: 0.95 });

      pathLayer.on({
        click: () => handleSelect(municipio),
        mouseover: (e: LeafletMouseEvent) => {
          if (selectedRef.current?.codIBGE !== municipio.codIBGE) {
            (e.target as Path).setStyle({ fillOpacity: 0.88, weight: 2, color: "#94a3b8" });
          }
        },
        mouseout: (e: LeafletMouseEvent) => {
          if (selectedRef.current?.codIBGE !== municipio.codIBGE) {
            (e.target as Path).setStyle(buildStyle(municipio.ideb, false));
          }
        },
      });
    },
    [handleSelect]
  );

  return (
    <div className="-m-4 md:-m-6 flex h-[calc(100vh-76px)] flex-col bg-gray-50 dark:bg-gray-900">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-white">
            IDEB Acre
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Clique em um município para selecioná-lo
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Toggle de visualização */}
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-100 p-1 dark:border-gray-600 dark:bg-gray-700">
            <button
              onClick={() => setViewMode("mapa")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-all ${
                viewMode === "mapa"
                  ? "bg-white text-blue-600 shadow dark:bg-gray-600 dark:text-blue-400"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
              }`}
            >
              Mapa
            </button>
            <button
              onClick={() => setViewMode("lista")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-all ${
                viewMode === "lista"
                  ? "bg-white text-blue-600 shadow dark:bg-gray-600 dark:text-blue-400"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
              }`}
            >
              Ranking
            </button>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Conteúdo                                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-1 overflow-hidden">
        {/* ---- Mapa ---- */}
        {viewMode === "mapa" && (
          <div className="relative flex-1">
            {/* Loading */}
            {loadingGeo && (
              <div className="absolute inset-0 z-1000 flex items-center justify-center bg-white/80 dark:bg-gray-900/80">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
                  <p className="text-sm text-gray-500">Carregando mapa do IBGE...</p>
                </div>
              </div>
            )}

            {/* Erro */}
            {geoError && (
              <div className="absolute inset-0 z-1000 flex items-center justify-center bg-white/90">
                <p className="text-sm text-red-500">
                  Não foi possível carregar os limites municipais.
                </p>
              </div>
            )}

            <MapContainer
              center={[-9.0, -70.0]}
              zoom={7}
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
                  key="acre-municipios"
                  data={geoData}
                  style={styleFeature}
                  onEachFeature={onEachFeature}
                />
              )}
            </MapContainer>

            {/* Legenda */}
            <div className="absolute bottom-6 left-4 z-1000 rounded-lg bg-white p-3 shadow-lg dark:bg-gray-800">
              <p className="mb-2 text-xs font-semibold text-gray-600 dark:text-gray-300">IDEB</p>
              {[
                { label: "≥ 5.0", color: "#22c55e" },
                { label: "4.5 – 4.9", color: "#84cc16" },
                { label: "4.0 – 4.4", color: "#eab308" },
                { label: "3.5 – 3.9", color: "#f97316" },
                { label: "< 3.5",  color: "#ef4444" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300"
                >
                  <span
                    className="inline-block h-3 w-3 rounded-sm border border-white/50"
                    style={{ backgroundColor: item.color }}
                  />
                  {item.label}
                </div>
              ))}
            </div>

            {/* Painel do município selecionado */}
            {selected && (
              <div className="absolute right-4 top-4 z-1000 w-64 rounded-xl bg-white p-4 shadow-xl dark:bg-gray-800">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-bold text-gray-800 dark:text-white">{selected.nome}</h3>
                  <button
                    onClick={handleDeselect}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                  <div className="flex items-center justify-between">
                    <span>IDEB</span>
                    <strong style={{ color: getColor(selected.ideb) }}>{selected.ideb}</strong>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{
                        width: `${(selected.ideb / 10) * 100}%`,
                        backgroundColor: getColor(selected.ideb),
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span>População</span>
                    <strong>{selected.populacao.toLocaleString("pt-BR")}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Cód. IBGE</span>
                    <strong className="font-mono text-xs">{selected.codIBGE}</strong>
                  </div>
                </div>

                {/* Área para ações futuras */}
                <div className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-700">
                  <p className="text-xs text-gray-400">Ações para {selected.nome}</p>
                  <div className="mt-2 space-y-2">
                    <button className="w-full rounded-lg bg-blue-50 px-3 py-2 text-left text-xs font-medium text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400">
                      Ver detalhes →
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ---- Ranking ---- */}
        {viewMode === "lista" && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mx-auto max-w-2xl">
              <h2 className="mb-4 text-lg font-semibold text-gray-700 dark:text-gray-200">
                Ranking IDEB — {municipiosAcre.length} municípios
              </h2>
              <div className="space-y-2">
                {[...municipiosAcre]
                  .sort((a, b) => b.ideb - a.ideb)
                  .map((m, i) => (
                    <button
                      key={m.codIBGE}
                      onClick={() => handleSelect(m)}
                      className={`flex w-full items-center gap-4 rounded-lg p-3 shadow-sm transition-colors ${
                        selected?.codIBGE === m.codIBGE
                          ? "bg-blue-50 ring-1 ring-blue-300 dark:bg-blue-900/20"
                          : "bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700"
                      }`}
                    >
                      <span className="w-6 text-center text-sm font-bold text-gray-400">
                        #{i + 1}
                      </span>
                      <span
                        className="h-4 w-4 shrink-0 rounded-sm border border-white/50"
                        style={{ backgroundColor: getColor(m.ideb) }}
                      />
                      <span className="flex-1 text-left text-sm font-medium text-gray-700 dark:text-gray-200">
                        {m.nome}
                      </span>
                      <div className="w-32">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                          <div
                            className="h-2 rounded-full"
                            style={{
                              width: `${(m.ideb / 6) * 100}%`,
                              backgroundColor: getColor(m.ideb),
                            }}
                          />
                        </div>
                      </div>
                      <span
                        className="w-10 text-right text-sm font-bold"
                        style={{ color: getColor(m.ideb) }}
                      >
                        {m.ideb}
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
