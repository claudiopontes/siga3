"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";
import { Eye, SlidersHorizontal, Printer, AlertTriangle } from "lucide-react";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

// --- Tipos das views agregadas ---

type ResumoRow = {
  ano_remessa: number;
  id_entidade: number;
  id_ente: number;
  nome_ente: string;
  nome_entidade: string;
  valor_empenhado_liquido: number;
  valor_liquidado: number;
  valor_pago: number;
  valor_a_liquidar: number;
  valor_a_pagar: number;
  qtd_empenhos: number;
  qtd_credores: number;
  percentual_pago: number;
};

type EvolucaoRow = {
  ano_remessa: number;
  mes_empenho: string;
  id_entidade: number;
  id_ente: number;
  valor_empenhado_liquido: number;
  valor_liquidado: number;
  valor_pago: number;
};

type RankingEnteRow = {
  ano_remessa: number;
  id_ente: number;
  nome_ente: string;
  valor_empenhado_liquido: number;
  valor_liquidado: number;
  valor_pago: number;
  valor_a_pagar: number;
  qtd_empenhos: number;
};

type RankingCredorRow = {
  ano_remessa: number;
  id_ente: number;
  cpf_cnpj_credor: string;
  nome_credor: string;
  valor_empenhado_liquido: number;
  valor_pago: number;
  qtd_empenhos: number;
};

type ComposicaoRow = {
  ano_remessa: number;
  id_entidade: number;
  id_ente: number;
  tipo_composicao: string;
  codigo: string;
  rotulo: string;
  valor_empenhado_liquido: number;
  valor_pago: number;
};

type AlertaRow = {
  ano_remessa: number;
  id_ente: number;
  id_entidade: number;
  tipo_alerta: string;
  descricao: string;
  cpf_cnpj_credor: string | null;
  valor_principal: number;
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

// 42P01 = PostgreSQL "relation does not exist"
// 42703 = PostgreSQL "column does not exist"
// PGRST205 = PostgREST "table not found in schema cache"
const VIEW_NOT_FOUND_CODES = new Set(["42P01", "42703", "PGRST205"]);

function isViewMissing(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  if (VIEW_NOT_FOUND_CODES.has(e.code ?? "")) return true;
  // PostgREST às vezes retorna o código em `details` ou na mensagem
  const msg = (e.message ?? "").toLowerCase();
  return msg.includes("could not find the table") || msg.includes("schema cache");
}

// --- Componente principal ---

export default function PainelDespesaClient() {
  "use no memo";

  const searchParams = useSearchParams();
  const paramAnoInicio  = searchParams.get("anoInicio");
  const paramAnoFim     = searchParams.get("anoFim");
  const paramEnte       = searchParams.get("ente");       // dim_ente.id_ente
  const paramEntidade   = searchParams.get("entidade");   // dim_entidade.id_entidade

  const [loading, setLoading]       = useState(isSupabaseConfigured);
  const [error, setError]           = useState<string | null>(null);
  const [viewsMissing, setViewsMissing] = useState(false);

  const [resumo, setResumo]             = useState<ResumoRow[]>([]);
  const [evolucao, setEvolucao]         = useState<EvolucaoRow[]>([]);
  const [rankEntes, setRankEntes]       = useState<RankingEnteRow[]>([]);
  const [rankCredores, setRankCredores] = useState<RankingCredorRow[]>([]);
  const [composicao, setComposicao]     = useState<ComposicaoRow[]>([]);
  const [alertas, setAlertas]           = useState<AlertaRow[]>([]);

  const evolucaoRef   = useRef<HTMLDivElement | null>(null);
  const entesRef      = useRef<HTMLDivElement | null>(null);
  const credoresRef   = useRef<HTMLDivElement | null>(null);
  const composicaoRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !paramAnoInicio || !paramAnoFim) return;

    let active = true;
    const client = supabase!;
    const anoInicioNum  = Number(paramAnoInicio);
    const anoFimNum     = Number(paramAnoFim);
    // Filtro por entidade específica tem precedência sobre filtro por ente
    const entidadeNum   = paramEntidade && paramEntidade !== "all" ? Number(paramEntidade) : null;
    const enteNum       = !entidadeNum && paramEnte && paramEnte !== "all" ? Number(paramEnte) : null;

    async function queryView<T>(
      view: string,
      cols: string,
      extra?: (q: ReturnType<typeof client.from>) => ReturnType<typeof client.from>,
    ): Promise<T[]> {
      let q = client
        .from(view)
        .select(cols)
        .gte("ano_remessa", anoInicioNum)
        .lte("ano_remessa", anoFimNum);

      // Filtro de entidade específica (mais restrito)
      if (entidadeNum != null) q = q.eq("id_entidade", entidadeNum) as typeof q;
      // Filtro de ente (agrupa todas as entidades do ente)
      else if (enteNum != null) q = q.eq("id_ente", enteNum) as typeof q;

      if (extra) q = extra(q) as typeof q;

      const { data, error: qErr } = await q;
      if (qErr) {
        if (isViewMissing(qErr)) throw Object.assign(new Error("view_missing"), { viewMissing: true });
        throw new Error(`${view}: ${formatSupabaseError(qErr)}`);
      }
      return (data ?? []) as T[];
    }

    async function load() {
      setLoading(true);
      setError(null);
      setViewsMissing(false);

      // mv_ = Materialized Views — leitura rápida, sem recálculo em tempo real
      const [
        resumoResult,
        evolucaoResult,
        entesResult,
        credoresResult,
        composicaoResult,
        alertasEntesResult,
        alertasCredoresResult,
      ] = await Promise.allSettled([
        queryView<ResumoRow>("mv_despesa_resumo", "*"),

        queryView<EvolucaoRow>(
          "mv_despesa_evolucao_mensal",
          "ano_remessa,mes_empenho,id_entidade,valor_empenhado_liquido,valor_liquidado,valor_pago",
          (q) => q.order("mes_empenho", { ascending: true }),
        ),

        queryView<RankingEnteRow>(
          "mv_despesa_ranking_entes",
          "ano_remessa,id_entidade,nome_ente,valor_empenhado_liquido,valor_liquidado,valor_pago,valor_a_pagar,qtd_empenhos",
          (q) => q.order("valor_empenhado_liquido", { ascending: false }).limit(10),
        ),

        queryView<RankingCredorRow>(
          "mv_despesa_ranking_credores",
          "ano_remessa,cpf_cnpj_credor,nome_credor,valor_empenhado_liquido,valor_pago,qtd_empenhos",
          (q) => q.order("valor_pago", { ascending: false }).limit(10),
        ),

        queryView<ComposicaoRow>(
          "mv_despesa_composicao",
          "ano_remessa,id_entidade,tipo_composicao,codigo,rotulo,valor_empenhado_liquido,valor_pago",
          (q) => q.in("tipo_composicao", ["categoria_economica", "grupo_natureza"]),
        ),

        client
          .from("mv_alertas_despesa")
          .select("ano_remessa,id_entidade,tipo_alerta,descricao,cpf_cnpj_credor,valor_principal")
          .gte("ano_remessa", anoInicioNum)
          .lte("ano_remessa", anoFimNum)
          .eq("tipo_alerta", "ente_maior_a_pagar")
          .order("valor_principal", { ascending: false })
          .limit(5),

        client
          .from("mv_alertas_despesa")
          .select("ano_remessa,id_entidade,tipo_alerta,descricao,cpf_cnpj_credor,valor_principal")
          .gte("ano_remessa", anoInicioNum)
          .lte("ano_remessa", anoFimNum)
          .eq("tipo_alerta", "credor_concentrado")
          .order("valor_principal", { ascending: false })
          .limit(5),
      ]);

      if (!active) return;

      // Se o resumo falhar (view ausente ou erro crítico), para tudo
      if (resumoResult.status === "rejected") {
        const err = resumoResult.reason as Error & { viewMissing?: boolean };
        if (err.viewMissing) { setViewsMissing(true); } else { setError(err.message); }
        setLoading(false);
        return;
      }

      setResumo(resumoResult.value);
      setEvolucao(evolucaoResult.status === "fulfilled" ? evolucaoResult.value : []);
      setRankEntes(entesResult.status === "fulfilled" ? entesResult.value : []);
      setRankCredores(credoresResult.status === "fulfilled" ? credoresResult.value : []);
      setComposicao(composicaoResult.status === "fulfilled" ? composicaoResult.value : []);

      type AlertasRes = { data: AlertaRow[] | null; error: unknown };
      const alertasEntes: AlertaRow[] = alertasEntesResult.status === "fulfilled"
        ? ((alertasEntesResult.value as unknown as AlertasRes).data ?? [])
        : [];
      const alertasCredores: AlertaRow[] = alertasCredoresResult.status === "fulfilled"
        ? ((alertasCredoresResult.value as unknown as AlertasRes).data ?? [])
        : [];

      setAlertas([...alertasEntes, ...alertasCredores]);
      setLoading(false);
    }

    load().catch((err: Error & { viewMissing?: boolean }) => {
      if (!active) return;
      if (err.viewMissing) { setViewsMissing(true); } else { setError(err.message); }
      setLoading(false);
    });

    return () => { active = false; };
  }, [paramAnoInicio, paramAnoFim, paramEnte, paramEntidade]);

  // --- KPIs (soma do resumo) ---

  const kpi = useMemo(() => {
    let empenhado = 0, liquidado = 0, pago = 0, aLiquidar = 0, aPagar = 0;
    let qtdEntes = 0, qtdCredoresTotal = 0;

    resumo.forEach((r) => {
      empenhado       += toNum(r.valor_empenhado_liquido);
      liquidado       += toNum(r.valor_liquidado);
      pago            += toNum(r.valor_pago);
      aLiquidar       += toNum(r.valor_a_liquidar);
      aPagar          += toNum(r.valor_a_pagar);
      qtdEntes        += 1;
      qtdCredoresTotal += toNum(r.qtd_credores);
    });

    const pctPago = liquidado > 0 ? (pago / liquidado) * 100 : 0;
    return { empenhado, liquidado, pago, aLiquidar, aPagar, pctPago, qtdEntes, qtdCredoresTotal };
  }, [resumo]);

  // --- Evolução mensal ---

  const evolucaoMensal = useMemo(() => {
    const acc = new Map<string, { empenhado: number; liquidado: number; pago: number }>();

    evolucao.forEach((row) => {
      const mes = row.mes_empenho?.slice(0, 7) ?? "";
      if (!mes) return;
      if (!acc.has(mes)) acc.set(mes, { empenhado: 0, liquidado: 0, pago: 0 });
      const e = acc.get(mes)!;
      e.empenhado += toNum(row.valor_empenhado_liquido);
      e.liquidado += toNum(row.valor_liquidado);
      e.pago      += toNum(row.valor_pago);
    });

    const sorted = [...acc.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const labels = sorted.map(([mes]) => {
      const [ano, m] = mes.split("-");
      return `${m}/${ano}`;
    });

    return {
      labels,
      empenhado: sorted.map(([, v]) => Number(v.empenhado.toFixed(2))),
      liquidado:  sorted.map(([, v]) => Number(v.liquidado.toFixed(2))),
      pago:       sorted.map(([, v]) => Number(v.pago.toFixed(2))),
    };
  }, [evolucao]);

  const evolucaoOptions = useMemo<ApexOptions>(
    () => ({
      chart: { type: "line", toolbar: { show: true }, fontFamily: "inherit" },
      stroke: { curve: "smooth", width: [2, 2, 2] },
      colors: ["#0f766e", "#3b82f6", "#10b981"],
      dataLabels: { enabled: false },
      xaxis: { categories: evolucaoMensal.labels, labels: { rotate: -30 } },
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
      { name: "Liquidado",         data: evolucaoMensal.liquidado },
      { name: "Pago",              data: evolucaoMensal.pago },
    ],
    [evolucaoMensal],
  );

  // --- Ranking entes (agrega por ente ao cruzar vários anos) ---

  const rankingEntes = useMemo(() => {
    const acc = new Map<number, RankingEnteRow>();
    rankEntes.forEach((r) => {
      const key = r.id_ente;
      if (!acc.has(key)) {
        acc.set(key, { ...r,
          valor_empenhado_liquido: 0, valor_liquidado: 0,
          valor_pago: 0, valor_a_pagar: 0, qtd_empenhos: 0 });
      }
      const e = acc.get(key)!;
      e.valor_empenhado_liquido += toNum(r.valor_empenhado_liquido);
      e.valor_liquidado         += toNum(r.valor_liquidado);
      e.valor_pago              += toNum(r.valor_pago);
      e.valor_a_pagar           += toNum(r.valor_a_pagar);
      e.qtd_empenhos            += toNum(r.qtd_empenhos);
    });
    return [...acc.values()].sort((a, b) => b.valor_empenhado_liquido - a.valor_empenhado_liquido).slice(0, 10);
  }, [rankEntes]);

  // --- Ranking credores (agrega por credor ao cruzar vários anos) ---

  const rankingCredores = useMemo(() => {
    const acc = new Map<string, RankingCredorRow>();
    rankCredores.forEach((r) => {
      const key = r.cpf_cnpj_credor;
      if (!acc.has(key)) {
        acc.set(key, { ...r,
          valor_empenhado_liquido: 0, valor_pago: 0, qtd_empenhos: 0 });
      }
      const e = acc.get(key)!;
      e.valor_empenhado_liquido += toNum(r.valor_empenhado_liquido);
      e.valor_pago              += toNum(r.valor_pago);
      e.qtd_empenhos            += toNum(r.qtd_empenhos);
    });
    return [...acc.values()].sort((a, b) => b.valor_pago - a.valor_pago).slice(0, 10);
  }, [rankCredores]);

  // --- Composição por categoria econômica ---

  const composicaoCat = useMemo(() => {
    const acc = new Map<string, { rotulo: string; valor: number }>();
    composicao
      .filter((r) => r.tipo_composicao === "categoria_economica")
      .forEach((r) => {
        const key = r.codigo;
        if (!acc.has(key)) acc.set(key, { rotulo: r.rotulo, valor: 0 });
        acc.get(key)!.valor += toNum(r.valor_empenhado_liquido);
      });
    return [...acc.values()].filter((v) => v.valor > 0).sort((a, b) => b.valor - a.valor);
  }, [composicao]);

  const composicaoGrupo = useMemo(() => {
    const acc = new Map<string, { rotulo: string; valor: number }>();
    composicao
      .filter((r) => r.tipo_composicao === "grupo_natureza")
      .forEach((r) => {
        const key = r.codigo;
        if (!acc.has(key)) acc.set(key, { rotulo: r.rotulo, valor: 0 });
        acc.get(key)!.valor += toNum(r.valor_empenhado_liquido);
      });
    return [...acc.values()].filter((v) => v.valor > 0).sort((a, b) => b.valor - a.valor);
  }, [composicao]);

  const composicaoTotal = useMemo(
    () => composicaoCat.reduce((acc, v) => acc + v.valor, 0),
    [composicaoCat],
  );

  const composicaoDonutOptions = useMemo<ApexOptions>(
    () => ({
      chart: { type: "donut", toolbar: { show: false }, fontFamily: "inherit" },
      labels: composicaoCat.map((v) => v.rotulo),
      colors: ["#0f766e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"],
      legend: { position: "bottom", fontSize: "12px" },
      dataLabels: { enabled: true, formatter: (v: number) => `${v.toFixed(1)}%` },
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
    () => composicaoCat.map((v) => Number(v.valor.toFixed(2))),
    [composicaoCat],
  );

  // --- Alertas ---

  const alertasEntesAPagar = useMemo(
    () => alertas.filter((a) => a.tipo_alerta === "ente_maior_a_pagar"),
    [alertas],
  );

  const alertasCredoresConcentracao = useMemo(() => {
    const credRows = alertas.filter((a) => a.tipo_alerta === "credor_concentrado");
    const totalPago = credRows.reduce((s, r) => s + toNum(r.valor_principal), 0);
    return credRows.map((r) => ({
      ...r,
      pct: totalPago > 0 ? (toNum(r.valor_principal) / totalPago) * 100 : 0,
    }));
  }, [alertas]);

  // --- Ações de gráficos ---

  const onFullscreenElement = async (el: HTMLDivElement | null) => {
    if (!el) return;
    if (document.fullscreenElement) { await document.exitFullscreen(); return; }
    await el.requestFullscreen();
  };

  const closeActionsMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    (event.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
  };

  // --- Render: guards ---

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

  if (viewsMissing) {
    return (
      <div className="m-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
        <p className="mb-1 font-semibold">Views de performance não encontradas.</p>
        <p>
          Execute o arquivo{" "}
          <code className="rounded bg-amber-100 px-1 py-0.5 font-mono">
            etl/schema/views_despesa_performance.sql
          </code>{" "}
          no SQL Editor do Supabase para criar as views necessárias.
        </p>
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

  if (!paramAnoInicio || !paramAnoFim) {
    return (
      <div className="m-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
        Nenhum dado de despesa disponível. Verifique a tabela{" "}
        <code>fato_empenho</code> no Supabase.
      </div>
    );
  }

  if (resumo.length === 0) {
    return (
      <div className="m-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
        Nenhum empenho encontrado para o período {paramAnoInicio}–{paramAnoFim}. Verifique se o ETL da despesa foi executado.
      </div>
    );
  }

  const periodoLabel = paramAnoFim !== paramAnoInicio
    ? `${paramAnoInicio}–${paramAnoFim}`
    : paramAnoInicio;

  return (
    <div className="min-h-screen space-y-5 bg-slate-50 p-4 pb-10 dark:bg-slate-900 sm:p-6">

      {/* Cards KPI */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-6">
        <KpiCard titulo="Empenhado Líquido" valor={fmtCompacto(kpi.empenhado)} valorCompleto={fmtMoeda(kpi.empenhado)} cor="slate" />
        <KpiCard titulo="Liquidado"         valor={fmtCompacto(kpi.liquidado)} valorCompleto={fmtMoeda(kpi.liquidado)} cor="blue" />
        <KpiCard titulo="Pago"              valor={fmtCompacto(kpi.pago)}      valorCompleto={fmtMoeda(kpi.pago)}      cor="green" />
        <KpiCard titulo="A Liquidar"        valor={fmtCompacto(kpi.aLiquidar)} valorCompleto={fmtMoeda(kpi.aLiquidar)} cor="amber" />
        <KpiCard titulo="A Pagar"           valor={fmtCompacto(kpi.aPagar)}    valorCompleto={fmtMoeda(kpi.aPagar)}    cor="red" />
        <KpiCardDestaque titulo="% Pago" valor={fmtPct(kpi.pctPago)} descricao="Pago / Liquidado" realizacao={kpi.pctPago} />
      </div>

      {/* Gráfico de evolução mensal */}
      <div
        ref={evolucaoRef}
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
      >
        <div className="mb-2 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Evolução Mensal da Despesa — {periodoLabel}
            </h3>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Empenhado Líquido, Liquidado e Pago por mês de empenho
            </p>
          </div>
          <details className="relative">
            <ActionSummary />
            <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
              <button type="button" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700" onClick={(e) => { closeActionsMenu(e); onFullscreenElement(evolucaoRef.current); }}>
                <Eye className="h-3.5 w-3.5" /> Visualizar
              </button>
              <button type="button" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700" onClick={(e) => { closeActionsMenu(e); window.print(); }}>
                <Printer className="h-3.5 w-3.5" /> Imprimir
              </button>
            </div>
          </details>
        </div>
        {evolucaoMensal.labels.length > 0 ? (
          <Chart options={evolucaoOptions} series={evolucaoSeries} type="line" height={320} />
        ) : (
          <div className="flex h-80 items-center justify-center text-sm text-slate-500">
            Sem dados temporais disponíveis para o período selecionado.
          </div>
        )}
      </div>

      {/* Ranking entes + credores */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">

        {/* Ranking entes */}
        <div ref={entesRef} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Top 10 — Entes por Despesa</h3>
              <p className="text-xs text-slate-400 dark:text-slate-500">Ordenado por Empenhado Líquido</p>
            </div>
            <details className="relative">
              <ActionSummary />
              <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                <button type="button" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700" onClick={(e) => { closeActionsMenu(e); onFullscreenElement(entesRef.current); }}>
                  <Eye className="h-3.5 w-3.5" /> Visualizar
                </button>
                <button type="button" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700" onClick={(e) => { closeActionsMenu(e); window.print(); }}>
                  <Printer className="h-3.5 w-3.5" /> Imprimir
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
                  <tr key={`ente-${i}`} className={`border-t border-slate-100 dark:border-slate-700/50 ${i % 2 !== 0 ? "bg-slate-50 dark:bg-slate-800/40" : ""}`}>
                    <td className="px-3 py-2 text-xs text-slate-400">{i + 1}</td>
                    <td className="max-w-40 truncate px-3 py-2 font-medium text-slate-700 dark:text-slate-200">{ente.nome_ente}</td>
                    <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">{fmtCompacto(ente.valor_empenhado_liquido)}</td>
                    <td className="px-3 py-2 text-right text-blue-600 dark:text-blue-400">{fmtCompacto(ente.valor_liquidado)}</td>
                    <td className="px-3 py-2 text-right text-green-600 dark:text-green-400">{fmtCompacto(ente.valor_pago)}</td>
                    <td className={`px-3 py-2 text-right ${ente.valor_a_pagar > 0 ? "font-semibold text-red-600 dark:text-red-400" : "text-slate-400"}`}>{fmtCompacto(ente.valor_a_pagar)}</td>
                  </tr>
                ))}
                {rankingEntes.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-400">Sem dados</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Ranking credores */}
        <div ref={credoresRef} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Top 10 — Credores por Pagamento</h3>
              <p className="text-xs text-slate-400 dark:text-slate-500">Ordenado por Valor Pago</p>
            </div>
            <details className="relative">
              <ActionSummary />
              <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                <button type="button" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700" onClick={(e) => { closeActionsMenu(e); onFullscreenElement(credoresRef.current); }}>
                  <Eye className="h-3.5 w-3.5" /> Visualizar
                </button>
                <button type="button" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700" onClick={(e) => { closeActionsMenu(e); window.print(); }}>
                  <Printer className="h-3.5 w-3.5" /> Imprimir
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
                  <tr key={`credor-${i}`} className={`border-t border-slate-100 dark:border-slate-700/50 ${i % 2 !== 0 ? "bg-slate-50 dark:bg-slate-800/40" : ""}`}>
                    <td className="px-3 py-2 text-xs text-slate-400">{i + 1}</td>
                    <td className="max-w-[180px] truncate px-3 py-2 font-medium text-slate-700 dark:text-slate-200" title={credor.cpf_cnpj_credor}>{credor.nome_credor}</td>
                    <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">{fmtCompacto(credor.valor_empenhado_liquido)}</td>
                    <td className="px-3 py-2 text-right text-green-600 dark:text-green-400">{fmtCompacto(credor.valor_pago)}</td>
                    <td className="px-3 py-2 text-right text-slate-500 dark:text-slate-400">{fmtNum(credor.qtd_empenhos)}</td>
                  </tr>
                ))}
                {rankingCredores.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-400">Sem dados</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Composição da despesa */}
      <div ref={composicaoRef} className="grid grid-cols-1 gap-4 xl:grid-cols-2">

        {/* Donut — categoria econômica */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-2">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Composição por Categoria Econômica</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500">Distribuição do Empenhado Líquido por categoria</p>
          </div>
          {composicaoDonutSeries.length > 0 ? (
            <Chart options={composicaoDonutOptions} series={composicaoDonutSeries} type="donut" height={320} />
          ) : (
            <div className="flex h-80 items-center justify-center text-sm text-slate-500">
              Sem dados de composição por categoria.
            </div>
          )}
        </div>

        {/* Tabela — grupo de natureza da despesa */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Composição por Grupo de Natureza da Despesa</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500">Empenhado Líquido por grupo</p>
          </div>
          <div className="max-h-80 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                <tr>
                  <th className="px-3 py-2 text-left">Grupo</th>
                  <th className="px-3 py-2 text-right">Empenhado</th>
                  <th className="px-3 py-2 text-right">Part. %</th>
                </tr>
              </thead>
              <tbody>
                {composicaoGrupo.map((item, i) => (
                  <tr key={item.rotulo} className={`border-t border-slate-100 dark:border-slate-700/50 ${i % 2 !== 0 ? "bg-slate-50 dark:bg-slate-800/40" : ""}`}>
                    <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-200">{item.rotulo}</td>
                    <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">{fmtMoeda(item.valor)}</td>
                    <td className="px-3 py-2 text-right text-slate-500 dark:text-slate-400">
                      {composicaoTotal > 0 ? `${((item.valor / composicaoTotal) * 100).toFixed(1)}%` : "-"}
                    </td>
                  </tr>
                ))}
                {composicaoGrupo.length === 0 && (
                  <tr><td colSpan={3} className="px-3 py-6 text-center text-sm text-slate-400">Sem dados</td></tr>
                )}
              </tbody>
              {composicaoTotal > 0 && (
                <tfoot className="sticky bottom-0 border-t-2 border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-900">
                  <tr>
                    <td className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-100">Total</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-800 dark:text-slate-100">{fmtMoeda(composicaoTotal)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-800 dark:text-slate-100">100,0%</td>
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
          <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">Alertas da Despesa</h3>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
              Entes com maior saldo a pagar
            </p>
            {alertasEntesAPagar.length > 0 ? (
              <ul className="space-y-1.5">
                {alertasEntesAPagar.map((alerta, i) => (
                  <li key={`alerta-ente-${i}`} className="flex items-center justify-between rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs dark:border-amber-900/40 dark:bg-slate-800">
                    <span className="truncate pr-2 font-medium text-slate-700 dark:text-slate-200">{alerta.descricao}</span>
                    <span className="shrink-0 font-semibold text-red-600 dark:text-red-400">{fmtCompacto(toNum(alerta.valor_principal))}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-amber-600 dark:text-amber-500">Nenhum saldo a pagar identificado.</p>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
              Credores com maior concentração de pagamentos
            </p>
            {alertasCredoresConcentracao.length > 0 ? (
              <ul className="space-y-1.5">
                {alertasCredoresConcentracao.map((alerta, i) => (
                  <li key={`alerta-credor-${i}`} className="flex items-center justify-between rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs dark:border-amber-900/40 dark:bg-slate-800">
                    <span className="truncate pr-2 font-medium text-slate-700 dark:text-slate-200" title={alerta.cpf_cnpj_credor ?? ""}>{alerta.descricao}</span>
                    <span className="shrink-0 font-semibold text-slate-600 dark:text-slate-300">{fmtPct(alerta.pct)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-amber-600 dark:text-amber-500">Sem dados de concentração de pagamentos.</p>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-amber-200 pt-3 dark:border-amber-900/40">
          <span className="text-xs text-amber-700 dark:text-amber-400">
            <span className="font-semibold">{fmtNum(kpi.qtdEntes)}</span> entes com despesa
          </span>
          <span className="text-xs text-amber-700 dark:text-amber-400">
            <span className="font-semibold">{fmtNum(kpi.qtdCredoresTotal)}</span> credores distintos
          </span>
          <span className="text-xs text-amber-700 dark:text-amber-400">
            Total a liquidar:{" "}
            <span className="font-semibold text-amber-600 dark:text-amber-400">{fmtCompacto(kpi.aLiquidar)}</span>
          </span>
          <span className="text-xs text-amber-700 dark:text-amber-400">
            Total a pagar:{" "}
            <span className="font-semibold text-red-600 dark:text-red-400">{fmtCompacto(kpi.aPagar)}</span>
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
  blue:  "border-l-blue-500",
  amber: "border-l-amber-500",
  red:   "border-l-red-500",
};

const corValor: Record<CorKpi, string> = {
  slate: "text-slate-800 dark:text-slate-100",
  green: "text-green-700 dark:text-green-400",
  blue:  "text-blue-700 dark:text-blue-400",
  amber: "text-amber-700 dark:text-amber-400",
  red:   "text-red-600 dark:text-red-400",
};

function KpiCard({ titulo, valor, valorCompleto, cor }: { titulo: string; valor: string; valorCompleto: string; cor: CorKpi }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 border-l-4 ${corBorda[cor]}`} title={valorCompleto}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{titulo}</p>
      <p className={`mt-2 text-xl font-bold leading-tight sm:text-2xl ${corValor[cor]}`}>{valor}</p>
    </div>
  );
}

function KpiCardDestaque({ titulo, valor, descricao, realizacao }: { titulo: string; valor: string; descricao: string; realizacao: number }) {
  const bg =
    realizacao >= 90 ? "bg-green-600"
    : realizacao >= 70 ? "bg-blue-600"
    : realizacao >= 50 ? "bg-amber-500"
    : "bg-red-500";

  return (
    <div className={`col-span-2 rounded-2xl p-5 shadow-sm xl:col-span-1 ${bg} text-white`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-white/80">{titulo}</p>
      <p className="mt-2 text-3xl font-bold leading-tight sm:text-4xl">{valor}</p>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/30">
        <div className="h-full rounded-full bg-white transition-all duration-700" style={{ width: `${Math.min(100, Math.max(0, realizacao))}%` }} />
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
