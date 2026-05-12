"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import type { GeoJsonObject, Geometry, Feature } from "geojson";
import type { Layer, Path, LeafletMouseEvent } from "leaflet";
import "leaflet/dist/leaflet.css";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type VacinacaoMapRow = {
  codigo_municipio_ibge: string;
  nome_municipio: string;
  cobertura_media: number | null;
  menor_cobertura: number | null;
  total_abaixo_meta: number;
  total_imunobiologicos: number;
  imunobiologico_menor_cobertura: string | null;
};

interface Props {
  dados: Record<string, VacinacaoMapRow>;
  munSel?: string;
  onSelect?: (nome: string | null) => void;
}

type AcreFeature = Feature<Geometry, { codarea?: string }>;

// ─── Escala de cor por cobertura ─────────────────────────────────────────────

function getColor(cob: number | null): string {
  if (cob === null) return "#cbd5e1"; // sem dado — cinza
  if (cob >= 95)   return "#22c55e"; // meta atingida — verde
  if (cob >= 80)   return "#f97316"; // abaixo da meta — laranja
  if (cob >= 50)   return "#ef4444"; // crítico — vermelho
  return "#7f1d1d";                  // muito baixo — vermelho escuro
}

function buildStyle(cob: number | null, isSelected: boolean) {
  return {
    fillColor: getColor(cob),
    weight: isSelected ? 3 : 1,
    color: isSelected ? "#1d4ed8" : "#ffffff",
    fillOpacity: isSelected ? 0.95 : 0.78,
  };
}

function fmtPct(v: number | null) {
  if (v === null) return "—";
  return `${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

// ─── Componente ──────────────────────────────────────────────────────────────

export default function MapaVacinacaoContent({ dados, munSel, onSelect }: Props) {
  const [geoData, setGeoData] = useState<GeoJsonObject | null>(null);
  const [loadingGeo, setLoadingGeo] = useState(true);
  const [geoError, setGeoError] = useState(false);
  const [selected, setSelected] = useState<VacinacaoMapRow | null>(null);

  const selectedRef = useRef<VacinacaoMapRow | null>(null);
  const layersRef = useRef<Record<string, Path>>({});

  useEffect(() => {
    fetch(
      "https://servicodados.ibge.gov.br/api/v3/malhas/estados/12?intrarregiao=municipio&formato=application/vnd.geo+json"
    )
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => { setGeoData(data); setLoadingGeo(false); })
      .catch(() => { setGeoError(true); setLoadingGeo(false); });
  }, []);

  // Sincroniza seleção externa (munSel vindo do seletor global)
  useEffect(() => {
    if (!munSel) {
      if (selectedRef.current) {
        const prev = layersRef.current[selectedRef.current.codigo_municipio_ibge];
        if (prev) prev.setStyle(buildStyle(selectedRef.current.cobertura_media, false));
        selectedRef.current = null;
        setSelected(null);
      }
      return;
    }
    const row = Object.values(dados).find(d => d.nome_municipio === munSel);
    if (!row) return;
    if (selectedRef.current?.codigo_municipio_ibge === row.codigo_municipio_ibge) return;
    if (selectedRef.current) {
      const prev = layersRef.current[selectedRef.current.codigo_municipio_ibge];
      if (prev) prev.setStyle(buildStyle(selectedRef.current.cobertura_media, false));
    }
    const layer = layersRef.current[row.codigo_municipio_ibge];
    if (layer) layer.setStyle(buildStyle(row.cobertura_media, true));
    selectedRef.current = row;
    setSelected(row);
  }, [munSel, dados]);

  const handleSelect = useCallback((row: VacinacaoMapRow) => {
    if (selectedRef.current) {
      const prev = layersRef.current[selectedRef.current.codigo_municipio_ibge];
      if (prev) prev.setStyle(buildStyle(selectedRef.current.cobertura_media, false));
    }
    const isSame = selectedRef.current?.codigo_municipio_ibge === row.codigo_municipio_ibge;
    if (isSame) {
      selectedRef.current = null;
      setSelected(null);
      onSelect?.(null);
      return;
    }
    const layer = layersRef.current[row.codigo_municipio_ibge];
    if (layer) layer.setStyle(buildStyle(row.cobertura_media, true));
    selectedRef.current = row;
    setSelected(row);
    onSelect?.(row.nome_municipio);
  }, [onSelect]);

  // GeoJSON do IBGE usa codarea com 7 dígitos; nosso BD armazena 6 dígitos (sem dígito verificador)
  function lookupRow(cod: string | undefined) {
    if (!cod) return undefined;
    return dados[cod] ?? dados[cod.slice(0, 6)];
  }

  const styleFeature = useCallback((feature?: AcreFeature) => {
    const cod = feature?.properties?.codarea;
    const row = lookupRow(cod);
    const isSel = !!selectedRef.current && row?.codigo_municipio_ibge === selectedRef.current.codigo_municipio_ibge;
    return buildStyle(row?.cobertura_media ?? null, isSel);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados]);

  const onEachFeature = useCallback((feature: AcreFeature, layer: Layer) => {
    const cod = feature?.properties?.codarea;
    if (!cod) return;
    const row = lookupRow(cod);
    if (!row) return;

    const pathLayer = layer as Path;
    layersRef.current[row.codigo_municipio_ibge] = pathLayer;

    const cobColor = getColor(row.cobertura_media);
    const tooltipHtml = `
      <strong>${row.nome_municipio}</strong><br/>
      Cobertura média: <strong style="color:${cobColor}">${fmtPct(row.cobertura_media)}</strong><br/>
      Abaixo da meta: <strong>${row.total_abaixo_meta}</strong> vacina(s)
      ${row.imunobiologico_menor_cobertura ? `<br/>Menor: ${row.imunobiologico_menor_cobertura} (${fmtPct(row.menor_cobertura)})` : ""}
    `;
    pathLayer.bindTooltip(tooltipHtml, { sticky: true, opacity: 0.97 });

    pathLayer.on({
      click: () => handleSelect(row),
      mouseover: (e: LeafletMouseEvent) => {
        if (selectedRef.current?.codigo_municipio_ibge !== row.codigo_municipio_ibge) {
          (e.target as Path).setStyle({ fillOpacity: 0.92, weight: 2, color: "#94a3b8" });
        }
      },
      mouseout: (e: LeafletMouseEvent) => {
        if (selectedRef.current?.codigo_municipio_ibge !== row.codigo_municipio_ibge) {
          (e.target as Path).setStyle(buildStyle(row.cobertura_media, false));
        }
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados, handleSelect]);

  const legendaItems = [
    { label: "≥ 95% — Meta atingida",  color: "#22c55e" },
    { label: "80–95% — Abaixo da meta", color: "#f97316" },
    { label: "50–80% — Crítico",        color: "#ef4444" },
    { label: "< 50% — Muito baixo",     color: "#7f1d1d" },
    { label: "Sem dado",                color: "#cbd5e1" },
  ];

  return (
    <div className="relative h-full w-full">
      {loadingGeo && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-white/80 dark:bg-gray-900/80">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
            <p className="text-sm text-gray-500">Carregando mapa...</p>
          </div>
        </div>
      )}

      {geoError && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-white/90 dark:bg-gray-900/90">
          <p className="text-sm text-red-500">Não foi possível carregar os limites municipais.</p>
        </div>
      )}

      <MapContainer
        center={[-9.0, -70.0]}
        zoom={7}
        minZoom={7}
        maxZoom={11}
        maxBounds={[[-12.5, -74.5], [-6.5, -65.5]]}
        maxBoundsViscosity={1.0}
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
      <div className="absolute bottom-6 left-4 z-[1000] rounded-lg border border-gray-300 bg-white p-3 shadow-xl dark:border-gray-600 dark:bg-gray-900">
        <p className="mb-2 text-xs font-semibold text-gray-700 dark:text-gray-200">Cobertura vacinal</p>
        {legendaItems.map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200">
            <span className="inline-block h-3 w-3 shrink-0 rounded-sm border border-gray-300" style={{ backgroundColor: item.color }} />
            {item.label}
          </div>
        ))}
      </div>

      {/* Painel do município selecionado */}
      {selected && (
        <div className="absolute right-4 top-4 z-[1000] w-64 rounded-xl border border-gray-300 bg-white p-4 shadow-xl dark:border-gray-600 dark:bg-gray-900">
          <div className="mb-3 flex items-start justify-between gap-2">
            <h3 className="font-bold text-gray-800 dark:text-white">{selected.nome_municipio}</h3>
            <button
              onClick={() => handleSelect(selected)}
              className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>

          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
            <div className="flex items-center justify-between">
              <span>Cobertura média</span>
              <strong style={{ color: getColor(selected.cobertura_media) }}>
                {fmtPct(selected.cobertura_media)}
              </strong>
            </div>

            {/* Barra de progresso */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
              <div
                className="h-2 rounded-full transition-all"
                style={{
                  width: `${Math.min(Number(selected.cobertura_media ?? 0), 100)}%`,
                  backgroundColor: getColor(selected.cobertura_media),
                }}
              />
            </div>

            <div className="flex items-center justify-between">
              <span>Abaixo da meta</span>
              <strong className={selected.total_abaixo_meta > 0 ? "text-orange-600 dark:text-orange-400" : "text-emerald-600 dark:text-emerald-400"}>
                {selected.total_abaixo_meta} vacina(s)
              </strong>
            </div>
            {selected.imunobiologico_menor_cobertura && (
              <div className="flex items-center justify-between gap-2">
                <span className="shrink-0">Menor cob.</span>
                <span className="truncate text-right text-xs text-red-600 dark:text-red-400" title={selected.imunobiologico_menor_cobertura}>
                  {selected.imunobiologico_menor_cobertura} ({fmtPct(selected.menor_cobertura)})
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span>Meta (95%)</span>
              <strong className={Number(selected.cobertura_media ?? 0) >= 95 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                {Number(selected.cobertura_media ?? 0) >= 95 ? "Atingida" : "Não atingida"}
              </strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
