"use client";

import React, { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { ApexOptions } from "apexcharts";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface VigilanciaResumo {
  area:                      string;
  fonte:                     string;
  total_alertas:             number;
  total_criticos:            number;
  total_altos:               number;
  total_medios:              number;
  total_municipios_afetados: number;
  total_doencas_monitoradas: number;
  ano_epidemiologico:        number | null;
  semana_epidemiologica:     number | null;
  atualizado_em:             string;
}

interface VigilanciaAlerta {
  id_alerta:             number | null;
  area:                  string;
  fonte:                 string;
  codigo_municipio_ibge: string | null;
  nome_municipio:        string | null;
  doenca:                string;
  ano_epidemiologico:    number | null;
  semana_epidemiologica: number | null;
  tipo_alerta:           string;
  nivel:                 string;
  descricao:             string;
  valor_observado:       number | null;
  valor_referencia:      number | null;
  prioridade:            number;
  atualizado_em:         string;
}

interface SeriePonto {
  periodo_label: string;
  data_inicio?:  string;
  doenca:        string;
  casos:         number;
}

interface VigilanciaMunicipio {
  codigo_municipio_ibge: string;
  nome_municipio:        string | null;
  doenca:                string;
  ano_epidemiologico:    number | null;
  semana_epidemiologica: number | null;
  casos:                 number | null;
  casos_est:             number | null;
  nivel:                 number | null;
  nivel_descricao:       string | null;
  rt:                    number | null;
  p_rt1:                 number | null;
  receptivo:             number | null;
  transmissao:           number | null;
  notif_accum_year:      number | null;
  casos_periodo:         number | null;
}

// Situação por município (pivotada: uma linha por município)
interface SituacaoMunicipio {
  codigo:      string;
  nome:        string;
  dengue:      VigilanciaMunicipio | null;
  chikungunya: VigilanciaMunicipio | null;
  zika:        VigilanciaMunicipio | null;
  casosTotal:  number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtNum(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return Number(v).toLocaleString("pt-BR");
}

function abreviarMunicipio(nome: string | null): string {
  if (!nome) return "—";
  return nome.length > 16 ? nome.slice(0, 15) + "…" : nome;
}

// Nível InfoDengue: 1=verde 2=amarelo 3=laranja 4=vermelho
function NivelInfoDengue({ nivel, casos }: { nivel: number | null; casos: number | null }) {
  const n = nivel ?? 1;
  const c = Number(casos ?? 0);
  if (n === 4)
    return (
      <span className="inline-flex flex-col items-center gap-0.5">
        <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">Alto risco</span>
        {c > 0 && <span className="text-xs text-red-600 dark:text-red-400">{fmtNum(c)} casos</span>}
      </span>
    );
  if (n === 3)
    return (
      <span className="inline-flex flex-col items-center gap-0.5">
        <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">Alerta</span>
        {c > 0 && <span className="text-xs text-orange-600 dark:text-orange-400">{fmtNum(c)} casos</span>}
      </span>
    );
  if (n === 2)
    return (
      <span className="inline-flex flex-col items-center gap-0.5">
        <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">Atenção</span>
        {c > 0 && <span className="text-xs text-yellow-600 dark:text-yellow-400">{fmtNum(c)} casos</span>}
      </span>
    );
  return (
    <span className="inline-flex flex-col items-center gap-0.5">
      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/40 dark:text-green-300">Normal</span>
      {c > 0 && <span className="text-xs text-gray-500 dark:text-gray-400">{fmtNum(c)} casos</span>}
    </span>
  );
}

const NIVEL_COR: Record<string, string> = {
  CRITICO: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  ALTO:    "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  MEDIO:   "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  BAIXO:   "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
};
const NIVEL_DOT: Record<string, string> = {
  CRITICO: "bg-red-500",
  ALTO:    "bg-orange-400",
  MEDIO:   "bg-yellow-400",
  BAIXO:   "bg-green-500",
};
const NIVEL_LABEL: Record<string, string> = {
  CRITICO: "Crítico",
  ALTO:    "Alto",
  MEDIO:   "Médio",
  BAIXO:   "Baixo",
};

function NivelBadge({ nivel }: { nivel: string }) {
  const n = nivel?.toUpperCase();
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${NIVEL_COR[n] ?? NIVEL_COR.BAIXO}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${NIVEL_DOT[n] ?? NIVEL_DOT.BAIXO}`} />
      {NIVEL_LABEL[n] ?? nivel}
    </span>
  );
}

function DoencaBadge({ doenca }: { doenca: string }) {
  if (doenca === "dengue")
    return <span className="rounded bg-rose-50 px-1.5 py-0.5 text-xs font-medium text-rose-600 dark:bg-rose-900/30 dark:text-rose-300">Dengue</span>;
  if (doenca === "chikungunya")
    return <span className="rounded bg-purple-50 px-1.5 py-0.5 text-xs font-medium text-purple-600 dark:bg-purple-900/30 dark:text-purple-300">Chikungunya</span>;
  if (doenca === "zika")
    return <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-600 dark:bg-amber-900/30 dark:text-amber-300">Zika</span>;
  return <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">{doenca}</span>;
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="mt-3 h-8 w-16 rounded bg-gray-200 dark:bg-gray-700" />
    </div>
  );
}

// Retorna "DD/MM a DD/MM" para uma semana epidemiológica ISO (começa na segunda-feira)
function intervaloDaSE(ano: number, se: number): string {
  // Jan 4 do ano sempre pertence à SE 1 (definição ISO)
  const jan4 = new Date(ano, 0, 4);
  const diaSemana = jan4.getDay() || 7; // segunda=1 … domingo=7
  const inicio = new Date(jan4);
  inicio.setDate(jan4.getDate() - (diaSemana - 1) + (se - 1) * 7);
  const fim = new Date(inicio);
  fim.setDate(inicio.getDate() + 6);
  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `${fmt(inicio)} a ${fmt(fim)}`;
}

function BarraSimples({ label, valor, max, cor }: { label: string; valor: number; max: number; cor: string }) {
  const pct = max > 0 ? Math.round((valor / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 truncate text-right text-xs text-slate-600 dark:text-slate-300">{label}</span>
      <div className="flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700" style={{ height: 10 }}>
        <div className={`h-full rounded-full ${cor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 shrink-0 text-xs font-semibold text-slate-700 dark:text-slate-200">{fmtNum(valor)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function VigilanciaEpidemiologicaClient() {
  const [resumo,      setResumo]      = useState<VigilanciaResumo | null>(null);
  const [alertas,     setAlertas]     = useState<VigilanciaAlerta[]>([]);
  const [municipios,    setMunicipios]    = useState<VigilanciaMunicipio[]>([]);
  const [serie,         setSerie]         = useState<SeriePonto[]>([]);
  const [carregando,    setCarregando]    = useState(true);
  const [carregandoSerie, setCarregandoSerie] = useState(false);
  const [erro,          setErro]          = useState<string | null>(null);

  const [periodo,          setPeriodo]          = useState("6m");
  const [granularidade,    setGranularidade]    = useState("semana");
  const [munSelecionado,   setMunSelecionado]   = useState("");   // código IBGE ou ""
  const [filtroMunicipio,  setFiltroMunicipio]  = useState("");
  const [filtroDoenca,     setFiltroDoenca]     = useState("todas");
  const [filtroNivel,      setFiltroNivel]      = useState("todos");
  const [filtroTipo,       setFiltroTipo]       = useState("todos");
  const [todosOsMunicipios, setTodosOsMunicipios] = useState<{codigo: string; nome: string}[]>([]);

  // Carga principal: resumo, alertas e dados por município
  useEffect(() => {
    setCarregando(true);
    const munParam = munSelecionado ? `&municipio=${munSelecionado}` : "";
    Promise.all([
      fetch("/api/alertas/vigilancia/resumo").then((r) => r.json()),
      fetch("/api/alertas/vigilancia/detalhes").then((r) => r.json()),
      fetch(`/api/alertas/vigilancia/municipios?periodo=${periodo}${munParam}`).then((r) => r.json()),
    ])
      .then(([res, als, muns]) => {
        setResumo(res ?? null);
        setAlertas(Array.isArray(als) ? als : []);
        const munsArr: VigilanciaMunicipio[] = Array.isArray(muns) ? muns : [];
        setMunicipios(munsArr);
        if (!munSelecionado) {
          const vistos = new Set<string>();
          const lista: {codigo: string; nome: string}[] = [];
          for (const m of munsArr) {
            if (!vistos.has(m.codigo_municipio_ibge)) {
              vistos.add(m.codigo_municipio_ibge);
              lista.push({ codigo: m.codigo_municipio_ibge, nome: m.nome_municipio ?? m.codigo_municipio_ibge });
            }
          }
          setTodosOsMunicipios(lista.sort((a, b) => a.nome.localeCompare(b.nome)));
        }
      })
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : "Erro ao carregar dados."))
      .finally(() => setCarregando(false));
  }, [periodo, munSelecionado]);

  // Carga da série histórica (gráfico de linha)
  useEffect(() => {
    setCarregandoSerie(true);
    const munParam = munSelecionado ? `&municipio=${munSelecionado}` : "";
    fetch(`/api/alertas/vigilancia/serie?periodo=${periodo}&granularidade=${granularidade}${munParam}`)
      .then((r) => r.json())
      .then((data) => setSerie(Array.isArray(data) ? data : []))
      .catch(() => setSerie([]))
      .finally(() => setCarregandoSerie(false));
  }, [periodo, granularidade, munSelecionado]);

  const labelPeriodo = periodo === "6m" ? "6 meses" : periodo === "2a" ? "2 anos" : "1 ano";

  // Pivota municípios: uma linha por município com dengue/chikungunya/zika
  const situacoes = useMemo((): SituacaoMunicipio[] => {
    const map = new Map<string, SituacaoMunicipio>();
    for (const m of municipios) {
      const cod = m.codigo_municipio_ibge;
      if (!map.has(cod)) {
        map.set(cod, { codigo: cod, nome: m.nome_municipio ?? cod, dengue: null, chikungunya: null, zika: null, casosTotal: 0 });
      }
      const s = map.get(cod)!;
      if (m.doenca === "dengue")      s.dengue      = m;
      if (m.doenca === "chikungunya") s.chikungunya = m;
      if (m.doenca === "zika")        s.zika        = m;
      s.casosTotal += Number(m.casos_periodo ?? 0);
    }
    return [...map.values()].sort((a, b) => b.casosTotal - a.casosTotal);
  }, [municipios]);

  // KPIs do período selecionado
  const totaisAno = useMemo(() => {
    const dengue      = municipios.filter(m => m.doenca === "dengue").reduce((s, m) => s + Number(m.casos_periodo ?? 0), 0);
    const chikungunya = municipios.filter(m => m.doenca === "chikungunya").reduce((s, m) => s + Number(m.casos_periodo ?? 0), 0);
    const zika        = municipios.filter(m => m.doenca === "zika").reduce((s, m) => s + Number(m.casos_periodo ?? 0), 0);
    const maxNivel    = municipios.reduce((max, m) => Math.max(max, m.nivel ?? 1), 1);
    return { dengue, chikungunya, zika, total: dengue + chikungunya + zika, maxNivel };
  }, [municipios]);

  const alertasFiltrados = useMemo(() => alertas.filter((a) => {
    if (filtroNivel   !== "todos" && a.nivel       !== filtroNivel)   return false;
    if (filtroDoenca  !== "todas" && a.doenca      !== filtroDoenca)  return false;
    if (filtroTipo    !== "todos" && a.tipo_alerta !== filtroTipo)    return false;
    if (filtroMunicipio && !(a.nome_municipio ?? "").toLowerCase().includes(filtroMunicipio.toLowerCase())) return false;
    return true;
  }), [alertas, filtroNivel, filtroDoenca, filtroTipo, filtroMunicipio]);

  const tiposAlerta = useMemo(() => Array.from(new Set(alertas.map((a) => a.tipo_alerta))).sort(), [alertas]);

  // Processa série para o gráfico de linha
  const dadosLinha = useMemo(() => {
    const periodos = Array.from(new Set(serie.map((p) => p.periodo_label))).sort();
    const dengue      = periodos.map((pl) => serie.find((p) => p.periodo_label === pl && p.doenca === "dengue")?.casos      ?? 0);
    const chikungunya = periodos.map((pl) => serie.find((p) => p.periodo_label === pl && p.doenca === "chikungunya")?.casos ?? 0);
    const zika        = periodos.map((pl) => serie.find((p) => p.periodo_label === pl && p.doenca === "zika")?.casos        ?? 0);
    return { periodos, dengue, chikungunya, zika };
  }, [serie]);

  const opcoesLinha = useMemo((): ApexOptions => ({
    chart: { type: "line", toolbar: { show: false }, fontFamily: "inherit", animations: { enabled: false } },
    colors: ["#f43f5e", "#a855f7", "#f59e0b"],
    stroke: { curve: "smooth", width: 2 },
    markers: { size: dadosLinha.periodos.length <= 30 ? 3 : 0 },
    xaxis: {
      categories: dadosLinha.periodos,
      labels: {
        rotate: -35,
        style: { fontSize: "10px" },
        formatter: (v: string) => {
          if (!v) return "";
          if (granularidade === "mes") return v.slice(0, 7).replace("-", "/");
          const parts = v.split("-W");
          return parts.length === 2 ? `SE ${parts[1]}/${parts[0]}` : v;
        },
      },
      tickAmount: Math.min(dadosLinha.periodos.length, 16),
    },
    yaxis: { labels: { style: { fontSize: "11px" } }, min: 0 },
    legend: { position: "top", fontSize: "12px" },
    tooltip: { y: { formatter: (v) => `${fmtNum(v)} casos` } },
    grid: { borderColor: "#f0f0f0", strokeDashArray: 4 },
    noData: { text: "Sem dados no período" },
  }), [granularidade, dadosLinha.periodos]);

  const opcoesBarraCasos: ApexOptions = {
    chart: { type: "bar", toolbar: { show: false }, fontFamily: "inherit" },
    colors: ["#f43f5e", "#a855f7", "#f59e0b"],
    plotOptions: { bar: { borderRadius: 3, horizontal: true, barHeight: "60%" } },
    dataLabels: { enabled: false },
    xaxis: {
      categories: situacoes.slice(0, 10).map((s) => abreviarMunicipio(s.nome)),
      labels: { style: { fontSize: "10px" } },
    },
    yaxis: { labels: { style: { fontSize: "10px" } } },
    legend: { position: "top", fontSize: "12px" },
    tooltip: { y: { formatter: (v) => `${fmtNum(v)} casos acumulados` } },
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

  const seRef = resumo?.semana_epidemiologica ?? municipios[0]?.semana_epidemiologica;
  const anoRef = resumo?.ano_epidemiologico   ?? municipios[0]?.ano_epidemiologico;

  return (
    <div className="space-y-5">

      {/* ── Controles globais ── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Período */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Período:</span>
          {(["6m", "1a", "2a"] as const).map((p) => (
            <button key={p} onClick={() => setPeriodo(p)}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                periodo === p
                  ? "bg-rose-500 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              }`}>
              {p === "6m" ? "6 meses" : p === "1a" ? "1 ano" : "2 anos"}
            </button>
          ))}
        </div>

        {/* Município */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Município:</span>
          <select
            value={munSelecionado}
            onChange={(e) => setMunSelecionado(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-rose-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          >
            <option value="">Todos os municípios</option>
            {todosOsMunicipios.map((m) => (
              <option key={m.codigo} value={m.codigo}>{m.nome}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Cards KPI ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {carregando ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            {/* Casos dengue acumulados no ano */}
            <div className={`rounded-xl border p-4 ${totaisAno.dengue > 0 ? "border-rose-200 bg-rose-50 dark:border-rose-800/40 dark:bg-rose-900/10" : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"}`}>
              <p className={`text-xs font-medium uppercase tracking-wide ${totaisAno.dengue > 0 ? "text-rose-600 dark:text-rose-400" : "text-gray-400"}`}>Dengue ({labelPeriodo})</p>
              <p className={`mt-1 text-2xl font-bold ${totaisAno.dengue > 0 ? "text-rose-700 dark:text-rose-300" : "text-gray-700 dark:text-gray-200"}`}>{fmtNum(totaisAno.dengue)}</p>
              <p className="text-xs text-gray-400">casos acumulados</p>
            </div>

            {/* Casos chikungunya acumulados */}
            <div className={`rounded-xl border p-4 ${totaisAno.chikungunya > 0 ? "border-purple-200 bg-purple-50 dark:border-purple-800/40 dark:bg-purple-900/10" : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"}`}>
              <p className={`text-xs font-medium uppercase tracking-wide ${totaisAno.chikungunya > 0 ? "text-purple-600 dark:text-purple-400" : "text-gray-400"}`}>Chikungunya ({labelPeriodo})</p>
              <p className={`mt-1 text-2xl font-bold ${totaisAno.chikungunya > 0 ? "text-purple-700 dark:text-purple-300" : "text-gray-700 dark:text-gray-200"}`}>{fmtNum(totaisAno.chikungunya)}</p>
              <p className="text-xs text-gray-400">casos acumulados</p>
            </div>

            {/* Casos zika acumulados */}
            <div className={`rounded-xl border p-4 ${totaisAno.zika > 0 ? "border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-900/10" : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"}`}>
              <p className={`text-xs font-medium uppercase tracking-wide ${totaisAno.zika > 0 ? "text-amber-600 dark:text-amber-400" : "text-gray-400"}`}>Zika ({labelPeriodo})</p>
              <p className={`mt-1 text-2xl font-bold ${totaisAno.zika > 0 ? "text-amber-700 dark:text-amber-300" : "text-gray-700 dark:text-gray-200"}`}>{fmtNum(totaisAno.zika)}</p>
              <p className="text-xs text-gray-400">casos acumulados</p>
            </div>

            {/* Alertas ativos */}
            <div className={`rounded-xl border p-4 ${(resumo?.total_criticos ?? 0) + (resumo?.total_altos ?? 0) > 0 ? "border-red-200 bg-white dark:border-red-800/40 dark:bg-gray-800" : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"}`}>
              <p className={`text-xs font-medium uppercase tracking-wide ${(resumo?.total_criticos ?? 0) + (resumo?.total_altos ?? 0) > 0 ? "text-red-500" : "text-gray-400"}`}>Alertas ativos</p>
              <p className={`mt-1 text-2xl font-bold ${(resumo?.total_criticos ?? 0) + (resumo?.total_altos ?? 0) > 0 ? "text-red-600 dark:text-red-400" : "text-gray-700 dark:text-gray-200"}`}>
                {(resumo?.total_criticos ?? 0) + (resumo?.total_altos ?? 0)}
              </p>
              <p className="text-xs text-gray-400">{resumo?.total_criticos ?? 0} crítico · {resumo?.total_altos ?? 0} alto</p>
            </div>

            {/* Semana epidemiológica */}
            <div className="rounded-xl border border-blue-200 bg-white p-4 dark:border-blue-800/40 dark:bg-gray-800 col-span-2 sm:col-span-1">
              <p className="text-xs font-medium uppercase tracking-wide text-blue-400">Semana epidemiológica</p>
              <p className="mt-1 text-2xl font-bold text-blue-600 dark:text-blue-400">
                {seRef ? `SE ${seRef}` : "—"}
              </p>
              <p className="mt-0.5 text-xs text-gray-400">
                {seRef && anoRef
                  ? intervaloDaSE(anoRef, seRef)
                  : (anoRef ?? "—")}
                {" · "}{anoRef ?? ""}
              </p>
            </div>
          </>
        )}
      </div>

      {/* ── Gráfico: casos acumulados por município ── */}
      {!carregando && totaisAno.total > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-700">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Casos no período por município</h2>
            <p className="mt-0.5 text-xs text-slate-400">Top 10 municípios · últimos {labelPeriodo} — dengue, chikungunya e zika</p>
          </div>
          <div className="p-4">
            <Chart
              key={`bar-${periodo}-${munSelecionado}`}
              type="bar"
              height={280}
              options={opcoesBarraCasos}
              series={[
                { name: "Dengue",      data: situacoes.slice(0, 10).map((s) => Number(s.dengue?.casos_periodo ?? 0)) },
                { name: "Chikungunya", data: situacoes.slice(0, 10).map((s) => Number(s.chikungunya?.casos_periodo ?? 0)) },
                { name: "Zika",        data: situacoes.slice(0, 10).map((s) => Number(s.zika?.casos_periodo ?? 0)) },
              ]}
            />
          </div>
        </div>
      )}

      {/* ── Gráfico de linha: evolução temporal ── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <div>
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Evolução de casos no período</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {munSelecionado
                ? (todosOsMunicipios.find(m => m.codigo === munSelecionado)?.nome ?? munSelecionado)
                : "Todos os municípios"} · últimos {labelPeriodo}
            </p>
          </div>
          {/* Granularidade */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 dark:text-gray-400">Agrupar por:</span>
            {(["semana", "mes"] as const).map((g) => (
              <button key={g} onClick={() => setGranularidade(g)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                  granularidade === g
                    ? "bg-slate-600 text-white dark:bg-slate-500"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                }`}>
                {g === "semana" ? "Semana" : "Mês"}
              </button>
            ))}
          </div>
        </div>
        {carregandoSerie ? (
          <div className="flex h-48 items-center justify-center text-sm text-gray-400">Carregando...</div>
        ) : (
          <div className="p-4">
            <Chart
              key={`line-${periodo}-${granularidade}-${munSelecionado}`}
              type="line"
              height={260}
              options={opcoesLinha}
              series={[
                { name: "Dengue",      data: dadosLinha.dengue },
                { name: "Chikungunya", data: dadosLinha.chikungunya },
                { name: "Zika",        data: dadosLinha.zika },
              ]}
            />
          </div>
        )}
      </div>

      {/* ── Tabela: situação por município ── */}
      {!carregando && situacoes.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-700">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Situação epidemiológica por município</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Nível de alerta atual · casos nos últimos {labelPeriodo} · {seRef ? `SE ${seRef}/${anoRef}` : "semana mais recente"}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
                  <th className="px-4 py-3">Município</th>
                  <th className="px-4 py-3 text-center">Dengue</th>
                  <th className="px-4 py-3 text-center">Chikungunya</th>
                  <th className="px-4 py-3 text-center">Zika</th>
                  <th className="px-4 py-3 text-right">Total casos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {situacoes.map((s) => (
                  <tr key={s.codigo} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{s.nome}</td>
                    <td className="px-4 py-3 text-center">
                      <NivelInfoDengue nivel={s.dengue?.nivel ?? 1} casos={s.dengue?.casos_periodo ?? 0} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <NivelInfoDengue nivel={s.chikungunya?.nivel ?? 1} casos={s.chikungunya?.casos_periodo ?? 0} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <NivelInfoDengue nivel={s.zika?.nivel ?? 1} casos={s.zika?.casos_periodo ?? 0} />
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-700 dark:text-slate-200">
                      {s.casosTotal > 0 ? fmtNum(s.casosTotal) : <span className="text-slate-300 dark:text-slate-600">0</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tabela de alertas ativos ── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Alertas de arboviroses</h2>
              <p className="mt-0.5 text-xs text-slate-400">
                {alertasFiltrados.length} alerta{alertasFiltrados.length !== 1 ? "s" : ""} encontrado{alertasFiltrados.length !== 1 ? "s" : ""}
              </p>
              {/* Legenda dos critérios de alerta */}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {[
                  { cor: "bg-red-500",    label: "Crítico",  desc: "Nível 4 (alerta vermelho)" },
                  { cor: "bg-orange-400", label: "Alto",     desc: "Nível 3 · transmissão ≥ 2 · Rt > 1 (p ≥ 95%) · incidência ≥ 100/100 mil" },
                  { cor: "bg-yellow-400", label: "Médio",    desc: "Receptividade climática ≥ 2" },
                ].map((item) => (
                  <span key={item.label} className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400" title={item.desc}>
                    <span className={`inline-block h-2 w-2 rounded-full ${item.cor}`} />
                    <span className="font-medium">{item.label}:</span>
                    <span className="hidden sm:inline">{item.desc}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                placeholder="Município..."
                value={filtroMunicipio}
                onChange={(e) => setFiltroMunicipio(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-rose-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
              />
              <select value={filtroDoenca} onChange={(e) => setFiltroDoenca(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-rose-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
                <option value="todas">Todas as doenças</option>
                <option value="dengue">Dengue</option>
                <option value="chikungunya">Chikungunya</option>
                <option value="zika">Zika</option>
              </select>
              <select value={filtroNivel} onChange={(e) => setFiltroNivel(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-rose-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
                <option value="todos">Todos os níveis</option>
                <option value="CRITICO">Crítico</option>
                <option value="ALTO">Alto</option>
                <option value="MEDIO">Médio</option>
              </select>
              {tiposAlerta.length > 0 && (
                <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-rose-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
                  <option value="todos">Todos os tipos</option>
                  {tiposAlerta.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              )}
            </div>
          </div>
        </div>

        {carregando ? (
          <div className="p-6 text-center text-sm text-gray-400">Carregando...</div>
        ) : alertasFiltrados.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400">
            {alertas.length === 0
              ? "Nenhum alerta ativo nesta semana — todos os municípios estão em nível normal."
              : "Nenhum alerta encontrado com os filtros selecionados."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
                  <th className="px-4 py-3">Nível</th>
                  <th className="px-4 py-3">Município</th>
                  <th className="px-4 py-3">Doença</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Descrição</th>
                  <th className="px-4 py-3 text-center">SE</th>
                  <th className="px-4 py-3">Val. observado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {alertasFiltrados.map((a, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                    <td className="px-4 py-3"><NivelBadge nivel={a.nivel} /></td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700 dark:text-slate-200">{a.nome_municipio ?? "—"}</td>
                    <td className="px-4 py-3"><DoencaBadge doenca={a.doenca} /></td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{a.tipo_alerta}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{a.descricao}</td>
                    <td className="px-4 py-3 text-center text-slate-500 dark:text-slate-400">
                      {a.semana_epidemiologica ? `${a.semana_epidemiologica}/${a.ano_epidemiologico}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {a.valor_observado !== null ? fmtNum(a.valor_observado) : "—"}
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
