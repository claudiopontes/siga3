"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import type { GeoJsonObject, Geometry, Feature } from "geojson";
import type { Layer, Path, LeafletMouseEvent } from "leaflet";
import "leaflet/dist/leaflet.css";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type MunicipioBase = {
  nome: string;
  codIBGE: string;
  lat: number;
  lng: number;
};

interface Props {
  onSelect?: (municipio: MunicipioBase | null) => void;
  /** Município pré-selecionado ao montar o componente */
  defaultValue?: string; // codIBGE
}

type AcreFeature = Feature<Geometry, { codarea?: string }>;

// ---------------------------------------------------------------------------
// Lista de municípios do Acre
// ---------------------------------------------------------------------------

const municipios: MunicipioBase[] = [
  { nome: "Acrelândia",           codIBGE: "1200013", lat: -9.9936,  lng: -66.8969 },
  { nome: "Assis Brasil",         codIBGE: "1200054", lat: -10.9358, lng: -69.5733 },
  { nome: "Brasileia",            codIBGE: "1200104", lat: -11.0089, lng: -68.7411 },
  { nome: "Bujari",               codIBGE: "1200138", lat: -9.8272,  lng: -67.9519 },
  { nome: "Capixaba",             codIBGE: "1200179", lat: -10.5597, lng: -67.6908 },
  { nome: "Cruzeiro do Sul",      codIBGE: "1200203", lat: -7.6307,  lng: -72.6732 },
  { nome: "Epitaciolândia",       codIBGE: "1200252", lat: -11.0233, lng: -68.7239 },
  { nome: "Feijó",                codIBGE: "1200302", lat: -8.1614,  lng: -70.3533 },
  { nome: "Jordão",               codIBGE: "1200328", lat: -9.1658,  lng: -71.8964 },
  { nome: "Mâncio Lima",          codIBGE: "1200336", lat: -7.6178,  lng: -72.8964 },
  { nome: "Manoel Urbano",        codIBGE: "1200344", lat: -8.8369,  lng: -69.2578 },
  { nome: "Marechal Thaumaturgo", codIBGE: "1200351", lat: -8.9361,  lng: -72.7914 },
  { nome: "Plácido de Castro",    codIBGE: "1200385", lat: -10.3322, lng: -67.1808 },
  { nome: "Porto Acre",           codIBGE: "1200393", lat: -9.5836,  lng: -67.5344 },
  { nome: "Porto Walter",         codIBGE: "1200407", lat: -8.2694,  lng: -72.7503 },
  { nome: "Rio Branco",           codIBGE: "1200401", lat: -9.9754,  lng: -67.8249 },
  { nome: "Rodrigues Alves",      codIBGE: "1200427", lat: -7.7367,  lng: -72.6461 },
  { nome: "Santa Rosa do Purus",  codIBGE: "1200435", lat: -9.4744,  lng: -70.5197 },
  { nome: "Sena Madureira",       codIBGE: "1200500", lat: -9.0659,  lng: -68.6578 },
  { nome: "Senador Guiomard",     codIBGE: "1200450", lat: -10.1536, lng: -67.7375 },
  { nome: "Tarauacá",             codIBGE: "1200609", lat: -8.1608,  lng: -70.7739 },
  { nome: "Xapuri",               codIBGE: "1200708", lat: -10.6519, lng: -68.5011 },
];

const municipioByCode = Object.fromEntries(municipios.map((m) => [m.codIBGE, m]));

// Limites geográficos do Acre (SW → NE)
const ACRE_BOUNDS: [[number, number], [number, number]] = [
  [-11.15, -73.95],
  [-7.10,  -66.60],
];

// Centraliza o mapa no Acre e foca o container (resolve o duplo clique)
function InicializarMapa() {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(ACRE_BOUNDS, { padding: [24, 24] });
    map.getContainer().focus();
  }, [map]);
  return null;
}

// ---------------------------------------------------------------------------
// Estilos do mapa
// ---------------------------------------------------------------------------

const STYLE_DEFAULT = {
  fillColor: "#94a3b8",
  weight: 1,
  color: "#ffffff",
  fillOpacity: 0.6,
};

const STYLE_HOVER = {
  fillColor: "#64748b",
  weight: 2,
  color: "#ffffff",
  fillOpacity: 0.8,
};

const STYLE_SELECTED = {
  fillColor: "#3b82f6",
  weight: 2.5,
  color: "#1d4ed8",
  fillOpacity: 0.85,
};

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export default function SeletorMunicipio({ onSelect, defaultValue }: Props) {
  const [selected, setSelected] = useState<MunicipioBase | null>(
    () => (defaultValue ? (municipioByCode[defaultValue] ?? null) : null)
  );
  const [busca, setBusca] = useState("");
  const [geoData, setGeoData] = useState<GeoJsonObject | null>(null);
  const [loadingGeo, setLoadingGeo] = useState(true);
  const [geoError, setGeoError] = useState(false);

  const selectedRef = useRef<MunicipioBase | null>(selected);
  const layersRef = useRef<Record<string, Path>>({});

  // Busca GeoJSON do IBGE
  useEffect(() => {
    fetch(
      "https://servicodados.ibge.gov.br/api/v3/malhas/estados/12?intrarregiao=municipio&formato=application/vnd.geo+json"
    )
      .then((r) => {
        if (!r.ok) throw new Error();
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

  // Aplica estilo inicial ao município com defaultValue
  useEffect(() => {
    if (!selected) return;
    const layer = layersRef.current[selected.codIBGE];
    if (layer) layer.setStyle(STYLE_SELECTED);
  }, [geoData, selected]); // roda após o GeoJSON ser carregado

  const handleSelect = useCallback(
    (municipio: MunicipioBase) => {
      // Remove estilo do anterior
      if (selectedRef.current) {
        const prev = layersRef.current[selectedRef.current.codIBGE];
        if (prev) prev.setStyle(STYLE_DEFAULT);
      }
      // Aplica estilo no novo
      const layer = layersRef.current[municipio.codIBGE];
      if (layer) layer.setStyle(STYLE_SELECTED);

      selectedRef.current = municipio;
      setSelected(municipio);
      onSelect?.(municipio);
    },
    [onSelect]
  );

  const handleDeselect = useCallback(() => {
    if (selectedRef.current) {
      const prev = layersRef.current[selectedRef.current.codIBGE];
      if (prev) prev.setStyle(STYLE_DEFAULT);
    }
    selectedRef.current = null;
    setSelected(null);
    onSelect?.(null);
  }, [onSelect]);

  const onEachFeature = useCallback(
    (feature: AcreFeature, layer: Layer) => {
      const cod = feature?.properties?.codarea;
      if (!cod) return;
      const municipio = municipioByCode[cod];
      if (!municipio) return;

      const pathLayer = layer as Path;
      layersRef.current[municipio.codIBGE] = pathLayer;

      pathLayer.bindTooltip(municipio.nome, { sticky: true, opacity: 0.9 });

      pathLayer.on({
        click: () => handleSelect(municipio),
        mouseover: (e: LeafletMouseEvent) => {
          if (selectedRef.current?.codIBGE !== municipio.codIBGE) {
            (e.target as Path).setStyle(STYLE_HOVER);
            (e.target as Path).bringToFront();
          }
        },
        mouseout: (e: LeafletMouseEvent) => {
          if (selectedRef.current?.codIBGE !== municipio.codIBGE) {
            (e.target as Path).setStyle(STYLE_DEFAULT);
          }
        },
      });
    },
    [handleSelect]
  );

  const municipiosFiltrados = municipios.filter((m) =>
    m.nome.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div className="flex h-full min-h-[500px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
      {/* ------------------------------------------------------------------ */}
      {/* Painel lateral — lista de municípios                                */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex w-64 shrink-0 flex-col border-r border-gray-200 dark:border-gray-700">
        {/* Cabeçalho */}
        <div className="border-b border-gray-200 p-4 dark:border-gray-700">
          <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
            Selecionar Município
          </h2>
          {/* Busca */}
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Buscar município..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-8 pr-3 text-xs text-gray-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
            />
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {municipiosFiltrados.length === 0 ? (
            <p className="p-4 text-xs text-gray-400">Nenhum município encontrado.</p>
          ) : (
            municipiosFiltrados.map((m) => {
              const isSelected = selected?.codIBGE === m.codIBGE;
              return (
                <button
                  key={m.codIBGE}
                  onClick={() => handleSelect(m)}
                  className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors ${
                    isSelected
                      ? "bg-blue-50 font-semibold text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                      : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                  }`}
                >
                  {isSelected && (
                    <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                  )}
                  {!isSelected && (
                    <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-transparent" />
                  )}
                  {m.nome}
                </button>
              );
            })
          )}
        </div>

        {/* Rodapé — município selecionado */}
        <div className="border-t border-gray-200 p-4 dark:border-gray-700">
          {selected ? (
            <div>
              <p className="mb-1 text-xs text-gray-400">Selecionado</p>
              <p className="text-sm font-semibold text-gray-800 dark:text-white">{selected.nome}</p>
              <p className="mt-0.5 font-mono text-xs text-gray-400">{selected.codIBGE}</p>
              <button
                onClick={handleDeselect}
                className="mt-2 text-xs text-red-400 hover:text-red-600"
              >
                Limpar seleção
              </button>
            </div>
          ) : (
            <p className="text-xs text-gray-400">Nenhum município selecionado.</p>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Mapa                                                                 */}
      {/* ------------------------------------------------------------------ */}
      <div className="relative flex-1">
        {/* Loading */}
        {loadingGeo && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 dark:bg-gray-900/80">
            <div className="flex flex-col items-center gap-3">
              <div className="h-7 w-7 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
              <p className="text-xs text-gray-500">Carregando mapa...</p>
            </div>
          </div>
        )}

        {/* Erro */}
        {geoError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/90">
            <p className="text-sm text-red-500">Não foi possível carregar os limites municipais.</p>
          </div>
        )}

        <MapContainer
          center={[-9.0, -70.0]}
          zoom={6}
          style={{ height: "100%", width: "100%" }}
          zoomControl={true}
        >
          <InicializarMapa />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            opacity={0.5}
          />
          {geoData && (
            <GeoJSON
              key="seletor-municipios"
              data={geoData}
              style={() => STYLE_DEFAULT}
              onEachFeature={onEachFeature}
            />
          )}
        </MapContainer>

        {/* Badge do selecionado sobreposto ao mapa */}
        {selected && (
          <div className="pointer-events-none absolute bottom-4 right-4 z-10 rounded-lg bg-blue-600 px-4 py-2 shadow-lg">
            <p className="text-sm font-semibold text-white">{selected.nome}</p>
          </div>
        )}
      </div>
    </div>
  );
}
