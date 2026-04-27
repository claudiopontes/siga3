/* eslint-disable react-hooks/preserve-manual-memoization */
"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";
import { useRouter, useSearchParams } from "next/navigation";
import { normalizeName } from "@/components/combustivel/filter-utils";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

type EmpenhoRow = {
  id_despesa: number;
  entidade: string;
  ano_empenho: number;
  data_empenho: string;
  nome_credor: string;
  tipo_combustivel: string;
  forma_fornecimento: string;
  valor_empenho: number;
  valor_liquidado: number;
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
  if (value >= 1_000_000)
    return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value / 1_000_000)} Mi`;
  if (value >= 1_000)
    return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value / 1_000)} mil`;
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}

function formatDeltaPercent(value: number): string {
  const signal = value > 0 ? "+" : "";
  return `${signal}${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)}%`;
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
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
            .from("tb_despesa_combustivel_polanco")
            .select(
              "id_despesa, entidade, ano_empenho, data_empenho, nome_credor, tipo_combustivel, forma_fornecimento, valor_empenho, valor_liquidado",
            )
            .order("data_empenho", { ascending: true })
            .range(offset, offset + pageSize - 1);

          if (error) throw error;

          const batch = (data ?? []) as EmpenhoRow[];
          out.push(...batch);
          if (batch.length < pageSize) break;
          offset += pageSize;
        }

        if (!active) return;
        setRows(out);
        setLoading(false);
      } catch (err) {
        if (!active) return;
        setError(extractErrorMessage(err) || "Falha ao carregar dados");
        setLoading(false);
      }
    }

    load();
    return () => { active = false; };
  }, []);

  // ── Opções de filtro ──────────────────────────────────────────
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

  // ── Linhas filtradas ──────────────────────────────────────────
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
    return r;
  }, [rows, selectedEntidade, selectedTipos, selectedCredor, selectedForma]);

  // ── KPIs ──────────────────────────────────────────────────────
  const totalEmpenhado = useMemo(
    () => filteredRows.reduce((s, r) => s + (r.valor_empenho ?? 0), 0),
    [filteredRows],
  );
  const totalLiquidado = useMemo(
    () => filteredRows.reduce((s, r) => s + (r.valor_liquidado ?? 0), 0),
    [filteredRows],
  );
  const pctExecutado = totalEmpenhado > 0 ? (totalLiquidado / totalEmpenhado) * 100 : 0;
  const qtdEmpenhos = filteredRows.length;

  // ── KPI variação MoM ─────────────────────────────────────────
  const kpiVariation = useMemo(() => {
    const byMonth = new Map<string, { emp: number; liq: number; qtd: number }>();
    for (const r of filteredRows) {
      const key = monthKey(r.data_empenho);
      const cur = byMonth.get(key) ?? { emp: 0, liq: 0, qtd: 0 };
      cur.emp += r.valor_empenho ?? 0;
      cur.liq += r.valor_liquidado ?? 0;
      cur.qtd += 1;
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

  // ── Série mensal (linha) ──────────────────────────────────────
  const monthlySeries = useMemo(() => {
    const byMonth = new Map<string, { emp: number; liq: number }>();
    for (const r of filteredRows) {
      const key = monthKey(r.data_empenho);
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

  // ── Treemap entidades ─────────────────────────────────────────
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

  // ── Pizza tipo combustível ────────────────────────────────────
  const tipoPie = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filteredRows) {
      map.set(r.tipo_combustivel, (map.get(r.tipo_combustivel) ?? 0) + (r.valor_empenho ?? 0));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [filteredRows]);

  // ── Donut forma fornecimento ──────────────────────────────────
  const formaDonut = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filteredRows) {
      map.set(r.forma_fornecimento, (map.get(r.forma_fornecimento) ?? 0) + (r.valor_empenho ?? 0));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [filteredRows]);

  // ── TOP credores (barras) ─────────────────────────────────────
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

  // ── Pareto credores ───────────────────────────────────────────
  const credorPareto = useMemo(() => {
    const sorted = [...credorBar].sort((a, b) => b.value - a.value).slice(0, 15);
    const total = sorted.reduce((s, r) => s + r.value, 0);
    let acc = 0;
    return sorted.map((item) => {
      acc += item.value;
      return { name: item.name, value: item.value, acumulado: +((acc / total) * 100).toFixed(1) };
    });
  }, [credorBar]);

  // ── Helpers de filtro via URL ─────────────────────────────────
  function setFilter(key: string, value: string | string[]) {
    const params = new URLSearchParams(searchParams.toString());
    if (Array.isArray(value)) {
      params.delete(key);
      value.forEach((v) => params.append(key, v));
    } else {
      if (value === "all") params.delete(key);
      else params.set(key, value);
    }
    router.replace(`/painel-combustivel-empenhos?${params.toString()}`, { scroll: false });
  }

  function clearAllFilters() {
    router.replace("/painel-combustivel-empenhos", { scroll: false });
  }

  const hasActiveFilters =
    selectedEntidade !== "all" ||
    selectedTipos.length > 0 ||
    selectedCredor !== "all" ||
    selectedForma !== "all";

  // ── Highlight helper ──────────────────────────────────────────
  function highlightClass(key: ChartKey) {
    if (!highlightedChart) return "";
    return highlightedChart === key ? "ring-2 ring-orange-400" : "opacity-40";
  }

  // ── ApexCharts: Linha ─────────────────────────────────────────
  const lineOptions: ApexOptions = {
    chart: { type: "line", toolbar: { show: false }, zoom: { enabled: false }, background: "transparent" },
    colors: ["#f97316", "#3b82f6"],
    stroke: { curve: "smooth", width: [2, 2] },
    xaxis: { categories: monthlySeries.categories, labels: { style: { fontSize: "11px" } } },
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

  // ── ApexCharts: Treemap ───────────────────────────────────────
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

  // ── ApexCharts: Pizza tipo ────────────────────────────────────
  const pieOptions: ApexOptions = {
    chart: { type: "pie", toolbar: { show: false }, background: "transparent" },
    labels: tipoPie.map(([label]) => label),
    colors: ["#f97316", "#3b82f6", "#10b981", "#8b5cf6", "#ef4444", "#eab308", "#06b6d4", "#ec4899"],
    legend: { position: "bottom", fontSize: "11px" },
    tooltip: { y: { formatter: (v) => formatMoney(v) } },
    theme: { mode: "light" },
  };
  const pieSeries = tipoPie.map(([, v]) => v);

  // ── ApexCharts: Donut forma fornecimento ──────────────────────
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

  // ── ApexCharts: Barras credores ───────────────────────────────
  const credorBarOptions: ApexOptions = {
    chart: { type: "bar", toolbar: { show: false }, background: "transparent" },
    plotOptions: { bar: { horizontal: true, borderRadius: 4 } },
    colors: ["#f97316"],
    xaxis: { labels: { formatter: (v) => formatMillions(Number(v)), style: { fontSize: "10px" } } },
    yaxis: { labels: { style: { fontSize: "10px" }, maxWidth: 180 } },
    tooltip: { y: { formatter: (v) => formatMoney(v) } },
    theme: { mode: "light" },
    grid: { borderColor: "#f1f5f9" },
  };
  const credorBarSeries = [
    { name: "Empenhado", data: credorBar.map((r) => ({ x: r.name, y: r.value })) },
  ];

  // ── ApexCharts: Pareto ────────────────────────────────────────
  const paretoOptions: ApexOptions = {
    chart: { type: "bar", toolbar: { show: false }, background: "transparent" },
    plotOptions: { bar: { borderRadius: 4 } },
    colors: ["#f97316"],
    stroke: { width: [0, 2], colors: ["transparent", "#3b82f6"] },
    xaxis: {
      categories: credorPareto.map((r) => r.name),
      labels: { rotate: -35, style: { fontSize: "10px" } },
    },
    yaxis: [
      { labels: { formatter: (v) => formatMillions(v), style: { fontSize: "10px" } } },
      {
        opposite: true,
        min: 0,
        max: 100,
        labels: { formatter: (v) => `${v.toFixed(0)}%`, style: { fontSize: "10px" } },
      },
    ],
    tooltip: {
      shared: true,
      intersect: false,
      y: [{ formatter: (v) => formatMoney(v) }, { formatter: (v) => `${v.toFixed(1)}%` }],
    },
    legend: { position: "top" },
    theme: { mode: "light" },
    grid: { borderColor: "#f1f5f9" },
  };
  const paretoSeries = [
    { name: "Empenhado", type: "column", data: credorPareto.map((r) => r.value) },
    { name: "Acumulado %", type: "line", data: credorPareto.map((r) => r.acumulado) },
  ];

  // ── Render ────────────────────────────────────────────────────
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
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-[1100px] flex-col gap-4 p-4 sm:p-6">
      {/* Filtros inline (mobile) */}
      <div className="flex flex-wrap items-center gap-2 lg:hidden">
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
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          title="Valor Empenhado"
          value={formatMoney(totalEmpenhado)}
          delta={kpiVariation?.deltaEmp ?? null}
          color="orange"
        />
        <KpiCard
          title="Valor Liquidado"
          value={formatMoney(totalLiquidado)}
          delta={kpiVariation?.deltaLiq ?? null}
          color="blue"
        />
        <KpiCard
          title="Execução Orçamentária"
          value={`${pctExecutado.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
          delta={null}
          color="green"
        />
        <KpiCard
          title="Qtd. de Empenhos"
          value={qtdEmpenhos.toLocaleString("pt-BR")}
          delta={kpiVariation?.deltaQtd ?? null}
          color="purple"
        />
      </div>

      {/* Linha: evolução mensal */}
      <ChartCard
        title="Evolução Mensal — Empenhado vs Liquidado"
        chartKey="line"
        highlighted={highlightedChart}
        onHighlight={setHighlightedChart}
        className={highlightClass("line")}
      >
        <Chart options={lineOptions} series={lineSeries} type="line" height={280} width="100%" />
      </ChartCard>

      {/* Treemap + Pizza */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Valor Empenhado por Entidade"
          chartKey="treemap"
          highlighted={highlightedChart}
          onHighlight={setHighlightedChart}
          className={highlightClass("treemap")}
        >
          <Chart options={treemapOptions} series={treemapSeries} type="treemap" height={280} width="100%" />
        </ChartCard>

        <ChartCard
          title="Distribuição por Tipo de Combustível"
          chartKey="pie"
          highlighted={highlightedChart}
          onHighlight={setHighlightedChart}
          className={highlightClass("pie")}
        >
          {pieSeries.length > 0 ? (
            <Chart options={pieOptions} series={pieSeries} type="pie" height={280} width="100%" />
          ) : (
            <Empty />
          )}
        </ChartCard>
      </div>

      {/* Donut + Barras credores */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Forma de Fornecimento"
          chartKey="donut"
          highlighted={highlightedChart}
          onHighlight={setHighlightedChart}
          className={highlightClass("donut")}
        >
          {donutSeries.length > 0 ? (
            <Chart options={donutOptions} series={donutSeries} type="donut" height={280} width="100%" />
          ) : (
            <Empty />
          )}
        </ChartCard>

        <ChartCard
          title="TOP Credores / Fornecedores"
          chartKey="credorBar"
          highlighted={highlightedChart}
          onHighlight={setHighlightedChart}
          className={highlightClass("credorBar")}
        >
          {credorBar.length > 0 ? (
            <Chart options={credorBarOptions} series={credorBarSeries} type="bar" height={280} width="100%" />
          ) : (
            <Empty />
          )}
        </ChartCard>
      </div>

      {/* Pareto */}
      <ChartCard
        title="Pareto — Credores (80/20)"
        chartKey="pareto"
        highlighted={highlightedChart}
        onHighlight={setHighlightedChart}
        className={highlightClass("pareto")}
      >
        {credorPareto.length > 0 ? (
          <Chart options={paretoOptions} series={paretoSeries} type="bar" height={300} width="100%" />
        ) : (
          <Empty />
        )}
      </ChartCard>
      </div>
    </div>
  );
}

// ── Sub-componentes ───────────────────────────────────────────────

function KpiCard({
  title,
  value,
  delta,
  color,
}: {
  title: string;
  value: string;
  delta: number | null;
  color: "orange" | "blue" | "green" | "purple";
}) {
  const palette = {
    orange: "border-orange-100 bg-orange-50 dark:border-orange-900/30 dark:bg-orange-900/10",
    blue: "border-blue-100 bg-blue-50 dark:border-blue-900/30 dark:bg-blue-900/10",
    green: "border-green-100 bg-green-50 dark:border-green-900/30 dark:bg-green-900/10",
    purple: "border-purple-100 bg-purple-50 dark:border-purple-900/30 dark:bg-purple-900/10",
  };
  const textPalette = {
    orange: "text-orange-700 dark:text-orange-300",
    blue: "text-blue-700 dark:text-blue-300",
    green: "text-green-700 dark:text-green-300",
    purple: "text-purple-700 dark:text-purple-300",
  };

  return (
    <div className={`rounded-xl border p-4 ${palette[color]}`}>
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{title}</p>
      <p className={`mt-1 text-lg font-bold leading-tight ${textPalette[color]}`}>{value}</p>
      {delta !== null && (
        <p
          className={`mt-0.5 text-xs font-medium ${delta >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}
        >
          {delta >= 0 ? "▲" : "▼"} {formatDeltaPercent(delta)} vs mês anterior
        </p>
      )}
    </div>
  );
}

function ChartCard({
  title,
  chartKey,
  highlighted,
  onHighlight,
  children,
  className = "",
}: {
  title: string;
  chartKey: ChartKey;
  highlighted: ChartKey | null;
  onHighlight: (key: ChartKey | null) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-gray-200 bg-white p-4 transition-all dark:border-gray-700 dark:bg-gray-900 ${className}`}
      onMouseEnter={() => onHighlight(chartKey)}
      onMouseLeave={() => onHighlight(null)}
    >
      <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</h3>
      {children}
    </div>
  );
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
      className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
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
