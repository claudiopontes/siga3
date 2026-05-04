"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";
import { Eye, SlidersHorizontal, Printer, AlertTriangle } from "lucide-react";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

// --- Tipos ---

type EmpenhoRow = {
  id_entidade: number;
  ano_remessa: number | null;
  data_empenho: string | null;
  cpf_cnpj_credor: string | null;
  numero_categoria_economica: number | null;
  numero_grupo_natureza_despesa: number | null;
  numero_elemento_despesa: number | null;
  numero_funcao: number | null;
  valor_empenhado_liquido: number | null;
  valor_liquidado: number | null;
  valor_pago: number | null;
  valor_a_liquidar: number | null;
  valor_a_pagar: number | null;
};

type DimEnteRow = {
  id_ente: number;
  codigo: number;
  nome: string;
};

type DimCredorRow = {
  cnpj_cpf: string;
  nome: string;
};

// --- Helpers ---

function toNum(v: number | string | null | undefined): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const p = parseFloat(v.replace(",", "."));
    return Number.isFinite(p) ? p : 0;
  }
  return 0;
}

function fmtMoeda(v: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function fmtCompacto(v: number): string {
  const s = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (a >= 1e9) return `${s}R$ ${(a / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} bi`;
  if (a >= 1e6) return `${s}R$ ${(a / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi`;
  if (a >= 1e3) return `${s}R$ ${(a / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return fmtMoeda(v);
}

function fmtPct(v: number): string {
  return `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function fmtNum(v: number): string {
  return v.toLocaleString("pt-BR");
}

function formatSupabaseError(error: unknown): string {
  if (!error) return "Erro desconhecido.";
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    const e = error as { message?: string; details?: string; hint?: string; code?: string };
    return [e.message, e.details, e.hint, e.code].filter(Boolean).join(" | ") || JSON.stringify(error);
  }
  return String(error);
}

function mesAnoChave(dataStr: string | null): string {
  if (!dataStr) return "";
  return dataStr.slice(0, 7); // "2024-03"
}

async function loadAllPaginated<T>(
  client: NonNullable<typeof supabase>,
  table: string,
  selectCols: string,
): Promise<T[]> {
  const pageSize = 1000;
  let offset = 0;
  const all: T[] = [];
  while (true) {
    const { data, error } = await client
      .from(table)
      .select(selectCols)
      .range(offset, offset + pageSize - 1);
    if (error || !data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

// --- Componente principal ---

export default function PainelDespesaClient() {
  "use no memo";

  const searchParams = useSearchParams();
  const paramAnoInicio = searchParams.get("anoInicio");
  const paramAnoFim    = searchParams.get("anoFim");
  const paramEnte      = searchParams.get("ente");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<EmpenhoRow[]>([]);
  const [credores, setCredores] = useState<DimCredorRow[]>([]);
  const [enteByCode, setEnteByCode] = useState<Map<number, DimEnteRow>>(new Map());

  const evolucaoRef = useRef<HTMLDivElement | null>(null);
  const entesRef = useRef<HTMLDivElement | null>(null);
  const credoresRef = useRef<HTMLDivElement | null>(null);
  const composicaoRef = useRef<HTMLDivElement | null>(null);

  // Carrega dim_credor uma única vez
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const client = supabase!;

    Promise.all([
      client.from("dim_ente").select("id_ente,codigo,nome").range(0, 9999),
      loadAllPaginated<DimCredorRow>(client, "dim_credor", "cnpj_cpf,nome"),
    ]).then(([entesRes, credoresData]) => {
      if (!entesRes.error) {
        const m = new Map<number, DimEnteRow>();
        ((entesRes.data ?? []) as DimEnteRow[]).forEach((e) => m.set(Number(e.codigo), e));
        setEnteByCode(m);
      }
      setCredores(credoresData);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Carrega fato_empenho quando os params de URL mudam
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }
    if (!paramAnoInicio || !paramAnoFim) {
      // Aguarda o header definir o período padrão na URL
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    const client = supabase!;
    const anoInicioNum = Number(paramAnoInicio);
    const anoFimNum    = Number(paramAnoFim);
    const enteNum = paramEnte && paramEnte !== "all" ? Number(paramEnte) : null;

    async function load() {
      // Filtra por ano_remessa (indexado via idx_fato_empenho_entidade_ano).
      // Para reduzir volume transferido, execute etl/schema/views_despesa.sql no Supabase.
      const pageSize = 1000;
      let offset = 0;
      const allRows: EmpenhoRow[] = [];

      while (true) {
        const baseQuery = client
          .from("fato_empenho")
          .select(
            "id_entidade,ano_remessa,data_empenho,cpf_cnpj_credor,numero_categoria_economica,numero_grupo_natureza_despesa,numero_elemento_despesa,numero_funcao,valor_empenhado_liquido,valor_liquidado,valor_pago,valor_a_liquidar,valor_a_pagar",
          )
          .gte("ano_remessa", anoInicioNum)
          .lte("ano_remessa", anoFimNum);

        const finalQuery = enteNum != null
          ? baseQuery.eq("id_entidade", enteNum)
          : baseQuery;

        const { data, error: queryError } = await finalQuery.range(offset, offset + pageSize - 1);

        if (queryError) throw new Error(formatSupabaseError(queryError));

        const batch = (data ?? []) as EmpenhoRow[];
        allRows.push(...batch);
        if (batch.length < pageSize) break;
        offset += pageSize;
      }

      if (!active) return;
      setRows(allRows);
      setLoading(false);
    }

    load().catch((err) => {
      if (!active) return;
      setError(formatSupabaseError(err));
      setLoading(false);
    });

    return () => { active = false; };
  }, [paramAnoInicio, paramAnoFim, paramEnte]);

  // --- Mapas auxiliares ---

  const credorByCpfCnpj = useMemo(() => {
    const m = new Map<string, DimCredorRow>();
    credores.forEach((c) => m.set(c.cnpj_cpf, c));
    return m;
  }, [credores]);

  // --- KPIs ---

  const kpi = useMemo(() => {
    let empenhado = 0,
      liquidado = 0,
      pago = 0,
      aLiquidar = 0,
      aPagar = 0;
    const entesSet = new Set<number>();
    const credoresSet = new Set<string>();

    rows.forEach((row) => {
      empenhado += toNum(row.valor_empenhado_liquido);
      liquidado += toNum(row.valor_liquidado);
      pago += toNum(row.valor_pago);
      aLiquidar += toNum(row.valor_a_liquidar);
      aPagar += toNum(row.valor_a_pagar);
      if (row.id_entidade) entesSet.add(row.id_entidade);
      if (row.cpf_cnpj_credor) credoresSet.add(row.cpf_cnpj_credor);
    });

    const pctPago = liquidado > 0 ? (pago / liquidado) * 100 : 0;
    return {
      empenhado,
      liquidado,
      pago,
      aLiquidar,
      aPagar,
      pctPago,
      qtdEntes: entesSet.size,
      qtdCredores: credoresSet.size,
    };
  }, [rows]);

  // --- Evolução mensal ---

  const evolucaoMensal = useMemo(() => {
    const acc = new Map<string, { empenhado: number; liquidado: number; pago: number }>();

    rows.forEach((row) => {
      const mes = mesAnoChave(row.data_empenho);
      if (!mes) return;
      if (!acc.has(mes)) acc.set(mes, { empenhado: 0, liquidado: 0, pago: 0 });
      const entry = acc.get(mes)!;
      entry.empenhado += toNum(row.valor_empenhado_liquido);
      entry.liquidado += toNum(row.valor_liquidado);
      entry.pago += toNum(row.valor_pago);
    });

    const sorted = [...acc.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const labels = sorted.map(([mes]) => {
      const [ano, m] = mes.split("-");
      return `${m}/${ano}`;
    });

    return {
      labels,
      empenhado: sorted.map(([, v]) => Number(v.empenhado.toFixed(2))),
      liquidado: sorted.map(([, v]) => Number(v.liquidado.toFixed(2))),
      pago: sorted.map(([, v]) => Number(v.pago.toFixed(2))),
    };
  }, [rows]);

  const evolucaoOptions = useMemo<ApexOptions>(
    () => ({
      chart: { type: "line", toolbar: { show: true }, fontFamily: "inherit" },
      stroke: { curve: "smooth", width: [2, 2, 2] },
      colors: ["#0f766e", "#3b82f6", "#10b981"],
      dataLabels: { enabled: false },
      xaxis: {
        categories: evolucaoMensal.labels,
        labels: { rotate: -30 },
      },
      yaxis: { labels: { formatter: (v: number) => fmtCompacto(Number(v)) } },
      tooltip: { y: { formatter: (v: number) => fmtMoeda(Number(v)) } },
      legend: { position: "bottom", fontSize: "12px" },
      grid: { borderColor: "#e2e8f0", strokeDashArray: 3 },
    }),
    [evolucaoMensal.labels],
  );

  const evolucaoSeries = useMemo(
    () => [
      { name: "Empenhado Líquido", data: evolucaoMensal.empenhado },
      { name: "Liquidado", data: evolucaoMensal.liquidado },
      { name: "Pago", data: evolucaoMensal.pago },
    ],
    [evolucaoMensal],
  );

  // --- Ranking entes ---

  const rankingEntes = useMemo(() => {
    const acc = new Map<
      number,
      { empenhado: number; liquidado: number; pago: number; aPagar: number }
    >();

    rows.forEach((row) => {
      const code = row.id_entidade;
      if (!acc.has(code)) acc.set(code, { empenhado: 0, liquidado: 0, pago: 0, aPagar: 0 });
      const e = acc.get(code)!;
      e.empenhado += toNum(row.valor_empenhado_liquido);
      e.liquidado += toNum(row.valor_liquidado);
      e.pago += toNum(row.valor_pago);
      e.aPagar += toNum(row.valor_a_pagar);
    });

    return [...acc.entries()]
      .map(([code, values]) => ({
        nome: enteByCode.get(code)?.nome ?? String(code),
        ...values,
      }))
      .sort((a, b) => b.empenhado - a.empenhado)
      .slice(0, 10);
  }, [rows, enteByCode]);

  // --- Ranking credores ---

  const rankingCredores = useMemo(() => {
    const acc = new Map<
      string,
      { empenhado: number; pago: number; qtd: number; cnpjCpf: string }
    >();

    rows.forEach((row) => {
      const key = row.cpf_cnpj_credor ?? "(sem credor)";
      if (!acc.has(key)) acc.set(key, { empenhado: 0, pago: 0, qtd: 0, cnpjCpf: key });
      const e = acc.get(key)!;
      e.empenhado += toNum(row.valor_empenhado_liquido);
      e.pago += toNum(row.valor_pago);
      e.qtd += 1;
    });

    return [...acc.entries()]
      .map(([key, values]) => ({
        nome: credorByCpfCnpj.get(key)?.nome ?? key,
        ...values,
      }))
      .sort((a, b) => b.pago - a.pago)
      .slice(0, 10);
  }, [rows, credorByCpfCnpj]);

  // --- Composição por categoria econômica ---

  const composicaoCat = useMemo(() => {
    const acc = new Map<string, number>();
    rows.forEach((row) => {
      const key =
        row.numero_categoria_economica != null
          ? `Categoria ${row.numero_categoria_economica}`
          : "Não informada";
      acc.set(key, (acc.get(key) ?? 0) + toNum(row.valor_empenhado_liquido));
    });
    return [...acc.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  // --- Composição por grupo de natureza ---

  const composicaoGrupo = useMemo(() => {
    const acc = new Map<string, number>();
    rows.forEach((row) => {
      const key =
        row.numero_grupo_natureza_despesa != null
          ? `Grupo ${row.numero_grupo_natureza_despesa}`
          : "Não informado";
      acc.set(key, (acc.get(key) ?? 0) + toNum(row.valor_empenhado_liquido));
    });
    return [...acc.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const composicaoTotal = useMemo(
    () => composicaoCat.reduce((acc, [, v]) => acc + v, 0),
    [composicaoCat],
  );

  const composicaoDonutOptions = useMemo<ApexOptions>(
    () => ({
      chart: { type: "donut", toolbar: { show: false }, fontFamily: "inherit" },
      labels: composicaoCat.map(([label]) => label),
      colors: ["#0f766e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"],
      legend: { position: "bottom", fontSize: "12px" },
      dataLabels: {
        enabled: true,
        formatter: (v: number) => `${v.toFixed(1)}%`,
      },
      tooltip: { y: { formatter: (v: number) => fmtMoeda(v) } },
      plotOptions: {
        pie: {
          donut: {
            size: "55%",
            labels: {
              show: true,
              total: {
                show: true,
                label: "Empenhado",
                formatter: () => fmtCompacto(composicaoTotal),
              },
            },
          },
        },
      },
    }),
    [composicaoCat, composicaoTotal],
  );

  const composicaoDonutSeries = useMemo(
    () => composicaoCat.map(([, v]) => Number(v.toFixed(2))),
    [composicaoCat],
  );

  // --- Alertas ---

  const alertasEntesAPagar = useMemo(
    () => rankingEntes.filter((e) => e.aPagar > 0).slice(0, 5),
    [rankingEntes],
  );

  const alertasCredoresConcentracao = useMemo(() => {
    if (rankingCredores.length === 0 || kpi.pago === 0) return [];
    return rankingCredores.slice(0, 5).map((c) => ({
      ...c,
      pct: kpi.pago > 0 ? (c.pago / kpi.pago) * 100 : 0,
    }));
  }, [rankingCredores, kpi.pago]);

  // --- Ações de gráficos ---

  const onFullscreenElement = async (el: HTMLDivElement | null) => {
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await el.requestFullscreen();
  };

  const closeActionsMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    const details = event.currentTarget.closest("details");
    details?.removeAttribute("open");
  };

  // --- Render ---

  if (!isSupabaseConfigured) {
    return (
      <div className="m-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
        Supabase não configurado. Defina as variáveis de ambiente{" "}
        <code>NEXT_PUBLIC_SUPABASE_URL</code> e <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          <span className="text-sm">Carregando despesas públicas...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
        Falha ao carregar dados: {error}
      </div>
    );
  }

  if (rows.length === 0 && paramAnoInicio && paramAnoFim) {
    return (
      <div className="m-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
        Nenhum empenho encontrado para o período {paramAnoInicio}–{paramAnoFim}. Verifique se o ETL da despesa foi executado.
      </div>
    );
  }

  if (!paramAnoInicio || !paramAnoFim) {
    return (
      <div className="m-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
        Nenhum dado de despesa disponível. Verifique a tabela{" "}
        <code>fato_empenho</code> no Supabase.
      </div>
    );
  }

  return (
    <div className="min-h-screen space-y-5 bg-slate-50 p-4 pb-10 dark:bg-slate-900 sm:p-6">

      {/* Cards KPI */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-6">
        <KpiCard
          titulo="Empenhado Líquido"
          valor={fmtCompacto(kpi.empenhado)}
          valorCompleto={fmtMoeda(kpi.empenhado)}
          cor="slate"
        />
        <KpiCard
          titulo="Liquidado"
          valor={fmtCompacto(kpi.liquidado)}
          valorCompleto={fmtMoeda(kpi.liquidado)}
          cor="blue"
        />
        <KpiCard
          titulo="Pago"
          valor={fmtCompacto(kpi.pago)}
          valorCompleto={fmtMoeda(kpi.pago)}
          cor="green"
        />
        <KpiCard
          titulo="A Liquidar"
          valor={fmtCompacto(kpi.aLiquidar)}
          valorCompleto={fmtMoeda(kpi.aLiquidar)}
          cor="amber"
        />
        <KpiCard
          titulo="A Pagar"
          valor={fmtCompacto(kpi.aPagar)}
          valorCompleto={fmtMoeda(kpi.aPagar)}
          cor="red"
        />
        <KpiCardDestaque
          titulo="% Pago"
          valor={fmtPct(kpi.pctPago)}
          descricao="Pago / Liquidado"
          realizacao={kpi.pctPago}
        />
      </div>

      {/* Gráfico de evolução mensal */}
      <div
        ref={evolucaoRef}
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
      >
        <div className="mb-2 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Evolução Mensal da Despesa — {paramAnoInicio}{paramAnoFim !== paramAnoInicio ? `–${paramAnoFim}` : ""}
            </h3>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Empenhado Líquido, Liquidado e Pago por mês de empenho
            </p>
          </div>
          <details className="relative">
            <ActionSummary />
            <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                onClick={(e) => {
                  closeActionsMenu(e);
                  onFullscreenElement(evolucaoRef.current);
                }}
              >
                <Eye className="h-3.5 w-3.5" />
                Visualizar
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                onClick={(e) => {
                  closeActionsMenu(e);
                  window.print();
                }}
              >
                <Printer className="h-3.5 w-3.5" />
                Imprimir
              </button>
            </div>
          </details>
        </div>
        {evolucaoMensal.labels.length > 0 ? (
          <Chart
            options={evolucaoOptions}
            series={evolucaoSeries}
            type="line"
            height={320}
          />
        ) : (
          <div className="flex h-[320px] items-center justify-center text-sm text-slate-500">
            Sem dados temporais disponíveis para o período selecionado.
          </div>
        )}
      </div>

      {/* Ranking entes + credores */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Ranking entes */}
        <div
          ref={entesRef}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Top 10 — Entes por Despesa
              </h3>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Ordenado por Empenhado Líquido
              </p>
            </div>
            <details className="relative">
              <ActionSummary />
              <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                  onClick={(e) => {
                    closeActionsMenu(e);
                    onFullscreenElement(entesRef.current);
                  }}
                >
                  <Eye className="h-3.5 w-3.5" />
                  Visualizar
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                  onClick={(e) => {
                    closeActionsMenu(e);
                    window.print();
                  }}
                >
                  <Printer className="h-3.5 w-3.5" />
                  Imprimir
                </button>
              </div>
            </details>
          </div>
          <div className="max-h-[420px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Ente</th>
                  <th className="px-3 py-2 text-right">Empenhado</th>
                  <th className="px-3 py-2 text-right">Liquidado</th>
                  <th className="px-3 py-2 text-right">Pago</th>
                  <th className="px-3 py-2 text-right">A Pagar</th>
                </tr>
              </thead>
              <tbody>
                {rankingEntes.map((ente, i) => (
                  <tr
                    key={`ente-${i}`}
                    className={`border-t border-slate-100 dark:border-slate-700/50 ${i % 2 !== 0 ? "bg-slate-50 dark:bg-slate-800/40" : ""}`}
                  >
                    <td className="px-3 py-2 text-xs text-slate-400">{i + 1}</td>
                    <td className="max-w-[160px] truncate px-3 py-2 font-medium text-slate-700 dark:text-slate-200">
                      {ente.nome}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">
                      {fmtCompacto(ente.empenhado)}
                    </td>
                    <td className="px-3 py-2 text-right text-blue-600 dark:text-blue-400">
                      {fmtCompacto(ente.liquidado)}
                    </td>
                    <td className="px-3 py-2 text-right text-green-600 dark:text-green-400">
                      {fmtCompacto(ente.pago)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right ${ente.aPagar > 0 ? "font-semibold text-red-600 dark:text-red-400" : "text-slate-400"}`}
                    >
                      {fmtCompacto(ente.aPagar)}
                    </td>
                  </tr>
                ))}
                {rankingEntes.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-400">
                      Sem dados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Ranking credores */}
        <div
          ref={credoresRef}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Top 10 — Credores por Pagamento
              </h3>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Ordenado por Valor Pago
              </p>
            </div>
            <details className="relative">
              <ActionSummary />
              <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                  onClick={(e) => {
                    closeActionsMenu(e);
                    onFullscreenElement(credoresRef.current);
                  }}
                >
                  <Eye className="h-3.5 w-3.5" />
                  Visualizar
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                  onClick={(e) => {
                    closeActionsMenu(e);
                    window.print();
                  }}
                >
                  <Printer className="h-3.5 w-3.5" />
                  Imprimir
                </button>
              </div>
            </details>
          </div>
          <div className="max-h-[420px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Credor</th>
                  <th className="px-3 py-2 text-right">Empenhado</th>
                  <th className="px-3 py-2 text-right">Pago</th>
                  <th className="px-3 py-2 text-right">Qtd.</th>
                </tr>
              </thead>
              <tbody>
                {rankingCredores.map((credor, i) => (
                  <tr
                    key={`credor-${i}`}
                    className={`border-t border-slate-100 dark:border-slate-700/50 ${i % 2 !== 0 ? "bg-slate-50 dark:bg-slate-800/40" : ""}`}
                  >
                    <td className="px-3 py-2 text-xs text-slate-400">{i + 1}</td>
                    <td
                      className="max-w-[180px] truncate px-3 py-2 font-medium text-slate-700 dark:text-slate-200"
                      title={credor.cnpjCpf}
                    >
                      {credor.nome}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">
                      {fmtCompacto(credor.empenhado)}
                    </td>
                    <td className="px-3 py-2 text-right text-green-600 dark:text-green-400">
                      {fmtCompacto(credor.pago)}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-500 dark:text-slate-400">
                      {fmtNum(credor.qtd)}
                    </td>
                  </tr>
                ))}
                {rankingCredores.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-400">
                      Sem dados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Composição da despesa */}
      <div
        ref={composicaoRef}
        className="grid grid-cols-1 gap-4 xl:grid-cols-2"
      >
        {/* Donut — categoria econômica */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-2">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Composição por Categoria Econômica
            </h3>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Distribuição do Empenhado Líquido por categoria
            </p>
          </div>
          {composicaoDonutSeries.length > 0 ? (
            <Chart
              options={composicaoDonutOptions}
              series={composicaoDonutSeries}
              type="donut"
              height={320}
            />
          ) : (
            <div className="flex h-[320px] items-center justify-center text-sm text-slate-500">
              Sem dados de composição por categoria.
            </div>
          )}
        </div>

        {/* Tabela — grupo de natureza da despesa */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Composição por Grupo de Natureza da Despesa
            </h3>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Empenhado Líquido por grupo
            </p>
          </div>
          <div className="max-h-[320px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                <tr>
                  <th className="px-3 py-2 text-left">Grupo</th>
                  <th className="px-3 py-2 text-right">Empenhado</th>
                  <th className="px-3 py-2 text-right">Part. %</th>
                </tr>
              </thead>
              <tbody>
                {composicaoGrupo.map(([label, valor], i) => (
                  <tr
                    key={label}
                    className={`border-t border-slate-100 dark:border-slate-700/50 ${i % 2 !== 0 ? "bg-slate-50 dark:bg-slate-800/40" : ""}`}
                  >
                    <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-200">
                      {label}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">
                      {fmtMoeda(valor)}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-500 dark:text-slate-400">
                      {composicaoTotal > 0
                        ? `${((valor / composicaoTotal) * 100).toFixed(1)}%`
                        : "-"}
                    </td>
                  </tr>
                ))}
                {composicaoGrupo.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-sm text-slate-400">
                      Sem dados
                    </td>
                  </tr>
                )}
              </tbody>
              {composicaoTotal > 0 && (
                <tfoot className="sticky bottom-0 border-t-2 border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-900">
                  <tr>
                    <td className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-100">
                      Total
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-800 dark:text-slate-100">
                      {fmtMoeda(composicaoTotal)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-800 dark:text-slate-100">
                      100,0%
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      {/* Alertas da despesa */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/10">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            Alertas da Despesa
          </h3>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Entes com maior saldo a pagar */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
              Entes com maior saldo a pagar
            </p>
            {alertasEntesAPagar.length > 0 ? (
              <ul className="space-y-1.5">
                {alertasEntesAPagar.map((ente, i) => (
                  <li
                    key={`alerta-ente-${i}`}
                    className="flex items-center justify-between rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs dark:border-amber-900/40 dark:bg-slate-800"
                  >
                    <span className="truncate pr-2 font-medium text-slate-700 dark:text-slate-200">
                      {ente.nome}
                    </span>
                    <span className="shrink-0 font-semibold text-red-600 dark:text-red-400">
                      {fmtCompacto(ente.aPagar)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                Nenhum saldo a pagar identificado.
              </p>
            )}
          </div>

          {/* Credores com maior concentração */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
              Credores com maior concentração de pagamentos
            </p>
            {alertasCredoresConcentracao.length > 0 ? (
              <ul className="space-y-1.5">
                {alertasCredoresConcentracao.map((credor, i) => (
                  <li
                    key={`alerta-credor-${i}`}
                    className="flex items-center justify-between rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs dark:border-amber-900/40 dark:bg-slate-800"
                  >
                    <span
                      className="truncate pr-2 font-medium text-slate-700 dark:text-slate-200"
                      title={credor.cnpjCpf}
                    >
                      {credor.nome}
                    </span>
                    <span className="shrink-0 font-semibold text-slate-600 dark:text-slate-300">
                      {fmtPct(credor.pct)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                Sem dados de concentração de pagamentos.
              </p>
            )}
          </div>
        </div>

        {/* Indicadores resumidos */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-amber-200 pt-3 dark:border-amber-900/40">
          <span className="text-xs text-amber-700 dark:text-amber-400">
            <span className="font-semibold">{fmtNum(kpi.qtdEntes)}</span> entes com despesa
          </span>
          <span className="text-xs text-amber-700 dark:text-amber-400">
            <span className="font-semibold">{fmtNum(kpi.qtdCredores)}</span> credores distintos
          </span>
          <span className="text-xs text-amber-700 dark:text-amber-400">
            Total a liquidar:{" "}
            <span className="font-semibold text-amber-600 dark:text-amber-400">
              {fmtCompacto(kpi.aLiquidar)}
            </span>
          </span>
          <span className="text-xs text-amber-700 dark:text-amber-400">
            Total a pagar:{" "}
            <span className="font-semibold text-red-600 dark:text-red-400">
              {fmtCompacto(kpi.aPagar)}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

// --- Sub-componentes ---

type CorKpi = "slate" | "green" | "blue" | "amber" | "red";

const corBorda: Record<CorKpi, string> = {
  slate: "border-l-slate-400",
  green: "border-l-green-500",
  blue: "border-l-blue-500",
  amber: "border-l-amber-500",
  red: "border-l-red-500",
};

const corValor: Record<CorKpi, string> = {
  slate: "text-slate-800 dark:text-slate-100",
  green: "text-green-700 dark:text-green-400",
  blue: "text-blue-700 dark:text-blue-400",
  amber: "text-amber-700 dark:text-amber-400",
  red: "text-red-600 dark:text-red-400",
};

function KpiCard({
  titulo,
  valor,
  valorCompleto,
  cor,
}: {
  titulo: string;
  valor: string;
  valorCompleto: string;
  cor: CorKpi;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 border-l-4 ${corBorda[cor]}`}
      title={valorCompleto}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {titulo}
      </p>
      <p className={`mt-2 text-xl font-bold leading-tight sm:text-2xl ${corValor[cor]}`}>
        {valor}
      </p>
    </div>
  );
}

function KpiCardDestaque({
  titulo,
  valor,
  descricao,
  realizacao,
}: {
  titulo: string;
  valor: string;
  descricao: string;
  realizacao: number;
}) {
  const bg =
    realizacao >= 90
      ? "bg-green-600"
      : realizacao >= 70
        ? "bg-blue-600"
        : realizacao >= 50
          ? "bg-amber-500"
          : "bg-red-500";

  return (
    <div className={`col-span-2 rounded-2xl p-5 shadow-sm xl:col-span-1 ${bg} text-white`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-white/80">{titulo}</p>
      <p className="mt-2 text-3xl font-bold leading-tight sm:text-4xl">{valor}</p>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/30">
        <div
          className="h-full rounded-full bg-white transition-all duration-700"
          style={{ width: `${Math.min(100, Math.max(0, realizacao))}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-white/70">{descricao}</p>
    </div>
  );
}

function ActionSummary() {
  return (
    <summary className="inline-flex list-none cursor-pointer select-none items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-xs font-semibold text-teal-700 shadow-sm transition hover:border-teal-300 hover:bg-teal-100 hover:text-teal-800 dark:border-teal-900/70 dark:bg-teal-950/30 dark:text-teal-300 dark:hover:bg-teal-900/40">
      <SlidersHorizontal className="h-3.5 w-3.5" />
      Ações
    </summary>
  );
}
