/* eslint-disable react-hooks/preserve-manual-memoization */
"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import CombustivelHeaderFilters from "@/components/combustivel/CombustivelHeaderFilters";
import {
  buildMunicipioIndex,
  inferMunicipioCodeFromEntidade,
  normalizeCode,
  normalizeName,
} from "@/components/combustivel/filter-utils";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

type MensalRow = {
  ano: number;
  mes: number;
  entidade: string;
  emitente: string;
  tipo_combustivel: string;
  litros: number;
  valor_total: number;
  qtd_notas: number;
};

type LegacyMensalRow = Omit<MensalRow, "emitente">;

type MunicipioRow = {
  nome: string;
  codigo: string;
  uf_codigo: string | null;
};

type ChartKey = "line" | "treemap" | "pie" | "pareto" | "heatmap" | "emitenteBar";

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
    return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value / 1_000_000)} Mi`;
  }
  if (value >= 1_000) {
    return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value / 1_000)} mil`;
  }
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}

function formatDeltaPercent(value: number): string {
  const signal = value > 0 ? "+" : "";
  return `${signal}${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)}%`;
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
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

function isMissingEmitenteColumnError(error: unknown): boolean {
  const message = extractErrorMessage(error).toLowerCase();
  return (
    message.includes("emitente") &&
    (message.includes("column") ||
      message.includes("coluna") ||
      message.includes("schema cache") ||
      message.includes("does not exist") ||
      message.includes("nao existe"))
  );
}

export default function PainelCombustivelClient() {
  "use no memo";

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [highlightedChart, setHighlightedChart] = useState<ChartKey | null>(null);

  const [mensalRows, setMensalRows] = useState<MensalRow[]>([]);
  const [municipios, setMunicipios] = useState<MunicipioRow[]>([]);
  const [hasMensalEmitente, setHasMensalEmitente] = useState(false);
  const [lastUpdateLabel, setLastUpdateLabel] = useState<string | null>(null);

  const selectedMunicipio = searchParams.get("municipio") ?? "all";
  const selectedEntidade = searchParams.get("entidade") ?? "all";
  const selectedTipos = searchParams.getAll("tipo").filter((item) => item.length > 0);
  const selectedEmitente = searchParams.get("emitente") ?? "all";

  useEffect(() => {
    let active = true;

    async function fetchAllMensalRows(
      client: NonNullable<typeof supabase>,
    ): Promise<{ rows: MensalRow[]; hasEmitente: boolean }> {
      const pageSize = 1000;
      let offset = 0;
      const out: MensalRow[] = [];

      while (true) {
        const { data, error } = await client
          .from("combustivel_mensal")
          .select("ano, mes, entidade, emitente, tipo_combustivel, litros, valor_total, qtd_notas")
          .order("ano", { ascending: true })
          .order("mes", { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (error) throw error;

        const batch = (data ?? []) as MensalRow[];
        out.push(...batch);

        if (batch.length < pageSize) break;
        offset += pageSize;
      }

      return { rows: out, hasEmitente: true };
    }

    async function fetchAllMunicipioRows(
      client: NonNullable<typeof supabase>,
    ): Promise<MunicipioRow[]> {
      const pageSize = 1000;
      let offset = 0;
      const out: MunicipioRow[] = [];

      while (true) {
        const { data, error } = await client
          .from("aux_dim_municipio")
          .select("codigo, nome, uf_codigo")
          .eq("uf_codigo", "12")
          .order("nome", { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (error) throw error;

        const batch = (data ?? []) as MunicipioRow[];
        out.push(...batch);

        if (batch.length < pageSize) break;
        offset += pageSize;
      }

      return out;
    }

    async function fetchAllMensalRowsLegacy(
      client: NonNullable<typeof supabase>,
    ): Promise<{ rows: MensalRow[]; hasEmitente: boolean }> {
      const pageSize = 1000;
      let offset = 0;
      const out: MensalRow[] = [];

      while (true) {
        const { data, error } = await client
          .from("combustivel_mensal")
          .select("ano, mes, entidade, tipo_combustivel, litros, valor_total, qtd_notas")
          .order("ano", { ascending: true })
          .order("mes", { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (error) throw error;

        const batch = (data ?? []) as LegacyMensalRow[];
        out.push(
          ...batch.map((row) => ({
            ...row,
            emitente: "",
          })),
        );

        if (batch.length < pageSize) break;
        offset += pageSize;
      }

      return { rows: out, hasEmitente: false };
    }

    async function load() {
      setLoading(true);
      setError(null);

      if (!isSupabaseConfigured || !supabase) {
        setError(
          "Supabase n\u00e3o configurado. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no arquivo .env.local.",
        );
        setLoading(false);
        return;
      }

      const client = supabase;

      try {
        const [mensalResult, municipioData, updateData] = await Promise.all([
          (async () => {
            try {
              return await fetchAllMensalRows(client);
            } catch (error) {
              if (isMissingEmitenteColumnError(error)) {
                return fetchAllMensalRowsLegacy(client);
              }
              throw error;
            }
          })(),
          fetchAllMunicipioRows(client),
          client
            .from("combustivel_mensal")
            .select("atualizado_em")
            .order("atualizado_em", { ascending: false })
            .limit(1),
        ]);

        if (!active) return;

        setMensalRows(mensalResult.rows);
        setHasMensalEmitente(mensalResult.hasEmitente);
        setMunicipios(municipioData);

        const raw = (updateData.data?.[0] as { atualizado_em?: string } | undefined)?.atualizado_em;
        if (raw) {
          setLastUpdateLabel(
            new Date(raw).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }),
          );
        }

        setLoading(false);
      } catch (error) {
        if (!active) return;
        setError(extractErrorMessage(error) || "Falha ao carregar dados");
        setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  const availableTipos = useMemo(() => {
    return [...new Set(mensalRows.map((row) => row.tipo_combustivel))].sort((a, b) =>
      a.localeCompare(b, "pt-BR"),
    );
  }, [mensalRows]);

  const uniqueEntidadeNorms = useMemo(
    () => new Set(mensalRows.map((row) => normalizeName(row.entidade))),
    [mensalRows],
  );
  const municipioIndex = useMemo(() => buildMunicipioIndex(municipios), [municipios]);

  const selectedMunicipioEntityNames = useMemo(() => {
    if (selectedMunicipio === "all") return null;
    const targetMunicipio = normalizeCode(selectedMunicipio);
    const names = new Set<string>();
    mensalRows.forEach((row) => {
      const entityNorm = normalizeName(row.entidade);
      const municipioCode = inferMunicipioCodeFromEntidade(row.entidade, municipioIndex);
      if (municipioCode && municipioCode === targetMunicipio) {
        names.add(entityNorm);
      }
    });
    return names.size > 0 ? names : null;
  }, [mensalRows, municipioIndex, selectedMunicipio]);

  const resolvedSelectedEntidade = useMemo(() => {
    if (selectedEntidade === "all") return "all";
    const normalized = normalizeName(selectedEntidade);
    return uniqueEntidadeNorms.has(normalized) ? normalized : "all";
  }, [selectedEntidade, uniqueEntidadeNorms]);

  const resolvedSelectedTipos = useMemo(
    () => selectedTipos.filter((tipo) => availableTipos.includes(tipo)),
    [availableTipos, selectedTipos],
  );
  const resolvedSelectedEmitente = useMemo(() => {
    if (selectedEmitente === "all") return "all";
    return normalizeName(selectedEmitente);
  }, [selectedEmitente]);

  const filteredMensalRows = useMemo(() => {
    let rows = mensalRows;

    if (resolvedSelectedTipos.length > 0) {
      const selected = new Set(resolvedSelectedTipos);
      rows = rows.filter((row) => selected.has(row.tipo_combustivel));
    }

    if (resolvedSelectedEntidade !== "all") {
      rows = rows.filter((row) => normalizeName(row.entidade) === resolvedSelectedEntidade);
    }

    if (selectedMunicipioEntityNames) {
      rows = rows.filter((row) => selectedMunicipioEntityNames.has(normalizeName(row.entidade)));
    }

    if (hasMensalEmitente && resolvedSelectedEmitente !== "all") {
      rows = rows.filter((row) => normalizeName(row.emitente) === resolvedSelectedEmitente);
    }

    if (!hasMensalEmitente && resolvedSelectedEmitente !== "all") {
      rows = [];
    }

    return rows;
  }, [
    mensalRows,
    resolvedSelectedEntidade,
    hasMensalEmitente,
    resolvedSelectedEmitente,
    selectedMunicipioEntityNames,
    resolvedSelectedTipos,
  ]);

  const kpi = useMemo(() => {
    const totalValor = filteredMensalRows.reduce((acc, row) => acc + row.valor_total, 0);
    const totalLitros = filteredMensalRows.reduce((acc, row) => acc + row.litros, 0);
    const precoMedio = totalLitros > 0 ? totalValor / totalLitros : 0;
    return { totalValor, totalLitros, precoMedio };
  }, [filteredMensalRows]);

  const monthlySeries = useMemo(() => {
    const grouped = new Map<string, number>();
    filteredMensalRows.forEach((row) => {
      const key = monthKey(row.ano, row.mes);
      grouped.set(key, (grouped.get(key) ?? 0) + row.valor_total);
    });

    const labels = [...grouped.keys()].sort((a, b) => a.localeCompare(b));
    const values = labels.map((key) => grouped.get(key) ?? 0);
    const axisLabels = labels.map((key) => {
      const [ano, mes] = key.split("-");
      return `${mes}/${ano}`;
    });
    return { labels: axisLabels, values };
  }, [filteredMensalRows]);

  const entidadeTreemap = useMemo(() => {
    const grouped = new Map<string, number>();
    filteredMensalRows.forEach((row) => {
      const key = row.entidade;
      grouped.set(key, (grouped.get(key) ?? 0) + row.valor_total);
    });
    return [...grouped.entries()]
      .map(([x, y]) => ({ x, y }))
      .sort((a, b) => b.y - a.y)
      .slice(0, 30);
  }, [filteredMensalRows]);

  const tipoPie = useMemo(() => {
    const grouped = new Map<string, number>();
    filteredMensalRows.forEach((row) => {
      const key = row.tipo_combustivel;
      grouped.set(key, (grouped.get(key) ?? 0) + row.valor_total);
    });
    const labels = [...grouped.keys()];
    const series = labels.map((label) => grouped.get(label) ?? 0);
    return { labels, series };
  }, [filteredMensalRows]);
  const tipoPieKey = useMemo(
    () =>
      `${tipoPie.labels.join("|")}::${tipoPie.series
        .map((value) => Number(value).toFixed(4))
        .join("|")}`,
    [tipoPie.labels, tipoPie.series],
  );

  const emitenteBar = useMemo(() => {
    const grouped = new Map<string, number>();
    filteredMensalRows.forEach((row) => {
      if (!row.emitente) return;
      grouped.set(row.emitente, (grouped.get(row.emitente) ?? 0) + row.valor_total);
    });
    return [...grouped.entries()]
      .map(([emitente, valor_total]) => ({ emitente, valor_total }))
      .sort((a, b) => b.valor_total - a.valor_total)
      .slice(0, 12);
  }, [filteredMensalRows]);

  const monthlyVariation = useMemo(() => {
    const grouped = new Map<string, { valor: number; litros: number }>();
    filteredMensalRows.forEach((row) => {
      const key = monthKey(row.ano, row.mes);
      const current = grouped.get(key) ?? { valor: 0, litros: 0 };
      current.valor += row.valor_total;
      current.litros += row.litros;
      grouped.set(key, current);
    });

    const keys = [...grouped.keys()].sort((a, b) => a.localeCompare(b));
    if (keys.length < 2) {
      return {
        hasComparison: false,
        currentLabel: keys[0] ?? null,
        previousLabel: null,
        valorDelta: 0,
        litrosDelta: 0,
        precoDelta: 0,
      };
    }

    const currentKey = keys[keys.length - 1];
    const previousKey = keys[keys.length - 2];
    const current = grouped.get(currentKey) ?? { valor: 0, litros: 0 };
    const previous = grouped.get(previousKey) ?? { valor: 0, litros: 0 };
    const currentPreco = current.litros > 0 ? current.valor / current.litros : 0;
    const previousPreco = previous.litros > 0 ? previous.valor / previous.litros : 0;

    const calcDelta = (now: number, old: number) => {
      if (old === 0) return now === 0 ? 0 : 100;
      return ((now - old) / old) * 100;
    };

    return {
      hasComparison: true,
      currentLabel: currentKey,
      previousLabel: previousKey,
      valorDelta: calcDelta(current.valor, previous.valor),
      litrosDelta: calcDelta(current.litros, previous.litros),
      precoDelta: calcDelta(currentPreco, previousPreco),
    };
  }, [filteredMensalRows]);

  const emitentePareto = useMemo(() => {
    const categories = emitenteBar.map((row) =>
      row.emitente.length > 24 ? `${row.emitente.slice(0, 24)}...` : row.emitente,
    );
    const totals = emitenteBar.map((row) => row.valor_total);
    const totalSum = totals.reduce((acc, value) => acc + value, 0);
    const cumulativeTotals = totals.reduce<number[]>((acc, value, index) => {
      const previous = index === 0 ? 0 : acc[index - 1];
      return [...acc, previous + value];
    }, []);
    const cumulativePercent = cumulativeTotals.map((value) => (totalSum <= 0 ? 0 : (value / totalSum) * 100));

    return { categories, totals, cumulativePercent };
  }, [emitenteBar]);

  const tipoHeatmap = useMemo(() => {
    const months = new Set<string>();
    const tipos = new Set<string>();
    const grouped = new Map<string, Map<string, number>>();

    filteredMensalRows.forEach((row) => {
      const month = monthKey(row.ano, row.mes);
      months.add(month);
      tipos.add(row.tipo_combustivel);
      const byMonth = grouped.get(row.tipo_combustivel) ?? new Map<string, number>();
      byMonth.set(month, (byMonth.get(month) ?? 0) + row.valor_total);
      grouped.set(row.tipo_combustivel, byMonth);
    });

    const orderedMonths = [...months].sort((a, b) => a.localeCompare(b));
    const monthLabel = new Map<string, string>();
    orderedMonths.forEach((key) => {
      const [ano, mes] = key.split("-");
      monthLabel.set(key, `${mes}/${ano}`);
    });

    const orderedTipos = [...tipos].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const series = orderedTipos.map((tipo) => {
      const byMonth = grouped.get(tipo) ?? new Map<string, number>();
      return {
        name: tipo,
        data: orderedMonths.map((month) => ({
          x: monthLabel.get(month) ?? month,
          y: byMonth.get(month) ?? 0,
        })),
      };
    });

    return { series };
  }, [filteredMensalRows]);

  const hasLineData = monthlySeries.values.length > 0;
  const hasTreemapData = entidadeTreemap.length > 0;
  const hasPieData = tipoPie.labels.length > 0 && tipoPie.series.some((value) => value > 0);
  const hasEmitenteBarData = emitenteBar.length > 0;
  const hasParetoData = emitentePareto.totals.length > 0;
  const hasHeatmapData = tipoHeatmap.series.length > 0;

  const chartMeta: Record<ChartKey, { title: string; containerId: string; hasData: boolean; emptyText: string }> = {
    line: {
      title: "Evolução Mensal do Gasto com Combustível",
      containerId: "chart-panel-line",
      hasData: hasLineData,
      emptyText: "Sem dados para o recorte atual.",
    },
    treemap: {
      title: "Entidade",
      containerId: "chart-panel-treemap",
      hasData: hasTreemapData,
      emptyText: "Sem dados para o recorte atual.",
    },
    pie: {
      title: "Tipo de Combustível",
      containerId: "chart-panel-pie",
      hasData: hasPieData,
      emptyText: "Sem dados para o recorte atual.",
    },
    pareto: {
      title: "Pareto de Emitentes (80/20)",
      containerId: "chart-panel-pareto",
      hasData: hasParetoData,
      emptyText: hasMensalEmitente
        ? "Sem dados para o recorte atual."
        : "Coluna emitente indisponivel no fato mensal para este ambiente.",
    },
    heatmap: {
      title: "Mapa de Gastos por Tipo e Mês",
      containerId: "chart-panel-heatmap",
      hasData: hasHeatmapData,
      emptyText: "Sem dados para o recorte atual.",
    },
    emitenteBar: {
      title: "Valor Total por Emitente",
      containerId: "chart-panel-emitente-bar",
      hasData: hasEmitenteBarData,
      emptyText: hasMensalEmitente
        ? "Sem dados para o recorte atual."
        : "Coluna emitente indisponivel no fato mensal para este ambiente.",
    },
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
    printWindow.close();
  };

  const renderExpandedChart = (chart: ChartKey) => {
    if (chart === "line") {
      return hasLineData ? (
        <Chart
          type="line"
          options={lineOptions}
          series={[{ name: "Valor Total", data: monthlySeries.values }]}
          height="100%"
        />
      ) : (
        <div className={emptyChartClass}>{chartMeta.line.emptyText}</div>
      );
    }
    if (chart === "treemap") {
      return hasTreemapData ? (
        <Chart type="treemap" options={treemapOptions} series={[{ data: entidadeTreemap }]} height="100%" />
      ) : (
        <div className={emptyChartClass}>{chartMeta.treemap.emptyText}</div>
      );
    }
    if (chart === "pie") {
      return hasPieData ? (
        <Chart key={`${tipoPieKey}-expanded`} type="pie" options={pieOptions} series={tipoPie.series} height="100%" />
      ) : (
        <div className={emptyChartClass}>{chartMeta.pie.emptyText}</div>
      );
    }
    if (chart === "pareto") {
      return hasParetoData ? (
        <Chart
          type="line"
          options={paretoOptions}
          series={[
            { name: "Valor Total", type: "column", data: emitentePareto.totals },
            { name: "Acumulado", type: "line", data: emitentePareto.cumulativePercent },
          ]}
          height="100%"
        />
      ) : (
        <div className={emptyChartClass}>{chartMeta.pareto.emptyText}</div>
      );
    }
    if (chart === "heatmap") {
      return hasHeatmapData ? (
        <Chart type="heatmap" options={heatmapOptions} series={tipoHeatmap.series} height="100%" />
      ) : (
        <div className={emptyChartClass}>{chartMeta.heatmap.emptyText}</div>
      );
    }
    return hasEmitenteBarData ? (
      <Chart
        type="bar"
        options={barOptions}
        series={[{ name: "Valor Total", data: emitenteBar.map((row) => row.valor_total) }]}
        height="100%"
      />
    ) : (
      <div className={emptyChartClass}>{chartMeta.emitenteBar.emptyText}</div>
    );
  };

  const lineOptions: ApexOptions = useMemo(
    () => ({
      chart: {
        type: "line",
        toolbar: { show: false },
        fontFamily: "inherit",
      },
      markers: { size: 3, hover: { size: 5 } },
      stroke: { curve: "smooth", width: 2 },
      dataLabels: { enabled: false },
      grid: { borderColor: "#e5e7eb", strokeDashArray: 4 },
      xaxis: {
        categories: monthlySeries.labels,
        labels: {
          rotate: -35,
          hideOverlappingLabels: true,
          trim: true,
          style: { fontSize: "11px" },
        },
      },
      yaxis: {
        tickAmount: 4,
        labels: {
          formatter: (value) => `R$ ${formatMillions(Number(value))}`,
        },
      },
      tooltip: {
        y: { formatter: (value) => formatMoney(Number(value)) },
      },
      colors: ["#0f766e"],
    }),
    [monthlySeries.labels],
  );

  const treemapOptions: ApexOptions = useMemo(
    () => ({
      chart: {
        type: "treemap",
        toolbar: { show: false },
        fontFamily: "inherit",
        events: {
          dataPointSelection: (_event, _chart, config) => {
            const index = config.dataPointIndex;
            const entity = entidadeTreemap[index]?.x;
            if (!entity) return;
            const params = new URLSearchParams(searchParams.toString());
            params.set("entidade", normalizeName(entity));
            router.replace(`${pathname}?${params.toString()}`, { scroll: false });
          },
        },
      },
      plotOptions: {
        treemap: {
          distributed: false,
          enableShades: true,
          shadeIntensity: 0.6,
        },
      },
      dataLabels: {
        enabled: true,
        formatter: (_text, opts) => {
          const name = opts.w.globals.labels[opts.seriesIndex] ?? "";
          return name.length > 18 ? `${name.slice(0, 18)}...` : name;
        },
      },
      legend: { show: false },
      tooltip: { y: { formatter: (value) => formatMoney(Number(value)) } },
      colors: ["#0f766e"],
    }),
    [entidadeTreemap, pathname, router, searchParams],
  );

  const pieOptions: ApexOptions = useMemo(
    () => ({
      chart: {
        type: "pie",
        fontFamily: "inherit",
        events: {
          dataPointSelection: (_event, _chart, config) => {
            const index = config.dataPointIndex;
            const tipo = tipoPie.labels[index];
            if (!tipo) return;
            const params = new URLSearchParams(searchParams.toString());
            const current = params.getAll("tipo");
            params.delete("tipo");
            if (current.includes(tipo)) {
              current.filter((item) => item !== tipo).forEach((item) => params.append("tipo", item));
            } else {
              [...current, tipo].forEach((item) => params.append("tipo", item));
            }
            router.replace(`${pathname}?${params.toString()}`, { scroll: false });
          },
        },
      },
      labels: tipoPie.labels,
      legend: {
        position: "bottom",
        horizontalAlign: "left",
        fontSize: "11px",
        fontWeight: 400,
        itemMargin: { horizontal: 10, vertical: 4 },
        labels: { colors: "#475569" },
        markers: { size: 8 },
      },
      colors: [
        "#0f766e",
        "#1d4ed8",
        "#f59e0b",
        "#be123c",
        "#7c3aed",
        "#16a34a",
        "#0369a1",
        "#ea580c",
        "#0891b2",
        "#65a30d",
      ],
      tooltip: {
        custom: ({ series, seriesIndex, w }) => {
          const label = w.globals.labels?.[seriesIndex] ?? "";
          const value = Number(series?.[seriesIndex] ?? 0);
          return `<div style="padding:8px 10px;background:rgba(15,23,42,0.92);color:#ffffff;border-radius:8px;font-size:12px;line-height:1.35;">
            <div style="font-weight:600;margin-bottom:2px;">${label}</div>
            <div>${formatMoney(value)}</div>
          </div>`;
        },
      },
      dataLabels: {
        enabled: false,
      },
    }),
    [pathname, router, searchParams, tipoPie.labels],
  );

  const barOptions: ApexOptions = useMemo(
    () => ({
      chart: {
        type: "bar",
        toolbar: { show: false },
        fontFamily: "inherit",
        events: {
          dataPointSelection: (_event, _chart, config) => {
            const index = config.dataPointIndex;
            if (index < 0) return;
            const emitente = emitenteBar[index]?.emitente;
            if (!emitente) return;
            const params = new URLSearchParams(searchParams.toString());
            if (params.get("emitente") === emitente) params.delete("emitente");
            else params.set("emitente", emitente);
            router.replace(`${pathname}?${params.toString()}`, { scroll: false });
          },
        },
      },
      plotOptions: { bar: { horizontal: true, borderRadius: 3 } },
      dataLabels: { enabled: false },
      xaxis: {
        categories: emitenteBar.map((row) =>
          row.emitente.length > 28 ? `${row.emitente.slice(0, 28)}...` : row.emitente,
        ),
        tickAmount: 3,
        labels: {
          hideOverlappingLabels: true,
          formatter: (value) => `R$ ${formatMillions(Number(value))}`,
        },
      },
      tooltip: {
        y: { formatter: (value) => formatMoney(Number(value)) },
      },
      colors: [selectedEmitente === "all" ? "#1d4ed8" : "#0f766e"],
      grid: { borderColor: "#d8dee6", strokeDashArray: 3 },
      yaxis: { labels: { style: { fontSize: "11px" } } },
    }),
    [emitenteBar, pathname, router, searchParams, selectedEmitente],
  );

  const paretoOptions: ApexOptions = useMemo(
    () => ({
      chart: { type: "line", toolbar: { show: false }, fontFamily: "inherit" },
      stroke: { width: [0, 3], curve: "smooth" },
      plotOptions: { bar: { borderRadius: 3, columnWidth: "55%" } },
      dataLabels: { enabled: false },
      xaxis: {
        categories: emitentePareto.categories,
        labels: { rotate: -35, hideOverlappingLabels: true, style: { fontSize: "11px" } },
      },
      yaxis: [
        {
          title: { text: "Valor (R$)" },
          labels: { formatter: (value) => `R$ ${formatMillions(Number(value))}` },
        },
        {
          opposite: true,
          min: 0,
          max: 100,
          tickAmount: 5,
          title: { text: "Acumulado" },
          labels: { formatter: (value) => `${Number(value).toFixed(0)}%` },
        },
      ],
      tooltip: {
        shared: true,
        y: [
          { formatter: (value) => formatMoney(Number(value)) },
          { formatter: (value) => `${Number(value).toFixed(1)}%` },
        ],
      },
      colors: ["#1d4ed8", "#be123c"],
      legend: { position: "top" },
      grid: { borderColor: "#d8dee6", strokeDashArray: 3 },
    }),
    [emitentePareto.categories],
  );

  const heatmapOptions: ApexOptions = useMemo(
    () => ({
      chart: { type: "heatmap", toolbar: { show: false }, fontFamily: "inherit" },
      dataLabels: { enabled: false },
      plotOptions: {
        heatmap: {
          shadeIntensity: 0.45,
          radius: 3,
          colorScale: {
            ranges: [
              { from: 0, to: 0, color: "#e5e7eb", name: "Sem gasto" },
              { from: 0.0001, to: 49999.99, color: "#bfdbfe", name: "Baixo" },
              { from: 50000, to: 199999.99, color: "#60a5fa", name: "Medio" },
              { from: 200000, to: 999999999, color: "#1d4ed8", name: "Alto" },
            ],
          },
        },
      },
      tooltip: {
        y: { formatter: (value) => formatMoney(Number(value)) },
      },
      legend: { show: true, position: "top" },
      grid: { borderColor: "#d8dee6", strokeDashArray: 3 },
    }),
    [],
  );

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
        {`Carregando painel de combust\u00edvel...`}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-600 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300">
        Falha ao carregar dados do painel: {error}
      </div>
    );
  }

  if (mensalRows.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
        {`Nenhum dado encontrado para o painel de combust\u00edvel. Verifique se as tabelas `}
        `combustivel_mensal`, `combustivel_emitente`, `aux_dim_municipio` e `aux_dim_entidade`
        {` est\u00e3o populadas no Supabase.`}
      </div>
    );
  }

  const chartHeaderClass = "mb-2.5";
  const kpiHeaderClass = "mb-1.5";
  const panelTitleClass = "text-sm font-semibold tracking-tight text-gray-700 dark:text-gray-200";
  const cardClass =
    "rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800";
  const kpiCardClass =
    "rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800";
  const actionButtonClass =
    "inline-flex items-center rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700";
  const emptyChartClass =
    "flex h-full items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400";
  const trendClass = (delta: number) => {
    if (delta > 0.01) return "text-emerald-600 dark:text-emerald-300";
    if (delta < -0.01) return "text-red-600 dark:text-red-300";
    return "text-blue-600 dark:text-blue-300";
  };
  const trendArrow = (delta: number) => {
    if (delta > 0.01) return "↑";
    if (delta < -0.01) return "↓";
    return "→";
  };

  const renderChartActions = (chart: ChartKey) => (
    <details className="relative">
      <summary className={`${actionButtonClass} list-none cursor-pointer select-none`}>Ações</summary>
      <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
        <button
          type="button"
          className="w-full rounded-md px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
          onClick={(event) => {
            closeActionsMenu(event);
            setHighlightedChart(chart);
          }}
        >
          Visualizar
        </button>
        <button
          type="button"
          className="w-full rounded-md px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
          onClick={(event) => {
            closeActionsMenu(event);
            printChart(chart);
          }}
        >
          Imprimir
        </button>
      </div>
    </details>
  );

  return (
    <div className="space-y-3">
      <div className="lg:hidden">
        <CombustivelHeaderFilters />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className={kpiCardClass}>
          <div className={kpiHeaderClass}>
            <h3 className={panelTitleClass}>Valor Total</h3>
          </div>
          <div className="text-center">
            <p className="text-[26px] font-semibold leading-tight text-[#1e3aaf] dark:text-blue-400">
              R$ {formatMillions(kpi.totalValor)}
            </p>
            {monthlyVariation.hasComparison ? (
              <p className={`mt-1 text-[17px] font-semibold ${trendClass(monthlyVariation.valorDelta)}`}>
                {`${trendArrow(monthlyVariation.valorDelta)} ${formatDeltaPercent(monthlyVariation.valorDelta)}`}
              </p>
            ) : (
              <p className="mt-1 text-[17px] text-blue-600 dark:text-blue-300">Sem hist\u00f3rico suficiente.</p>
            )}
            {monthlyVariation.hasComparison ? (
              <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                {`Ref. ${toMonthLabel(monthlyVariation.currentLabel)} vs ${toMonthLabel(monthlyVariation.previousLabel)}`}
              </p>
            ) : null}
          </div>
        </div>

        <div className={kpiCardClass}>
          <div className={kpiHeaderClass}>
            <h3 className={panelTitleClass}>Litros</h3>
          </div>
          <div className="text-center">
            <p className="text-[26px] font-semibold leading-tight text-[#1e3aaf] dark:text-blue-400">
              {formatMillions(kpi.totalLitros)}
            </p>
            {monthlyVariation.hasComparison ? (
              <p className={`mt-1 text-[17px] font-semibold ${trendClass(monthlyVariation.litrosDelta)}`}>
                {`${trendArrow(monthlyVariation.litrosDelta)} ${formatDeltaPercent(monthlyVariation.litrosDelta)}`}
              </p>
            ) : (
              <p className="mt-1 text-[17px] text-blue-600 dark:text-blue-300">Sem hist\u00f3rico suficiente.</p>
            )}
            {monthlyVariation.hasComparison ? (
              <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                {`Ref. ${toMonthLabel(monthlyVariation.currentLabel)} vs ${toMonthLabel(monthlyVariation.previousLabel)}`}
              </p>
            ) : null}
          </div>
        </div>

        <div className={kpiCardClass}>
          <div className={kpiHeaderClass}>
            <h3 className={panelTitleClass}>{`Pre\u00e7o M\u00e9dio`}</h3>
          </div>
          <div className="text-center">
            <p className="text-[26px] font-semibold leading-tight text-[#1e3aaf] dark:text-blue-400">
              {formatMoney(kpi.precoMedio)}
            </p>
            {monthlyVariation.hasComparison ? (
              <p className={`mt-1 text-[17px] font-semibold ${trendClass(monthlyVariation.precoDelta)}`}>
                {`${trendArrow(monthlyVariation.precoDelta)} ${formatDeltaPercent(monthlyVariation.precoDelta)}`}
              </p>
            ) : (
              <p className="mt-1 text-[17px] text-blue-600 dark:text-blue-300">Sem hist\u00f3rico suficiente.</p>
            )}
            {monthlyVariation.hasComparison ? (
              <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                {`Ref. ${toMonthLabel(monthlyVariation.currentLabel)} vs ${toMonthLabel(monthlyVariation.previousLabel)}`}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          {/* Botão Empenhos SIPAC */}
          <Link
            href="/painel-combustivel-empenhos"
            className="group relative flex items-center justify-center gap-2 overflow-hidden rounded-xl border border-orange-300/80 bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-3 text-sm font-extrabold uppercase tracking-[0.02em] text-white shadow-md shadow-orange-300/40 transition hover:-translate-y-0.5 hover:from-orange-600 hover:to-amber-600 hover:shadow-lg hover:shadow-orange-300/50 dark:border-orange-700 dark:from-orange-700 dark:to-amber-700 dark:text-orange-50 dark:shadow-none dark:hover:from-orange-600 dark:hover:to-amber-600"
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(255,255,255,0.28),transparent_42%)] opacity-90 transition group-hover:opacity-100" />
            <svg className="relative" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <span className="relative">Empenhos SIPAC</span>
          </Link>

          {/* Box Fonte + Atualização */}
          <div className="relative flex flex-1 flex-col gap-3 rounded-2xl border border-sky-200/80 bg-gradient-to-b from-sky-50/90 to-cyan-50/70 p-4 shadow-sm shadow-sky-100/60 dark:border-sky-800/60 dark:from-sky-900/20 dark:to-cyan-900/10 dark:shadow-none">
            <div className="flex flex-col gap-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-600/90 dark:text-sky-400">
                Fonte dos Dados
              </p>
              <p className="text-sm font-bold leading-tight text-gray-800 dark:text-gray-100">
                Notas Fiscais Emitidas
              </p>
            </div>
            <div className="h-px w-full bg-gradient-to-r from-sky-200 via-sky-200/70 to-transparent dark:from-sky-700/70 dark:via-sky-700/40" />
            <div className="flex flex-col gap-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-600/90 dark:text-sky-400">
                Última Atualização
              </p>
              <p className="text-sm font-bold leading-tight text-gray-800 dark:text-gray-100">
                {lastUpdateLabel ?? "—"}
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className={`xl:col-span-8 ${cardClass}`}>
          <div className={`${chartHeaderClass} flex items-start justify-between gap-3`}>
            <h3 className={panelTitleClass}>{`Evolu\u00e7\u00e3o Mensal do Gasto com Combust\u00edvel`}</h3>
            {renderChartActions("line")}
          </div>
          <div id="chart-panel-line" className="h-[260px] xl:h-[250px]">
            {hasLineData ? (
              <Chart
                type="line"
                options={lineOptions}
                series={[{ name: "Valor Total", data: monthlySeries.values }]}
                height="100%"
              />
            ) : (
              <div className={emptyChartClass}>Sem dados para o recorte atual.</div>
            )}
          </div>
        </div>

        <div className={`xl:col-span-4 ${cardClass}`}>
          <div className={`${chartHeaderClass} flex items-start justify-between gap-3`}>
            <h3 className={panelTitleClass}>Entidade</h3>
            {renderChartActions("treemap")}
          </div>
          <div id="chart-panel-treemap" className="h-[260px] xl:h-[250px]">
            {hasTreemapData ? (
              <Chart
                type="treemap"
                options={treemapOptions}
                series={[{ data: entidadeTreemap }]}
                height="100%"
              />
            ) : (
              <div className={emptyChartClass}>Sem dados para o recorte atual.</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12 xl:items-start">
        <div className={`xl:col-span-5 ${cardClass}`}>
          <div className={`${chartHeaderClass} flex items-start justify-between gap-3`}>
            <h3 className={panelTitleClass}>{`Tipo de Combust\u00edvel`}</h3>
            {renderChartActions("pie")}
          </div>
          <div id="chart-panel-pie" className="h-80">
            {hasPieData ? (
              <Chart key={tipoPieKey} type="pie" options={pieOptions} series={tipoPie.series} height="100%" />
            ) : (
              <div className={emptyChartClass}>Sem dados para o recorte atual.</div>
            )}
          </div>
        </div>

        <div className={`xl:col-span-7 ${cardClass}`}>
          <div className={`${chartHeaderClass} flex items-start justify-between gap-3`}>
            <h3 className={panelTitleClass}>Pareto de Emitentes (80/20)</h3>
            {renderChartActions("pareto")}
          </div>
          <div id="chart-panel-pareto" className="h-[260px]">
            {hasParetoData ? (
              <Chart
                type="line"
                options={paretoOptions}
                series={[
                  { name: "Valor Total", type: "column", data: emitentePareto.totals },
                  { name: "Acumulado", type: "line", data: emitentePareto.cumulativePercent },
                ]}
                height="100%"
              />
            ) : (
              <div className={emptyChartClass}>
                {hasMensalEmitente
                  ? "Sem dados para o recorte atual."
                  : "Coluna emitente indisponivel no fato mensal para este ambiente."}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className={`xl:col-span-8 ${cardClass}`}>
          <div className={`${chartHeaderClass} flex items-start justify-between gap-3`}>
            <div>
              <h3 className={panelTitleClass}>{`Mapa de Gastos por Tipo e M\u00eas`}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Intensidade da cor indica maior ou menor gasto por tipo no m\u00eas.
              </p>
            </div>
            {renderChartActions("heatmap")}
          </div>
          <div id="chart-panel-heatmap" className="h-[340px]">
            {hasHeatmapData ? (
              <Chart type="heatmap" options={heatmapOptions} series={tipoHeatmap.series} height="100%" />
            ) : (
              <div className={emptyChartClass}>Sem dados para o recorte atual.</div>
            )}
          </div>
        </div>

        <div className={`xl:col-span-4 ${cardClass}`}>
          <div className={`${chartHeaderClass} flex items-start justify-between gap-3`}>
            <h3 className={panelTitleClass}>Valor Total por Emitente</h3>
            {renderChartActions("emitenteBar")}
          </div>
          <div id="chart-panel-emitente-bar" className="h-[340px]">
            {hasEmitenteBarData ? (
              <Chart
                type="bar"
                options={barOptions}
                series={[{ name: "Valor Total", data: emitenteBar.map((row) => row.valor_total) }]}
                height="100%"
              />
            ) : (
              <div className={emptyChartClass}>
                {hasMensalEmitente
                  ? "Sem dados para o recorte atual."
                  : "Coluna emitente indisponivel no fato mensal para este ambiente."}
              </div>
            )}
          </div>
        </div>
      </div>

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
              <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">
                {chartMeta[highlightedChart].title}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => printChart(highlightedChart)}
                  className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  Imprimir
                </button>
                <button
                  type="button"
                  onClick={() => setHighlightedChart(null)}
                  className="rounded-md bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600"
                >
                  Fechar
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1">
              <div className="h-full rounded-lg border border-gray-200 p-2 dark:border-gray-700 sm:p-3">
                <div className="h-full">{renderExpandedChart(highlightedChart)}</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}


