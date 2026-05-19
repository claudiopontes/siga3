"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";
import BlocoCenso from "./BlocoCenso";
import type { EscolaPonto } from "./MapaEscolasContent";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

interface ApiEscolasResp {
  edicao: number | null;
  escolas: EscolaPonto[];
  total: number;
}

type ViewMode = "analise" | "escolas";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface ApiResp {
  ano_censo: number | null;
  kpis: {
    total_escolas: number;
    total_matriculas: number;
    total_docentes: number;
    razao_aluno_docente: number | null;
    total_inf:  number; total_fund: number; total_med:  number;
    total_prof: number; total_eja:  number; total_esp:  number;
  };
  filtros: {
    municipios:   { cod: number; nome: string | null }[];
    dependencias: string[];
    localizacoes: string[];
  };
  por_dependencia: { dependencia: string | null; n_escolas: number; matriculas: number; docentes: number }[];
  por_municipio:   { cod_municipio: number; nome: string | null; n_escolas: number; matriculas: number; sem_agua: number; sem_energia: number; sem_internet: number }[];
  infraestrutura:  { label: string; col: string; com: number; sem: number; nao_informado: number }[];
  fonte: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtInt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("pt-BR");
}

function fmtDec(n: number | null | undefined, dec = 1): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-2 h-3 w-24 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="h-7 w-16 rounded bg-gray-200 dark:bg-gray-700" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function CensoEscolarClient() {
  const [resp, setResp] = useState<ApiResp | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [municipioSel, setMunicipioSel]     = useState<string>("");
  const [dependenciaSel, setDependenciaSel] = useState<string>("");
  const [localizacaoSel, setLocalizacaoSel] = useState<string>("");

  // View toggle + lista de escolas
  const [viewMode, setViewMode] = useState<ViewMode>("analise");
  const [escolas, setEscolas] = useState<EscolaPonto[]>([]);
  const [carregandoEscolas, setCarregandoEscolas] = useState(false);
  const [busca, setBusca] = useState<string>("");
  const [detalhe, setDetalhe] = useState<EscolaPonto | null>(null);

  useEffect(() => {
    setCarregando(true);
    const qs = new URLSearchParams();
    if (municipioSel)   qs.set("municipio", municipioSel);
    if (dependenciaSel) qs.set("dependencia", dependenciaSel);
    if (localizacaoSel) qs.set("localizacao", localizacaoSel);
    const url = `/api/educacao/censo${qs.toString() ? "?" + qs.toString() : ""}`;
    fetch(url)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d: ApiResp) => setResp(d))
      .catch((e) => setErro(String(e)))
      .finally(() => setCarregando(false));
  }, [municipioSel, dependenciaSel, localizacaoSel]);

  // Carrega lista de escolas (mesmos filtros + situação=Em atividade, busca embutida)
  useEffect(() => {
    if (viewMode !== "escolas") return;
    setCarregandoEscolas(true);
    const qs = new URLSearchParams();
    qs.set("situacao", "Em atividade");
    if (municipioSel)   qs.set("municipio", municipioSel);
    if (dependenciaSel) qs.set("rede", dependenciaSel);
    if (localizacaoSel) qs.set("localizacao", localizacaoSel);
    if (busca.trim())   qs.set("busca", busca.trim());
    fetch(`/api/educacao/escolas?${qs.toString()}`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d: ApiEscolasResp) => setEscolas(d.escolas ?? []))
      .catch(() => setEscolas([]))
      .finally(() => setCarregandoEscolas(false));
  }, [viewMode, municipioSel, dependenciaSel, localizacaoSel, busca]);

  if (erro) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
        Erro ao carregar dados: {erro}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ─── KPIs ─── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {carregando ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <KpiCard color="gray"    label="Escolas Ativas"     valor={fmtInt(resp?.kpis.total_escolas)} hint={`Censo ${resp?.ano_censo ?? "—"} · Em atividade`} />
            <KpiCard color="indigo"  label="Matrículas"         valor={fmtInt(resp?.kpis.total_matriculas)} hint={`Censo ${resp?.ano_censo ?? "—"} · Ed. Básica`} />
            <KpiCard color="purple"  label="Docentes"           valor={fmtInt(resp?.kpis.total_docentes)} hint={`Censo ${resp?.ano_censo ?? "—"} · Ed. Básica`} />
            <KpiCard color="emerald" label="Aluno/Docente"      valor={fmtDec(resp?.kpis.razao_aluno_docente)} hint="Razão estadual" />
          </>
        )}
      </div>

      {/* ─── Filtros ─── */}
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800 sm:flex-row sm:flex-wrap sm:items-end">
        {/* Toggle view */}
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-100 p-1 dark:border-gray-700 dark:bg-gray-900/50">
          {([
            { id: "analise", label: "Análise" },
            { id: "escolas", label: "Lista de Escolas" },
          ] as const).map((mode) => (
            <button
              key={mode.id}
              onClick={() => setViewMode(mode.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                viewMode === mode.id
                  ? "bg-white text-brand-600 shadow dark:bg-gray-700 dark:text-brand-400"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <Field label="Município">
          <select value={municipioSel} onChange={(e) => setMunicipioSel(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
            <option value="">Todos</option>
            {resp?.filtros?.municipios.map((m) => <option key={m.cod} value={String(m.cod)}>{m.nome ?? m.cod}</option>)}
          </select>
        </Field>
        <Field label="Rede">
          <select value={dependenciaSel} onChange={(e) => setDependenciaSel(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
            <option value="">Todas</option>
            {resp?.filtros?.dependencias.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Localização">
          <select value={localizacaoSel} onChange={(e) => setLocalizacaoSel(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
            <option value="">Todas</option>
            {resp?.filtros?.localizacoes.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>

        {viewMode === "escolas" && (
          <Field label="Buscar escola">
            <input
              type="text"
              placeholder="nome contém…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-48 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            />
          </Field>
        )}

        <div className="ml-auto text-[10px] text-gray-400">
          Censo {resp?.ano_censo ?? "—"} · Situação = Em atividade · UF=AC
        </div>
      </div>

      {/* ─── Grade de gráficos (view "análise") ─── */}
      {viewMode === "analise" && !carregando && resp && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Matrículas por etapa */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">Matrículas por etapa</h3>
            <p className="mb-3 text-xs text-gray-400">Distribuição total de matrículas por modalidade.</p>
            <ChartBarMatriculasEtapa kpis={resp.kpis} />
          </div>

          {/* Matrículas por dependência */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">Matrículas por rede</h3>
            <p className="mb-3 text-xs text-gray-400">Estadual, Municipal, Federal e Privada.</p>
            <ChartDonutDependencia dados={resp.por_dependencia} />
          </div>

          {/* Infraestrutura — % escolas */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 lg:col-span-2">
            <h3 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">Infraestrutura — % de escolas com cada item</h3>
            <p className="mb-3 text-xs text-gray-400">Apenas escolas em atividade. Não informado tratado como ausência de resposta.</p>
            <ChartInfra dados={resp.infraestrutura} totalEscolas={resp.kpis.total_escolas} />
          </div>

          {/* Top municípios — matrículas */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">Matrículas por município</h3>
            <p className="mb-3 text-xs text-gray-400">Top 15 (ordem decrescente).</p>
            <ChartBarMatriculasMunicipio dados={resp.por_municipio.slice(0, 15)} />
          </div>

          {/* Municípios com escolas precárias */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">Municípios com escolas sem condições básicas</h3>
            <p className="mb-3 text-xs text-gray-400">Top 10 por nº de escolas sem água, energia ou internet.</p>
            <ChartPrecariedade dados={resp.por_municipio} />
          </div>
        </div>
      )}

      {/* ─── Tabela analítica por município (view "análise") ─── */}
      {viewMode === "analise" && !carregando && resp && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
            Detalhamento por município
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/50">
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Município</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">Escolas</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">Matrículas</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-red-600">Sem água</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-red-600">Sem energia</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-red-600">Sem internet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {resp.por_municipio.map((m) => (
                  <tr key={m.cod_municipio} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{m.nome ?? "—"}</td>
                    <td className="px-3 py-2 text-center text-gray-700 dark:text-gray-300">{fmtInt(m.n_escolas)}</td>
                    <td className="px-3 py-2 text-center font-medium text-indigo-700 dark:text-indigo-400">{fmtInt(m.matriculas)}</td>
                    <td className="px-3 py-2 text-center">{m.sem_agua > 0 ? <strong className="text-red-600">{m.sem_agua}</strong> : <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2 text-center">{m.sem_energia > 0 ? <strong className="text-red-600">{m.sem_energia}</strong> : <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2 text-center">{m.sem_internet > 0 ? <strong className="text-red-600">{m.sem_internet}</strong> : <span className="text-gray-300">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-componentes
// ---------------------------------------------------------------------------

function KpiCard({ color, label, valor, hint }: { color: "gray" | "indigo" | "purple" | "emerald"; label: string; valor: string; hint: string }) {
  const cores: Record<string, { border: string; labelCor: string; valorCor: string }> = {
    gray:    { border: "border-gray-200 dark:border-gray-700",         labelCor: "text-gray-500",    valorCor: "text-gray-900 dark:text-white" },
    indigo:  { border: "border-indigo-200 dark:border-indigo-800/40",  labelCor: "text-indigo-600",  valorCor: "text-indigo-700 dark:text-indigo-400" },
    purple:  { border: "border-purple-200 dark:border-purple-800/40",  labelCor: "text-purple-600",  valorCor: "text-purple-700 dark:text-purple-400" },
    emerald: { border: "border-emerald-200 dark:border-emerald-800/40", labelCor: "text-emerald-600", valorCor: "text-emerald-700 dark:text-emerald-400" },
  };
  const c = cores[color];
  return (
    <div className={`rounded-xl border bg-white p-4 dark:bg-gray-800 ${c.border}`}>
      <p className={`text-xs font-medium uppercase tracking-wide ${c.labelCor}`}>{label}</p>
      <p className={`mt-1 text-3xl font-bold ${c.valorCor}`}>{valor}</p>
      <p className="mt-1 text-[10px] text-gray-400">{hint}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</label>
      {children}
    </div>
  );
}

function ChartBarMatriculasEtapa({ kpis }: { kpis: ApiResp["kpis"] }) {
  const categorias = ["Infantil", "Fundamental", "Médio", "Profissional", "EJA", "Especial"];
  const valores    = [kpis.total_inf, kpis.total_fund, kpis.total_med, kpis.total_prof, kpis.total_eja, kpis.total_esp];
  const options: ApexOptions = {
    chart: { type: "bar", toolbar: { show: false }, fontFamily: "inherit" },
    colors: ["#6366f1"],
    plotOptions: { bar: { borderRadius: 4, horizontal: true, dataLabels: { position: "top" } } },
    dataLabels: { enabled: true, formatter: (v) => (typeof v === "number" ? v.toLocaleString("pt-BR") : String(v)), offsetX: 40, style: { fontSize: "11px", colors: ["#374151"] } },
    xaxis: { categories: categorias, labels: { style: { fontSize: "11px" } } },
    yaxis: { labels: { style: { fontSize: "11px" } } },
    grid: { borderColor: "#f0f0f0", strokeDashArray: 4 },
  };
  return <Chart type="bar" options={options} series={[{ data: valores }]} height={260} />;
}

function ChartDonutDependencia({ dados }: { dados: ApiResp["por_dependencia"] }) {
  const labels = dados.map((d) => d.dependencia ?? "(sem)");
  const series = dados.map((d) => d.matriculas);
  const cores = ["#3b82f6", "#22c55e", "#f59e0b", "#ec4899", "#8b5cf6"];
  const options: ApexOptions = {
    chart: { type: "donut", fontFamily: "inherit" },
    labels,
    colors: cores.slice(0, labels.length),
    legend: { position: "bottom", fontSize: "12px" },
    dataLabels: { formatter: (val) => `${typeof val === "number" ? val.toFixed(1) : val}%` },
    plotOptions: {
      pie: {
        donut: {
          labels: {
            show: true,
            value: { formatter: (v) => parseInt(v, 10).toLocaleString("pt-BR") },
            total: { show: true, label: "Total", formatter: (w) => (w.globals.seriesTotals as number[]).reduce((a, b) => a + b, 0).toLocaleString("pt-BR") },
          },
        },
      },
    },
  };
  return <Chart type="donut" options={options} series={series} height={260} />;
}

function ChartInfra({ dados, totalEscolas }: { dados: ApiResp["infraestrutura"]; totalEscolas: number }) {
  const categorias = dados.map((d) => d.label);
  const pctCom = dados.map((d) => totalEscolas > 0 ? (d.com / totalEscolas) * 100 : 0);
  const pctSem = dados.map((d) => totalEscolas > 0 ? (d.sem / totalEscolas) * 100 : 0);
  const options: ApexOptions = {
    chart: { type: "bar", stacked: true, stackType: "100%", toolbar: { show: false }, fontFamily: "inherit" },
    colors: ["#22c55e", "#ef4444"],
    plotOptions: { bar: { borderRadius: 3, horizontal: true } },
    dataLabels: { formatter: (v) => `${typeof v === "number" ? v.toFixed(0) : v}%`, style: { fontSize: "10px", colors: ["#fff"] } },
    xaxis: { categories: categorias, labels: { formatter: (v) => `${parseFloat(v).toFixed(0)}%`, style: { fontSize: "11px" } } },
    yaxis: { labels: { style: { fontSize: "11px" } } },
    legend: { position: "bottom" },
    grid: { borderColor: "#f0f0f0", strokeDashArray: 4 },
  };
  return <Chart type="bar" options={options} series={[
    { name: "Tem", data: pctCom },
    { name: "Não tem", data: pctSem },
  ]} height={420} />;
}

function ChartBarMatriculasMunicipio({ dados }: { dados: ApiResp["por_municipio"] }) {
  const categorias = dados.map((d) => d.nome ?? String(d.cod_municipio));
  const valores    = dados.map((d) => d.matriculas);
  const options: ApexOptions = {
    chart: { type: "bar", toolbar: { show: false }, fontFamily: "inherit" },
    colors: ["#3b82f6"],
    plotOptions: { bar: { borderRadius: 3, horizontal: true } },
    dataLabels: { enabled: true, formatter: (v) => (typeof v === "number" ? v.toLocaleString("pt-BR") : String(v)), offsetX: 35, style: { fontSize: "10px", colors: ["#374151"] } },
    xaxis: { categories: categorias, labels: { style: { fontSize: "10px" } } },
    yaxis: { labels: { style: { fontSize: "10px" } } },
    grid: { borderColor: "#f0f0f0", strokeDashArray: 4 },
  };
  return <Chart type="bar" options={options} series={[{ data: valores }]} height={400} />;
}

function ChartPrecariedade({ dados }: { dados: ApiResp["por_municipio"] }) {
  const ordenados = [...dados]
    .map((d) => ({ ...d, total_precario: d.sem_agua + d.sem_energia + d.sem_internet }))
    .filter((d) => d.total_precario > 0)
    .sort((a, b) => b.total_precario - a.total_precario)
    .slice(0, 10);
  const categorias = ordenados.map((d) => d.nome ?? String(d.cod_municipio));
  const options: ApexOptions = {
    chart: { type: "bar", stacked: true, toolbar: { show: false }, fontFamily: "inherit" },
    colors: ["#3b82f6", "#f59e0b", "#dc2626"],
    plotOptions: { bar: { borderRadius: 3, horizontal: true } },
    dataLabels: { enabled: false },
    xaxis: { categories: categorias, labels: { style: { fontSize: "10px" } } },
    yaxis: { labels: { style: { fontSize: "10px" } } },
    legend: { position: "bottom", fontSize: "11px" },
    grid: { borderColor: "#f0f0f0", strokeDashArray: 4 },
  };
  return <Chart type="bar" options={options} series={[
    { name: "Sem água",     data: ordenados.map((d) => d.sem_agua) },
    { name: "Sem energia",  data: ordenados.map((d) => d.sem_energia) },
    { name: "Sem internet", data: ordenados.map((d) => d.sem_internet) },
  ]} height={400} />;
}
