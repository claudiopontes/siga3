"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { normalizeName } from "@/components/combustivel/filter-utils";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

type EmpenhoRow = {
  ano: number;
  mes: number;
  entidade: string;
  tipo_combustivel: string;
  forma_fornecimento: string;
  nome_credor: string;
  valor_empenho: number;
  valor_liquidado: number;
  qtd_empenhos: number;
  atualizado_em: string;
};

type ChartKey = "line" | "treemap" | "pie" | "donut" | "credorBar" | "pareto";

function formatMoney(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatMillions(value: number): string {
  if (value >= 1_000_000) {
    return `${new Intl.NumberFormat("pt-BR", {
      maximumFractionDigits: 2,
    }).format(value / 1_000_000)} Mi`;
  }

  if (value >= 1_000) {
    return `${new Intl.NumberFormat("pt-BR", {
      maximumFractionDigits: 2,
    }).format(value / 1_000)} mil`;
  }

  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDeltaPercent(value: number): string {
  const signal = value > 0 ? "+" : "";
  return `${signal}${new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
  }).format(value)}%`;
}

function rowMonthKey(row: EmpenhoRow): string {
  return `${row.ano}-${String(row.mes).padStart(2, "0")}`;
}

function toMonthLabel(value: string | null): string {
  if (!value) return "--/----";

  const [year, month] = value.split("-");
  if (!year || !month) return value;

  return `${month}/${year}`;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;

  if (typeof error === "object" && error !== null && "message" in error) {
    const msg = (error as { message?: unknown }).message;
    return typeof msg === "string" ? msg : String(msg);
  }

  return String(error);
}

export default function PainelEmpenhoClient() {
  "use no memo";

  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [highlightedChart, setHighlightedChart] = useState<ChartKey | null>(null);
  const [rows, setRows] = useState<EmpenhoRow[]>([]);

  const selectedEntidade = searchParams.get("entidade") ?? "all";
  const selectedTipos = searchParams.getAll("tipo").filter((t) => t.length > 0);
  const selectedCredor = searchParams.get("credor") ?? "all";
  const selectedForma = searchParams.get("forma") ?? "all";
  const selectedAnoInicio = searchParams.get("anoInicio") ?? "";
  const selectedAnoFim = searchParams.get("anoFim") ?? "";

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      if (!isSupabaseConfigured || !supabase) {
        setError("Supabase não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.");
        setLoading(false);
        return;
      }

      try {
        const pageSize = 1000;
        let offset = 0;
        const out: EmpenhoRow[] = [];

        while (true) {
          const { data, error } = await supabase
            .from("combustivel_empenho_mensal")
            .select("ano, mes, entidade, tipo_combustivel, forma_fornecimento, nome_credor, valor_empenho, valor_liquidado, qtd_empenhos, atualizado_em")
            .order("ano", { ascending: true })
            .order("mes", { ascending: true })
            .range(offset, offset + pageSize - 1);

          if (error) throw error;

          const batch = (data ?? []) as EmpenhoRow[];
          out.push(...batch);

          if (batch.length < pageSize) break;
          offset += pageSize;
        }

        if (!active) return;

        setRows(out);


        // Auto-seleciona os últimos 2 anos se nenhum filtro de ano estiver definido
        const params = new URLSearchParams(window.location.search);
        if (!params.get("anoInicio") && !params.get("anoFim")) {
          const anos = [...new Set(out.map((r) => r.ano))].sort((a, b) => a - b);
          const maxAno = anos.at(-1) ?? new Date().getFullYear();
          params.set("anoInicio", String(maxAno - 1));
          params.set("anoFim", String(maxAno));
          router.replace(`/painel-combustivel-empenhos?${params.toString()}`, { scroll: false });
        }

        setLoading(false);
      } catch (err) {
        if (!active) return;

        setError(extractErrorMessage(err) || "Falha ao carregar dados");
        setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [router]);

  const availableTipos = useMemo(
    () => [...new Set(rows.map((r) => r.tipo_combustivel))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [rows],
  );

  const availableCredores = useMemo(
    () => [...new Set(rows.map((r) => r.nome_credor).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [rows],
  );

  const availableFormas = useMemo(
    () => [...new Set(rows.map((r) => r.forma_fornecimento).filter(Boolean))].sort(),
    [rows],
  );

  const availableEntidades = useMemo(
    () => [...new Set(rows.map((r) => r.entidade).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [rows],
  );

  const availableYears = useMemo(
    () => [...new Set(rows.map((r) => r.ano))].filter(Boolean).sort((a, b) => a - b),
    [rows],
  );

  const filteredRows = useMemo(() => {
    let r = rows;

    if (selectedEntidade !== "all") {
      const norm = normalizeName(selectedEntidade);
      r = r.filter((row) => normalizeName(row.entidade) === norm);
    }

    if (selectedTipos.length > 0) {
      const set = new Set(selectedTipos);
      r = r.filter((row) => set.has(row.tipo_combustivel));
    }

    if (selectedCredor !== "all") {
      const norm = normalizeName(selectedCredor);
      r = r.filter((row) => normalizeName(row.nome_credor) === norm);
    }

    if (selectedForma !== "all") {
      r = r.filter((row) => row.forma_fornecimento === selectedForma);
    }

    if (selectedAnoInicio) {
      const inicio = parseInt(selectedAnoInicio, 10);
      r = r.filter((row) => row.ano >= inicio);
    }

    if (selectedAnoFim) {
      const fim = parseInt(selectedAnoFim, 10);
      r = r.filter((row) => row.ano <= fim);
    }

    return r;
  }, [rows, selectedEntidade, selectedTipos, selectedCredor, selectedForma, selectedAnoInicio, selectedAnoFim]);

  const totalEmpenhado = useMemo(
    () => filteredRows.reduce((s, r) => s + (r.valor_empenho ?? 0), 0),
    [filteredRows],
  );

  const totalLiquidado = useMemo(
    () => filteredRows.reduce((s, r) => s + (r.valor_liquidado ?? 0), 0),
    [filteredRows],
  );

  const pctExecutado = totalEmpenhado > 0 ? (totalLiquidado / totalEmpenhado) * 100 : 0;
  const qtdEmpenhos = useMemo(
    () => filteredRows.reduce((s, r) => s + (r.qtd_empenhos ?? 0), 0),
    [filteredRows],
  );

  const kpiVariation = useMemo(() => {
    const byMonth = new Map<string, { emp: number; liq: number; qtd: number }>();

    for (const r of filteredRows) {
      const key = rowMonthKey(r);
      const cur = byMonth.get(key) ?? { emp: 0, liq: 0, qtd: 0 };

      cur.emp += r.valor_empenho ?? 0;
      cur.liq += r.valor_liquidado ?? 0;
      cur.qtd += r.qtd_empenhos ?? 0;

      byMonth.set(key, cur);
    }

    const keys = [...byMonth.keys()].sort();
    if (keys.length < 2) return null;

    const lastKey = keys[keys.length - 1]!;
    const prevKey = keys[keys.length - 2]!;
    const last = byMonth.get(lastKey)!;
    const prev = byMonth.get(prevKey)!;

    const deltaEmp = prev.emp > 0 ? ((last.emp - prev.emp) / prev.emp) * 100 : 0;
    const deltaLiq = prev.liq > 0 ? ((last.liq - prev.liq) / prev.liq) * 100 : 0;
    const deltaQtd = prev.qtd > 0 ? ((last.qtd - prev.qtd) / prev.qtd) * 100 : 0;

    return { deltaEmp, deltaLiq, deltaQtd };
  }, [filteredRows]);

  const monthlySeries = useMemo(() => {
    const byMonth = new Map<string, { emp: number; liq: number }>();

    for (const r of filteredRows) {
      const key = rowMonthKey(r);
      const cur = byMonth.get(key) ?? { emp: 0, liq: 0 };

      cur.emp += r.valor_empenho ?? 0;
      cur.liq += r.valor_liquidado ?? 0;

      byMonth.set(key, cur);
    }

    const keys = [...byMonth.keys()].sort();

    return {
      categories: keys.map(toMonthLabel),
      empenhado: keys.map((k) => +(byMonth.get(k)!.emp.toFixed(2))),
      liquidado: keys.map((k) => +(byMonth.get(k)!.liq.toFixed(2))),
    };
  }, [filteredRows]);

  const entidadeTreemap = useMemo(() => {
    const map = new Map<string, number>();

    for (const r of filteredRows) {
      map.set(r.entidade, (map.get(r.entidade) ?? 0) + (r.valor_empenho ?? 0));
    }

    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([x, y]) => ({ x, y: +y.toFixed(2) }));
  }, [filteredRows]);

  const tipoPie = useMemo(() => {
    const map = new Map<string, number>();

    for (const r of filteredRows) {
      map.set(r.tipo_combustivel, (map.get(r.tipo_combustivel) ?? 0) + (r.valor_empenho ?? 0));
    }

    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [filteredRows]);

  const formaDonut = useMemo(() => {
    const map = new Map<string, number>();

    for (const r of filteredRows) {
      map.set(r.forma_fornecimento, (map.get(r.forma_fornecimento) ?? 0) + (r.valor_empenho ?? 0));
    }

    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [filteredRows]);

  const credorBar = useMemo(() => {
    const map = new Map<string, number>();

    for (const r of filteredRows) {
      if (r.nome_credor) {
        map.set(r.nome_credor, (map.get(r.nome_credor) ?? 0) + (r.valor_empenho ?? 0));
      }
    }

    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([name, value]) => ({ name, value: +value.toFixed(2) }));
  }, [filteredRows]);

  const credorPareto = useMemo(() => {
    const sorted = [...credorBar].sort((a, b) => b.value - a.value).slice(0, 15);
    const total = sorted.reduce((s, r) => s + r.value, 0);

    let acc = 0;

    return sorted.map((item) => {
      acc += item.value;
      return {
        name: item.name,
        value: item.value,
        acumulado: total > 0 ? +((acc / total) * 100).toFixed(1) : 0,
      };
    });
  }, [credorBar]);

  function setFilter(key: string, value: string | string[]) {
    const params = new URLSearchParams(searchParams.toString());

    if (Array.isArray(value)) {
      params.delete(key);
      value.forEach((v) => params.append(key, v));
    } else {
      if (value === "all") params.delete(key);
      else params.set(key, value);
    }

    router.replace(`/painel-combustivel-empenhos?${params.toString()}`, {
      scroll: false,
    });
  }

  function clearAllFilters() {
    const maxAno = availableYears.at(-1) ?? new Date().getFullYear();
    const params = new URLSearchParams();
    params.set("anoInicio", String(maxAno - 1));
    params.set("anoFim", String(maxAno));
    router.replace(`/painel-combustivel-empenhos?${params.toString()}`, { scroll: false });
  }

  const hasActiveFilters =
    selectedEntidade !== "all" ||
    selectedTipos.length > 0 ||
    selectedCredor !== "all" ||
    selectedForma !== "all";

  function highlightClass(key: ChartKey) {
    if (!highlightedChart) return "";
    return highlightedChart === key ? "ring-2 ring-orange-400" : "opacity-40";
  }

  const lineOptions: ApexOptions = {
    chart: {
      type: "line",
      toolbar: { show: false },
      zoom: { enabled: false },
      background: "transparent",
    },
    colors: ["#f97316", "#3b82f6"],
    stroke: { curve: "smooth", width: [2, 2] },
    xaxis: {
      categories: monthlySeries.categories,
      labels: { style: { fontSize: "11px" } },
    },
    yaxis: {
      labels: {
        formatter: (v) => formatMillions(v),
        style: { fontSize: "11px" },
      },
    },
    tooltip: { y: { formatter: (v) => formatMoney(v) } },
    legend: { position: "top" },
    theme: { mode: "light" },
    grid: { borderColor: "#f1f5f9" },
  };

  const lineSeries = [
    { name: "Empenhado", data: monthlySeries.empenhado },
    { name: "Liquidado", data: monthlySeries.liquidado },
  ];

  const treemapOptions: ApexOptions = {
    chart: {
      type: "treemap",
      toolbar: { show: false },
      background: "transparent",
      events: {
        dataPointSelection: (_e, _chart, config) => {
          const label: string | undefined = entidadeTreemap[config.dataPointIndex]?.x;
          if (!label) return;

          const norm = normalizeName(label);
          setFilter("entidade", norm === normalizeName(selectedEntidade) ? "all" : label);
        },
      },
    },
    colors: ["#f97316"],
    dataLabels: { enabled: true, style: { fontSize: "11px" } },
    tooltip: { y: { formatter: (v) => formatMoney(v) } },
    theme: { mode: "light" },
  };

  const treemapSeries = [{ data: entidadeTreemap }];

  const pieOptions: ApexOptions = {
    chart: { type: "pie", toolbar: { show: false }, background: "transparent" },
    labels: tipoPie.map(([label]) => label),
    colors: ["#f97316", "#3b82f6", "#10b981", "#8b5cf6", "#ef4444", "#eab308", "#06b6d4", "#ec4899"],
    legend: { position: "bottom", fontSize: "11px" },
    tooltip: { y: { formatter: (v) => formatMoney(v) } },
    theme: { mode: "light" },
  };

  const pieSeries = tipoPie.map(([, v]) => v);

  const donutOptions: ApexOptions = {
    chart: { type: "donut", toolbar: { show: false }, background: "transparent" },
    labels: formaDonut.map(([label]) => label),
    colors: ["#f97316", "#3b82f6"],
    legend: { position: "bottom", fontSize: "11px" },
    tooltip: { y: { formatter: (v) => formatMoney(v) } },
    plotOptions: { pie: { donut: { size: "65%" } } },
    theme: { mode: "light" },
  };

  const donutSeries = formaDonut.map(([, v]) => v);

  const credorBarOptions: ApexOptions = {
    chart: { type: "bar", toolbar: { show: false }, background: "transparent" },
    plotOptions: { bar: { horizontal: true, borderRadius: 4 } },
    colors: ["#f97316"],
    dataLabels: {
      enabled: true,
      formatter: (v) => formatMillions(Number(v)),
      style: { fontSize: "10px" },
    },
    xaxis: {
      labels: {
        formatter: (v) => formatMillions(Number(v)),
        style: { fontSize: "10px" },
      },
    },
    yaxis: { labels: { style: { fontSize: "10px" }, maxWidth: 180 } },
    tooltip: { y: { formatter: (v) => formatMoney(v) } },
    theme: { mode: "light" },
    grid: { borderColor: "#f1f5f9" },
  };

  const credorBarSeries = [
    {
      name: "Empenhado",
      data: credorBar.map((r) => ({ x: r.name, y: r.value })),
    },
  ];

  const paretoOptions: ApexOptions = {
    chart: { type: "bar", toolbar: { show: false }, background: "transparent" },
    plotOptions: { bar: { borderRadius: 4 } },
    colors: ["#f97316", "#3b82f6"],
    stroke: { width: [0, 2], colors: ["transparent", "#3b82f6"] },
    xaxis: {
      categories: credorPareto.map((r) => r.name),
      labels: { rotate: -35, style: { fontSize: "10px" } },
    },
    dataLabels: { enabled: false },
    yaxis: [
      {
        labels: {
          formatter: (v) => formatMillions(v),
          style: { fontSize: "10px" },
        },
      },
      {
        opposite: true,
        min: 0,
        max: 100,
        labels: {
          formatter: (v) =>
            `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`,
          style: { fontSize: "10px" },
        },
      },
    ],
    tooltip: {
      shared: true,
      intersect: false,
      y: [
        { formatter: (v) => formatMoney(v) },
        {
          formatter: (v) =>
            `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`,
        },
      ],
    },
    legend: { position: "top" },
    theme: { mode: "light" },
    grid: { borderColor: "#f1f5f9" },
  };

  const paretoSeries: { name: string; type: "column" | "line"; data: number[] }[] = [
    { name: "Empenhado", type: "column", data: credorPareto.map((r) => r.value) },
    { name: "Acumulado %", type: "line", data: credorPareto.map((r) => r.acumulado) },
  ];

  const chartMeta: Record<ChartKey, { title: string; containerId: string }> = {
    line: { title: "Evolução Mensal — Empenhado vs Liquidado", containerId: "chart-panel-line" },
    treemap: { title: "Valor Empenhado por Entidade", containerId: "chart-panel-treemap" },
    pie: { title: "Distribuição por Tipo de Combustível", containerId: "chart-panel-pie" },
    donut: { title: "Forma de Fornecimento", containerId: "chart-panel-donut" },
    credorBar: { title: "TOP Credores / Fornecedores", containerId: "chart-panel-credor-bar" },
    pareto: { title: "Pareto — Credores (80/20)", containerId: "chart-panel-pareto" },
  };

  const closeActionsMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    const details = event.currentTarget.closest("details");
    details?.removeAttribute("open");
  };

  const printChart = (chart: ChartKey) => {
    const meta = chartMeta[chart];
    const target = document.getElementById(meta.containerId);
    if (!target) return;

    const chartCanvas = target.querySelector(".apexcharts-canvas");
    const content = chartCanvas ? chartCanvas.outerHTML : target.innerHTML;
    const printWindow = window.open("", "_blank", "width=1200,height=860");
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>${meta.title}</title>
          <style>
            body { margin: 0; font-family: Arial, sans-serif; padding: 24px; color: #111827; }
            h1 { margin: 0 0 16px; font-size: 20px; font-weight: 700; }
            .chart-wrap { border: 1px solid #d1d5db; border-radius: 12px; padding: 12px; }
          </style>
        </head>
        <body>
          <h1>${meta.title}</h1>
          <div class="chart-wrap">${content}</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16 text-gray-400">
        Carregando dados de empenhos...
      </div>
    );
  }

  if (error) {
    return (
      <div className="m-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="w-full max-w-full min-w-0 space-y-3 overflow-x-hidden pb-2">
      {/* Filtros inline (mobile) */}
      <div className="min-w-0 lg:hidden">
        <div className="overflow-x-auto pb-1">
          <div className="flex min-w-max items-center gap-2">
            <FilterPill
              label="Entidade"
              value={selectedEntidade}
              options={availableEntidades}
              onSelect={(v) => setFilter("entidade", v)}
            />
            <FilterPill
              label="Tipo"
              value={selectedTipos[0] ?? "all"}
              options={availableTipos}
              onSelect={(v) => setFilter("tipo", v === "all" ? [] : [v])}
            />
            <FilterPill
              label="Credor"
              value={selectedCredor}
              options={availableCredores}
              onSelect={(v) => setFilter("credor", v)}
            />
            <FilterPill
              label="Fornecimento"
              value={selectedForma}
              options={availableFormas}
              onSelect={(v) => setFilter("forma", v)}
            />
            <div className="flex shrink-0 items-center gap-1">
              <span className="text-xs text-gray-500">Ano:</span>
              <select
                value={selectedAnoInicio}
                onChange={(e) => setFilter("anoInicio", e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
              >
                <option value="">Todos</option>
                {availableYears.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <span className="text-xs text-gray-500">a</span>
              <select
                value={selectedAnoFim}
                onChange={(e) => setFilter("anoFim", e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
              >
                <option value="">Todos</option>
                {availableYears.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100"
              >
                Limpar filtros
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Linha superior: KPIs + metadados/ações */}
      <div className="grid w-full min-w-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_240px] 2xl:grid-cols-[minmax(0,1fr)_260px] xl:items-stretch">
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="Valor Empenhado"
            value={`R$ ${formatMillions(totalEmpenhado)}`}
            delta={kpiVariation?.deltaEmp ?? null}
          />
          <KpiCard
            title="Valor Liquidado"
            value={`R$ ${formatMillions(totalLiquidado)}`}
            delta={kpiVariation?.deltaLiq ?? null}
          />
          <KpiCard
            title="Execução Orçamentária"
            value={`${pctExecutado.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
            delta={null}
          />
          <KpiCard
            title="Qtd. de Empenhos"
            value={qtdEmpenhos.toLocaleString("pt-BR")}
            delta={kpiVariation?.deltaQtd ?? null}
          />
        </div>

        <div className="min-w-0">
          <div className="flex h-full w-full flex-col gap-2">
            <Link
              href="/painel-combustivel"
              className="group relative inline-flex h-8 w-full items-center justify-center gap-2 overflow-hidden rounded-xl border border-orange-300 bg-gradient-to-r from-orange-500 to-amber-500 px-3 text-[10px] font-extrabold uppercase tracking-[0.02em] text-white shadow-sm shadow-orange-300/40 transition hover:from-orange-600 hover:to-amber-600 hover:shadow-md hover:shadow-orange-300/50 dark:border-orange-700 dark:from-orange-700 dark:to-amber-700 dark:shadow-none"
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.3),transparent_40%)] opacity-90 transition group-hover:opacity-100" />

              <svg
                className="relative h-3 w-3 shrink-0"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10 7 5 12l5 5" />
                <path d="M5 12h10a4 4 0 1 1 0 8h-1" />
              </svg>

              <span className="relative">Notas Fiscais</span>
            </Link>

          </div>
        </div>
      </div>

      {/* Linha: evolução mensal */}
      <ChartCard
        title="Evolução Mensal — Empenhado vs Liquidado"
        className={highlightClass("line")}
        actions={
          <ChartActions
            onView={() => setHighlightedChart("line")}
            onPrint={printChart}
            chartKey="line"
            onCloseMenu={closeActionsMenu}
          />
        }
      >
        <div id="chart-panel-line" className="-mx-1 overflow-x-auto px-1">
          <div className="min-w-[760px]">
            <Chart options={lineOptions} series={lineSeries} type="line" height={270} width="100%" />
          </div>
        </div>
      </ChartCard>

      {/* Treemap + Pizza */}
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Valor Empenhado por Entidade"
          className={highlightClass("treemap")}
          actions={
            <ChartActions
              onView={() => setHighlightedChart("treemap")}
              onPrint={printChart}
              chartKey="treemap"
              onCloseMenu={closeActionsMenu}
            />
          }
        >
          <div id="chart-panel-treemap" className="overflow-x-auto">
            <div className="min-w-[440px]">
              <Chart options={treemapOptions} series={treemapSeries} type="treemap" height={270} width="100%" />
            </div>
          </div>
        </ChartCard>

        <ChartCard
          title="Distribuição por Tipo de Combustível"
          className={highlightClass("pie")}
          actions={
            <ChartActions
              onView={() => setHighlightedChart("pie")}
              onPrint={printChart}
              chartKey="pie"
              onCloseMenu={closeActionsMenu}
            />
          }
        >
          {pieSeries.length > 0 ? (
            <div id="chart-panel-pie" className="overflow-x-auto">
              <div className="min-w-[340px]">
                <Chart options={pieOptions} series={pieSeries} type="pie" height={270} width="100%" />
              </div>
            </div>
          ) : (
            <Empty />
          )}
        </ChartCard>
      </div>

      {/* Donut + Barras credores */}
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Forma de Fornecimento"
          className={highlightClass("donut")}
          actions={
            <ChartActions
              onView={() => setHighlightedChart("donut")}
              onPrint={printChart}
              chartKey="donut"
              onCloseMenu={closeActionsMenu}
            />
          }
        >
          {donutSeries.length > 0 ? (
            <div id="chart-panel-donut" className="overflow-x-auto">
              <div className="min-w-[340px]">
                <Chart options={donutOptions} series={donutSeries} type="donut" height={270} width="100%" />
              </div>
            </div>
          ) : (
            <Empty />
          )}
        </ChartCard>

        <ChartCard
          title="TOP Credores / Fornecedores"
          className={highlightClass("credorBar")}
          actions={
            <ChartActions
              onView={() => setHighlightedChart("credorBar")}
              onPrint={printChart}
              chartKey="credorBar"
              onCloseMenu={closeActionsMenu}
            />
          }
        >
          {credorBar.length > 0 ? (
            <div id="chart-panel-credor-bar" className="overflow-x-auto">
              <div className="min-w-[500px]">
                <Chart options={credorBarOptions} series={credorBarSeries} type="bar" height={270} width="100%" />
              </div>
            </div>
          ) : (
            <Empty />
          )}
        </ChartCard>
      </div>

      {/* Pareto */}
      <ChartCard
        title="Pareto — Credores (80/20)"
        className={highlightClass("pareto")}
        actions={
          <ChartActions
            onView={() => setHighlightedChart("pareto")}
            onPrint={printChart}
            chartKey="pareto"
            onCloseMenu={closeActionsMenu}
          />
        }
      >
        {credorPareto.length > 0 ? (
          <div id="chart-panel-pareto" className="overflow-x-auto">
            <div className="min-w-[620px]">
              <Chart options={paretoOptions} series={paretoSeries} type="bar" height={290} width="100%" />
            </div>
          </div>
        ) : (
          <Empty />
        )}
      </ChartCard>
      {highlightedChart ? (
        <div className="fixed inset-0 z-120000 flex items-center justify-center p-3 sm:p-5">
          <button
            type="button"
            aria-label="Fechar visualização ampliada"
            className="absolute inset-0 bg-gray-900/70 backdrop-blur-[1px]"
            onClick={() => setHighlightedChart(null)}
          />
          <div className="relative z-10 flex h-[95vh] w-[98vw] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl dark:border-gray-700 dark:bg-gray-900 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3 border-b border-gray-200 pb-3 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">{chartMeta[highlightedChart].title}</h3>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => printChart(highlightedChart)} className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">Imprimir</button>
                <button type="button" onClick={() => setHighlightedChart(null)} className="rounded-md bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600">Fechar</button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-gray-200 p-2 dark:border-gray-700 sm:p-3">
              <div className="h-full min-w-[760px]">
                <ChartCardContent chartKey={highlightedChart} lineOptions={lineOptions} lineSeries={lineSeries} treemapOptions={treemapOptions} treemapSeries={treemapSeries} pieOptions={pieOptions} pieSeries={pieSeries} donutOptions={donutOptions} donutSeries={donutSeries} credorBarOptions={credorBarOptions} credorBarSeries={credorBarSeries} paretoOptions={paretoOptions} paretoSeries={paretoSeries} />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function KpiCard({
  title,
  value,
  delta,
}: {
  title: string;
  value: string;
  delta: number | null;
}) {
  const trendColor =
    delta === null ? ""
    : delta > 0.01 ? "text-emerald-600 dark:text-emerald-300"
    : delta < -0.01 ? "text-red-600 dark:text-red-300"
    : "text-blue-600 dark:text-blue-300";

  const trendArrow =
    delta === null ? ""
    : delta > 0.01 ? "↑"
    : delta < -0.01 ? "↓"
    : "→";

  return (
    <div className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-1.5">
        <h3 className="text-sm font-semibold tracking-tight text-gray-700 dark:text-gray-200">{title}</h3>
      </div>
      <div className="text-center">
        <p className="text-[26px] font-semibold leading-tight text-[#1e3aaf] dark:text-blue-400">{value}</p>
        {delta !== null && (
          <p className={`mt-1 text-[17px] font-semibold ${trendColor}`}>
            {trendArrow} {formatDeltaPercent(delta)}
          </p>
        )}
        {delta !== null && (
          <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">vs mês anterior</p>
        )}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  children,
  className = "",
  actions,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div
      className={`min-w-0 max-w-full overflow-hidden rounded-xl border border-gray-200 bg-white p-3.5 transition-all dark:border-gray-700 dark:bg-gray-900 ${className}`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</h3>
        {actions}
      </div>
      {children}
    </div>
  );
}

function ChartActions({
  onView,
  onPrint,
  chartKey,
  onCloseMenu,
}: {
  onView: () => void;
  onPrint: (key: ChartKey) => void;
  chartKey: ChartKey;
  onCloseMenu: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <details className="relative">
      <summary className="inline-flex list-none cursor-pointer select-none items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-xs font-semibold text-teal-700 shadow-sm transition hover:border-teal-300 hover:bg-teal-100 hover:text-teal-800 dark:border-teal-900/70 dark:bg-teal-950/30 dark:text-teal-300 dark:hover:bg-teal-900/40">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
        Ações
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
        <button type="button" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700" onClick={(event) => { onCloseMenu(event); onView(); }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          Visualizar
        </button>
        <button type="button" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700" onClick={(event) => { onCloseMenu(event); onPrint(chartKey); }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          Imprimir
        </button>
      </div>
    </details>
  );
}

function ChartCardContent(props: {
  chartKey: ChartKey;
  lineOptions: ApexOptions;
  lineSeries: { name: string; data: number[] }[];
  treemapOptions: ApexOptions;
  treemapSeries: { data: { x: string; y: number }[] }[];
  pieOptions: ApexOptions;
  pieSeries: number[];
  donutOptions: ApexOptions;
  donutSeries: number[];
  credorBarOptions: ApexOptions;
  credorBarSeries: { name: string; data: { x: string; y: number }[] }[];
  paretoOptions: ApexOptions;
  paretoSeries: { name: string; type: "column" | "line"; data: number[] }[];
}) {
  const { chartKey } = props;
  if (chartKey === "line") return <Chart options={props.lineOptions} series={props.lineSeries} type="line" height={520} width="100%" />;
  if (chartKey === "treemap") return <Chart options={props.treemapOptions} series={props.treemapSeries} type="treemap" height={520} width="100%" />;
  if (chartKey === "pie") return props.pieSeries.length > 0 ? <Chart options={props.pieOptions} series={props.pieSeries} type="pie" height={520} width="100%" /> : <Empty />;
  if (chartKey === "donut") return props.donutSeries.length > 0 ? <Chart options={props.donutOptions} series={props.donutSeries} type="donut" height={520} width="100%" /> : <Empty />;
  if (chartKey === "credorBar") return props.credorBarSeries[0]?.data?.length > 0 ? <Chart options={props.credorBarOptions} series={props.credorBarSeries} type="bar" height={520} width="100%" /> : <Empty />;
  return props.paretoSeries[0]?.data?.length > 0 ? <Chart options={props.paretoOptions} series={props.paretoSeries} type="bar" height={520} width="100%" /> : <Empty />;
}

function FilterPill({
  label,
  value,
  options,
  onSelect,
}: {
  label: string;
  value: string;
  options: string[];
  onSelect: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onSelect(e.target.value)}
      className="min-w-[180px] shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
    >
      <option value="all">Todos ({label})</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

function Empty() {
  return (
    <div className="flex h-48 items-center justify-center text-sm text-gray-400">
      Sem dados para exibir
    </div>
  );
}
