"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface Municipio {
  cod_municipio: number;
  nome: string | null;
  an_exercicio: number | null;
  nr_periodo: number | null;
  edicao_ideb: number | null;
  total_mde: number | null;
  total_despesa_educacao: number | null;
  total_matriculas: number | null;
  gasto_aluno_mde: number | null;
  gasto_aluno_educacao: number | null;
  // TCE (SIPAC/empenho)
  ano_referencia_tce: number | null;
  total_mde_tce: number | null;
  total_despesa_educacao_tce: number | null;
  receita_base_mde_tce: number | null;
  pct_aplicado_mde_tce: number | null;
  gasto_aluno_mde_tce: number | null;
  divergencia_mde_pct: number | null;
  ideb_ai: number | null;
  ideb_af: number | null;
  ideb_em: number | null;
  ideb_composite: number | null;
  custo_por_ponto_ideb: number | null;
}

interface ApiResp {
  kpis: {
    total_municipios: number;
    municipios_com_dado: number;
    gasto_medio_mde: number | null;
    gasto_min_mde: number | null;
    gasto_max_mde: number | null;
    gasto_medio_total: number | null;
    total_mde_estadual: number;
    total_matriculas_estadual: number;
  };
  municipios: Municipio[];
  fonte: string;
}

type OrdemCol =
  | "nome" | "matriculas"
  | "mde" | "mde_tce" | "divergencia"
  | "despesa"
  | "gasto_mde" | "gasto_mde_tce" | "gasto_total"
  | "pct_tce"
  | "ideb" | "custo_ideb";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtBRL(n: number | null | undefined, decimais = 0): string {
  if (n === null || n === undefined) return "—";
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: decimais, maximumFractionDigits: decimais })}`;
}

function fmtInt(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : n.toLocaleString("pt-BR");
}

function fmtNum(n: number | null | undefined, dec = 1): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function getColorDivergencia(pct: number | null | undefined): string {
  if (pct === null || pct === undefined) return "text-gray-400";
  const abs = Math.abs(pct);
  if (abs <= 2)  return "text-emerald-600 dark:text-emerald-400";
  if (abs <= 5)  return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

function fmtDelta(pct: number | null | undefined): string {
  if (pct === null || pct === undefined) return "—";
  const sinal = pct > 0 ? "+" : "";
  return `${sinal}${pct.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function getColorIdeb(ideb: number | null): string {
  if (ideb === null) return "#94a3b8";
  if (ideb >= 5.0) return "#22c55e";
  if (ideb >= 4.5) return "#84cc16";
  if (ideb >= 4.0) return "#eab308";
  if (ideb >= 3.5) return "#f97316";
  return "#ef4444";
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

export default function EficienciaClient() {
  const [resp, setResp] = useState<ApiResp | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ordemCol, setOrdemCol] = useState<OrdemCol>("gasto_mde");
  const [ordemAsc, setOrdemAsc] = useState<boolean>(false);

  // Filtros
  const [busca, setBusca]                 = useState<string>("");
  const [portePorte, setPortePorte]       = useState<"todos" | "pequeno" | "medio" | "grande">("todos");
  const [somenteCompleto, setSomenteCompleto] = useState<boolean>(false);

  useEffect(() => {
    setCarregando(true);
    fetch("/api/educacao/eficiencia")
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d: ApiResp) => setResp(d))
      .catch((e) => setErro(String(e)))
      .finally(() => setCarregando(false));
  }, []);

  // Aplica filtros + ordenação
  const municipiosFiltrados = useMemo(() => {
    if (!resp) return [];
    let arr = [...resp.municipios];

    // Filtro: busca por nome (normalizado, sem acentos)
    if (busca.trim()) {
      const q = busca.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      arr = arr.filter((m) =>
        (m.nome ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(q),
      );
    }

    // Filtro: porte (faixa de matrículas)
    if (portePorte !== "todos") {
      arr = arr.filter((m) => {
        const mat = m.total_matriculas ?? 0;
        if (portePorte === "pequeno") return mat < 2000;
        if (portePorte === "medio")   return mat >= 2000 && mat < 10000;
        if (portePorte === "grande")  return mat >= 10000;
        return true;
      });
    }

    // Filtro: somente com dado completo (Gasto MDE + IDEB)
    if (somenteCompleto) {
      arr = arr.filter((m) => m.gasto_aluno_mde !== null && m.gasto_aluno_mde > 0 && m.ideb_composite !== null);
    }

    return arr;
  }, [resp, busca, portePorte, somenteCompleto]);

  const municipiosOrdenados = useMemo(() => {
    const arr = [...municipiosFiltrados];
    const get = (m: Municipio): number | string => {
      switch (ordemCol) {
        case "nome":        return (m.nome ?? "").toLowerCase();
        case "matriculas":  return m.total_matriculas ?? -1;
        case "mde":           return m.total_mde ?? -1;
        case "mde_tce":       return m.total_mde_tce ?? -1;
        case "divergencia":   return m.divergencia_mde_pct ?? -9999;
        case "despesa":       return m.total_despesa_educacao ?? -1;
        case "gasto_mde":     return m.gasto_aluno_mde ?? -1;
        case "gasto_mde_tce": return m.gasto_aluno_mde_tce ?? -1;
        case "gasto_total":   return m.gasto_aluno_educacao ?? -1;
        case "pct_tce":       return m.pct_aplicado_mde_tce ?? -1;
        case "ideb":          return m.ideb_composite ?? -1;
        case "custo_ideb":    return m.custo_por_ponto_ideb ?? -1;
      }
    };
    arr.sort((a, b) => {
      const va = get(a), vb = get(b);
      if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb);
      return (va as number) - (vb as number);
    });
    return ordemAsc ? arr : arr.reverse();
  }, [municipiosFiltrados, ordemCol, ordemAsc]);

  const toggleOrdem = (col: OrdemCol) => {
    if (ordemCol === col) setOrdemAsc((v) => !v);
    else { setOrdemCol(col); setOrdemAsc(false); }
  };

  if (erro) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
        Erro ao carregar dados: {erro}
      </div>
    );
  }

  const kpis = resp?.kpis;

  return (
    <div className="space-y-4">
      {/* ─── KPIs ─── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {carregando ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Municípios c/ dado</p>
              <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">{kpis?.municipios_com_dado ?? 0}</p>
              <p className="mt-1 text-[10px] text-gray-400">de {kpis?.total_municipios ?? 0}</p>
            </div>
            <div className="rounded-xl border border-teal-200 bg-white p-4 dark:border-teal-800/40 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wide text-teal-600">Gasto MDE médio</p>
              <p className="mt-1 text-2xl font-bold text-teal-700 dark:text-teal-400">{fmtBRL(kpis?.gasto_medio_mde)}</p>
              <p className="mt-1 text-[10px] text-gray-400">por aluno (média estadual)</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-white p-4 dark:border-emerald-800/40 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">Gasto MDE mín.</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-400">{fmtBRL(kpis?.gasto_min_mde)}</p>
              <p className="mt-1 text-[10px] text-gray-400">município com menor gasto</p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-white p-4 dark:border-rose-800/40 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wide text-rose-600">Gasto MDE máx.</p>
              <p className="mt-1 text-2xl font-bold text-rose-700 dark:text-rose-400">{fmtBRL(kpis?.gasto_max_mde)}</p>
              <p className="mt-1 text-[10px] text-gray-400">município com maior gasto</p>
            </div>
            <div className="rounded-xl border border-indigo-200 bg-white p-4 dark:border-indigo-800/40 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wide text-indigo-600">Total MDE estadual</p>
              <p className="mt-1 text-xl font-bold text-indigo-700 dark:text-indigo-400">{fmtBRL(kpis?.total_mde_estadual)}</p>
              <p className="mt-1 text-[10px] text-gray-400">soma de todos municípios</p>
            </div>
            <div className="rounded-xl border border-purple-200 bg-white p-4 dark:border-purple-800/40 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wide text-purple-600">Total matrículas</p>
              <p className="mt-1 text-xl font-bold text-purple-700 dark:text-purple-400">{fmtInt(kpis?.total_matriculas_estadual)}</p>
              <p className="mt-1 text-[10px] text-gray-400">Censo Escolar</p>
            </div>
          </>
        )}
      </div>

      {/* ─── Filtros ─── */}
      {!carregando && resp && (
        <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Buscar município</label>
            <input
              type="text"
              placeholder="nome contém…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-48 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            />
          </div>

          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Porte do município</label>
            <select
              value={portePorte}
              onChange={(e) => setPortePorte(e.target.value as typeof portePorte)}
              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            >
              <option value="todos">Todos</option>
              <option value="pequeno">Pequeno (&lt; 2.000 matrículas)</option>
              <option value="medio">Médio (2.000–10.000)</option>
              <option value="grande">Grande (≥ 10.000)</option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
            <input
              type="checkbox"
              checked={somenteCompleto}
              onChange={(e) => setSomenteCompleto(e.target.checked)}
              className="rounded border-gray-300"
            />
            Somente com Gasto MDE + IDEB
          </label>

          {(busca.trim() || portePorte !== "todos" || somenteCompleto) && (
            <button
              onClick={() => { setBusca(""); setPortePorte("todos"); setSomenteCompleto(false); }}
              className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Limpar filtros
            </button>
          )}

          <div className="ml-auto text-[10px] text-gray-400">
            {municipiosFiltrados.length} de {resp.municipios.length} municípios
          </div>
        </div>
      )}

      {/* ─── Gráficos ─── */}
      {!carregando && resp && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Ranking gasto MDE/aluno */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">Ranking — Gasto MDE por aluno</h3>
            <p className="mb-3 text-xs text-gray-400">Top 15 (decrescente). Despesa MDE liquidada / matrículas Censo.</p>
            <ChartRankingGasto
              dados={[...municipiosFiltrados]
                .filter((m) => m.gasto_aluno_mde !== null && m.gasto_aluno_mde > 0)
                .sort((a, b) => (b.gasto_aluno_mde ?? 0) - (a.gasto_aluno_mde ?? 0))
                .slice(0, 15)}
            />
          </div>

          {/* Scatter Gasto x IDEB */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">Gasto MDE × IDEB (composto)</h3>
            <p className="mb-3 text-xs text-gray-400">Outliers: gasta muito e tem IDEB baixo (alerta) ou gasta pouco e tem IDEB alto (eficiente).</p>
            <ChartScatterGastoIdeb
              dados={municipiosFiltrados.filter((m) => m.gasto_aluno_mde !== null && m.ideb_composite !== null)}
            />
          </div>
        </div>
      )}

      {/* ─── Tabela completa com ordenação ─── */}
      {!carregando && resp && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-100 px-4 py-2 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
            <strong className="text-gray-700 dark:text-gray-200">{municipiosOrdenados.length}</strong> municípios · Clique no cabeçalho para ordenar
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/50">
                  <Th col="nome"        ordemCol={ordemCol} ordemAsc={ordemAsc} onClick={toggleOrdem} align="left">Município</Th>
                  <Th col="matriculas"  ordemCol={ordemCol} ordemAsc={ordemAsc} onClick={toggleOrdem} align="center" color="text-purple-600">Matrículas</Th>
                  <Th col="mde"           ordemCol={ordemCol} ordemAsc={ordemAsc} onClick={toggleOrdem} align="right"  color="text-teal-600">Total MDE <span className="text-[9px] font-normal normal-case">(SICONFI)</span></Th>
                  <Th col="mde_tce"       ordemCol={ordemCol} ordemAsc={ordemAsc} onClick={toggleOrdem} align="right"  color="text-fuchsia-600">Total MDE <span className="text-[9px] font-normal normal-case">(SIPAC/TCE)</span></Th>
                  <Th col="divergencia"   ordemCol={ordemCol} ordemAsc={ordemAsc} onClick={toggleOrdem} align="right"  color="text-gray-600">Δ %</Th>
                  <Th col="despesa"       ordemCol={ordemCol} ordemAsc={ordemAsc} onClick={toggleOrdem} align="right"  color="text-cyan-600">Despesa Edu.</Th>
                  <Th col="gasto_mde"     ordemCol={ordemCol} ordemAsc={ordemAsc} onClick={toggleOrdem} align="right"  color="text-teal-700">MDE/Aluno <span className="text-[9px] font-normal normal-case">(SICONFI)</span></Th>
                  <Th col="gasto_mde_tce" ordemCol={ordemCol} ordemAsc={ordemAsc} onClick={toggleOrdem} align="right"  color="text-fuchsia-700">MDE/Aluno <span className="text-[9px] font-normal normal-case">(SIPAC/TCE)</span></Th>
                  <Th col="gasto_total"   ordemCol={ordemCol} ordemAsc={ordemAsc} onClick={toggleOrdem} align="right"  color="text-cyan-700">Edu/Aluno</Th>
                  <Th col="pct_tce"       ordemCol={ordemCol} ordemAsc={ordemAsc} onClick={toggleOrdem} align="right"  color="text-violet-600">% MDE <span className="text-[9px] font-normal normal-case">(TCE)</span></Th>
                  <Th col="ideb"          ordemCol={ordemCol} ordemAsc={ordemAsc} onClick={toggleOrdem} align="center" color="text-blue-600">IDEB</Th>
                  <Th col="custo_ideb"    ordemCol={ordemCol} ordemAsc={ordemAsc} onClick={toggleOrdem} align="right"  color="text-amber-600">Custo/IDEB</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {municipiosOrdenados.map((m) => (
                  <tr key={m.cod_municipio} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{m.nome ?? "—"}</td>
                    <td className="px-3 py-2 text-center text-purple-700 dark:text-purple-400">{fmtInt(m.total_matriculas)}</td>
                    <td className="px-3 py-2 text-right text-teal-700 dark:text-teal-400">{fmtBRL(m.total_mde)}</td>
                    <td className="px-3 py-2 text-right text-fuchsia-700 dark:text-fuchsia-400">{fmtBRL(m.total_mde_tce)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${getColorDivergencia(m.divergencia_mde_pct)}`}>{fmtDelta(m.divergencia_mde_pct)}</td>
                    <td className="px-3 py-2 text-right text-cyan-700 dark:text-cyan-400">{fmtBRL(m.total_despesa_educacao)}</td>
                    <td className="px-3 py-2 text-right font-bold text-teal-700 dark:text-teal-400">{fmtBRL(m.gasto_aluno_mde)}</td>
                    <td className="px-3 py-2 text-right font-bold text-fuchsia-700 dark:text-fuchsia-400">{fmtBRL(m.gasto_aluno_mde_tce)}</td>
                    <td className="px-3 py-2 text-right font-bold text-cyan-700 dark:text-cyan-400">{fmtBRL(m.gasto_aluno_educacao)}</td>
                    <td className="px-3 py-2 text-right text-violet-700 dark:text-violet-400">{m.pct_aplicado_mde_tce !== null ? `${m.pct_aplicado_mde_tce.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : "—"}</td>
                    <td className="px-3 py-2 text-center font-bold" style={{ color: getColorIdeb(m.ideb_composite) }}>{fmtNum(m.ideb_composite)}</td>
                    <td className="px-3 py-2 text-right text-amber-700 dark:text-amber-400">{fmtBRL(m.custo_por_ponto_ideb)}</td>
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

function Th({
  col, ordemCol, ordemAsc, onClick, align = "left", color = "text-gray-500", children,
}: {
  col: OrdemCol; ordemCol: OrdemCol; ordemAsc: boolean;
  onClick: (c: OrdemCol) => void;
  align?: "left" | "center" | "right";
  color?: string;
  children: React.ReactNode;
}) {
  const ativo = ordemCol === col;
  const seta = !ativo ? "↕" : ordemAsc ? "↑" : "↓";
  const alignClass = align === "left" ? "text-left" : align === "center" ? "text-center" : "text-right";
  return (
    <th
      className={`cursor-pointer select-none px-3 py-2 text-xs font-semibold uppercase tracking-wide hover:text-gray-700 dark:hover:text-gray-200 ${alignClass} ${color}`}
      onClick={() => onClick(col)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <span className={`text-[10px] ${ativo ? "text-gray-700 dark:text-gray-200" : "text-gray-300"}`}>{seta}</span>
      </span>
    </th>
  );
}

function ChartRankingGasto({ dados }: { dados: Municipio[] }) {
  const categorias = dados.map((d) => d.nome ?? String(d.cod_municipio));
  const valores    = dados.map((d) => d.gasto_aluno_mde ?? 0);
  const options: ApexOptions = {
    chart: { type: "bar", toolbar: { show: false }, fontFamily: "inherit" },
    colors: ["#0d9488"],
    plotOptions: { bar: { borderRadius: 3, horizontal: true, dataLabels: { position: "top" } } },
    dataLabels: { enabled: true,
      formatter: (v) => (typeof v === "number" ? `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}` : String(v)),
      offsetX: 60, style: { fontSize: "10px", colors: ["#374151"] } },
    xaxis: { categories: categorias,
      labels: { formatter: (v) => `R$ ${parseFloat(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`, style: { fontSize: "10px" } } },
    yaxis: { labels: { style: { fontSize: "10px" } } },
    grid: { borderColor: "#f0f0f0", strokeDashArray: 4 },
    tooltip: { y: { formatter: (v) => `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}` } },
  };
  return <Chart type="bar" options={options} series={[{ name: "Gasto MDE/Aluno", data: valores }]} height={400} />;
}

function ChartScatterGastoIdeb({ dados }: { dados: Municipio[] }) {
  const pontos = dados.map((m) => ({
    x: m.gasto_aluno_mde ?? 0,
    y: m.ideb_composite  ?? 0,
    nome: m.nome ?? String(m.cod_municipio),
  }));
  const options: ApexOptions = {
    chart: { type: "scatter", toolbar: { show: false }, fontFamily: "inherit", zoom: { enabled: false } },
    colors: ["#0d9488"],
    xaxis: {
      title: { text: "Gasto MDE / aluno (R$)", style: { fontSize: "11px" } },
      labels: { formatter: (v) => `R$ ${parseFloat(typeof v === "string" ? v : String(v)).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`, style: { fontSize: "10px" } },
    },
    yaxis: {
      title: { text: "IDEB (média etapas)", style: { fontSize: "11px" } },
      min: 0, max: 7,
      labels: { formatter: (v) => v.toFixed(1), style: { fontSize: "10px" } },
    },
    grid: { borderColor: "#f0f0f0", strokeDashArray: 4 },
    markers: { size: 7 },
    tooltip: {
      custom: ({ seriesIndex, dataPointIndex, w }: {
        seriesIndex: number; dataPointIndex: number;
        w: { config: { series: Array<{ data: Array<{ x: number; y: number; nome: string }> }> } };
      }) => {
        const p = w.config.series[seriesIndex].data[dataPointIndex];
        return `<div style="padding:6px 10px;font-size:12px"><strong>${p.nome}</strong><br/>Gasto: R$ ${p.x.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}<br/>IDEB: ${p.y.toFixed(1)}</div>`;
      },
    },
  };
  return <Chart type="scatter" options={options} series={[{ name: "Municípios", data: pontos }]} height={400} />;
}
