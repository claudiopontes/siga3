"use client";

import dynamic from "next/dynamic";
import { ApexOptions } from "apexcharts";
import { desmatamentoPorCodigo } from "@/data/desmatamentoAcre";
import type { MunicipioSelecionado } from "./MapaDesmatamento";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

const baseGrid: ApexOptions["grid"] = { borderColor: "#f0f0f0", strokeDashArray: 4 };

// ---------------------------------------------------------------------------
// Estado — gráfico de área anual
// ---------------------------------------------------------------------------
const anosDesmatamento   = ["2015","2016","2017","2018","2019","2020","2021","2022","2023","2024"];
const kmDesmatadosEstado = [1465, 1454, 1177, 1282, 1699, 1635, 1190, 1002, 924, 870];

const optionsEstado: ApexOptions = {
  chart: { type: "area", toolbar: { show: false }, fontFamily: "inherit" },
  colors: ["#e45e3c"],
  fill: { type: "gradient", gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 100] } },
  stroke: { curve: "smooth", width: 2 },
  dataLabels: { enabled: false },
  xaxis: { categories: anosDesmatamento, labels: { style: { fontSize: "11px" } } },
  yaxis: { labels: { formatter: (v) => `${v.toLocaleString("pt-BR")} km²`, style: { fontSize: "11px" } } },
  tooltip: { y: { formatter: (v) => `${v.toLocaleString("pt-BR")} km²` } },
  grid: baseGrid,
};

// ---------------------------------------------------------------------------
// Município — comparativo de barras
// ---------------------------------------------------------------------------
const municipiosOrdenados = Object.entries(desmatamentoPorCodigo)
  .map(([cod, d]) => ({ cod, ...d }))
  .sort((a, b) => b.pct - a.pct);

function getBarColor(pct: number): string {
  if (pct >= 40) return "#dc2626";
  if (pct >= 25) return "#f97316";
  if (pct >= 15) return "#eab308";
  if (pct >= 8)  return "#84cc16";
  return "#16a34a";
}

function buildOptionsComparativo(codSelecionado: string): ApexOptions {
  return {
    chart: { type: "bar", toolbar: { show: false }, fontFamily: "inherit" },
    colors: municipiosOrdenados.map((m) => m.cod === codSelecionado ? "#1d4ed8" : getBarColor(m.pct)),
    plotOptions: {
      bar: { borderRadius: 3, horizontal: true, distributed: true, dataLabels: { position: "top" } },
    },
    dataLabels: {
      enabled: true,
      formatter: (v) => `${v}%`,
      offsetX: 22,
      style: { fontSize: "10px", colors: ["#374151"] },
    },
    legend: { show: false },
    xaxis: {
      categories: municipiosOrdenados.map((m) => m.nome),
      max: 70,
      labels: { style: { fontSize: "10px" } },
    },
    yaxis: { labels: { style: { fontSize: "10px" } } },
    tooltip: { y: { formatter: (v) => `${v}% desmatado` } },
    grid: baseGrid,
  };
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------
interface Props {
  municipioSelecionado?: MunicipioSelecionado | null;
}

export default function GraficoDesmatamento({ municipioSelecionado }: Props) {
  const isMunicipio = !!municipioSelecionado;

  const titulo    = isMunicipio ? "Comparativo de Desmatamento — todos os municípios" : "Desmatamento Anual no Acre";
  const subtitulo = isMunicipio
    ? `${municipioSelecionado.nome} destacado em azul — % desmatado por município`
    : "Área desmatada por ano em km² — Fonte: PRODES/INPE";

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-5 flex flex-col h-full">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">{titulo}</h3>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">{subtitulo}</p>

      <div className="flex-1 min-h-0">
        {isMunicipio ? (
          <Chart
            key={`comp-${municipioSelecionado.codIBGE}`}
            type="bar"
            options={buildOptionsComparativo(municipioSelecionado.codIBGE)}
            series={[{ name: "% Desmatado", data: municipiosOrdenados.map((m) => m.pct) }]}
            height={500}
          />
        ) : (
          <Chart
            key="estado-anual"
            type="area"
            options={optionsEstado}
            series={[{ name: "Área desmatada", data: kmDesmatadosEstado }]}
            height="100%"
          />
        )}
      </div>
    </div>
  );
}
