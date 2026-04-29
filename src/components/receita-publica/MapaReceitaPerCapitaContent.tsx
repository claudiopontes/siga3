"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import type { Feature, GeoJsonObject, Geometry } from "geojson";
import "leaflet/dist/leaflet.css";
import type { ReceitaPerCapitaItem } from "./MapaReceitaPerCapita";
import { Eye, MoreVertical, Printer } from "lucide-react";

type AcreFeature = Feature<Geometry, { codarea?: string }>;

function normalizeIbgeCode(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const digits = String(value).replace(/\D/g, "");
  return digits ? digits.padStart(7, "0") : "";
}

function CriarPaneRotulos() {
  const map = useMap();
  if (!map.getPane("rotulosPane")) {
    const pane = map.createPane("rotulosPane");
    pane.style.zIndex = "450";
    pane.style.pointerEvents = "none";
  }
  return null;
}

function colorByValue(v: number, cuts: number[]): string {
  if (v >= cuts[4]) return "#14532d";
  if (v >= cuts[3]) return "#166534";
  if (v >= cuts[2]) return "#15803d";
  if (v >= cuts[1]) return "#22c55e";
  if (v >= cuts[0]) return "#86efac";
  return "#dcfce7";
}

function ActionSummary() {
  return (
    <summary className="inline-flex list-none cursor-pointer select-none items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-xs font-semibold text-teal-700 shadow-sm transition hover:border-teal-300 hover:bg-teal-100 hover:text-teal-800 dark:border-teal-900/70 dark:bg-teal-950/30 dark:text-teal-300 dark:hover:bg-teal-900/40">
      <MoreVertical className="h-3.5 w-3.5" />
      Ações
    </summary>
  );
}

export default function MapaReceitaPerCapitaContent({ dados }: { dados: Record<string, ReceitaPerCapitaItem> }) {
  const [geoData, setGeoData] = useState<GeoJsonObject | null>(null);
  const [erro, setErro] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const onPrint = () => window.print();
  const onFullscreen = async () => {
    const el = wrapperRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await el.requestFullscreen();
  };
  const closeActionsMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    const details = event.currentTarget.closest("details");
    details?.removeAttribute("open");
  };

  useEffect(() => {
    fetch("https://servicodados.ibge.gov.br/api/v3/malhas/estados/12?intrarregiao=municipio&formato=application/vnd.geo+json")
      .then((r) => {
        if (!r.ok) throw new Error("falha");
        return r.json();
      })
      .then((data) => setGeoData(data))
      .catch(() => setErro(true));
  }, []);

  const cortes = useMemo(() => {
    const values = Object.values(dados)
      .map((d) => d.perCapita)
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);
    if (values.length < 5) return [500, 1000, 2000, 3000, 5000];
    const q = (p: number) => values[Math.floor((values.length - 1) * p)] ?? values[values.length - 1];
    return [q(0.2), q(0.4), q(0.6), q(0.8), q(0.95)];
  }, [dados]);

  return (
    <div ref={wrapperRef} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Mapa de Receita per capita - Acre</h3>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">Receita realizada no período dividida pela população IBGE</p>
        </div>
        <details className="relative">
          <ActionSummary />
          <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
            <button type="button" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700" onClick={(event) => { closeActionsMenu(event); onFullscreen(); }}><Eye className="h-3.5 w-3.5" />Visualizar</button>
            <button type="button" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700" onClick={(event) => { closeActionsMenu(event); onPrint(); }}><Printer className="h-3.5 w-3.5" />Imprimir</button>
          </div>
        </details>
      </div>
      <div className="relative h-56 sm:h-64 lg:h-72">
        {!geoData && !erro ? <div className="absolute inset-0 z-10 flex items-center justify-center text-xs text-gray-500">Carregando mapa...</div> : null}
        {erro ? <div className="absolute inset-0 z-10 flex items-center justify-center text-xs text-red-500">Falha ao carregar malha municipal.</div> : null}
        <MapContainer center={[-9.2, -70.2]} zoom={6} minZoom={6} zoomSnap={0.5} style={{ height: "100%", width: "100%" }} zoomControl scrollWheelZoom>
          <CriarPaneRotulos />
          <TileLayer attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>' url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png" opacity={0.5} />
          <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png" opacity={0.35} />
          {geoData ? (
            <GeoJSON
              data={geoData}
              style={(feature?: AcreFeature) => {
                const cod = normalizeIbgeCode(feature?.properties?.codarea ?? "");
                const d = dados[cod];
                return { fillColor: d ? colorByValue(d.perCapita, cortes) : "#e5e7eb", color: "#ffffff", weight: 1, fillOpacity: 0.82 };
              }}
              onEachFeature={(feature, layer) => {
                const cod = normalizeIbgeCode((feature as AcreFeature).properties?.codarea ?? "");
                const d = dados[cod];
                if (!d) return;
                layer.bindTooltip(
                  `<strong>${d.nome}</strong><br/>Per capita: <strong>${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(d.perCapita)}</strong><br/>Receita: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(d.receitaTotal)}<br/>População: ${d.populacao.toLocaleString("pt-BR")}`,
                  { sticky: true, opacity: 0.95 },
                );
              }}
            />
          ) : null}
          <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png" opacity={0.8} pane="rotulosPane" />
        </MapContainer>
        <div className="absolute bottom-4 left-2 sm:left-4 z-1000 rounded-lg bg-white/95 dark:bg-gray-800/95 p-2 sm:p-3 shadow-lg text-[10px] sm:text-xs">
          <p className="font-semibold text-gray-600 dark:text-gray-300 mb-1 sm:mb-2">Receita per capita</p>
          {[
            { label: `>= ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(cortes[4])}`, color: "#14532d" },
            { label: `>= ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(cortes[3])}`, color: "#166534" },
            { label: `>= ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(cortes[2])}`, color: "#15803d" },
            { label: `>= ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(cortes[1])}`, color: "#22c55e" },
            { label: `< ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(cortes[1])}`, color: "#86efac" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2 text-gray-600 dark:text-gray-300 leading-5">
              <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: item.color }} />
              {item.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

