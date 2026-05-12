"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import { createPortal } from "react-dom";

function MapOverlay({ children }: { children: React.ReactNode }) {
  const map = useMap();
  return createPortal(children, map.getContainer());
}
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

        {/* Legenda — dentro do MapContainer via portal, fora da cadeia de opacidade das camadas */}
        <MapOverlay>
          <div
            style={{
              position: "absolute", bottom: 24, left: 16,
              zIndex: 2000, borderRadius: 8,
              border: "1px solid #e5e7eb", padding: 12,
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              backgroundColor: "#ffffff", opacity: 1,
            }}
          >
            <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 600, color: "#374151" }}>Cobertura vacinal</p>
            {legendaItems.map((item) => (
              <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#374151", marginBottom: 3 }}>
                <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 2, border: "1px solid #d1d5db", backgroundColor: item.color, flexShrink: 0 }} />
                {item.label}
              </div>
            ))}
          </div>
        </MapOverlay>

        {/* Painel do município selecionado */}
        {selected && (
          <MapOverlay>
            <div
              style={{
                position: "absolute", top: 16, right: 16,
                zIndex: 2000, width: 256, borderRadius: 12,
                border: "1px solid #e5e7eb", padding: 16,
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                backgroundColor: "#ffffff", opacity: 1,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, gap: 8 }}>
                <h3 style={{ margin: 0, fontWeight: 700, color: "#1f2937", fontSize: 14 }}>{selected.nome_municipio}</h3>
                <button
                  onClick={() => handleSelect(selected)}
                  style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 2 }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13, color: "#4b5563" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Cobertura média</span>
                  <strong style={{ color: getColor(selected.cobertura_media) }}>{fmtPct(selected.cobertura_media)}</strong>
                </div>

                <div style={{ height: 8, width: "100%", overflow: "hidden", borderRadius: 9999, backgroundColor: "#f3f4f6" }}>
                  <div style={{ height: 8, borderRadius: 9999, width: `${Math.min(Number(selected.cobertura_media ?? 0), 100)}%`, backgroundColor: getColor(selected.cobertura_media) }} />
                </div>

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Abaixo da meta</span>
                  <strong style={{ color: selected.total_abaixo_meta > 0 ? "#d97706" : "#059669" }}>{selected.total_abaixo_meta} vacina(s)</strong>
                </div>

                {selected.imunobiologico_menor_cobertura && (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ flexShrink: 0 }}>Menor cob.</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11, color: "#dc2626", textAlign: "right" }} title={selected.imunobiologico_menor_cobertura}>
                      {selected.imunobiologico_menor_cobertura} ({fmtPct(selected.menor_cobertura)})
                    </span>
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Meta (95%)</span>
                  <strong style={{ color: Number(selected.cobertura_media ?? 0) >= 95 ? "#059669" : "#dc2626" }}>
                    {Number(selected.cobertura_media ?? 0) >= 95 ? "Atingida" : "Não atingida"}
                  </strong>
                </div>
              </div>
            </div>
          </MapOverlay>
        )}
      </MapContainer>
    </div>
  );
}
