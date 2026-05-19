"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ApexOptions } from "apexcharts";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

interface ApiMunicipio {
  codigo_ibge: string;
  nome: string | null;
  ideb_ai: number | null;
  ideb_af: number | null;
  ideb_em: number | null;
  ideb_composite: number | null;
  edicao_ideb: number | null;
}

interface ApiResp {
  total: number;
  municipios: ApiMunicipio[];
}

const N_BARRAS = 8;

export default function GraficoIdeb() {
  const [dados, setDados] = useState<ApiMunicipio[]>([]);
  const [edicao, setEdicao] = useState<number | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    fetch("/api/educacao/mapa-acre")
      .then((r) => r.json())
      .then((d: ApiResp) => {
        if (cancelado) return;
        setDados(d.municipios ?? []);
        setEdicao(d.municipios?.find((m) => m.edicao_ideb !== null)?.edicao_ideb ?? null);
      })
      .catch(() => { if (!cancelado) setDados([]); })
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, []);

  // Top N municípios por IDEB Anos Finais — mantém o tema histórico do gráfico
  const top = [...dados]
    .filter((m) => m.ideb_af !== null)
    .sort((a, b) => (b.ideb_af ?? 0) - (a.ideb_af ?? 0))
    .slice(0, N_BARRAS);

  const categorias = top.map((m) => m.nome ?? m.codigo_ibge);
  const valores    = top.map((m) => m.ideb_af ?? 0);

  const options: ApexOptions = {
    chart: { type: "bar", toolbar: { show: false }, fontFamily: "inherit" },
    colors: ["#3B82F6"],
    plotOptions: {
      bar: { borderRadius: 4, horizontal: true, dataLabels: { position: "top" } },
    },
    dataLabels: {
      enabled: true,
      formatter: (v) => (typeof v === "number" ? v.toFixed(1) : String(v)),
      offsetX: 18,
      style: { fontSize: "11px", colors: ["#374151"] },
    },
    xaxis: {
      categories: categorias,
      min: 0,
      max: 7,
      labels: { style: { fontSize: "11px" } },
    },
    yaxis: { labels: { style: { fontSize: "11px" } } },
    grid: { borderColor: "#f0f0f0", strokeDashArray: 4 },
    tooltip: { y: { formatter: (v) => `IDEB ${v.toFixed(1)}` } },
  };

  const series = [{ data: valores }];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 sm:p-4 h-full">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">
        IDEB — Anos Finais {edicao ? `(${edicao})` : ""}
      </h3>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
        {carregando
          ? "Carregando dados INEP…"
          : top.length > 0
            ? `Top ${top.length} municípios do Acre — rede Pública`
            : "Sem dados disponíveis. Execute a carga INEP."}
      </p>
      {!carregando && top.length > 0 && (
        <Chart type="bar" options={options} series={series} height={210} />
      )}
      {!carregando && top.length === 0 && (
        <div className="flex h-[210px] items-center justify-center text-xs text-gray-400">
          Sem dados — mart.painel_educacao_municipio vazio
        </div>
      )}
    </div>
  );
}
