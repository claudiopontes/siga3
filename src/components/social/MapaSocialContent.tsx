"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import type { GeoJsonObject, Geometry, Feature } from "geojson";
import type { Layer, Path, LeafletMouseEvent } from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapaSocialRow = {
  codigo_ibge_municipio: string;
  nome_municipio:        string;
  cobertura_por_1000:    number;
  bf_por_1000:           number;
  bpc_por_1000:          number;
  bf_familias:           number;
  bpc_beneficiarios:     number;
  populacao_estimada:    number;
  meses_com_dados:       number;
  periodo:               { inicio: string; fim: string };
};

interface Props {
  dados: Record<string, MapaSocialRow>;
}

type AcreFeature = Feature<Geometry, { codarea?: string }>;

// Faixas de BF/1.000 hab — média nacional ~98, Acre tipicamente 120–160
const FAIXAS = [
  { limite: 80,  cor: "#22c55e", label: "< 80 · abaixo da média nacional" },
  { limite: 120, cor: "#eab308", label: "80 – 120 · na média nacional"     },
  { limite: 160, cor: "#f97316", label: "120 – 160 · acima da média"       },
  { limite: Infinity, cor: "#ef4444", label: "> 160 · muito acima"         },
];

function getColor(bf1000: number): string {
  for (const faixa of FAIXAS) {
    if (bf1000 < faixa.limite) return faixa.cor;
  }
  return "#ef4444";
}

function buildStyle(cobertura: number, isSelected: boolean) {
  return {
    fillColor: getColor(cobertura),
    weight:      isSelected ? 3 : 1,
    color:       isSelected ? "#1d4ed8" : "#ffffff",
    fillOpacity: isSelected ? 0.95 : 0.80,
  };
}

function fmtNum(v: number) {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function fmtMes(anomes: string) {
  if (!anomes || anomes.length < 7) return anomes;
  const [a, m] = anomes.split("-");
  return `${m}/${a}`;
}

export default function MapaSocialContent({ dados }: Props) {
  const [geoData, setGeoData]     = useState<GeoJsonObject | null>(null);
  const [loadingGeo, setLoadingGeo] = useState(true);
  const [geoError, setGeoError]   = useState(false);
  const [selected, setSelected]   = useState<MapaSocialRow | null>(null);

  const selectedRef = useRef<MapaSocialRow | null>(null);
  const layersRef   = useRef<Record<string, Path>>({});

  useEffect(() => {
    fetch(
      "https://servicodados.ibge.gov.br/api/v3/malhas/estados/12?intrarregiao=municipio&formato=application/vnd.geo+json"
    )
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => { setGeoData(d); setLoadingGeo(false); })
      .catch(() => { setGeoError(true); setLoadingGeo(false); });
  }, []);

  const handleSelect = useCallback((row: MapaSocialRow) => {
    if (selectedRef.current) {
      const prev = layersRef.current[selectedRef.current.codigo_ibge_municipio];
      if (prev) prev.setStyle(buildStyle(selectedRef.current.cobertura_por_1000, false));
    }
    const layer = layersRef.current[row.codigo_ibge_municipio];
    if (layer) layer.setStyle(buildStyle(row.cobertura_por_1000, true));
    selectedRef.current = row;
    setSelected(row);
  }, []);

  const handleDeselect = useCallback(() => {
    if (selectedRef.current) {
      const prev = layersRef.current[selectedRef.current.codigo_ibge_municipio];
      if (prev) prev.setStyle(buildStyle(selectedRef.current.cobertura_por_1000, false));
    }
    selectedRef.current = null;
    setSelected(null);
  }, []);

  const styleFeature = useCallback((feature?: AcreFeature) => {
    const cod = feature?.properties?.codarea;
    const row = cod ? dados[cod] : undefined;
    return buildStyle(row?.cobertura_por_1000 ?? 0, false);
  }, [dados]);

  const onEachFeature = useCallback((feature: AcreFeature, layer: Layer) => {
    const cod = feature?.properties?.codarea;
    if (!cod) return;
    const row = dados[cod];
    if (!row) return;

    const pathLayer = layer as Path;
    layersRef.current[row.codigo_ibge_municipio] = pathLayer;

    const tooltipHtml = `
      <strong>${row.nome_municipio}</strong><br/>
      Cobertura: <strong style="color:${getColor(row.cobertura_por_1000)}">${fmtNum(row.cobertura_por_1000)}</strong> / 1.000 hab<br/>
      BF: ${fmtNum(row.bf_por_1000)} · BPC: ${fmtNum(row.bpc_por_1000)}
    `;
    pathLayer.bindTooltip(tooltipHtml, { sticky: true, opacity: 0.97 });

    pathLayer.on({
      click: () => handleSelect(row),
      mouseover: (e: LeafletMouseEvent) => {
        if (selectedRef.current?.codigo_ibge_municipio !== row.codigo_ibge_municipio) {
          (e.target as Path).setStyle({ fillOpacity: 0.95, weight: 2, color: "#94a3b8" });
        }
      },
      mouseout: (e: LeafletMouseEvent) => {
        if (selectedRef.current?.codigo_ibge_municipio !== row.codigo_ibge_municipio) {
          (e.target as Path).setStyle(buildStyle(row.cobertura_por_1000, false));
        }
      },
    });
  }, [dados, handleSelect]);

  // Período exibido (pega do primeiro item disponível)
  const periodoLabel = (() => {
    const item = Object.values(dados)[0];
    if (!item) return null;
    const { inicio, fim } = item.periodo;
    return inicio === fim ? fmtMes(fim) : `${fmtMes(inicio)} – ${fmtMes(fim)}`;
  })();

  return (
    <div className="relative h-full w-full">
      {loadingGeo && (
        <div className="absolute inset-0 z-1000 flex items-center justify-center bg-white/80 dark:bg-slate-900/80">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-500 border-t-transparent" />
            <p className="text-sm text-slate-500">Carregando mapa...</p>
          </div>
        </div>
      )}

      {geoError && (
        <div className="absolute inset-0 z-1000 flex items-center justify-center bg-white/90 dark:bg-slate-900/90">
          <p className="text-sm text-red-500">Não foi possível carregar os limites municipais.</p>
        </div>
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
      <div className="absolute bottom-6 left-4 z-1000 rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-800">
        <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
          Bolsa Família / 1.000 hab
        </p>
        {FAIXAS.map((f) => (
          <div key={f.label} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <span
              className="inline-block h-3 w-3 shrink-0 rounded-sm border border-white/50"
              style={{ backgroundColor: f.cor }}
            />
            {f.label}
          </div>
        ))}
        {periodoLabel && (
          <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
            Período: {periodoLabel}
          </p>
        )}
      </div>

      {/* Painel do município selecionado */}
      {selected && (
        <div className="absolute right-4 top-4 z-1000 w-64 rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-3 flex items-start justify-between gap-2">
            <h3 className="font-bold text-slate-800 dark:text-white">{selected.nome_municipio}</h3>
            <button
              onClick={handleDeselect}
              className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
            <div className="flex items-center justify-between">
              <span>Cobertura total</span>
              <strong style={{ color: getColor(selected.cobertura_por_1000) }}>
                {fmtNum(selected.cobertura_por_1000)} / 1.000
              </strong>
            </div>

            {/* Barra de cobertura */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
              <div
                className="h-2 rounded-full transition-all"
                style={{
                  width: `${Math.min((selected.cobertura_por_1000 / 250) * 100, 100)}%`,
                  backgroundColor: getColor(selected.cobertura_por_1000),
                }}
              />
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 pt-2 dark:border-slate-700">
              <span className="text-xs text-slate-500">BF / 1.000 hab</span>
              <span className="text-xs font-medium">{fmtNum(selected.bf_por_1000)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">BPC / 1.000 hab</span>
              <span className="text-xs font-medium">{fmtNum(selected.bpc_por_1000)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 pt-2 dark:border-slate-700">
              <span className="text-xs text-slate-500">Famílias BF</span>
              <span className="text-xs font-medium">{selected.bf_familias.toLocaleString("pt-BR")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Beneficiários BPC</span>
              <span className="text-xs font-medium">{selected.bpc_beneficiarios.toLocaleString("pt-BR")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Pop. estimada</span>
              <span className="text-xs font-medium">{selected.populacao_estimada.toLocaleString("pt-BR")}</span>
            </div>
            {selected.meses_com_dados > 1 && (
              <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                Média de {selected.meses_com_dados} competências
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
