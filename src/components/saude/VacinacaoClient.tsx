"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ApexOptions } from "apexcharts";
import { ArrowLeft, ShieldCheck, Info } from "lucide-react";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface CoberturaResumo {
  area:                         string;
  fonte:                        string;
  ano:                          number;
  data_referencia:              string | null;
  tipo_periodo:                 string;
  arquivo_id:                   number | null;
  total_alertas:                number;
  total_criticos:               number;
  total_altos:                  number;
  total_medios:                 number;
  total_informativos:           number;
  total_municipios_afetados:    number;
  cobertura_media:              number | null;
  total_municipios_abaixo_meta: number;
  atualizado_em:                string;
}

interface CoberturaMunicipio {
  codigo_municipio_ibge:          string | null;
  nome_municipio:                 string;
  uf:                             string | null;
  ano:                            number;
  data_referencia:                string | null;
  tipo_periodo:                   string;
  total_imunobiologicos:          number;
  total_abaixo_meta:              number;
  cobertura_media:                number | null;
  menor_cobertura:                number | null;
  maior_cobertura:                number | null;
  imunobiologico_menor_cobertura: string | null;
  atualizado_em:                  string;
}

interface CoberturaImunobiologico {
  imunobiologico:              string;
  ano:                         number;
  data_referencia:             string | null;
  tipo_periodo:                string;
  cobertura_media:             number | null;
  total_municipios:            number;
  total_municipios_abaixo_meta: number;
  numerador_total:             number | null;
  denominador_total:           number | null;
  atualizado_em:               string;
}

interface CoberturaEvolucao {
  codigo_municipio_ibge: string | null;
  nome_municipio:        string;
  uf:                    string | null;
  ano:                   number;
  data_referencia:       string | null;
  tipo_periodo:          string;
  status_arquivo:        string;
  imunobiologico:        string;
  cobertura_percentual:  number | null;
  numerador:             number | null;
  denominador:           number | null;
  meta_percentual:       number;
  abaixo_meta:           boolean | null;
}

interface CoberturaAlerta {
  id_alerta:             number | null;
  area:                  string;
  fonte:                 string;
  arquivo_id:            number | null;
  codigo_municipio_ibge: string | null;
  nome_municipio:        string | null;
  ano:                   number;
  data_referencia:       string | null;
  tipo_periodo:          string;
  imunobiologico:        string | null;
  tipo_alerta:           string;
  nivel:                 string;
  descricao:             string;
  valor_observado:       number | null;
  valor_referencia:      number | null;
  prioridade?:           number;
  atualizado_em:         string;
}

interface DosesResumo {
  total_doses_ano_atual:     number;
  total_doses_mes_atual:     number;
  total_municipios_com_dado: number;
  total_imunobiologicos:     number;
  total_alertas:             number;
  total_criticos:            number;
  total_altos:               number;
  total_medios:              number;
  ano_referencia:            number | null;
  mes_referencia:            number | null;
  atualizado_em:             string;
}

interface DosesAlerta {
  id_alerta:             number | null;
  fonte:                 string;
  codigo_municipio_ibge: string | null;
  nome_municipio:        string | null;
  tipo_alerta:           string;
  nivel:                 string;
  descricao:             string;
  valor_observado:       number | null;
  valor_referencia:      number | null;
  prioridade?:           number;
}

interface SeriePonto {
  codigo_municipio_ibge: string;
  no_imunobiologico:     string;
  ano:                   number;
  mes:                   number;
  total_doses:           number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtNum(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return Number(v).toLocaleString("pt-BR");
}

function fmtPct(v: number | null | undefined, dec = 1): string {
  if (v === null || v === undefined) return "—";
  return `${Number(v).toLocaleString("pt-BR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })}%`;
}

function fmtData(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const [y, m, d] = iso.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  } catch {
    return iso.slice(0, 10);
  }
}

function nomesMeses(): string[] {
  return ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
}

// ---------------------------------------------------------------------------
// Sub-componentes de badge
// ---------------------------------------------------------------------------

function NivelBadge({ nivel }: { nivel: string }) {
  const n = (nivel ?? "").toUpperCase();
  if (n === "CRITICO")
    return <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">Crítico</span>;
  if (n === "ALTO")
    return <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">Alto</span>;
  if (n === "MEDIO")
    return <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">Médio</span>;
  return <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">{nivel}</span>;
}

function PeriodoBadge({ tipo }: { tipo: string }) {
  if (tipo === "FECHADO")
    return <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Fechado</span>;
  return <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Acompanhamento</span>;
}

function FonteBadge({ fonte }: { fonte: string }) {
  if (fonte === "PNI_COBERTURA")
    return <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Cobertura</span>;
  return <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">Doses aplic.</span>;
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="mt-3 h-8 w-16 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="mt-2 h-2 w-12 rounded bg-gray-100 dark:bg-gray-700/60" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function VacinacaoClient() {
  // Estado
  const [cobResumo,  setCobResumo]  = useState<CoberturaResumo | null>(null);
  const [cobMunic,   setCobMunic]   = useState<CoberturaMunicipio[]>([]);
  const [cobImuno,   setCobImuno]   = useState<CoberturaImunobiologico[]>([]);
  const [cobEvolucao, setCobEvolucao] = useState<CoberturaEvolucao[]>([]);
  const [cobAlertas, setCobAlertas] = useState<CoberturaAlerta[]>([]);
  const [dosesResumo, setDosesResumo] = useState<DosesResumo | null>(null);
  const [dosesAlertas, setDosesAlertas] = useState<DosesAlerta[]>([]);
  const [doseserie,  setDoseSerie]  = useState<SeriePonto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro,       setErro]       = useState<string | null>(null);

  // Filtros de tabela
  const [filtroMun,    setFiltroMun]    = useState("");
  const [filtroAno,    setFiltroAno]    = useState<string>("");
  const [filtroPeriodo, setFiltroPeriodo] = useState<string>("");
  const [apenasAbaixo, setApenasAbaixo]  = useState(false);

  useEffect(() => {
    Promise.allSettled([
      fetch("/api/saude/pni/cobertura/resumo").then(r => r.ok ? r.json() : null),
      fetch("/api/saude/pni/cobertura/municipios").then(r => r.ok ? r.json() : []),
      fetch("/api/saude/pni/cobertura/imunobiologicos").then(r => r.ok ? r.json() : []),
      fetch("/api/saude/pni/cobertura/evolucao").then(r => r.ok ? r.json() : []),
      fetch("/api/saude/pni/cobertura/alertas?home=1").then(r => r.ok ? r.json() : []),
      fetch("/api/saude/pni/resumo").then(r => r.ok ? r.json() : null),
      fetch("/api/saude/pni/alertas?home=1").then(r => r.ok ? r.json() : []),
      fetch("/api/saude/pni/serie").then(r => r.ok ? r.json() : []),
    ]).then(results => {
      const val = <T,>(r: PromiseSettledResult<T>, fallback: T): T =>
        r.status === "fulfilled" ? (r.value ?? fallback) : fallback;

      setCobResumo(val(results[0], null));
      setCobMunic(Array.isArray(val(results[1], [])) ? val(results[1], []) : []);
      setCobImuno(Array.isArray(val(results[2], [])) ? val(results[2], []) : []);
      setCobEvolucao(Array.isArray(val(results[3], [])) ? val(results[3], []) : []);
      setCobAlertas(Array.isArray(val(results[4], [])) ? val(results[4], []) : []);
      setDosesResumo(val(results[5], null));
      setDosesAlertas(Array.isArray(val(results[6], [])) ? val(results[6], []) : []);
      setDoseSerie(Array.isArray(val(results[7], [])) ? val(results[7], []) : []);
    }).catch((e: unknown) => {
      setErro(e instanceof Error ? e.message : "Erro ao carregar dados.");
    }).finally(() => setCarregando(false));
  }, []);

  // ── Derivações ──

  const anosDisponiveis = useMemo(() => {
    const s = new Set(cobMunic.map(m => String(m.ano)));
    return Array.from(s).sort();
  }, [cobMunic]);

  const municipiosFiltrados = useMemo(() => {
    return cobMunic.filter(m => {
      if (filtroMun && !m.nome_municipio.toLowerCase().includes(filtroMun.toLowerCase())) return false;
      if (filtroAno && String(m.ano) !== filtroAno) return false;
      if (filtroPeriodo && m.tipo_periodo !== filtroPeriodo) return false;
      if (apenasAbaixo && m.total_abaixo_meta === 0) return false;
      return true;
    });
  }, [cobMunic, filtroMun, filtroAno, filtroPeriodo, apenasAbaixo]);

  // Todos alertas combinados (cobertura + doses)
  const todosAlertas = useMemo(() => {
    const cob: (CoberturaAlerta & { _tipo: "cobertura" })[] = cobAlertas.map(a => ({ ...a, _tipo: "cobertura" as const }));
    const dos: (DosesAlerta & { _tipo: "doses"; ano: number; data_referencia: null; tipo_periodo: string })[] =
      dosesAlertas.map(a => ({ ...a, _tipo: "doses" as const, ano: dosesResumo?.ano_referencia ?? 0, data_referencia: null, tipo_periodo: "PARCIAL" }));
    return [...cob, ...dos];
  }, [cobAlertas, dosesAlertas, dosesResumo]);

  // Série mensal agregada (todos imunobiológicos, todos municípios)
  const serieMensal = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of doseserie) {
      const k = `${p.ano}-${String(p.mes).padStart(2, "0")}`;
      map.set(k, (map.get(k) ?? 0) + Number(p.total_doses));
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => {
      const [y, m] = k.split("-");
      return { label: `${nomesMeses()[parseInt(m) - 1]}/${y}`, doses: v };
    });
  }, [doseserie]);

  // Imunobiológicos ordenados por cobertura (menor primeiro)
  const imunoOrdenado = useMemo(() =>
    [...cobImuno].sort((a, b) => (a.cobertura_media ?? 999) - (b.cobertura_media ?? 999)).slice(0, 20),
  [cobImuno]);

  // Evolução: agrupa por status_arquivo/ano/data_referencia e imunobiológico
  const evolucaoSumarizada = useMemo(() => {
    // Médias por (ano, data_referencia, tipo_periodo, imuno)
    const map = new Map<string, { soma: number; cnt: number; abaixo: number; total: number; tipo_periodo: string }>();
    for (const e of cobEvolucao) {
      const k = `${e.ano}|${e.data_referencia}|${e.imunobiologico}`;
      const cur = map.get(k) ?? { soma: 0, cnt: 0, abaixo: 0, total: 0, tipo_periodo: e.tipo_periodo };
      if (e.cobertura_percentual !== null) { cur.soma += e.cobertura_percentual; cur.cnt++; }
      if (e.abaixo_meta) cur.abaixo++;
      cur.total++;
      cur.tipo_periodo = e.tipo_periodo;
      map.set(k, cur);
    }
    // Grupos por imunobiológico para comparação 2025 vs 2026
    const porImuno = new Map<string, Array<{ ano: number; dataRef: string | null; media: number | null; tipo_periodo: string; abaixo: number; total: number }>>();
    for (const [k, v] of map) {
      const [anoS, dataRef, imuno] = k.split("|");
      if (!porImuno.has(imuno)) porImuno.set(imuno, []);
      porImuno.get(imuno)!.push({
        ano: parseInt(anoS), dataRef: dataRef === "null" ? null : dataRef,
        media: v.cnt > 0 ? v.soma / v.cnt : null,
        tipo_periodo: v.tipo_periodo, abaixo: v.abaixo, total: v.total,
      });
    }
    return porImuno;
  }, [cobEvolucao]);

  // Imunobiológicos distintos para comparação
  const imunosEvolucao = useMemo(() => Array.from(evolucaoSumarizada.keys()).sort(), [evolucaoSumarizada]);

  // ── Config gráficos ──

  const opcoesImuno: ApexOptions = useMemo(() => ({
    chart: { type: "bar", toolbar: { show: false }, fontFamily: "inherit" },
    colors: imunoOrdenado.map(i => (i.cobertura_media ?? 100) < 80 ? "#ef4444" : (i.cobertura_media ?? 100) < 95 ? "#f97316" : "#10b981"),
    plotOptions: { bar: { borderRadius: 4, horizontal: true, distributed: true } },
    dataLabels: {
      enabled: true,
      formatter: (v: number) => `${v.toFixed(1)}%`,
      style: { fontSize: "10px", colors: ["#fff"] },
    },
    legend: { show: false },
    xaxis: {
      categories: imunoOrdenado.map(i => i.imunobiologico.length > 22 ? i.imunobiologico.slice(0, 21) + "…" : i.imunobiologico),
      labels: { style: { fontSize: "10px" } },
      max: 130,
    },
    yaxis: { labels: { style: { fontSize: "10px" } } },
    annotations: {
      xaxis: [{ x: 95, borderColor: "#6366f1", label: { text: "Meta 95%", style: { color: "#6366f1", fontSize: "10px" } } }],
    },
    tooltip: { y: { formatter: (v: number) => `${v.toFixed(1)}%` } },
    grid: { borderColor: "#e5e7eb", strokeDashArray: 4 },
  }), [imunoOrdenado]);

  const opcoesSerie: ApexOptions = useMemo(() => ({
    chart: { type: "bar", toolbar: { show: false }, fontFamily: "inherit" },
    colors: ["#10b981"],
    plotOptions: { bar: { borderRadius: 3 } },
    dataLabels: { enabled: false },
    xaxis: { categories: serieMensal.map(p => p.label), labels: { style: { fontSize: "10px" }, rotate: -35 } },
    yaxis: { labels: { style: { fontSize: "11px" } } },
    tooltip: { y: { formatter: (v: number) => fmtNum(v) + " doses" } },
    grid: { borderColor: "#e5e7eb", strokeDashArray: 4 },
  }), [serieMensal]);

  // ── Render ──

  if (erro) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-300">
        <p className="font-semibold">Erro ao carregar dados</p>
        <p className="mt-1 font-mono text-xs">{erro}</p>
      </div>
    );
  }

  const isParcial = cobResumo?.tipo_periodo === "PARCIAL";

  return (
    <div className="space-y-5">

      {/* ── Cabeçalho ── */}
      <div className="rounded-2xl border border-emerald-200 bg-white px-5 py-4 shadow-sm dark:border-emerald-800/40 dark:bg-gray-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-lg bg-emerald-50 p-2 dark:bg-emerald-900/20">
              <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-800 dark:text-white">Vacinação</h1>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                Acompanhamento de cobertura vacinal, doses aplicadas e sinais de queda nos municípios.
              </p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                Fontes: PNI/RNDS · Cobertura vacinal XLSX
              </p>
            </div>
          </div>
          <Link
            href="/painel-saude"
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600 transition hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Saúde Pública
          </Link>
        </div>

        {/* Aviso parcial */}
        {isParcial && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-blue-50 px-3 py-2 dark:bg-blue-900/20">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500 dark:text-blue-400" />
            <p className="text-xs text-blue-700 dark:text-blue-300">
              Dados parciais do ano corrente são tratados como acompanhamento e podem mudar até o fechamento do exercício.
              Alertas de período parcial não indicam descumprimento definitivo da meta.
            </p>
          </div>
        )}
      </div>

      {/* ── Cards principais ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
        {carregando ? (
          Array.from({ length: 7 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800/40 dark:bg-emerald-900/10">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Cobertura média</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-300">{fmtPct(cobResumo?.cobertura_media)}</p>
              <p className="text-xs text-gray-400">meta 95%</p>
            </div>

            <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 dark:border-orange-800/40 dark:bg-orange-900/10">
              <p className="text-xs font-medium uppercase tracking-wide text-orange-600 dark:text-orange-400">Mun. abaixo da meta</p>
              <p className="mt-1 text-2xl font-bold text-orange-700 dark:text-orange-300">{fmtNum(cobResumo?.total_municipios_abaixo_meta)}</p>
              <p className="text-xs text-gray-400">de 22 municípios</p>
            </div>

            <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800/40 dark:bg-red-900/10">
              <p className="text-xs font-medium uppercase tracking-wide text-red-600 dark:text-red-400">Alertas críticos</p>
              <p className="mt-1 text-2xl font-bold text-red-700 dark:text-red-300">{fmtNum(cobResumo?.total_criticos)}</p>
              <p className="text-xs text-gray-400">cobertura</p>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/40 dark:bg-amber-900/10">
              <p className="text-xs font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">Alertas altos</p>
              <p className="mt-1 text-2xl font-bold text-amber-700 dark:text-amber-300">{fmtNum(cobResumo?.total_altos)}</p>
              <p className="text-xs text-gray-400">cobertura</p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Tipo de período</p>
              <div className="mt-2">
                <PeriodoBadge tipo={cobResumo?.tipo_periodo ?? "—"} />
              </div>
              <p className="mt-1 text-xs text-gray-400">{cobResumo?.ano ?? "—"}</p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Referência</p>
              <p className="mt-1 text-base font-bold text-gray-700 dark:text-gray-200">{fmtData(cobResumo?.data_referencia)}</p>
              <p className="text-xs text-gray-400">data base</p>
            </div>

            <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-800/40 dark:bg-violet-900/10">
              <p className="text-xs font-medium uppercase tracking-wide text-violet-600 dark:text-violet-400">Doses aplicadas</p>
              <p className="mt-1 text-2xl font-bold text-violet-700 dark:text-violet-300">
                {dosesResumo ? fmtNum(dosesResumo.total_doses_ano_atual) : "—"}
              </p>
              <p className="text-xs text-gray-400">{dosesResumo?.ano_referencia ?? "—"}</p>
            </div>
          </>
        )}
      </div>

      {/* ── Cobertura por município ── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Cobertura por município</h2>
          <p className="mt-0.5 text-xs text-slate-400">Vacinas abaixo da meta de 95% por município · Fonte: planilhas DPNI</p>

          <div className="mt-3 flex flex-wrap gap-2">
            <input
              type="text"
              placeholder="Filtrar município..."
              value={filtroMun}
              onChange={e => setFiltroMun(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
            />
            <select
              value={filtroAno}
              onChange={e => setFiltroAno(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
            >
              <option value="">Todos os anos</option>
              {anosDisponiveis.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select
              value={filtroPeriodo}
              onChange={e => setFiltroPeriodo(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
            >
              <option value="">Todos os períodos</option>
              <option value="FECHADO">Fechado</option>
              <option value="PARCIAL">Parcial</option>
            </select>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <input
                type="checkbox"
                checked={apenasAbaixo}
                onChange={e => setApenasAbaixo(e.target.checked)}
                className="rounded accent-emerald-600"
              />
              Somente abaixo da meta
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          {carregando ? (
            <div className="p-6">
              <div className="animate-pulse space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-8 w-full rounded bg-gray-100 dark:bg-gray-700" />
                ))}
              </div>
            </div>
          ) : municipiosFiltrados.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-gray-400">
              {cobMunic.length === 0 ? "Dados de cobertura vacinal não disponíveis. Execute npm run carga-pni-cobertura:postgres para carregar." : "Nenhum município encontrado com os filtros aplicados."}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
                  <th className="px-4 py-3">Município</th>
                  <th className="px-4 py-3 text-right">Cob. média</th>
                  <th className="px-4 py-3 text-right">Menor cob.</th>
                  <th className="px-4 py-3">Vacina mais baixa</th>
                  <th className="px-4 py-3 text-right">Imunobiol.</th>
                  <th className="px-4 py-3 text-right">Abaixo meta</th>
                  <th className="px-4 py-3">Período</th>
                  <th className="px-4 py-3">Referência</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {municipiosFiltrados.map((m, i) => {
                  const abaixoMeta = m.total_abaixo_meta > 0;
                  return (
                    <tr key={i} className={`hover:bg-slate-50 dark:hover:bg-slate-700/40 ${abaixoMeta ? "" : ""}`}>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800 dark:text-slate-100">
                        {m.nome_municipio}
                      </td>
                      <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold ${
                        (m.cobertura_media ?? 100) < 80 ? "text-red-600 dark:text-red-400"
                        : (m.cobertura_media ?? 100) < 95 ? "text-orange-600 dark:text-orange-400"
                        : "text-emerald-600 dark:text-emerald-400"
                      }`}>
                        {fmtPct(m.cobertura_media)}
                      </td>
                      <td className={`whitespace-nowrap px-4 py-3 text-right ${
                        (m.menor_cobertura ?? 100) < 95 ? "font-semibold text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-300"
                      }`}>
                        {fmtPct(m.menor_cobertura)}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                        {m.imunobiologico_menor_cobertura ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">
                        {fmtNum(m.total_imunobiologicos)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {m.total_abaixo_meta > 0 ? (
                          <span className="font-semibold text-orange-600 dark:text-orange-400">{m.total_abaixo_meta}</span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400">0</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <PeriodoBadge tipo={m.tipo_periodo} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                        {fmtData(m.data_referencia)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Gráfico de imunobiológicos ── */}
      {!carregando && imunoOrdenado.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-700">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Cobertura por imunobiológico</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Cobertura média estadual por vacina — do menor para o maior · Meta de referência: 95%
              {isParcial && <span className="ml-1 text-blue-500">(exercício parcial)</span>}
            </p>
          </div>
          <div className="p-4">
            <Chart
              type="bar"
              height={Math.max(220, imunoOrdenado.length * 28)}
              options={opcoesImuno}
              series={[{ name: "Cobertura (%)", data: imunoOrdenado.map(i => parseFloat((i.cobertura_media ?? 0).toFixed(1))) }]}
            />
          </div>
        </div>
      )}

      {/* ── Comparação de exercícios (evolução) ── */}
      {!carregando && imunosEvolucao.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-700">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Evolução da cobertura</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Comparação entre exercícios disponíveis por imunobiológico
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
                  <th className="px-4 py-3">Imunobiológico</th>
                  {/* Renderiza colunas dinamicamente para cada ano/referência */}
                  {(() => {
                    const cols = new Set<string>();
                    for (const v of evolucaoSumarizada.values()) {
                      v.forEach(p => cols.add(`${p.ano}|${p.dataRef}|${p.tipo_periodo}`));
                    }
                    return Array.from(cols).sort().map(col => {
                      const [ano, dataRef, tipo] = col.split("|");
                      return (
                        <th key={col} className="px-4 py-3 text-right">
                          {ano} {tipo === "PARCIAL" ? <span className="text-blue-500">(parcial)</span> : ""}
                          {dataRef && dataRef !== "null" && <span className="block font-normal normal-case">{fmtData(dataRef)}</span>}
                        </th>
                      );
                    });
                  })()}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {imunosEvolucao.slice(0, 20).map(imuno => {
                  const pts = evolucaoSumarizada.get(imuno) ?? [];
                  const cols = new Set<string>();
                  for (const v of evolucaoSumarizada.values()) {
                    v.forEach(p => cols.add(`${p.ano}|${p.dataRef}|${p.tipo_periodo}`));
                  }
                  return (
                    <tr key={imuno} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100 text-xs">{imuno}</td>
                      {Array.from(cols).sort().map(col => {
                        const [ano, dataRef, tipo] = col.split("|");
                        const pt = pts.find(p => String(p.ano) === ano && String(p.dataRef) === dataRef && p.tipo_periodo === tipo);
                        const media = pt?.media ?? null;
                        return (
                          <td key={col} className={`whitespace-nowrap px-4 py-3 text-right font-semibold ${
                            media === null ? "text-gray-400" :
                            media < 80 ? "text-red-600 dark:text-red-400" :
                            media < 95 ? "text-orange-600 dark:text-orange-400" :
                            "text-emerald-600 dark:text-emerald-400"
                          }`}>
                            {media !== null ? fmtPct(media) : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Doses aplicadas ── */}
      <div className="rounded-2xl border border-violet-200 bg-white shadow-sm dark:border-violet-800/40 dark:bg-slate-800">
        <div className="border-b border-violet-100 px-5 py-3 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Doses aplicadas</h2>
          <p className="mt-0.5 text-xs text-slate-400">Registros individuais do RNDS/PNI por município · Fonte: API doses aplicadas</p>
        </div>

        {!carregando && dosesResumo === null && serieMensal.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-400">
            Dados de doses aplicadas ainda não carregados ou indisponíveis.
            Execute <code className="rounded bg-gray-100 px-1 dark:bg-gray-700">npm run carga-pni:postgres</code> para carregar.
          </p>
        ) : (
          <div className="p-5 space-y-4">
            {/* Mini cards de doses */}
            {!carregando && dosesResumo && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-violet-100 bg-violet-50 p-3 dark:border-violet-800/30 dark:bg-violet-900/10">
                  <p className="text-xs font-medium text-violet-600 dark:text-violet-400 uppercase tracking-wide">Total {dosesResumo.ano_referencia}</p>
                  <p className="mt-1 text-xl font-bold text-violet-700 dark:text-violet-300">{fmtNum(dosesResumo.total_doses_ano_atual)}</p>
                </div>
                <div className="rounded-xl border border-violet-100 bg-violet-50 p-3 dark:border-violet-800/30 dark:bg-violet-900/10">
                  <p className="text-xs font-medium text-violet-600 dark:text-violet-400 uppercase tracking-wide">Último mês</p>
                  <p className="mt-1 text-xl font-bold text-violet-700 dark:text-violet-300">{fmtNum(dosesResumo.total_doses_mes_atual)}</p>
                  <p className="text-xs text-gray-400">{nomesMeses()[(dosesResumo.mes_referencia ?? 1) - 1]}</p>
                </div>
                <div className="rounded-xl border border-violet-100 bg-violet-50 p-3 dark:border-violet-800/30 dark:bg-violet-900/10">
                  <p className="text-xs font-medium text-violet-600 dark:text-violet-400 uppercase tracking-wide">Municípios</p>
                  <p className="mt-1 text-xl font-bold text-violet-700 dark:text-violet-300">{fmtNum(dosesResumo.total_municipios_com_dado)}</p>
                  <p className="text-xs text-gray-400">com dados</p>
                </div>
                <div className="rounded-xl border border-violet-100 bg-violet-50 p-3 dark:border-violet-800/30 dark:bg-violet-900/10">
                  <p className="text-xs font-medium text-violet-600 dark:text-violet-400 uppercase tracking-wide">Alertas</p>
                  <p className="mt-1 text-xl font-bold text-violet-700 dark:text-violet-300">{fmtNum(dosesResumo.total_alertas)}</p>
                  <p className="text-xs text-gray-400">{fmtNum(dosesResumo.total_criticos)} crítico(s)</p>
                </div>
              </div>
            )}

            {/* Gráfico de série mensal */}
            {!carregando && serieMensal.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">Evolução mensal de doses aplicadas (todos os municípios)</p>
                <Chart
                  type="bar"
                  height={200}
                  options={opcoesSerie}
                  series={[{ name: "Doses", data: serieMensal.map(p => p.doses) }]}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Alertas de vacinação ── */}
      {!carregando && todosAlertas.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-700">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Alertas de vacinação</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Cobertura vacinal e doses aplicadas · {todosAlertas.length} alerta(s)
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
                  <th className="px-4 py-3">Nível</th>
                  <th className="px-4 py-3">Fonte</th>
                  <th className="px-4 py-3">Município</th>
                  <th className="px-4 py-3">Vacina</th>
                  <th className="px-4 py-3">Tipo de alerta</th>
                  <th className="px-4 py-3">Descrição</th>
                  <th className="px-4 py-3 text-right">Observado</th>
                  <th className="px-4 py-3 text-right">Referência</th>
                  <th className="px-4 py-3">Ano</th>
                  <th className="px-4 py-3">Período</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {todosAlertas.map((a, i) => {
                  const fonte = "fonte" in a ? a.fonte : "PNI";
                  const imuno = "imunobiologico" in a ? a.imunobiologico : null;
                  const ano = "ano" in a ? a.ano : (dosesResumo?.ano_referencia ?? "—");
                  const tipo_periodo = "tipo_periodo" in a ? a.tipo_periodo : "PARCIAL";
                  return (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                      <td className="whitespace-nowrap px-4 py-3"><NivelBadge nivel={a.nivel} /></td>
                      <td className="whitespace-nowrap px-4 py-3"><FonteBadge fonte={fonte} /></td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800 dark:text-slate-100">
                        {a.nome_municipio ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                        {imuno ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">
                        {a.tipo_alerta}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 max-w-xs">
                        {a.descricao}
                        {tipo_periodo === "PARCIAL" && (
                          <span className="ml-1 text-blue-400 dark:text-blue-400">· acompanhamento parcial</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600 dark:text-slate-300">
                        {a.valor_observado !== null ? fmtPct(a.valor_observado) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600 dark:text-slate-300">
                        {a.valor_referencia !== null ? fmtPct(a.valor_referencia) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400">{ano}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <PeriodoBadge tipo={tipo_periodo} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!carregando && todosAlertas.length === 0 && cobMunic.length > 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-900/10 dark:text-emerald-300">
          ✓ Nenhum alerta de vacinação no momento.
        </div>
      )}

    </div>
  );
}
