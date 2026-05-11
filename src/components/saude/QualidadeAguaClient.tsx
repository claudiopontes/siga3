"use client";

import React, { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { ApexOptions } from "apexcharts";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface MunicipioSisagua {
  codigo_municipio_ibge:          string;
  nome_municipio:                 string | null;
  sisagua_total_amostras:         number | null;
  sisagua_total_fora_padrao:      number | null;
  sisagua_total_ecoli:            number | null;
  sisagua_total_coliformes:       number | null;
  sisagua_percentual_fora_padrao: number | null;
  sisagua_data_ultima_coleta:     string | null;
  nivel_risco:                    string | null;
  score_risco:                    number;
}

interface SisaguaAlerta {
  id_alerta:             number | null;
  area:                  string;
  fonte:                 string;
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

function fmtNum(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return Number(v).toLocaleString("pt-BR");
}

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function fmtData(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
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
  if (n === "SEM_DADOS")
    return <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500 dark:bg-gray-700 dark:text-gray-400">S/ dados</span>;
  return <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/40 dark:text-green-300">Baixo</span>;
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
// Componente principal
// ---------------------------------------------------------------------------

export default function QualidadeAguaClient() {
  const [municipios, setMunicipios] = useState<MunicipioSisagua[]>([]);
  const [alertas, setAlertas] = useState<SisaguaAlerta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Filtros de alertas
  const [filtroMunicipio, setFiltroMunicipio] = useState("");
  const [filtroNivel, setFiltroNivel] = useState("todos");
  const [filtroTipo, setFiltroTipo] = useState("todos");

  useEffect(() => {
    Promise.all([
      fetch("/api/saude/municipios?orderBy=score_risco&orderDir=desc&pageSize=50").then((r) => r.json()),
      fetch("/api/alertas/sisagua/detalhes").then((r) => r.json()),
    ])
      .then(([muns, als]) => {
        setMunicipios(Array.isArray(muns) ? muns : []);
        setAlertas(Array.isArray(als) ? als : []);
      })
      .catch((e: unknown) => {
        setErro(e instanceof Error ? e.message : "Erro ao carregar dados.");
      })
      .finally(() => setCarregando(false));
  }, []);

  // Apenas municípios com dados SISAGUA
  const munComDados = useMemo(
    () => municipios.filter((m) => (m.sisagua_total_amostras ?? 0) > 0),
    [municipios]
  );

  // Métricas agregadas
  const metricas = useMemo(() => {
    const totalAmostras   = munComDados.reduce((s, m) => s + (m.sisagua_total_amostras ?? 0), 0);
    const totalForaPadrao = munComDados.reduce((s, m) => s + (m.sisagua_total_fora_padrao ?? 0), 0);
    const totalEcoli      = munComDados.reduce((s, m) => s + (m.sisagua_total_ecoli ?? 0), 0);
    const totalColiformes = munComDados.reduce((s, m) => s + (m.sisagua_total_coliformes ?? 0), 0);
    const municipiosAfetados = munComDados.filter((m) => (m.sisagua_total_fora_padrao ?? 0) > 0).length;
    const datas = munComDados.map((m) => m.sisagua_data_ultima_coleta).filter(Boolean) as string[];
    const ultimaColeta = datas.length > 0 ? datas.sort((a, b) => b.localeCompare(a))[0] : null;
    return { totalAmostras, totalForaPadrao, totalEcoli, totalColiformes, municipiosAfetados, ultimaColeta };
  }, [munComDados]);

  // Gráfico: fora do padrão por município (top 15)
  const dadosGraficoFora = useMemo(() => {
    const top = [...munComDados]
      .filter((m) => (m.sisagua_total_fora_padrao ?? 0) > 0)
      .sort((a, b) => (b.sisagua_total_fora_padrao ?? 0) - (a.sisagua_total_fora_padrao ?? 0))
      .slice(0, 15);
    return {
      categorias: top.map((m) => abreviarMunicipio(m.nome_municipio)),
      foraPadrao: top.map((m) => m.sisagua_total_fora_padrao ?? 0),
    };
  }, [munComDados]);

  // Gráfico: E. coli e coliformes por município (top 15)
  const dadosGraficoContaminantes = useMemo(() => {
    const top = [...munComDados]
      .filter((m) => (m.sisagua_total_ecoli ?? 0) > 0 || (m.sisagua_total_coliformes ?? 0) > 0)
      .sort((a, b) => ((b.sisagua_total_ecoli ?? 0) + (b.sisagua_total_coliformes ?? 0)) - ((a.sisagua_total_ecoli ?? 0) + (a.sisagua_total_coliformes ?? 0)))
      .slice(0, 15);
    return {
      categorias: top.map((m) => abreviarMunicipio(m.nome_municipio)),
      ecoli: top.map((m) => m.sisagua_total_ecoli ?? 0),
      coliformes: top.map((m) => m.sisagua_total_coliformes ?? 0),
    };
  }, [munComDados]);

  // Alertas filtrados
  const alertasFiltrados = useMemo(() => {
    return alertas.filter((a) => {
      if (filtroNivel !== "todos" && a.nivel !== filtroNivel) return false;
      if (filtroTipo !== "todos" && a.tipo_alerta !== filtroTipo) return false;
      if (filtroMunicipio && !(a.nome_municipio ?? "").toLowerCase().includes(filtroMunicipio.toLowerCase())) return false;
      return true;
    });
  }, [alertas, filtroNivel, filtroTipo, filtroMunicipio]);

  // Tipos únicos de alerta para o filtro
  const tiposAlerta = useMemo(() => {
    const set = new Set(alertas.map((a) => a.tipo_alerta));
    return Array.from(set).sort();
  }, [alertas]);

  // ---------------------------------------------------------------------------
  // Opções ApexCharts
  // ---------------------------------------------------------------------------

  const opcoesBarraFora: ApexOptions = {
    chart: { type: "bar", toolbar: { show: false }, fontFamily: "inherit" },
    colors: ["#f97316"],
    plotOptions: { bar: { borderRadius: 4, horizontal: false } },
    dataLabels: { enabled: false },
    xaxis: { categories: dadosGraficoFora.categorias, labels: { style: { fontSize: "10px" }, rotate: -35 } },
    yaxis: { labels: { style: { fontSize: "11px" } } },
    tooltip: { y: { formatter: (v) => `${v.toLocaleString("pt-BR")} amostras` } },
    grid: { borderColor: "#f0f0f0", strokeDashArray: 4 },
  };

  const opcoesBarraContaminantes: ApexOptions = {
    chart: { type: "bar", toolbar: { show: false }, fontFamily: "inherit", stacked: false },
    colors: ["#dc2626", "#f97316"],
    plotOptions: { bar: { borderRadius: 4, horizontal: false, columnWidth: "60%" } },
    dataLabels: { enabled: false },
    xaxis: { categories: dadosGraficoContaminantes.categorias, labels: { style: { fontSize: "10px" }, rotate: -35 } },
    yaxis: { labels: { style: { fontSize: "11px" } } },
    legend: { position: "top", fontSize: "12px" },
    tooltip: { y: { formatter: (v) => `${v.toLocaleString("pt-BR")} registros` } },
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

      {/* ── Cards KPI ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {carregando ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 dark:border-cyan-800/40 dark:bg-cyan-900/10">
              <p className="text-xs font-medium uppercase tracking-wide text-cyan-600 dark:text-cyan-400">Total de amostras</p>
              <p className="mt-1 text-2xl font-bold text-cyan-700 dark:text-cyan-300">{fmtNum(metricas.totalAmostras)}</p>
            </div>
            <div className={`rounded-xl border p-4 ${metricas.totalForaPadrao > 0 ? "border-orange-200 bg-orange-50 dark:border-orange-800/40 dark:bg-orange-900/10" : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"}`}>
              <p className={`text-xs font-medium uppercase tracking-wide ${metricas.totalForaPadrao > 0 ? "text-orange-600 dark:text-orange-400" : "text-gray-400"}`}>Fora do padrão</p>
              <p className={`mt-1 text-2xl font-bold ${metricas.totalForaPadrao > 0 ? "text-orange-700 dark:text-orange-300" : "text-gray-700 dark:text-gray-200"}`}>{fmtNum(metricas.totalForaPadrao)}</p>
              <p className="text-xs text-gray-400">amostras</p>
            </div>
            <div className={`rounded-xl border p-4 ${metricas.totalEcoli > 0 ? "border-red-200 bg-red-50 dark:border-red-800/40 dark:bg-red-900/10" : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"}`}>
              <p className={`text-xs font-medium uppercase tracking-wide ${metricas.totalEcoli > 0 ? "text-red-600 dark:text-red-400" : "text-gray-400"}`}>E. coli</p>
              <p className={`mt-1 text-2xl font-bold ${metricas.totalEcoli > 0 ? "text-red-700 dark:text-red-300" : "text-gray-700 dark:text-gray-200"}`}>{fmtNum(metricas.totalEcoli)}</p>
              <p className="text-xs text-gray-400">registros</p>
            </div>
            <div className={`rounded-xl border p-4 ${metricas.totalColiformes > 0 ? "border-orange-200 bg-orange-50 dark:border-orange-800/40 dark:bg-orange-900/10" : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"}`}>
              <p className={`text-xs font-medium uppercase tracking-wide ${metricas.totalColiformes > 0 ? "text-orange-600 dark:text-orange-400" : "text-gray-400"}`}>Coliformes</p>
              <p className={`mt-1 text-2xl font-bold ${metricas.totalColiformes > 0 ? "text-orange-700 dark:text-orange-300" : "text-gray-700 dark:text-gray-200"}`}>{fmtNum(metricas.totalColiformes)}</p>
              <p className="text-xs text-gray-400">registros</p>
            </div>
            <div className={`rounded-xl border p-4 ${metricas.municipiosAfetados > 0 ? "border-orange-200 bg-orange-50 dark:border-orange-800/40 dark:bg-orange-900/10" : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"}`}>
              <p className={`text-xs font-medium uppercase tracking-wide ${metricas.municipiosAfetados > 0 ? "text-orange-600 dark:text-orange-400" : "text-gray-400"}`}>Municípios afetados</p>
              <p className={`mt-1 text-2xl font-bold ${metricas.municipiosAfetados > 0 ? "text-orange-700 dark:text-orange-300" : "text-gray-700 dark:text-gray-200"}`}>{metricas.municipiosAfetados}</p>
              <p className="text-xs text-gray-400">com fora do padrão</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Última coleta</p>
              <p className="mt-1 text-sm font-bold text-gray-700 dark:text-gray-200">
                {metricas.ultimaColeta ? fmtData(metricas.ultimaColeta) : "—"}
              </p>
            </div>
          </>
        )}
      </div>

      {/* ── Gráficos ── */}
      {!carregando && munComDados.length > 0 && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

          {/* Fora do padrão por município */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-700">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Amostras fora do padrão por município</h2>
              <p className="mt-0.5 text-xs text-slate-400">Top municípios com maior número de amostras irregulares</p>
            </div>
            {dadosGraficoFora.categorias.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400">Sem registros fora do padrão.</div>
            ) : (
              <div className="p-4">
                <Chart
                  type="bar"
                  height={260}
                  options={opcoesBarraFora}
                  series={[{ name: "Fora do padrão", data: dadosGraficoFora.foraPadrao }]}
                />
              </div>
            )}
          </div>

          {/* E. coli e coliformes por município */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-700">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">E. coli e coliformes por município</h2>
              <p className="mt-0.5 text-xs text-slate-400">Indicadores de contaminação bacteriológica</p>
            </div>
            {dadosGraficoContaminantes.categorias.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400">Sem registros de contaminantes.</div>
            ) : (
              <div className="p-4">
                <Chart
                  type="bar"
                  height={260}
                  options={opcoesBarraContaminantes}
                  series={[
                    { name: "E. coli", data: dadosGraficoContaminantes.ecoli },
                    { name: "Coliformes", data: dadosGraficoContaminantes.coliformes },
                  ]}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tabela: municípios com maior risco ── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Municípios — risco na qualidade da água</h2>
          <p className="mt-0.5 text-xs text-slate-400">Ordenado por fora do padrão e presença de contaminantes</p>
        </div>
        {carregando ? (
          <div className="p-6 text-center text-sm text-gray-400">Carregando...</div>
        ) : municipios.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400">Sem dados SISAGUA carregados.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
                  <th className="px-4 py-3">Município</th>
                  <th className="px-4 py-3">Total amostras</th>
                  <th className="px-4 py-3">Fora do padrão</th>
                  <th className="px-4 py-3">E. coli</th>
                  <th className="px-4 py-3">Coliformes</th>
                  <th className="px-4 py-3">% fora</th>
                  <th className="px-4 py-3">Última coleta</th>
                  <th className="px-4 py-3">Risco</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {[...municipios]
                  .sort((a, b) => {
                    // Sem dados vai para o final
                    const aSemDados = (a.sisagua_total_amostras ?? 0) === 0;
                    const bSemDados = (b.sisagua_total_amostras ?? 0) === 0;
                    if (aSemDados !== bSemDados) return aSemDados ? 1 : -1;
                    return (b.sisagua_total_fora_padrao ?? 0) - (a.sisagua_total_fora_padrao ?? 0);
                  })
                  .map((m) => (
                    <tr key={m.codigo_municipio_ibge} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800 dark:text-slate-100">
                        {m.nome_municipio ?? m.codigo_municipio_ibge}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{fmtNum(m.sisagua_total_amostras)}</td>
                      <td className="px-4 py-3">
                        {(m.sisagua_total_fora_padrao ?? 0) > 0 ? (
                          <span className="font-semibold text-orange-600 dark:text-orange-400">{fmtNum(m.sisagua_total_fora_padrao)}</span>
                        ) : <span className="text-slate-400">0</span>}
                      </td>
                      <td className="px-4 py-3">
                        {(m.sisagua_total_ecoli ?? 0) > 0 ? (
                          <span className="font-bold text-red-600 dark:text-red-400">{fmtNum(m.sisagua_total_ecoli)}</span>
                        ) : <span className="text-slate-400">0</span>}
                      </td>
                      <td className="px-4 py-3">
                        {(m.sisagua_total_coliformes ?? 0) > 0 ? (
                          <span className="font-semibold text-orange-600 dark:text-orange-400">{fmtNum(m.sisagua_total_coliformes)}</span>
                        ) : <span className="text-slate-400">0</span>}
                      </td>
                      <td className="px-4 py-3">
                        {(m.sisagua_percentual_fora_padrao ?? 0) > 0 ? (
                          <span className="font-semibold text-orange-600 dark:text-orange-400">{fmtPct(m.sisagua_percentual_fora_padrao)}</span>
                        ) : <span className="text-slate-400">{fmtPct(m.sisagua_percentual_fora_padrao)}</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{fmtData(m.sisagua_data_ultima_coleta)}</td>
                      <td className="px-4 py-3"><NivelBadge nivel={
                          (m.sisagua_total_amostras ?? 0) === 0 ? "SEM_DADOS"
                        : (m.sisagua_total_ecoli ?? 0) > 0 ? "CRITICO"
                        : (m.sisagua_total_fora_padrao ?? 0) > 0 ? "ALTO"
                        : "BAIXO"
                      } /></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Tabela de alertas SISAGUA ── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Alertas SISAGUA</h2>
              <p className="mt-0.5 text-xs text-slate-400">
                {alertasFiltrados.length} alerta{alertasFiltrados.length !== 1 ? "s" : ""} encontrado{alertasFiltrados.length !== 1 ? "s" : ""}
              </p>
            </div>
            {/* Filtros */}
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                placeholder="Município..."
                value={filtroMunicipio}
                onChange={(e) => setFiltroMunicipio(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
              />
              <select
                value={filtroNivel}
                onChange={(e) => setFiltroNivel(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
              >
                <option value="todos">Todos os níveis</option>
                <option value="CRITICO">Crítico</option>
                <option value="ALTO">Alto</option>
                <option value="MEDIO">Médio</option>
                <option value="BAIXO">Baixo</option>
              </select>
              {tiposAlerta.length > 0 && (
                <select
                  value={filtroTipo}
                  onChange={(e) => setFiltroTipo(e.target.value)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                >
                  <option value="todos">Todos os tipos</option>
                  {tiposAlerta.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>

        {carregando ? (
          <div className="p-6 text-center text-sm text-gray-400">Carregando...</div>
        ) : alertasFiltrados.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400">Nenhum alerta encontrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
                  <th className="px-4 py-3">Nível</th>
                  <th className="px-4 py-3">Município</th>
                  <th className="px-4 py-3">Tipo de alerta</th>
                  <th className="px-4 py-3">Descrição</th>
                  <th className="px-4 py-3">Valor observado</th>
                  <th className="px-4 py-3">Referência</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {alertasFiltrados.map((a, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                    <td className="px-4 py-3"><NivelBadge nivel={a.nivel} /></td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700 dark:text-slate-200">
                      {a.nome_municipio ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">
                      {a.tipo_alerta}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{a.descricao}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {a.valor_observado !== null ? fmtPct(Number(a.valor_observado)) : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {a.valor_referencia !== null ? fmtPct(Number(a.valor_referencia)) : "—"}
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
