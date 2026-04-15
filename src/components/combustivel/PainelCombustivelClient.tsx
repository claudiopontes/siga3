"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";
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

type EmitenteRow = {
  emitente: string;
  litros: number;
  valor_total: number;
  qtd_notas: number;
};

type MunicipioRow = {
  nome: string;
  codigo: string;
  uf_codigo: string | null;
};

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

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const msg = (error as { message?: unknown }).message;
    return typeof msg === "string" ? msg : String(msg);
  }
  return String(error);
}

export default function PainelCombustivelClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mensalRows, setMensalRows] = useState<MensalRow[]>([]);
  const [emitenteRows, setEmitenteRows] = useState<EmitenteRow[]>([]);
  const [municipios, setMunicipios] = useState<MunicipioRow[]>([]);
  const [hasMensalEmitente, setHasMensalEmitente] = useState(false);

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
          "Supabase nao configurado. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no arquivo .env.local.",
        );
        setLoading(false);
        return;
      }

      const client = supabase;

      try {
        const [mensalResult, emitenteRes, municipioData] = await Promise.all([
          (async () => {
            try {
              return await fetchAllMensalRows(client);
            } catch (error) {
              const message = extractErrorMessage(error).toLowerCase();
              if (message.includes("emitente") || message.includes("column") || message.includes("coluna")) {
                return fetchAllMensalRowsLegacy(client);
              }
              throw error;
            }
          })(),
          client
            .from("combustivel_emitente")
            .select("emitente, litros, valor_total, qtd_notas")
            .order("valor_total", { ascending: false }),
          fetchAllMunicipioRows(client),
        ]);

        if (!active) return;

        if (emitenteRes.error) {
          setError(emitenteRes.error.message);
          setLoading(false);
          return;
        }

        setMensalRows(mensalResult.rows);
        setHasMensalEmitente(mensalResult.hasEmitente);
        setEmitenteRows((emitenteRes.data ?? []) as EmitenteRow[]);
        setMunicipios(municipioData);
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

    if (hasMensalEmitente && selectedEmitente !== "all") {
      rows = rows.filter((row) => row.emitente === selectedEmitente);
    }

    return rows;
  }, [
    mensalRows,
    resolvedSelectedEntidade,
    hasMensalEmitente,
    selectedEmitente,
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

  const emitenteBar = useMemo(() => {
    if (hasMensalEmitente) {
      const grouped = new Map<string, number>();
      filteredMensalRows.forEach((row) => {
        if (!row.emitente) return;
        grouped.set(row.emitente, (grouped.get(row.emitente) ?? 0) + row.valor_total);
      });
      return [...grouped.entries()]
        .map(([emitente, valor_total]) => ({ emitente, valor_total }))
        .sort((a, b) => b.valor_total - a.valor_total)
        .slice(0, 12);
    }

    const ordered = [...emitenteRows].sort((a, b) => b.valor_total - a.valor_total);
    if (selectedEmitente === "all") return ordered.slice(0, 12);
    return ordered.filter((item) => item.emitente === selectedEmitente).slice(0, 12);
  }, [emitenteRows, filteredMensalRows, hasMensalEmitente, selectedEmitente]);

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
      xaxis: { categories: monthlySeries.labels, labels: { rotate: -45 } },
      yaxis: {
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
      legend: { position: "right" },
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
        y: {
          formatter: (value) => formatMoney(Number(value)),
        },
      },
      dataLabels: {
        formatter: (value) => `${Number(value).toFixed(2)}%`,
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
        labels: { formatter: (value) => `R$ ${formatMillions(Number(value))}` },
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

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
        Carregando painel de combustivel...
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
        Nenhum dado encontrado para o painel de combustivel. Verifique se as tabelas `combustivel_mensal`,
        `combustivel_emitente`, `aux_dim_municipio` e `aux_dim_entidade` estao populadas no Supabase.
      </div>
    );
  }

  const chartHeaderClass = "mb-2";
  const kpiHeaderClass = "mb-1";
  const panelTitleClass = "text-sm font-semibold text-gray-700 dark:text-gray-200";
  const cardClass = "rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800";
  const kpiCardClass = "rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800";

  return (
    <div className="space-y-2">
      <div className="lg:hidden">
        <CombustivelHeaderFilters />
      </div>

      <div className="grid grid-cols-1 gap-2 xl:grid-cols-12">
        <div className={`xl:col-span-7 ${cardClass}`}>
          <div className={chartHeaderClass}>
            <h3 className={panelTitleClass}>Evolucao Mensal do Gasto com Combustivel</h3>
          </div>
          <div className="h-[260px] xl:h-[214px]">
            <Chart
              type="line"
              options={lineOptions}
              series={[{ name: "Valor Total", data: monthlySeries.values }]}
              height="100%"
            />
          </div>
        </div>

        <div className={`xl:col-span-3 ${cardClass}`}>
          <div className={chartHeaderClass}>
            <h3 className={panelTitleClass}>Entidade</h3>
          </div>
          <div className="h-[260px] xl:h-[214px]">
            <Chart
              type="treemap"
              options={treemapOptions}
              series={[{ data: entidadeTreemap }]}
              height="100%"
            />
          </div>
        </div>

        <div className="xl:col-span-2 space-y-2">
          <div className={kpiCardClass}>
            <div className={kpiHeaderClass}>
              <h3 className={panelTitleClass}>Valor Total</h3>
            </div>
            <div className="text-center">
              <p className="text-[24px] font-semibold text-[#1e3aaf] dark:text-blue-400">
                R$ {formatMillions(kpi.totalValor)}
              </p>
            </div>
          </div>

          <div className={kpiCardClass}>
            <div className={kpiHeaderClass}>
              <h3 className={panelTitleClass}>Litros</h3>
            </div>
            <div className="text-center">
              <p className="text-[24px] font-semibold text-[#1e3aaf] dark:text-blue-400">
                {formatMillions(kpi.totalLitros)}
              </p>
            </div>
          </div>

          <div className={kpiCardClass}>
            <div className={kpiHeaderClass}>
              <h3 className={panelTitleClass}>Preco Medio</h3>
            </div>
            <div className="text-center">
              <p className="text-[24px] font-semibold text-[#1e3aaf] dark:text-blue-400">
                {formatMoney(kpi.precoMedio)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 xl:grid-cols-12">
        <div className={`xl:col-span-5 ${cardClass}`}>
          <div className={chartHeaderClass}>
            <h3 className={panelTitleClass}>Tipo de Combustivel</h3>
          </div>
          <Chart type="pie" options={pieOptions} series={tipoPie.series} height={260} />
        </div>

        <div className={`xl:col-span-7 ${cardClass}`}>
          <div className={chartHeaderClass}>
            <h3 className={panelTitleClass}>Valor Total por Emitente</h3>
          </div>
          {(selectedMunicipio !== "all" ||
            resolvedSelectedEntidade !== "all" ||
            resolvedSelectedTipos.length > 0) && (
            <div className="mb-1 text-right text-xs text-amber-700 dark:text-amber-400">
              Visao geral (nao filtrada)
            </div>
          )}
          <Chart
            type="bar"
            options={barOptions}
            series={[{ name: "Valor Total", data: emitenteBar.map((row) => row.valor_total) }]}
            height={260}
          />
        </div>
      </div>
    </div>
  );
}
