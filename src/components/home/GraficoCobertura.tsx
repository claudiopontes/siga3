"use client";

import dynamic from "next/dynamic";
import { ApexOptions } from "apexcharts";
import { desmatamentoPorCodigo } from "@/data/desmatamentoAcre";
import type { MunicipioSelecionado } from "./MapaDesmatamento";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

const legendaBase = { position: "right" as const, fontSize: "11px" };
const donutBase   = { size: "65%", labels: { show: true } };

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
const optionsEstado: ApexOptions = {
  chart: { type: "donut", fontFamily: "inherit" },
  colors: ["#16a34a", "#dc2626", "#94a3b8"],
  labels: ["Floresta nativa", "Desmatamento acumulado", "Outros usos"],
  legend: legendaBase,
  dataLabels: { enabled: true, formatter: (v: number) => `${v.toFixed(1)}%` },
  tooltip: { y: { formatter: (v) => `${v.toLocaleString("pt-BR")} km²` } },
  plotOptions: {
    pie: {
      donut: {
        ...donutBase,
        labels: { show: true, total: { show: true, label: "Área total", formatter: () => "164.123 km²" } },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------
interface Props {
  municipioSelecionado?: MunicipioSelecionado | null;
}

export default function GraficoCobertura({ municipioSelecionado }: Props) {
  const isMunicipio = !!municipioSelecionado;

  const titulo    = isMunicipio ? `Cobertura Florestal — ${municipioSelecionado.nome}` : "Cobertura Florestal";
  const subtitulo = isMunicipio
    ? `${municipioSelecionado.pct}% desmatado · ${municipioSelecionado.kmDesmatado.toLocaleString("pt-BR")} km²`
    : "Distribuição do uso do solo no estado do Acre";

  let options = optionsEstado;
  let series: number[] = [142_787, 18_054, 3_282];

  if (isMunicipio) {
    const dados = desmatamentoPorCodigo[municipioSelecionado.codIBGE];
    const preservado = dados.areaTotal - dados.kmDesmatado;
    options = {
      chart: { type: "donut", fontFamily: "inherit" },
      colors: ["#16a34a", "#dc2626"],
      labels: ["Área preservada", "Área desmatada"],
      legend: legendaBase,
      dataLabels: { enabled: true, formatter: (v: number) => `${v.toFixed(1)}%` },
      tooltip: { y: { formatter: (v) => `${v.toLocaleString("pt-BR")} km²` } },
      plotOptions: {
        pie: {
          donut: {
            ...donutBase,
            labels: {
              show: true,
              total: {
                show: true,
                label: "Área total",
                formatter: () => `${dados.areaTotal.toLocaleString("pt-BR")} km²`,
              },
            },
          },
        },
      },
    };
    series = [preservado, dados.kmDesmatado];
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-2 sm:p-3 flex flex-col h-full">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1 shrink-0">{titulo}</h3>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-3 shrink-0">{subtitulo}</p>
      <div className="flex-1 min-h-0">
        <Chart
          key={isMunicipio ? `cobertura-${municipioSelecionado.codIBGE}` : "cobertura-estado"}
          type="donut"
          options={options}
          series={series}
          height="100%"
        />
      </div>
    </div>
  );
}
