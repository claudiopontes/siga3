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
  return <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/40 dark:text-green-300">Baixo</span>;
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
// Barra simples (sem biblioteca)
// ---------------------------------------------------------------------------

function BarraSimples({ label, valor, max, cor }: { label: string; valor: number; max: number; cor: string }) {
  const pct = max > 0 ? Math.round((valor / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 truncate text-right text-xs text-slate-600 dark:text-slate-300">{label}</span>
      <div className="flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700" style={{ height: 10 }}>
        <div className={`h-full rounded-full ${cor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 shrink-0 text-xs font-semibold text-slate-700 dark:text-slate-200">{valor}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function VigilanciaEpidemiologicaClient() {
  const [resumo,     setResumo]     = useState<VigilanciaResumo | null>(null);
  const [alertas,    setAlertas]    = useState<VigilanciaAlerta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro,       setErro]       = useState<string | null>(null);

  // Filtros
  const [filtroMunicipio, setFiltroMunicipio] = useState("");
  const [filtroDoenca,    setFiltroDoenca]    = useState("todas");
  const [filtroNivel,     setFiltroNivel]     = useState("todos");
  const [filtroTipo,      setFiltroTipo]      = useState("todos");

  useEffect(() => {
    Promise.all([
      fetch("/api/alertas/vigilancia/resumo").then((r) => r.json()),
      fetch("/api/alertas/vigilancia/detalhes").then((r) => r.json()),
    ])
      .then(([res, als]) => {
        setResumo(res ?? null);
        setAlertas(Array.isArray(als) ? als : []);
      })
      .catch((e: unknown) => {
        setErro(e instanceof Error ? e.message : "Erro ao carregar dados.");
      })
      .finally(() => setCarregando(false));
  }, []);

  // Alertas filtrados (client-side)
  const alertasFiltrados = useMemo(() => {
    return alertas.filter((a) => {
      if (filtroNivel !== "todos"   && a.nivel   !== filtroNivel)   return false;
      if (filtroDoenca !== "todas"  && a.doenca  !== filtroDoenca)  return false;
      if (filtroTipo   !== "todos"  && a.tipo_alerta !== filtroTipo) return false;
      if (filtroMunicipio && !(a.nome_municipio ?? "").toLowerCase().includes(filtroMunicipio.toLowerCase())) return false;
      return true;
    });
  }, [alertas, filtroNivel, filtroDoenca, filtroTipo, filtroMunicipio]);

  // Ranking de municípios por total de alertas
  const rankingMunicipios = useMemo(() => {
    const map: Record<string, { nome: string; dengue: number; chikungunya: number; zika: number; total: number; maxNivel: number }> = {};
    for (const a of alertas) {
      const cod = a.codigo_municipio_ibge ?? "desconhecido";
      if (!map[cod]) map[cod] = { nome: a.nome_municipio ?? cod, dengue: 0, chikungunya: 0, zika: 0, total: 0, maxNivel: 0 };
      map[cod].total++;
      if (a.doenca === "dengue")       map[cod].dengue++;
      if (a.doenca === "chikungunya")  map[cod].chikungunya++;
      if (a.doenca === "zika")         map[cod].zika++;
      const np = a.prioridade ?? 99;
      if (np < map[cod].maxNivel || map[cod].maxNivel === 0) map[cod].maxNivel = np;
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [alertas]);

  // Distribuição por doença
  const distDoenca = useMemo(() => {
    const dengue      = alertas.filter((a) => a.doenca === "dengue").length;
    const chikungunya = alertas.filter((a) => a.doenca === "chikungunya").length;
    const zika        = alertas.filter((a) => a.doenca === "zika").length;
    return { dengue, chikungunya, zika, total: dengue + chikungunya + zika };
  }, [alertas]);

  // Distribuição por nível
  const distNivel = useMemo(() => {
    const critico = alertas.filter((a) => a.nivel === "CRITICO").length;
    const alto    = alertas.filter((a) => a.nivel === "ALTO").length;
    const medio   = alertas.filter((a) => a.nivel === "MEDIO").length;
    return { critico, alto, medio, total: critico + alto + medio };
  }, [alertas]);

  // Tipos únicos de alerta
  const tiposAlerta = useMemo(() => {
    const set = new Set(alertas.map((a) => a.tipo_alerta));
    return Array.from(set).sort();
  }, [alertas]);

  // Gráfico donut distribuição por nível (ApexCharts)
  const opcoesDonut: ApexOptions = {
    chart: { type: "donut", fontFamily: "inherit" },
    colors: ["#dc2626", "#f97316", "#eab308"],
    labels: ["Crítico", "Alto", "Médio"],
    legend: { position: "bottom", fontSize: "12px" },
    dataLabels: { enabled: true, formatter: (val: number) => `${Math.round(val)}%` },
    tooltip: { y: { formatter: (v) => `${v} alerta${v !== 1 ? "s" : ""}` } },
    plotOptions: { pie: { donut: { size: "65%" } } },
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

  const semVazio = !carregando && alertas.length === 0;

  return (
    <div className="space-y-5">


      {/* ── Estado vazio ── */}
      {semVazio && (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Nenhum alerta de arbovirose encontrado.</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            Os dados serão exibidos após a carga do InfoDengue para o período com alertas ativos.
          </p>
        </div>
      )}

      {/* ── Cards KPI ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {carregando ? (
          Array.from({ length: 7 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Total de alertas</p>
              <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">{fmtNum(resumo?.total_alertas ?? 0)}</p>
            </div>

            <div className={`rounded-xl border p-4 ${(resumo?.total_criticos ?? 0) > 0 ? "border-red-200 bg-white dark:border-red-800/40 dark:bg-gray-800" : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"}`}>
              <p className={`text-xs font-medium uppercase tracking-wide ${(resumo?.total_criticos ?? 0) > 0 ? "text-red-500" : "text-gray-400"}`}>Críticos</p>
              <p className={`mt-1 text-3xl font-bold ${(resumo?.total_criticos ?? 0) > 0 ? "text-red-600 dark:text-red-400" : "text-gray-700 dark:text-gray-300"}`}>{resumo?.total_criticos ?? 0}</p>
            </div>

            <div className={`rounded-xl border p-4 ${(resumo?.total_altos ?? 0) > 0 ? "border-orange-200 bg-white dark:border-orange-800/40 dark:bg-gray-800" : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"}`}>
              <p className={`text-xs font-medium uppercase tracking-wide ${(resumo?.total_altos ?? 0) > 0 ? "text-orange-500" : "text-gray-400"}`}>Altos</p>
              <p className={`mt-1 text-3xl font-bold ${(resumo?.total_altos ?? 0) > 0 ? "text-orange-600 dark:text-orange-400" : "text-gray-700 dark:text-gray-300"}`}>{resumo?.total_altos ?? 0}</p>
            </div>

            <div className={`rounded-xl border p-4 ${(resumo?.total_medios ?? 0) > 0 ? "border-yellow-200 bg-white dark:border-yellow-800/40 dark:bg-gray-800" : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"}`}>
              <p className={`text-xs font-medium uppercase tracking-wide ${(resumo?.total_medios ?? 0) > 0 ? "text-yellow-600" : "text-gray-400"}`}>Médios</p>
              <p className={`mt-1 text-3xl font-bold ${(resumo?.total_medios ?? 0) > 0 ? "text-yellow-600 dark:text-yellow-400" : "text-gray-700 dark:text-gray-300"}`}>{resumo?.total_medios ?? 0}</p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Municípios afetados</p>
              <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">{resumo?.total_municipios_afetados ?? 0}</p>
            </div>

            <div className="rounded-xl border border-rose-200 bg-white p-4 dark:border-rose-800/40 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wide text-rose-500">Doenças monitoradas</p>
              <p className="mt-1 text-3xl font-bold text-rose-600 dark:text-rose-400">{resumo?.total_doencas_monitoradas ?? 3}</p>
              <p className="mt-0.5 text-xs text-gray-400">dengue · chikungunya · zika</p>
            </div>

            {resumo?.semana_epidemiologica && (
              <div className="rounded-xl border border-blue-200 bg-white p-4 dark:border-blue-800/40 dark:bg-gray-800 col-span-2 sm:col-span-1">
                <p className="text-xs font-medium uppercase tracking-wide text-blue-400">Semana epidemiológica</p>
                <p className="mt-1 text-2xl font-bold text-blue-600 dark:text-blue-400">
                  SE {resumo.semana_epidemiologica}
                </p>
                <p className="mt-0.5 text-xs text-gray-400">{resumo.ano_epidemiologico}</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Distribuições (gráficos) ── */}
      {!carregando && alertas.length > 0 && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

          {/* Distribuição por nível — donut */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-700">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Distribuição por nível</h2>
              <p className="mt-0.5 text-xs text-slate-400">{distNivel.total} alertas no total</p>
            </div>
            {distNivel.total === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400">Sem alertas no período.</div>
            ) : (
              <div className="p-4">
                <Chart
                  type="donut"
                  height={220}
                  options={opcoesDonut}
                  series={[distNivel.critico, distNivel.alto, distNivel.medio]}
                />
              </div>
            )}
          </div>

          {/* Distribuição por doença — barras simples */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-700">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Distribuição por doença</h2>
              <p className="mt-0.5 text-xs text-slate-400">{distDoenca.total} alertas no total</p>
            </div>
            <div className="space-y-3 p-5">
              <BarraSimples label="Dengue"       valor={distDoenca.dengue}       max={distDoenca.total} cor="bg-rose-500" />
              <BarraSimples label="Chikungunya"  valor={distDoenca.chikungunya}  max={distDoenca.total} cor="bg-purple-500" />
              <BarraSimples label="Zika"         valor={distDoenca.zika}         max={distDoenca.total} cor="bg-amber-500" />
            </div>
          </div>

          {/* Ranking municípios — barras simples */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-700">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Municípios com mais alertas</h2>
              <p className="mt-0.5 text-xs text-slate-400">Top {Math.min(rankingMunicipios.length, 5)}</p>
            </div>
            <div className="space-y-3 p-5">
              {rankingMunicipios.slice(0, 5).map((m) => (
                <BarraSimples
                  key={m.nome}
                  label={abreviarMunicipio(m.nome)}
                  valor={m.total}
                  max={rankingMunicipios[0]?.total ?? 1}
                  cor="bg-slate-500"
                />
              ))}
              {rankingMunicipios.length === 0 && (
                <p className="text-center text-sm text-gray-400">Sem dados.</p>
              )}
            </div>
          </div>

        </div>
      )}

      {/* ── Ranking detalhado de municípios ── */}
      {!carregando && rankingMunicipios.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-700">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Ranking de municípios por alertas</h2>
            <p className="mt-0.5 text-xs text-slate-400">Ordenado pelo total de alertas de arboviroses</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Município</th>
                  <th className="px-4 py-3 text-center">Dengue</th>
                  <th className="px-4 py-3 text-center">Chikungunya</th>
                  <th className="px-4 py-3 text-center">Zika</th>
                  <th className="px-4 py-3 text-center">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {rankingMunicipios.map((m, i) => (
                  <tr key={m.nome} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                    <td className="px-4 py-3 text-xs text-slate-400">{i + 1}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{m.nome}</td>
                    <td className="px-4 py-3 text-center">
                      {m.dengue > 0 ? <span className="font-semibold text-rose-600 dark:text-rose-400">{m.dengue}</span> : <span className="text-slate-300 dark:text-slate-600">0</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {m.chikungunya > 0 ? <span className="font-semibold text-purple-600 dark:text-purple-400">{m.chikungunya}</span> : <span className="text-slate-300 dark:text-slate-600">0</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {m.zika > 0 ? <span className="font-semibold text-amber-600 dark:text-amber-400">{m.zika}</span> : <span className="text-slate-300 dark:text-slate-600">0</span>}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-slate-700 dark:text-slate-200">{m.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tabela de alertas com filtros ── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Alertas de arboviroses</h2>
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
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-rose-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
              />
              <select
                value={filtroDoenca}
                onChange={(e) => setFiltroDoenca(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-rose-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
              >
                <option value="todas">Todas as doenças</option>
                <option value="dengue">Dengue</option>
                <option value="chikungunya">Chikungunya</option>
                <option value="zika">Zika</option>
              </select>
              <select
                value={filtroNivel}
                onChange={(e) => setFiltroNivel(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-rose-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
              >
                <option value="todos">Todos os níveis</option>
                <option value="CRITICO">Crítico</option>
                <option value="ALTO">Alto</option>
                <option value="MEDIO">Médio</option>
              </select>
              {tiposAlerta.length > 0 && (
                <select
                  value={filtroTipo}
                  onChange={(e) => setFiltroTipo(e.target.value)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-rose-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
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
          <div className="p-6 text-center text-sm text-gray-400">
            {alertas.length === 0
              ? "Nenhum alerta de arbovirose ativo no período carregado."
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
                  <th className="px-4 py-3 text-center">Ano</th>
                  <th className="px-4 py-3 text-center">SE</th>
                  <th className="px-4 py-3">Val. observado</th>
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
                    <td className="px-4 py-3"><DoencaBadge doenca={a.doenca} /></td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{a.tipo_alerta}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{a.descricao}</td>
                    <td className="px-4 py-3 text-center text-slate-500 dark:text-slate-400">{a.ano_epidemiologico ?? "—"}</td>
                    <td className="px-4 py-3 text-center text-slate-500 dark:text-slate-400">{a.semana_epidemiologica ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {a.valor_observado !== null ? fmtNum(a.valor_observado) : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {a.valor_referencia !== null ? fmtNum(a.valor_referencia) : "—"}
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
