"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import type { Layer, Map as LMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { desmatamentoPorCodigo, MunicipioDesmatamento } from "@/data/desmatamentoAcre";

export type MunicipioSelecionado = {
  codIBGE: string;
} & MunicipioDesmatamento;

interface Props {
  onSelect?: (municipio: MunicipioSelecionado | null) => void;
  municipioSelecionado?: MunicipioSelecionado | null;
}

// ---------------------------------------------------------------------------
// Pane customizado para rótulos ficarem acima dos polígonos
// ---------------------------------------------------------------------------
function CriarPaneRotulos() {
  const map = useMap();
  if (!map.getPane("rotulosPane")) {
    const pane = map.createPane("rotulosPane");
    pane.style.zIndex = "450"; // acima do overlayPane (400)
    pane.style.pointerEvents = "none";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helpers de cor — verde (preservado) → vermelho (desmatado)
// ---------------------------------------------------------------------------
function getColor(pct: number): string {
  if (pct >= 40) return "#dc2626";
  if (pct >= 25) return "#f97316";
  if (pct >= 15) return "#eab308";
  if (pct >= 8)  return "#84cc16";
  return "#16a34a";
}

function buildStyle(pct: number, isSelected = false) {
  return {
    fillColor: isSelected ? "#1d4ed8" : getColor(pct),
    weight: isSelected ? 3 : 1,
    color: isSelected ? "#1e40af" : "#ffffff",
    fillOpacity: isSelected ? 0.85 : 0.78,
  };
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------
export default function MapaDesmatamentoContent({ onSelect, municipioSelecionado }: Props) {
  const [geoData, setGeoData] = useState<object | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sobreAberto, setSobreAberto] = useState(false);

  const layersRef = useRef<Record<string, any>>({});
  const selectedRef = useRef<MunicipioSelecionado | null>(null);

  useEffect(() => {
    fetch(
      "https://servicodados.ibge.gov.br/api/v3/malhas/estados/12?intrarregiao=municipio&formato=application/vnd.geo+json"
    )
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => { setGeoData(data); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  // Sincroniza highlight quando a prop muda (ex: limpeza externa)
  useEffect(() => {
    if (!municipioSelecionado && selectedRef.current) {
      const prev = layersRef.current[selectedRef.current.codIBGE];
      if (prev) prev.setStyle(buildStyle(selectedRef.current.pct, false));
      selectedRef.current = null;
    }
  }, [municipioSelecionado]);

  const handleClick = useCallback((municipio: MunicipioSelecionado) => {
    // Deselect anterior
    if (selectedRef.current) {
      const prev = layersRef.current[selectedRef.current.codIBGE];
      if (prev) prev.setStyle(buildStyle(selectedRef.current.pct, false));
    }
    // Se clicar no mesmo, desseleciona
    if (selectedRef.current?.codIBGE === municipio.codIBGE) {
      selectedRef.current = null;
      onSelect?.(null);
      return;
    }
    // Seleciona novo
    const layer = layersRef.current[municipio.codIBGE];
    if (layer) layer.setStyle(buildStyle(municipio.pct, true));
    selectedRef.current = municipio;
    onSelect?.(municipio);
  }, [onSelect]);

  const styleFeature = useCallback((feature?: any) => {
    const dados = desmatamentoPorCodigo[feature?.properties?.codarea];
    const isSelected = municipioSelecionado?.codIBGE === feature?.properties?.codarea;
    return buildStyle(dados?.pct ?? 5, isSelected);
  }, [municipioSelecionado]);

  const onEachFeature = useCallback((feature: any, layer: Layer) => {
    const cod = feature?.properties?.codarea;
    const dados = desmatamentoPorCodigo[cod];
    if (!dados) return;

    layersRef.current[cod] = layer;

    const municipio: MunicipioSelecionado = { codIBGE: cod, ...dados };

    layer.bindTooltip(
      `<strong>${dados.nome}</strong><br/>
       Desmatado: <strong>${dados.pct}%</strong> — ${dados.kmDesmatado.toLocaleString("pt-BR")} km²`,
      { sticky: true, opacity: 0.95 }
    );

    layer.on({
      click: () => handleClick(municipio),
      mouseover: (e: any) => {
        if (selectedRef.current?.codIBGE !== cod)
          e.target.setStyle({ weight: 2, color: "#94a3b8", fillOpacity: 0.92 });
      },
      mouseout: (e: any) => {
        if (selectedRef.current?.codIBGE !== cod)
          e.target.setStyle(buildStyle(dados.pct, false));
      },
    });
  }, [handleClick]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Cabeçalho */}
      <div className="px-5 pt-4 pb-3 flex items-start justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            Mapa de Desmatamento — Acre
          </h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            Clique em um município para filtrar os gráficos ao lado
          </p>
        </div>
        {municipioSelecionado && (
          <button
            onClick={() => { onSelect?.(null); }}
            className="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 whitespace-nowrap ml-4 mt-0.5"
          >
            ✕ Limpar seleção
          </button>
        )}
      </div>

      <div className="relative h-56 sm:h-64 lg:h-72">
        {/* Loading */}
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 dark:bg-gray-900/80">
            <div className="flex flex-col items-center gap-3">
              <div className="h-7 w-7 animate-spin rounded-full border-4 border-green-500 border-t-transparent" />
              <p className="text-xs text-gray-500">Carregando mapa...</p>
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <p className="text-xs text-red-500">Não foi possível carregar os limites municipais.</p>
          </div>
        )}

        <MapContainer
          center={[-9.2, -70.2]}
          zoom={6}
          minZoom={6}
          zoomSnap={0.5}
          style={{ height: "100%", width: "100%" }}
          zoomControl={true}
          scrollWheelZoom={true}
        >
          <CriarPaneRotulos />

          {/* Base cartográfica clara */}
          <TileLayer
            attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
            opacity={0.5}
          />
          {/* Malha rodoviária (Voyager sem rótulos) — aparece sob os polígonos */}
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png"
            opacity={0.35}
          />
          {geoData && (
            <GeoJSON
              key={`desmatamento-${municipioSelecionado?.codIBGE ?? "none"}`}
              data={geoData as any}
              style={styleFeature}
              onEachFeature={onEachFeature}
            />
          )}
          {/* Rótulos de cidades/rodovias acima dos polígonos */}
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png"
            opacity={0.8}
            pane="rotulosPane"
          />
        </MapContainer>

        {/* Botão "Sobre o Acre" */}
        <button
          onClick={() => setSobreAberto((v) => !v)}
          className="absolute top-3 right-3 z-1000 flex items-center gap-1.5 rounded-lg bg-white/95 dark:bg-gray-800/95 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 shadow-md hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors border border-gray-200 dark:border-gray-600"
        >
          <span className="text-sm">ℹ</span> Sobre o Acre
        </button>

        {/* Painel "Sobre o Acre" */}
        {sobreAberto && (
          <div className="absolute top-12 right-3 z-1000 w-[min(320px,calc(100%-24px))] rounded-xl bg-white/97 dark:bg-gray-800/97 shadow-xl border border-gray-200 dark:border-gray-600 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Sobre o Estado do Acre
              </h3>
              <button
                onClick={() => setSobreAberto(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg leading-none"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
              O Acre é um estado brasileiro localizado no extremo oeste da Região Norte,
              fazendo fronteira com Peru e Bolívia. Com área de aproximadamente{" "}
              <strong>164.123 km²</strong> e população de cerca de{" "}
              <strong>906 mil habitantes</strong>, o estado tem mais de{" "}
              <strong>87% do território coberto por floresta Amazônica</strong>. A preservação
              ambiental é central para a identidade acreana — o estado é pioneiro em políticas de
              pagamento por serviços ambientais e tem o desmatamento como um dos principais
              indicadores monitorados pelo poder público.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { label: "Área",      valor: "164.123 km²" },
                { label: "Municípios", valor: "22" },
                { label: "Floresta",  valor: "87%" },
              ].map((item) => (
                <div key={item.label} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2 text-center">
                  <p className="text-xs font-bold text-gray-800 dark:text-white">{item.valor}</p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Legenda */}
        <div className="absolute bottom-4 left-2 sm:left-4 z-1000 rounded-lg bg-white/95 dark:bg-gray-800/95 p-2 sm:p-3 shadow-lg text-[10px] sm:text-xs">
          <p className="font-semibold text-gray-600 dark:text-gray-300 mb-1 sm:mb-2">% Desmatado</p>
          {[
            { label: "≥ 40%",  color: "#dc2626" },
            { label: "25–39%", color: "#f97316" },
            { label: "15–24%", color: "#eab308" },
            { label: "8–14%",  color: "#84cc16" },
            { label: "< 8%",   color: "#16a34a" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2 text-gray-600 dark:text-gray-300 leading-5">
              <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: item.color }} />
              {item.label}
            </div>
          ))}
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300 leading-5 mt-1 pt-1 border-t border-gray-200 dark:border-gray-600">
            <span className="inline-block h-3 w-3 rounded-sm bg-blue-700" />
            Selecionado
          </div>
        </div>
      </div>
    </div>
  );
}
