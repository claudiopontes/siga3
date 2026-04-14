"use client";

import dynamic from "next/dynamic";
import { ApexOptions } from "apexcharts";
import { desmatamentoPorCodigo, MunicipioDesmatamento } from "@/data/desmatamentoAcre";
import type { MunicipioSelecionado } from "./MapaDesmatamento";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

// ---------------------------------------------------------------------------
// Dados do estado (PRODES/INPE)
// ---------------------------------------------------------------------------
const anosDesmatamento = ["2015","2016","2017","2018","2019","2020","2021","2022","2023","2024"];
const kmDesmatadosEstado = [1465, 1454, 1177, 1282, 1699, 1635, 1190, 1002, 924, 870];

// ---------------------------------------------------------------------------
// Opções base reutilizáveis
// ---------------------------------------------------------------------------
const baseGrid: ApexOptions["grid"] = { borderColor: "#f0f0f0", strokeDashArray: 4 };

// ---------------------------------------------------------------------------
// Gráficos — Estado (sem seleção)
// ---------------------------------------------------------------------------
function chartDesmatamentoEstado(): { options: ApexOptions; series: ApexAxisChartSeries } {
  return {
    options: {
      chart: { type: "area", toolbar: { show: false }, fontFamily: "inherit" },
      colors: ["#e45e3c"],
      fill: { type: "gradient", gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 100] } },
      stroke: { curve: "smooth", width: 2 },
      dataLabels: { enabled: false },
      xaxis: { categories: anosDesmatamento, labels: { style: { fontSize: "11px" } } },
      yaxis: { labels: { formatter: (v) => `${v.toLocaleString("pt-BR")} km²`, style: { fontSize: "11px" } } },
      tooltip: { y: { formatter: (v) => `${v.toLocaleString("pt-BR")} km²` } },
      grid: baseGrid,
    },
    series: [{ name: "Área desmatada", data: kmDesmatadosEstado }],
  };
}

function chartCoberturaEstado(): { options: ApexOptions; series: number[] } {
  return {
    options: {
      chart: { type: "donut", fontFamily: "inherit" },
      colors: ["#16a34a", "#dc2626", "#94a3b8"],
      labels: ["Floresta nativa", "Desmatamento acumulado", "Outros usos"],
      legend: { position: "right", fontSize: "11px" },
      dataLabels: { enabled: true, formatter: (v: number) => `${v.toFixed(1)}%` },
      tooltip: { y: { formatter: (v) => `${v.toLocaleString("pt-BR")} km²` } },
      plotOptions: {
        pie: {
          donut: {
            size: "65%",
            labels: { show: true, total: { show: true, label: "Área total", formatter: () => "164.123 km²" } },
          },
        },
      },
    },
    series: [142_787, 18_054, 3_282],
  };
}

// ---------------------------------------------------------------------------
// Gráficos — Município selecionado
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

function chartComparacaoMunicipios(codSelecionado: string): { options: ApexOptions; series: ApexAxisChartSeries } {
  const colors = municipiosOrdenados.map((m) =>
    m.cod === codSelecionado ? "#1d4ed8" : getBarColor(m.pct)
  );

  return {
    options: {
      chart: { type: "bar", toolbar: { show: false }, fontFamily: "inherit" },
      colors,
      plotOptions: {
        bar: {
          borderRadius: 3,
          horizontal: true,
          distributed: true,
          dataLabels: { position: "top" },
        },
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
    },
    series: [{ name: "% Desmatado", data: municipiosOrdenados.map((m) => m.pct) }],
  };
}

function chartCoberturaMunicipio(municipio: MunicipioDesmatamento): { options: ApexOptions; series: number[] } {
  const preservado = municipio.areaTotal - municipio.kmDesmatado;
  return {
    options: {
      chart: { type: "donut", fontFamily: "inherit" },
      colors: ["#16a34a", "#dc2626"],
      labels: ["Área preservada", "Área desmatada"],
      legend: { position: "right", fontSize: "11px" },
      dataLabels: { enabled: true, formatter: (v: number) => `${v.toFixed(1)}%` },
      tooltip: { y: { formatter: (v) => `${v.toLocaleString("pt-BR")} km²` } },
      plotOptions: {
        pie: {
          donut: {
            size: "65%",
            labels: {
              show: true,
              total: {
                show: true,
                label: "Área total",
                formatter: () => `${municipio.areaTotal.toLocaleString("pt-BR")} km²`,
              },
            },
          },
        },
      },
    },
    series: [preservado, municipio.kmDesmatado],
  };
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------
interface Props {
  municipioSelecionado?: MunicipioSelecionado | null;
  stacked?: boolean;
}

export default function GraficosHome({ municipioSelecionado, stacked }: Props) {
  const isMunicipio = !!municipioSelecionado;

  const desmatamentoChart = isMunicipio
    ? chartComparacaoMunicipios(municipioSelecionado.codIBGE)
    : chartDesmatamentoEstado();

  const coberturaChart = isMunicipio
    ? chartCoberturaMunicipio(municipioSelecionado)
    : chartCoberturaEstado();

  const desmatamentoTitulo = isMunicipio
    ? "Comparativo de Desmatamento — todos os municípios"
    : "Desmatamento Anual no Acre";

  const desmatamentoSubtitulo = isMunicipio
    ? `${municipioSelecionado.nome} destacado em azul — % desmatado por município`
    : "Área desmatada por ano em km² — Fonte: PRODES/INPE";

  const coberturaTitulo = isMunicipio
    ? `Cobertura Florestal — ${municipioSelecionado.nome}`
    : "Cobertura Florestal";

  const coberturaSubtitulo = isMunicipio
    ? `${municipioSelecionado.pct}% do território desmatado · ${municipioSelecionado.kmDesmatado.toLocaleString("pt-BR")} km²`
    : "Distribuição do uso do solo no estado do Acre";

  // Quando município selecionado em modo stacked, o comparativo precisa de
  // altura fixa suficiente para exibir as 22 barras com legibilidade.
  const stackedComMunicipio = stacked && isMunicipio;

  const cardDesmatamentoClass = [
    "bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5",
    stacked && !isMunicipio ? "flex flex-col flex-1 min-h-0" : "",
  ].join(" ");

  const cardCoberturaClass = [
    "bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5",
    stacked ? "flex flex-col flex-1 min-h-0" : "",
  ].join(" ");

  const chartWrapClass = stacked && !stackedComMunicipio ? "flex-1 min-h-0" : "";

  // Alturas explícitas
  const alturaComparativo  = 500; // 22 municípios × ~22px + margens
  const alturaEstadoArea   = stacked ? "100%" : 220;
  const alturaDonut        = stacked && !isMunicipio ? "100%" : (isMunicipio ? 220 : 220);

  return (
    <div className={stacked ? "flex flex-col gap-4 h-full" : "grid grid-cols-1 lg:grid-cols-2 gap-4"}>
      {/* Desmatamento */}
      <div className={cardDesmatamentoClass}>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1 shrink-0">
          {desmatamentoTitulo}
        </h3>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-3 shrink-0">
          {desmatamentoSubtitulo}
        </p>
        <div className={chartWrapClass}>
          {isMunicipio ? (
            <Chart
              key={`comp-${municipioSelecionado.codIBGE}`}
              type="bar"
              options={desmatamentoChart.options}
              series={(desmatamentoChart as ReturnType<typeof chartComparacaoMunicipios>).series}
              height={alturaComparativo}
            />
          ) : (
            <Chart
              key="estado-anual"
              type="area"
              options={desmatamentoChart.options}
              series={(desmatamentoChart as ReturnType<typeof chartDesmatamentoEstado>).series}
              height={alturaEstadoArea}
            />
          )}
        </div>
      </div>

      {/* Cobertura florestal */}
      <div className={cardCoberturaClass}>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1 shrink-0">
          {coberturaTitulo}
        </h3>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-3 shrink-0">
          {coberturaSubtitulo}
        </p>
        <div className={stacked ? "flex-1 min-h-0" : ""}>
          <Chart
            key={isMunicipio ? `cobertura-${municipioSelecionado.codIBGE}` : "cobertura-estado"}
            type="donut"
            options={coberturaChart.options}
            series={coberturaChart.series}
            height={alturaDonut}
          />
        </div>
      </div>
    </div>
  );
}
