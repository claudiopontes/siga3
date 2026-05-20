"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  ideb: number | null;
  ideb_ai: number | null;
  ideb_af: number | null;
  ideb_em: number | null;
  meta_ai: number | null;
  meta_af: number | null;
  meta_em: number | null;
  edicao_ideb: number | null;
  populacao: number | null;
  ano_rendimento: number | null;
  aprovacao_fund_total: number | null;
  reprovacao_fund_total: number | null;
  abandono_fund_total: number | null;
  // Eficiência (cruzamento SICONFI × Censo)
  gasto_ano_siconfi: number | null;
  gasto_periodo_siconfi: number | null;
  total_mde: number | null;
  total_despesa_educacao: number | null;
  total_matriculas_censo: number | null;
  gasto_aluno_mde: number | null;
  gasto_aluno_educacao: number | null;
  // TCE (SIPAC/empenho — Custo Total com Educação, função 12)
  ano_referencia_tce: number | null;
  total_despesa_educacao_tce: number | null;
  gasto_aluno_educacao_tce: number | null;
};

/** Dados de IDEB por município que vêm de fora (props). */
export interface DadosMunicipioIdeb {
  codigo_ibge: string;
  nome?: string | null;
  ideb_ai?: number | null;
  ideb_af?: number | null;
  ideb_em?: number | null;
  ideb_composite?: number | null;
  meta_ai?: number | null;
  meta_af?: number | null;
  meta_em?: number | null;
  edicao_ideb?: number | null;
  populacao?: number | null;
  ano_rendimento?: number | null;
  aprovacao_fund_total?: number | null;
  reprovacao_fund_total?: number | null;
  abandono_fund_total?: number | null;
  // Eficiência
  gasto_ano_siconfi?: number | null;
  gasto_periodo_siconfi?: number | null;
  total_mde?: number | null;
  total_despesa_educacao?: number | null;
  total_matriculas_censo?: number | null;
  gasto_aluno_mde?: number | null;
  gasto_aluno_educacao?: number | null;
  // TCE (SIPAC/empenho — Custo Total com Educação, função 12)
  ano_referencia_tce?: number | null;
  total_despesa_educacao_tce?: number | null;
  gasto_aluno_educacao_tce?: number | null;
}

interface Props {
  /** Mapa cod_ibge → dados pedagógicos do município. Opcional — sem ele, mapa cinza. */
  dados?: Record<string, DadosMunicipioIdeb>;
  /** Etapa usada para colorir o mapa: 'composite' (default), 'AI', 'AF', 'EM'. */
  etapa?: "composite" | "AI" | "AF" | "EM";
  onSelect?: (municipio: Municipio | null) => void;
}

type AcreFeature = Feature<Geometry, { codarea?: string }>;

// ---------------------------------------------------------------------------
// Geografia (coordenadas estáticas — não muda)
// ---------------------------------------------------------------------------

interface MunicipioGeo { nome: string; codIBGE: string; lat: number; lng: number }

const MUNICIPIOS_GEO: MunicipioGeo[] = [
  { nome: "Rio Branco",           codIBGE: "1200401", lat: -9.9754,  lng: -67.8249 },
  { nome: "Cruzeiro do Sul",      codIBGE: "1200203", lat: -7.6307,  lng: -72.6732 },
  { nome: "Sena Madureira",       codIBGE: "1200500", lat: -9.0659,  lng: -68.6578 },
  { nome: "Tarauacá",             codIBGE: "1200609", lat: -8.1608,  lng: -70.7739 },
  { nome: "Feijó",                codIBGE: "1200302", lat: -8.1614,  lng: -70.3533 },
  { nome: "Brasiléia",            codIBGE: "1200104", lat: -11.0089, lng: -68.7411 },
  { nome: "Epitaciolândia",       codIBGE: "1200252", lat: -11.0233, lng: -68.7239 },
  { nome: "Xapuri",               codIBGE: "1200708", lat: -10.6519, lng: -68.5011 },
  { nome: "Plácido de Castro",    codIBGE: "1200385", lat: -10.3322, lng: -67.1808 },
  { nome: "Acrelândia",           codIBGE: "1200013", lat: -9.9936,  lng: -66.8969 },
  { nome: "Senador Guiomard",     codIBGE: "1200450", lat: -10.1536, lng: -67.7375 },
  { nome: "Porto Acre",           codIBGE: "1200807", lat: -9.5836,  lng: -67.5344 },
  { nome: "Bujari",               codIBGE: "1200138", lat: -9.8272,  lng: -67.9519 },
  { nome: "Capixaba",             codIBGE: "1200179", lat: -10.5597, lng: -67.6908 },
  { nome: "Mâncio Lima",          codIBGE: "1200336", lat: -7.6178,  lng: -72.8964 },
  { nome: "Rodrigues Alves",      codIBGE: "1200427", lat: -7.7367,  lng: -72.6461 },
  { nome: "Porto Walter",         codIBGE: "1200393", lat: -8.2694,  lng: -72.7503 },
  { nome: "Marechal Thaumaturgo", codIBGE: "1200351", lat: -8.9361,  lng: -72.7914 },
  { nome: "Jordão",               codIBGE: "1200328", lat: -9.1658,  lng: -71.8964 },
  { nome: "Santa Rosa do Purus",  codIBGE: "1200435", lat: -9.4744,  lng: -70.5197 },
  { nome: "Manoel Urbano",        codIBGE: "1200344", lat: -8.8369,  lng: -69.2578 },
  { nome: "Assis Brasil",         codIBGE: "1200054", lat: -10.9358, lng: -69.5733 },
];

// ---------------------------------------------------------------------------
// Helpers de estilo
// ---------------------------------------------------------------------------

const COR_SEM_DADO = "#cbd5e1";

function getColor(ideb: number | null): string {
  if (ideb === null) return COR_SEM_DADO;
  if (ideb >= 5.0) return "#22c55e";
  if (ideb >= 4.5) return "#84cc16";
  if (ideb >= 4.0) return "#eab308";
  if (ideb >= 3.5) return "#f97316";
  return "#ef4444";
}

function buildStyle(ideb: number | null, isSelected: boolean) {
  return {
    fillColor: getColor(ideb),
    weight: isSelected ? 3 : 1,
    color: isSelected ? "#1d4ed8" : "#ffffff",
    fillOpacity: isSelected ? 0.92 : ideb === null ? 0.5 : 0.72,
  };
}

function fmtNum(n: number | null, decimais = 1): string {
  if (n === null) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: decimais, maximumFractionDigits: decimais });
}

function pickIdeb(d: DadosMunicipioIdeb | undefined, etapa: Props["etapa"]): number | null {
  if (!d) return null;
  switch (etapa) {
    case "AI": return d.ideb_ai ?? null;
    case "AF": return d.ideb_af ?? null;
    case "EM": return d.ideb_em ?? null;
    case "composite":
    default:   return d.ideb_composite ?? null;
  }
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export default function MapaAcreContent({ dados = {}, etapa = "composite", onSelect }: Props) {
  const [selected, setSelected] = useState<Municipio | null>(null);
  const [geoData, setGeoData] = useState<GeoJsonObject | null>(null);
  const [loadingGeo, setLoadingGeo] = useState(true);
  const [geoError, setGeoError] = useState(false);

  const selectedRef = useRef<Municipio | null>(null);
  const layersRef = useRef<Record<string, Path>>({});

  useEffect(() => {
    fetch(
      "https://servicodados.ibge.gov.br/api/v3/malhas/estados/12?intrarregiao=municipio&formato=application/vnd.geo+json",
    )
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => { setGeoData(data); setLoadingGeo(false); })
      .catch(() => { setGeoError(true); setLoadingGeo(false); });
  }, []);

  const municipios: Municipio[] = useMemo(() => {
    return MUNICIPIOS_GEO.map((g) => {
      const d = dados[g.codIBGE];
      return {
        nome: g.nome, codIBGE: g.codIBGE, lat: g.lat, lng: g.lng,
        ideb:        pickIdeb(d, etapa),
        ideb_ai:     d?.ideb_ai ?? null,
        ideb_af:     d?.ideb_af ?? null,
        ideb_em:     d?.ideb_em ?? null,
        meta_ai:     d?.meta_ai ?? null,
        meta_af:     d?.meta_af ?? null,
        meta_em:     d?.meta_em ?? null,
        edicao_ideb: d?.edicao_ideb ?? null,
        populacao:   d?.populacao ?? null,
        ano_rendimento:        d?.ano_rendimento ?? null,
        aprovacao_fund_total:  d?.aprovacao_fund_total ?? null,
        reprovacao_fund_total: d?.reprovacao_fund_total ?? null,
        abandono_fund_total:   d?.abandono_fund_total ?? null,
        gasto_ano_siconfi:     d?.gasto_ano_siconfi ?? null,
        gasto_periodo_siconfi: d?.gasto_periodo_siconfi ?? null,
        total_mde:                  d?.total_mde ?? null,
        total_despesa_educacao:     d?.total_despesa_educacao ?? null,
        total_matriculas_censo:     d?.total_matriculas_censo ?? null,
        gasto_aluno_mde:            d?.gasto_aluno_mde ?? null,
        gasto_aluno_educacao:       d?.gasto_aluno_educacao ?? null,
        ano_referencia_tce:         d?.ano_referencia_tce ?? null,
        total_despesa_educacao_tce: d?.total_despesa_educacao_tce ?? null,
        gasto_aluno_educacao_tce:   d?.gasto_aluno_educacao_tce ?? null,
      };
    });
  }, [dados, etapa]);

  const municipioByCode = useMemo(
    () => Object.fromEntries(municipios.map((m) => [m.codIBGE, m])),
    [municipios],
  );

  const handleSelect = useCallback((municipio: Municipio) => {
    if (selectedRef.current) {
      const prev = layersRef.current[selectedRef.current.codIBGE];
      if (prev) prev.setStyle(buildStyle(selectedRef.current.ideb, false));
    }
    const layer = layersRef.current[municipio.codIBGE];
    if (layer) layer.setStyle(buildStyle(municipio.ideb, true));
    selectedRef.current = municipio;
    setSelected(municipio);
    onSelect?.(municipio);
  }, [onSelect]);

  const handleDeselect = useCallback(() => {
    if (selectedRef.current) {
      const prev = layersRef.current[selectedRef.current.codIBGE];
      if (prev) prev.setStyle(buildStyle(selectedRef.current.ideb, false));
    }
    selectedRef.current = null;
    setSelected(null);
    onSelect?.(null);
  }, [onSelect]);

  const styleFeature = useCallback(
    (feature?: AcreFeature) => {
      const cod = feature?.properties?.codarea;
      const municipio = cod ? municipioByCode[cod] : undefined;
      return buildStyle(municipio?.ideb ?? null, false);
    },
    [municipioByCode],
  );

  // Reaplica estilo quando dados ou etapa mudam
  useEffect(() => {
    for (const m of municipios) {
      const layer = layersRef.current[m.codIBGE];
      if (!layer) continue;
      const isSel = selectedRef.current?.codIBGE === m.codIBGE;
      layer.setStyle(buildStyle(m.ideb, isSel));
    }
  }, [municipios]);

  const onEachFeature = useCallback(
    (feature: AcreFeature, layer: Layer) => {
      const cod = feature?.properties?.codarea;
      if (!cod) return;
      const municipio = municipioByCode[cod];
      if (!municipio) return;
      const pathLayer = layer as Path;
      layersRef.current[municipio.codIBGE] = pathLayer;
      const tooltipLabel = municipio.ideb !== null
        ? `${municipio.nome} — IDEB ${fmtNum(municipio.ideb)}`
        : `${municipio.nome} — sem dado`;
      pathLayer.bindTooltip(tooltipLabel, { sticky: true, opacity: 0.95 });
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
    [handleSelect, municipioByCode],
  );

  return (
    <div className="relative h-full w-full">
      {loadingGeo && (
        <div className="absolute inset-0 z-1000 flex items-center justify-center bg-white/80 dark:bg-gray-900/80">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
      )}
      {geoError && (
        <div className="absolute inset-0 z-1000 flex items-center justify-center bg-white/90">
          <p className="text-sm text-red-500">Não foi possível carregar os limites municipais.</p>
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
          <GeoJSON key="acre-municipios" data={geoData} style={styleFeature} onEachFeature={onEachFeature} />
        )}
      </MapContainer>

      {/* Legenda */}
      <div className="absolute bottom-3 left-3 z-1000 rounded-lg bg-white p-2 shadow-md dark:bg-gray-800">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          IDEB {etapa !== "composite" ? `(${etapa})` : ""}
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
            <span className="inline-block h-2.5 w-2.5 rounded-sm border border-white/50" style={{ backgroundColor: item.color }} />
            {item.label}
          </div>
        ))}
      </div>

      {/* Painel do município selecionado */}
      {selected && (
        <div className="absolute right-3 top-3 z-1000 w-64 rounded-xl bg-white p-3 shadow-xl dark:bg-gray-800">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-800 dark:text-white">{selected.nome}</h3>
            <button
              onClick={handleDeselect}
              className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
            >✕</button>
          </div>
          <div className="space-y-2 text-xs text-gray-600 dark:text-gray-300">
            <div>
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                IDEB {selected.edicao_ideb ?? ""}
              </p>
              {([
                { label: "Anos Iniciais", obs: selected.ideb_ai, meta: selected.meta_ai },
                { label: "Anos Finais",   obs: selected.ideb_af, meta: selected.meta_af },
                { label: "Ensino Médio",  obs: selected.ideb_em, meta: selected.meta_em },
              ] as const).map((e) => (
                <div key={e.label} className="flex items-center justify-between">
                  <span>{e.label}</span>
                  <span>
                    <strong style={{ color: getColor(e.obs) }}>{fmtNum(e.obs)}</strong>
                    {" / "}
                    <span className="text-gray-400">{fmtNum(e.meta)}</span>
                  </span>
                </div>
              ))}
            </div>
            {selected.ano_rendimento !== null && (
              <div className="border-t border-gray-100 pt-1.5 dark:border-gray-700">
                <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  Rendimento {selected.ano_rendimento} (Fund.)
                </p>
                <div className="flex items-center justify-between"><span>Aprov.</span><strong className="text-emerald-600">{fmtNum(selected.aprovacao_fund_total)}%</strong></div>
                <div className="flex items-center justify-between"><span>Reprov.</span><strong className="text-orange-600">{fmtNum(selected.reprovacao_fund_total)}%</strong></div>
                <div className="flex items-center justify-between"><span>Abandono</span><strong className="text-red-600">{fmtNum(selected.abandono_fund_total)}%</strong></div>
              </div>
            )}
            {selected.populacao !== null && (
              <div className="flex items-center justify-between border-t border-gray-100 pt-1.5 dark:border-gray-700">
                <span>Pop. (IBGE)</span><strong>{selected.populacao.toLocaleString("pt-BR")}</strong>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
