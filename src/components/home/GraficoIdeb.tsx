"use client";

import dynamic from "next/dynamic";
import { ApexOptions } from "apexcharts";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

const options: ApexOptions = {
  chart: { type: "bar", toolbar: { show: false }, fontFamily: "inherit" },
  colors: ["#3B82F6"],
  plotOptions: {
    bar: { borderRadius: 4, horizontal: true, dataLabels: { position: "top" } },
  },
  dataLabels: {
    enabled: true,
    formatter: (v) => String(v),
    offsetX: 18,
    style: { fontSize: "11px", colors: ["#374151"] },
  },
  xaxis: {
    categories: [
      "Rio Branco", "Cruzeiro do Sul", "Tarauacá", "Sena Madureira",
      "Feijó", "Brasiléia", "Xapuri", "Juruá",
    ],
    min: 0,
    max: 7,
    labels: { style: { fontSize: "11px" } },
  },
  yaxis: { labels: { style: { fontSize: "11px" } } },
  grid: { borderColor: "#f0f0f0", strokeDashArray: 4 },
  tooltip: { y: { formatter: (v) => `IDEB ${v}` } },
};

const series = [{ data: [5.2, 4.8, 4.1, 4.3, 3.9, 4.6, 4.4, 3.7] }];

export default function GraficoIdeb() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 sm:p-4 h-full">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">
        IDEB por Regional
      </h3>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
        Índice de Desenvolvimento da Educação Básica — Anos finais (dados ilustrativos)
      </p>
      <Chart type="bar" options={options} series={series} height={210} />
    </div>
  );
}
