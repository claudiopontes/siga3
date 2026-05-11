"use client";

import React, { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { ApexOptions } from "apexcharts";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface SiopsResumo {
  ano:                    number;
  periodo:                string | null;
  total_alertas:          number;
  total_criticos:         number;
  total_altos:            number;
  total_municipios_afetados: number;
  atualizado_em:          string;
  total_municipios:       number;
  abaixo_minimo:          number;
  media_percentual:       number | null;
  menor_percentual:       number | null;
  maior_percentual:       number | null;
}

interface SiopsMunicipio {
  ano:                      number;
  periodo:                  string | null;
  codigo_municipio_ibge:    string;
  nome_municipio:           string | null;
  percentual_aplicado_saude: number | null;
  despesa_total_saude:      number | null;
  receita_base_calculo:     number | null;
  situacao_envio:           string | null;
  total_indicadores:        number;
  atualizado_em:            string;
  total_alertas:            number;
  total_criticos:           number;
  total_altos:              number;
  total_medios:             number;
  nivel_risco_orcamento:    string;
}

interface SiopsAlerta {
  id_alerta:             number | null;
  area:                  string;
  fonte:                 string;
  ano:                   number;
  periodo:               string | null;
  codigo_municipio_ibge: string | null;
  nome_municipio:        string | null;
  tipo_alerta:           string;
  nivel:                 string;
  descricao:             string;
  valor_observado:       number | null;
  valor_referencia:      number | null;
  prioridade:            number | null;
  atualizado_em:         string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtMoeda(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (n >= 1_000_000)
    return `R$ ${(n / 1_000_000).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mi`;
  if (n >= 1_000)
    return `R$ ${(n / 1_000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mil`;
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  return `${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function labelPeriodo(periodo: string | null | undefined): string {
  if (!periodo) return "—";
  const map: Record<string, string> = {
    "1B": "1º Bimestre", "2B": "2º Bimestre", "3B": "3º Bimestre",
    "4B": "4º Bimestre", "5B": "5º Bimestre", "6B": "6º Bimestre",
  };
  return map[periodo] ?? periodo;
}

function labelPeriodoCurto(periodo: string | null | undefined): string {
  if (!periodo) return "—";
  const map: Record<string, string> = {
    "1B": "1º Bim", "2B": "2º Bim", "3B": "3º Bim",
    "4B": "4º Bim", "5B": "5º Bim", "6B": "6º Bim",
  };
  return map[periodo] ?? periodo;
}

function labelTipoAlerta(tipo: string): string {
  const map: Record<string, string> = {
    siops_aplicacao_saude_baixa: "Aplicação abaixo do mínimo",
    siops_sem_dado_recente:      "Sem dado recente",
    siops_dado_incompleto:       "Dado incompleto",
    siops_variacao_atipica:      "Variação atípica",
  };
  return map[tipo] ?? tipo;
}

function abreviarMunicipio(nome: string | null): string {
  if (!nome) return "—";
  return nome.length > 14 ? nome.slice(0, 13) + "…" : nome;
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

function NivelBadge({ nivel }: { nivel: string }) {
  const n = nivel?.toUpperCase();
  if (n === "CRITICO")
    return <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">Crítico</span>;
  if (n === "ALTO")
    return <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">Alto</span>;
  if (n === "MEDIO")
    return <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">Médio</span>;
  return <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/40 dark:text-green-300">Normal</span>;
}

function SituacaoBadge({ situacao }: { situacao: string | null }) {
  if (situacao === "SEM_DADO")
    return <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-600 dark:bg-red-900/30 dark:text-red-300">Sem dado</span>;
  if (situacao === "INCOMPLETO")
    return <span className="rounded bg-yellow-50 px-1.5 py-0.5 text-xs font-medium text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-300">Incompleto</span>;
  if (situacao === "COM_DADO")
    return <span className="rounded bg-green-50 px-1.5 py-0.5 text-xs font-medium text-green-600 dark:bg-green-900/30 dark:text-green-300">Com dado</span>;
  return <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">{situacao ?? "—"}</span>;
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="mt-3 h-8 w-16 rounded bg-gray-200 dark:bg-gray-700" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Barra simples (distribuição por tipo)
// ---------------------------------------------------------------------------

function BarraSimples({ label, valor, max, cor }: { label: string; valor: number; max: number; cor: string }) {
  const pct = max > 0 ? Math.round((valor / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-44 shrink-0 truncate text-right text-xs text-slate-600 dark:text-slate-300">{label}</span>
      <div className="flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700" style={{ height: 10 }}>
        <div className={`h-full rounded-full ${cor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-6 shrink-0 text-xs font-semibold text-slate-700 dark:text-slate-200">{valor}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

interface Periodo { ano: number; periodo: string | null; }

export default function OrcamentoSaudeClient() {
  const [resumo,     setResumo]     = useState<SiopsResumo | null>(null);
  const [municipios, setMunicipios] = useState<SiopsMunicipio[]>([]);
  const [alertas,    setAlertas]    = useState<SiopsAlerta[]>([]);
  const [periodos,   setPeriodos]   = useState<Periodo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro,       setErro]       = useState<string | null>(null);

  // Seletores globais
  const [periodoSel, setPeriodoSel] = useState<string>(""); // "ANO|PERIODO"
  const [enteSel,    setEnteSel]    = useState<string>("");  // codigo_municipio_ibge

  // Filtros tabela municípios
  const [filtroAbaixo,      setFiltroAbaixo]      = useState(false);
  const [filtroNivelMun,    setFiltroNivelMun]    = useState("todos");

  // Filtros tabela alertas
  const [filtroAlertaNivel,  setFiltroAlertaNivel]  = useState("todos");
  const [filtroAlertaTipo,   setFiltroAlertaTipo]   = useState("todos");
  const [alertaHistorico,    setAlertaHistorico]    = useState(false);

  // Ordenação tabela alertas
  type AlertaSortCol = "nivel" | "nome_municipio" | "tipo_alerta" | "ano";
  const [alertaSortCol, setAlertaSortCol] = useState<AlertaSortCol>("nivel");
  const [alertaSortDir, setAlertaSortDir] = useState<"asc" | "desc">("asc");

  function toggleAlertaSort(col: AlertaSortCol) {
    if (alertaSortCol === col) setAlertaSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setAlertaSortCol(col); setAlertaSortDir("asc"); }
  }

  // Carrega lista de períodos disponíveis na primeira montagem
  useEffect(() => {
    fetch("/api/saude/orcamento/periodos")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setPeriodos(data); })
      .catch(() => {});
  }, []);

  // Carrega dados sempre que o período selecionado mudar
  useEffect(() => {
    const [ano, periodo] = periodoSel ? periodoSel.split("|") : ["", ""];
    const qs = ano && periodo ? `?ano=${ano}&periodo=${encodeURIComponent(periodo)}` : "";

    let cancelado = false;
    Promise.all([
      fetch(`/api/saude/orcamento/resumo${qs}`).then((r) => r.json()),
      fetch(`/api/saude/orcamento/municipios${qs ? qs + "&pageSize=50" : "?pageSize=50"}`).then((r) => r.json()),
      fetch(`/api/saude/orcamento/alertas${qs ? qs + "&limit=500" : "?limit=500"}`).then((r) => r.json()),
    ])
      .then(([res, muns, als]) => {
        if (cancelado) return;
        setResumo(res && !res.error ? res as SiopsResumo : null);
        setMunicipios(Array.isArray(muns) ? muns : []);
        setAlertas(Array.isArray(als) ? als : []);
        setCarregando(false);
        setErro(null);
      })
      .catch((e: unknown) => {
        if (cancelado) return;
        setErro(e instanceof Error ? e.message : "Erro ao carregar dados.");
        setCarregando(false);
      });
    return () => { cancelado = true; };
  }, [periodoSel]);

  // Municípios filtrados (por ente global + filtros locais)
  const municipiosFiltrados = useMemo(() => {
    return municipios.filter((m) => {
      if (enteSel && m.codigo_municipio_ibge !== enteSel) return false;
      if (filtroAbaixo && Number(m.percentual_aplicado_saude ?? 999) >= 15) return false;
      if (filtroNivelMun !== "todos" && m.nivel_risco_orcamento !== filtroNivelMun) return false;
      return true;
    });
  }, [municipios, enteSel, filtroAbaixo, filtroNivelMun]);

  // Alertas filtrados (por ente global + filtros locais + janela de anos)
  const anoMaxAlertas = useMemo(
    () => alertas.reduce((max, a) => Math.max(max, a.ano ?? 0), 0),
    [alertas]
  );

  const alertasFiltrados = useMemo(() => {
    return alertas.filter((a) => {
      if (!alertaHistorico && anoMaxAlertas > 0 && (a.ano ?? 0) < anoMaxAlertas - 1) return false;
      if (enteSel && a.codigo_municipio_ibge !== enteSel) return false;
      if (filtroAlertaNivel !== "todos" && a.nivel !== filtroAlertaNivel) return false;
      if (filtroAlertaTipo  !== "todos" && a.tipo_alerta !== filtroAlertaTipo) return false;
      return true;
    });
  }, [alertas, enteSel, filtroAlertaNivel, filtroAlertaTipo, alertaHistorico, anoMaxAlertas]);

  const NIVEL_ORD: Record<string, number> = { CRITICO: 0, ALTO: 1, MEDIO: 2, BAIXO: 3 };

  const alertasOrdenados = useMemo(() => {
    return [...alertasFiltrados].sort((a, b) => {
      let cmp = 0;
      if (alertaSortCol === "nivel") {
        cmp = (NIVEL_ORD[a.nivel] ?? 9) - (NIVEL_ORD[b.nivel] ?? 9);
      } else if (alertaSortCol === "nome_municipio") {
        cmp = (a.nome_municipio ?? "").localeCompare(b.nome_municipio ?? "", "pt-BR");
      } else if (alertaSortCol === "tipo_alerta") {
        cmp = (labelTipoAlerta(a.tipo_alerta)).localeCompare(labelTipoAlerta(b.tipo_alerta), "pt-BR");
      } else if (alertaSortCol === "ano") {
        cmp = (a.ano ?? 0) - (b.ano ?? 0);
        if (cmp === 0) cmp = (a.periodo ?? "").localeCompare(b.periodo ?? "", "pt-BR");
      }
      return alertaSortDir === "asc" ? cmp : -cmp;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertasFiltrados, alertaSortCol, alertaSortDir]);

  // Tipos únicos de alerta
  const tiposAlerta = useMemo(() => {
    const set = new Set(alertas.map((a) => a.tipo_alerta));
    return Array.from(set).sort();
  }, [alertas]);

  // Distribuição por tipo de alerta
  const distTipo = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const a of alertas) {
      acc[a.tipo_alerta] = (acc[a.tipo_alerta] ?? 0) + 1;
    }
    return acc;
  }, [alertas]);

  // Dados gráfico: percentual por município (filtrado por ente, ordenado ASC)
  const dadosGraficoPct = useMemo(() => {
    const base = enteSel ? municipios.filter((m) => m.codigo_municipio_ibge === enteSel) : municipios;
    const comDado = [...base]
      .filter((m) => m.percentual_aplicado_saude !== null)
      .sort((a, b) => Number(a.percentual_aplicado_saude ?? 0) - Number(b.percentual_aplicado_saude ?? 0));
    return {
      categorias: comDado.map((m) => abreviarMunicipio(m.nome_municipio)),
      valores:    comDado.map((m) => Number(Number(m.percentual_aplicado_saude ?? 0).toFixed(2))),
      cores:      comDado.map((m) => Number(m.percentual_aplicado_saude ?? 999) < 15 ? "#dc2626" : "#3b82f6"),
    };
  }, [municipios, enteSel]);

  // Dados gráfico: despesa total (filtrado por ente, top 15)
  const dadosGraficoDespesa = useMemo(() => {
    const base = enteSel ? municipios.filter((m) => m.codigo_municipio_ibge === enteSel) : municipios;
    const top = [...base]
      .filter((m) => Number(m.despesa_total_saude ?? 0) > 0)
      .sort((a, b) => Number(b.despesa_total_saude ?? 0) - Number(a.despesa_total_saude ?? 0))
      .slice(0, 15);
    return {
      categorias: top.map((m) => abreviarMunicipio(m.nome_municipio)),
      valores:    top.map((m) => Number((Number(m.despesa_total_saude ?? 0) / 1_000_000).toFixed(2))),
    };
  }, [municipios, enteSel]);

  // ---------------------------------------------------------------------------
  // ApexCharts options
  // ---------------------------------------------------------------------------

  const opcoesPct: ApexOptions = {
    chart: { type: "bar", toolbar: { show: false }, fontFamily: "inherit" },
    colors: dadosGraficoPct.cores,
    plotOptions: {
      bar: {
        borderRadius: 4,
        distributed: true,
        columnWidth: "70%",
      },
    },
    dataLabels: { enabled: false },
    legend: { show: false },
    xaxis: {
      categories: dadosGraficoPct.categorias,
      labels: { style: { fontSize: "10px" }, rotate: -35 },
    },
    yaxis: {
      labels: {
        style: { fontSize: "11px" },
        formatter: (v) => `${v}%`,
      },
    },
    annotations: {
      yaxis: [{
        y: 15,
        borderColor: "#f97316",
        borderWidth: 2,
        strokeDashArray: 4,
        label: {
          text: "Mínimo 15%",
          style: { color: "#f97316", fontSize: "11px", fontWeight: 600 },
          position: "left",
          offsetX: 10,
        },
      }],
    },
    tooltip: { y: { formatter: (v) => `${v}%` } },
    grid: { borderColor: "#f0f0f0", strokeDashArray: 4 },
  };

  const opcoesDespesa: ApexOptions = {
    chart: { type: "bar", toolbar: { show: false }, fontFamily: "inherit" },
    colors: ["#0ea5e9"],
    plotOptions: { bar: { borderRadius: 4, horizontal: false } },
    dataLabels: { enabled: false },
    xaxis: {
      categories: dadosGraficoDespesa.categorias,
      labels: { style: { fontSize: "10px" }, rotate: -35 },
    },
    yaxis: {
      labels: {
        style: { fontSize: "11px" },
        formatter: (v) => `R$ ${v}M`,
      },
    },
    tooltip: { y: { formatter: (v) => `R$ ${v.toLocaleString("pt-BR")} M` } },
    grid: { borderColor: "#f0f0f0", strokeDashArray: 4 },
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (erro) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-300">
        <p className="font-semibold">Erro ao carregar dados</p>
        <p className="mt-1 font-mono text-xs">{erro}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── Seletores ── */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={periodoSel}
          onChange={(e) => { setPeriodoSel(e.target.value); setEnteSel(""); }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
        >
          <option value="">Período mais recente</option>
          {periodos.map((p) => {
            const key = `${p.ano}|${p.periodo}`;
            return (
              <option key={key} value={key}>
                {labelPeriodoCurto(p.periodo)} / {p.ano}
              </option>
            );
          })}
        </select>

        <select
          value={enteSel}
          onChange={(e) => setEnteSel(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
        >
          <option value="">Todos os municípios</option>
          {[...municipios]
            .sort((a, b) => (a.nome_municipio ?? "").localeCompare(b.nome_municipio ?? ""))
            .map((m) => (
              <option key={m.codigo_municipio_ibge} value={m.codigo_municipio_ibge}>
                {m.nome_municipio ?? m.codigo_municipio_ibge}
              </option>
            ))}
        </select>

        {enteSel && (
          <button
            type="button"
            onClick={() => setEnteSel("")}
            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
          >
            Limpar
          </button>
        )}
      </div>

      {/* ── Cards KPI ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {carregando ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <div className={`rounded-xl border p-4 ${(resumo?.abaixo_minimo ?? 0) > 0 ? "border-red-200 bg-white dark:border-red-800/40 dark:bg-gray-800" : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"}`}>
              <p className={`text-xs font-medium uppercase tracking-wide ${(resumo?.abaixo_minimo ?? 0) > 0 ? "text-red-500" : "text-gray-400"}`}>Abaixo do mínimo</p>
              <p className={`mt-1 text-3xl font-bold ${(resumo?.abaixo_minimo ?? 0) > 0 ? "text-red-600 dark:text-red-400" : "text-gray-700 dark:text-gray-300"}`}>
                {resumo?.abaixo_minimo ?? 0}
              </p>
              <p className="mt-0.5 text-xs text-gray-400">municípios &lt; 15%</p>
            </div>

            <div className={`rounded-xl border p-4 ${(resumo?.total_criticos ?? 0) > 0 ? "border-red-200 bg-white dark:border-red-800/40 dark:bg-gray-800" : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"}`}>
              <p className={`text-xs font-medium uppercase tracking-wide ${(resumo?.total_criticos ?? 0) > 0 ? "text-red-500" : "text-gray-400"}`}>Alertas críticos</p>
              <p className={`mt-1 text-3xl font-bold ${(resumo?.total_criticos ?? 0) > 0 ? "text-red-600 dark:text-red-400" : "text-gray-700 dark:text-gray-300"}`}>
                {resumo?.total_criticos ?? 0}
              </p>
            </div>

            <div className={`rounded-xl border p-4 ${(resumo?.total_altos ?? 0) > 0 ? "border-orange-200 bg-white dark:border-orange-800/40 dark:bg-gray-800" : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"}`}>
              <p className={`text-xs font-medium uppercase tracking-wide ${(resumo?.total_altos ?? 0) > 0 ? "text-orange-500" : "text-gray-400"}`}>Alertas altos</p>
              <p className={`mt-1 text-3xl font-bold ${(resumo?.total_altos ?? 0) > 0 ? "text-orange-600 dark:text-orange-400" : "text-gray-700 dark:text-gray-300"}`}>
                {resumo?.total_altos ?? 0}
              </p>
            </div>

            <div className="rounded-xl border border-blue-200 bg-white p-4 dark:border-blue-800/40 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wide text-blue-500">Média aplicada</p>
              <p className="mt-1 text-2xl font-bold text-blue-600 dark:text-blue-400">
                {fmtPct(resumo?.media_percentual)}
              </p>
              <p className="mt-0.5 text-xs text-gray-400">dos municípios</p>
            </div>

            <div className={`rounded-xl border p-4 ${Number(resumo?.menor_percentual ?? 100) < 15 ? "border-red-200 bg-red-50 dark:border-red-800/40 dark:bg-red-900/10" : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"}`}>
              <p className={`text-xs font-medium uppercase tracking-wide ${Number(resumo?.menor_percentual ?? 100) < 15 ? "text-red-500" : "text-gray-400"}`}>Menor percentual</p>
              <p className={`mt-1 text-2xl font-bold ${Number(resumo?.menor_percentual ?? 100) < 15 ? "text-red-600 dark:text-red-400" : "text-gray-700 dark:text-gray-300"}`}>
                {fmtPct(resumo?.menor_percentual)}
              </p>
              {Number(resumo?.menor_percentual ?? 100) < 15 && (
                <p className="mt-0.5 text-xs font-semibold text-red-500">abaixo do mínimo</p>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 col-span-2 sm:col-span-1">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Período SIOPS</p>
              <p className="mt-1 text-lg font-bold text-gray-700 dark:text-gray-200">
                {resumo ? `${labelPeriodoCurto(resumo.periodo)} / ${resumo.ano}` : "—"}
              </p>
              <p className="mt-0.5 text-xs text-gray-400">
                {resumo?.total_municipios_afetados ?? 0} municípios afetados
              </p>
            </div>
          </>
        )}
      </div>

      {/* ── Gráficos ── */}
      {!carregando && municipios.length > 0 && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

          {/* Percentual aplicado por município */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-700">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Percentual aplicado em saúde</h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Ordenado do menor para o maior · Linha laranja = mínimo constitucional (15%)
              </p>
            </div>
            {dadosGraficoPct.valores.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400">Sem dados de percentual.</div>
            ) : (
              <div className="p-4">
                <Chart
                  type="bar"
                  height={280}
                  options={opcoesPct}
                  series={[{ name: "% aplicado", data: dadosGraficoPct.valores }]}
                />
              </div>
            )}
          </div>

          {/* Despesa total por município */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-700">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Despesa total em saúde por município</h2>
              <p className="mt-0.5 text-xs text-slate-400">Valores em milhões de reais · Top 15</p>
            </div>
            {dadosGraficoDespesa.valores.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400">Sem dados de despesa.</div>
            ) : (
              <div className="p-4">
                <Chart
                  type="bar"
                  height={280}
                  options={opcoesDespesa}
                  series={[{ name: "Despesa (R$ M)", data: dadosGraficoDespesa.valores }]}
                />
              </div>
            )}
          </div>

        </div>
      )}

      {/* ── Distribuição por tipo de alerta ── */}
      {!carregando && alertas.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-700">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Distribuição de alertas SIOPS por tipo</h2>
            <p className="mt-0.5 text-xs text-slate-400">{alertas.length} alertas no total</p>
          </div>
          <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
            <BarraSimples
              label="Aplicação abaixo do mínimo"
              valor={distTipo["siops_aplicacao_saude_baixa"] ?? 0}
              max={alertas.length}
              cor="bg-red-500"
            />
            <BarraSimples
              label="Sem dado recente"
              valor={distTipo["siops_sem_dado_recente"] ?? 0}
              max={alertas.length}
              cor="bg-orange-500"
            />
            <BarraSimples
              label="Dado incompleto"
              valor={distTipo["siops_dado_incompleto"] ?? 0}
              max={alertas.length}
              cor="bg-yellow-500"
            />
            <BarraSimples
              label="Variação atípica"
              valor={distTipo["siops_variacao_atipica"] ?? 0}
              max={alertas.length}
              cor="bg-blue-500"
            />
          </div>
        </div>
      )}

      {/* ── Tabela de municípios ── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Municípios — aplicação em saúde</h2>
              <p className="mt-0.5 text-xs text-slate-400">
                {municipiosFiltrados.length} município{municipiosFiltrados.length !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={filtroNivelMun}
                onChange={(e) => setFiltroNivelMun(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
              >
                <option value="todos">Todos os níveis</option>
                <option value="CRITICO">Crítico</option>
                <option value="ALTO">Alto</option>
                <option value="MEDIO">Médio</option>
                <option value="BAIXO">Normal</option>
              </select>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
                <input
                  type="checkbox"
                  checked={filtroAbaixo}
                  onChange={(e) => setFiltroAbaixo(e.target.checked)}
                  className="h-3.5 w-3.5 accent-red-500"
                />
                Abaixo do mínimo
              </label>
            </div>
          </div>
        </div>

        {carregando ? (
          <div className="p-6 text-center text-sm text-gray-400">Carregando...</div>
        ) : municipiosFiltrados.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400">
            {municipios.length === 0 ? "Sem dados SIOPS carregados." : "Nenhum município encontrado com os filtros."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
                  <th className="px-4 py-3">Município</th>
                  <th className="px-4 py-3">% aplicado</th>
                  <th className="px-4 py-3">Despesa total (R$ mi)</th>
                  <th className="px-4 py-3">Receita base (R$ mi)</th>
                  <th className="px-4 py-3">Situação</th>
                  <th className="px-4 py-3 text-center">Indicadores</th>
                  <th className="px-4 py-3 text-center">Alertas</th>
                  <th className="px-4 py-3">Risco</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {municipiosFiltrados.map((m) => {
                  const abaixo = m.percentual_aplicado_saude !== null && Number(m.percentual_aplicado_saude) < 15;
                  return (
                    <tr key={m.codigo_municipio_ibge} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800 dark:text-slate-100">
                        {m.nome_municipio ?? m.codigo_municipio_ibge}
                      </td>
                      <td className="px-4 py-3">
                        {m.percentual_aplicado_saude !== null ? (
                          <span className={`font-semibold ${abaixo ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                            {fmtPct(m.percentual_aplicado_saude)}
                            {abaixo && (
                              <span className="ml-1 inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-900/40 dark:text-red-300">
                                &lt;15%
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{fmtMoeda(m.despesa_total_saude)}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{fmtMoeda(m.receita_base_calculo)}</td>
                      <td className="px-4 py-3"><SituacaoBadge situacao={m.situacao_envio} /></td>
                      <td className="px-4 py-3 text-center text-slate-600 dark:text-slate-300">{m.total_indicadores}</td>
                      <td className="px-4 py-3 text-center">
                        {m.total_alertas > 0 ? (
                          <span className="font-semibold text-orange-600 dark:text-orange-400">{m.total_alertas}</span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3"><NivelBadge nivel={m.nivel_risco_orcamento} /></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
                  <td className="px-4 py-3">Total ({municipiosFiltrados.length})</td>
                  <td className="px-4 py-3 text-slate-400">—</td>
                  <td className="px-4 py-3">
                    {fmtMoeda(municipiosFiltrados.reduce((s, m) => s + Number(m.despesa_total_saude ?? 0), 0))}
                  </td>
                  <td className="px-4 py-3">
                    {fmtMoeda(municipiosFiltrados.reduce((s, m) => s + Number(m.receita_base_calculo ?? 0), 0))}
                  </td>
                  <td className="px-4 py-3 text-slate-400">—</td>
                  <td className="px-4 py-3 text-center">
                    {municipiosFiltrados.reduce((s, m) => s + Number(m.total_indicadores ?? 0), 0)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {municipiosFiltrados.reduce((s, m) => s + Number(m.total_alertas ?? 0), 0)}
                  </td>
                  <td className="px-4 py-3 text-slate-400">—</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── Tabela de alertas SIOPS ── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Alertas orçamentários SIOPS</h2>
              <p className="mt-0.5 text-xs text-slate-400">
                {alertasFiltrados.length} alerta{alertasFiltrados.length !== 1 ? "s" : ""} encontrado{alertasFiltrados.length !== 1 ? "s" : ""}
                {!alertaHistorico && anoMaxAlertas > 0 && (
                  <span className="ml-1 text-slate-400">
                    · {anoMaxAlertas - 1}–{anoMaxAlertas}
                  </span>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setAlertaHistorico((v) => !v)}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  alertaHistorico
                    ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                    : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                }`}
              >
                {alertaHistorico ? "Ocultar histórico" : "Ver histórico completo"}
              </button>
              <select
                value={filtroAlertaNivel}
                onChange={(e) => setFiltroAlertaNivel(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
              >
                <option value="todos">Todos os níveis</option>
                <option value="CRITICO">Crítico</option>
                <option value="ALTO">Alto</option>
                <option value="MEDIO">Médio</option>
              </select>
              {tiposAlerta.length > 0 && (
                <select
                  value={filtroAlertaTipo}
                  onChange={(e) => setFiltroAlertaTipo(e.target.value)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                >
                  <option value="todos">Todos os tipos</option>
                  {tiposAlerta.map((t) => (
                    <option key={t} value={t}>{labelTipoAlerta(t)}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>

        {carregando ? (
          <div className="p-6 text-center text-sm text-gray-400">Carregando...</div>
        ) : alertasFiltrados.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400">
            {alertas.length === 0 ? "Sem alertas SIOPS carregados para o período." : "Nenhum alerta encontrado com os filtros."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
                  {(["nivel", "nome_municipio", "tipo_alerta"] as AlertaSortCol[]).map((col, idx) => {
                    const labels: Record<string, string> = { nivel: "Nível", nome_municipio: "Município", tipo_alerta: "Tipo de alerta" };
                    const ativo = alertaSortCol === col;
                    return (
                      <th key={col} className={`px-4 py-3 ${idx === 2 ? "" : ""}`}>
                        <button
                          type="button"
                          onClick={() => toggleAlertaSort(col)}
                          className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200"
                        >
                          {labels[col]}
                          <span className={ativo ? "text-blue-500" : "text-slate-300 dark:text-slate-600"}>
                            {ativo ? (alertaSortDir === "asc" ? "↑" : "↓") : "↕"}
                          </span>
                        </button>
                      </th>
                    );
                  })}
                  <th className="px-4 py-3">Descrição</th>
                  <th className="px-4 py-3">Val. observado</th>
                  <th className="px-4 py-3">Referência</th>
                  <th className="px-4 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => toggleAlertaSort("ano")}
                      className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200"
                    >
                      Ano
                      <span className={alertaSortCol === "ano" ? "text-blue-500" : "text-slate-300 dark:text-slate-600"}>
                        {alertaSortCol === "ano" ? (alertaSortDir === "asc" ? "↑" : "↓") : "↕"}
                      </span>
                    </button>
                  </th>
                  <th className="px-4 py-3">Período</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {alertasOrdenados.map((a, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                    <td className="px-4 py-3"><NivelBadge nivel={a.nivel} /></td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700 dark:text-slate-200">
                      {a.nome_municipio ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">
                      {labelTipoAlerta(a.tipo_alerta)}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{a.descricao}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {a.valor_observado !== null
                        ? a.tipo_alerta === "siops_variacao_atipica"
                          ? fmtMoeda(a.valor_observado)
                          : fmtPct(a.valor_observado)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {a.valor_referencia !== null
                        ? a.tipo_alerta === "siops_variacao_atipica"
                          ? fmtMoeda(a.valor_referencia)
                          : fmtPct(a.valor_referencia)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-500 dark:text-slate-400">{a.ano}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400">
                      {labelPeriodo(a.periodo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
