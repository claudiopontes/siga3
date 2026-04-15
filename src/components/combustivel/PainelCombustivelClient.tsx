"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";
import { supabase } from "@/lib/supabase";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

type MensalRow = {
  ano: number;
  mes: number;
  entidade: string;
  tipo_combustivel: string;
  litros: number;
  valor_total: number;
  qtd_notas: number;
};

type EmitenteRow = {
  emitente: string;
  litros: number;
  valor_total: number;
  qtd_notas: number;
};

type MunicipioRow = {
  codigo: string;
  nome: string;
  uf_codigo: string | null;
};

type EntidadeDimRow = {
  codigo: string;
  nome: string;
  municipio_codigo: string | null;
};

type EntidadeOption = {
  codigo: string;
  nome: string;
  municipioCodigo: string | null;
};

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

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

export default function PainelCombustivelClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mensalRows, setMensalRows] = useState<MensalRow[]>([]);
  const [emitenteRows, setEmitenteRows] = useState<EmitenteRow[]>([]);
  const [municipios, setMunicipios] = useState<MunicipioRow[]>([]);
  const [dimEntidades, setDimEntidades] = useState<EntidadeDimRow[]>([]);

  const [selectedMunicipio, setSelectedMunicipio] = useState("all");
  const [selectedEntidade, setSelectedEntidade] = useState("all");
  const [selectedTipos, setSelectedTipos] = useState<string[]>([]);

  useEffect(() => {
    let active = true;

    async function fetchAllMensalRows(): Promise<MensalRow[]> {
      const pageSize = 1000;
      let offset = 0;
      const out: MensalRow[] = [];

      while (true) {
        const { data, error } = await supabase
          .from("combustivel_mensal")
          .select("ano, mes, entidade, tipo_combustivel, litros, valor_total, qtd_notas")
          .order("ano", { ascending: true })
          .order("mes", { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (error) throw error;

        const batch = (data ?? []) as MensalRow[];
        out.push(...batch);

        if (batch.length < pageSize) break;
        offset += pageSize;
      }

      return out;
    }

    async function load() {
      setLoading(true);
      setError(null);

      const [mensalData, emitenteRes, municipiosRes, entidadeRes] = await Promise.all([
        fetchAllMensalRows(),
        supabase
          .from("combustivel_emitente")
          .select("emitente, litros, valor_total, qtd_notas")
          .order("valor_total", { ascending: false }),
        supabase
          .from("aux_dim_municipio")
          .select("codigo, nome, uf_codigo")
          .eq("uf_codigo", "12")
          .order("nome", { ascending: true }),
        supabase
          .from("aux_dim_entidade")
          .select("codigo, nome, municipio_codigo")
          .order("nome", { ascending: true }),
      ]);

      if (!active) return;

      const failure = emitenteRes.error || municipiosRes.error || entidadeRes.error;
      if (failure) {
        setError(failure.message);
        setLoading(false);
        return;
      }

      setMensalRows(mensalData);
      setEmitenteRows((emitenteRes.data ?? []) as EmitenteRow[]);
      setMunicipios((municipiosRes.data ?? []) as MunicipioRow[]);
      setDimEntidades((entidadeRes.data ?? []) as EntidadeDimRow[]);
      setLoading(false);
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

  const entidadeOptions = useMemo(() => {
    const entidadeNames = new Set(mensalRows.map((row) => normalizeName(row.entidade)));
    const options: EntidadeOption[] = dimEntidades
      .filter((row) => entidadeNames.has(normalizeName(row.nome)))
      .map((row) => ({
        codigo: row.codigo,
        nome: row.nome,
        municipioCodigo: row.municipio_codigo,
      }));

    const uniqueByCode = new Map<string, EntidadeOption>();
    options.forEach((item) => uniqueByCode.set(item.codigo, item));
    return [...uniqueByCode.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [dimEntidades, mensalRows]);

  const entidadeCodigoToNormName = useMemo(() => {
    const out = new Map<string, string>();
    entidadeOptions.forEach((item) => out.set(item.codigo, normalizeName(item.nome)));
    return out;
  }, [entidadeOptions]);

  const selectedMunicipioEntityNames = useMemo(() => {
    if (selectedMunicipio === "all") return null;
    const names = new Set<string>();
    entidadeOptions.forEach((opt) => {
      if (opt.municipioCodigo === selectedMunicipio) {
        names.add(normalizeName(opt.nome));
      }
    });
    return names;
  }, [entidadeOptions, selectedMunicipio]);

  const resolvedSelectedEntidade = useMemo(() => {
    if (selectedEntidade === "all") return "all";
    return entidadeCodigoToNormName.has(selectedEntidade) ? selectedEntidade : "all";
  }, [entidadeCodigoToNormName, selectedEntidade]);

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
      const targetName = entidadeCodigoToNormName.get(resolvedSelectedEntidade);
      if (targetName) rows = rows.filter((row) => normalizeName(row.entidade) === targetName);
    }

    if (selectedMunicipioEntityNames) {
      rows = rows.filter((row) => selectedMunicipioEntityNames.has(normalizeName(row.entidade)));
    }

    return rows;
  }, [
    entidadeCodigoToNormName,
    mensalRows,
    resolvedSelectedEntidade,
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
    return [...emitenteRows].sort((a, b) => b.valor_total - a.valor_total).slice(0, 12);
  }, [emitenteRows]);

  const lineOptions: ApexOptions = useMemo(
    () => ({
      chart: { type: "line", toolbar: { show: false }, fontFamily: "inherit" },
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
      colors: ["#1d87e4"],
    }),
    [monthlySeries.labels],
  );

  const treemapOptions: ApexOptions = useMemo(
    () => ({
      chart: { type: "treemap", toolbar: { show: false }, fontFamily: "inherit" },
      dataLabels: {
        enabled: true,
        formatter: (_text, opts) => {
          const name = opts.w.globals.labels[opts.seriesIndex] ?? "";
          return name.length > 18 ? `${name.slice(0, 18)}...` : name;
        },
      },
      legend: { show: false },
      tooltip: { y: { formatter: (value) => formatMoney(Number(value)) } },
      colors: ["#1e3a8a", "#1d4ed8", "#0284c7", "#7e22ce", "#a21caf", "#d97706", "#0f766e"],
    }),
    [],
  );

  const pieOptions: ApexOptions = useMemo(
    () => ({
      chart: { type: "pie", fontFamily: "inherit" },
      labels: tipoPie.labels,
      legend: { position: "right" },
      tooltip: {
        y: {
          formatter: (value) => formatMoney(Number(value)),
        },
      },
      dataLabels: {
        formatter: (value) => `${Number(value).toFixed(2)}%`,
      },
    }),
    [tipoPie.labels],
  );

  const barOptions: ApexOptions = useMemo(
    () => ({
      chart: { type: "bar", toolbar: { show: false }, fontFamily: "inherit" },
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
      colors: ["#2389ea"],
      grid: { borderColor: "#d8dee6", strokeDashArray: 3 },
      yaxis: { labels: { style: { fontSize: "11px" } } },
    }),
    [emitenteBar],
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

  const filterHeaderClass = "mb-2";
  const chartHeaderClass = "mb-2";
  const kpiHeaderClass = "mb-1";
  const panelTitleClass = "text-sm font-semibold text-gray-700 dark:text-gray-200";
  const cardClass = "rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800";
  const filterCardClass = "rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800";
  const kpiCardClass = "rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 xl:grid-cols-12">
        <div className={`xl:col-span-3 ${filterCardClass}`}>
          <div className={filterHeaderClass}>
            <h3 className={panelTitleClass}>Municipio</h3>
          </div>
          <select
            value={selectedMunicipio}
            onChange={(e) => setSelectedMunicipio(e.target.value)}
            className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-700 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800"
          >
            <option value="all">Todos</option>
            {municipios.map((m) => (
              <option key={m.codigo} value={m.codigo}>
                {m.nome}
              </option>
            ))}
          </select>
        </div>

        <div className={`xl:col-span-6 ${filterCardClass}`}>
          <div className={filterHeaderClass}>
            <h3 className={panelTitleClass}>Entidade</h3>
          </div>
          <select
            value={resolvedSelectedEntidade}
            onChange={(e) => setSelectedEntidade(e.target.value)}
            className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-700 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800"
          >
            <option value="all">Todos</option>
            {entidadeOptions.map((entidade) => (
              <option key={entidade.codigo} value={entidade.codigo}>
                {entidade.nome}
              </option>
            ))}
          </select>
        </div>

        <div className={`xl:col-span-3 ${filterCardClass}`}>
          <div className={filterHeaderClass}>
            <h3 className={panelTitleClass}>Tipo Combustivel</h3>
          </div>
          <select
            multiple
            value={resolvedSelectedTipos}
            onChange={(e) =>
              setSelectedTipos(Array.from(e.target.selectedOptions).map((opt) => opt.value))
            }
            className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-700 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800"
          >
            {availableTipos.map((tipo) => (
              <option key={tipo} value={tipo}>
                {tipo}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 xl:grid-cols-12">
        <div className={`xl:col-span-7 ${cardClass}`}>
          <div className={chartHeaderClass}>
            <h3 className={panelTitleClass}>Evolucao Mensal do Gasto com Combustivel</h3>
          </div>
          <Chart
            type="line"
            options={lineOptions}
            series={[{ name: "Valor Total", data: monthlySeries.values }]}
            height={285}
          />
        </div>

        <div className={`xl:col-span-3 ${cardClass}`}>
          <div className={chartHeaderClass}>
            <h3 className={panelTitleClass}>Entidade</h3>
          </div>
          <Chart
            type="treemap"
            options={treemapOptions}
            series={[{ data: entidadeTreemap }]}
            height={285}
          />
        </div>

        <div className="xl:col-span-2 space-y-2">
          <div className={kpiCardClass}>
            <div className={kpiHeaderClass}>
              <h3 className={panelTitleClass}>Valor Total</h3>
            </div>
            <div className="text-center">
              <p className="text-[30px] font-semibold text-[#1e3aaf] dark:text-blue-400">
                R$ {formatMillions(kpi.totalValor)}
              </p>
            </div>
          </div>

          <div className={kpiCardClass}>
            <div className={kpiHeaderClass}>
              <h3 className={panelTitleClass}>Litros</h3>
            </div>
            <div className="text-center">
              <p className="text-[30px] font-semibold text-[#1e3aaf] dark:text-blue-400">
                {formatMillions(kpi.totalLitros)}
              </p>
            </div>
          </div>

          <div className={kpiCardClass}>
            <div className={kpiHeaderClass}>
              <h3 className={panelTitleClass}>Preco Medio</h3>
            </div>
            <div className="text-center">
              <p className="text-[30px] font-semibold text-[#1e3aaf] dark:text-blue-400">
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
