"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";
import MapaEducacao from "./MapaEducacao";
import type { Municipio, DadosMunicipioIdeb } from "@/components/Maps/MapaAcreContent";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface ApiMunicipio extends DadosMunicipioIdeb {}

interface ApiResp {
  edicoes: number[];
  edicao: number | null;
  municipios: ApiMunicipio[];
  kpis: {
    total_municipios: number;
    ideb_medio_ai: number | null;
    ideb_medio_af: number | null;
    ideb_medio_em: number | null;
    ideb_medio_composite: number | null;
    municipios_atingiram_meta: number;
    melhor: { nome: string | null; valor: number } | null;
    pior: { nome: string | null; valor: number } | null;
  } | null;
  evolucao: Array<{ ano: number; ai: number | null; af: number | null; em: number | null }>;
  atualizado_em: string | null;
  fonte: string;
}

type MetricaMapa = "composite" | "AI" | "AF" | "EM" | "APROV_FUND" | "ABANDONO_FUND";
type ViewMode = "mapa" | "lista" | "analise";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number | null | undefined, decimais = 1): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: decimais, maximumFractionDigits: decimais });
}

/** Quando a métrica do mapa é uma taxa (aprov/abandono), reusa o slot ideb_composite do dado para colorir. */
function dadosParaMapa(municipios: ApiMunicipio[], metrica: MetricaMapa): Record<string, DadosMunicipioIdeb> {
  const out: Record<string, DadosMunicipioIdeb> = {};
  for (const m of municipios) {
    let composite = m.ideb_composite ?? null;
    if (metrica === "APROV_FUND") {
      const v = m.aprovacao_fund_total ?? null;
      composite = v !== null ? v / 20 : null; // mapeia 0-100% para escala IDEB 0-5+ aproximada
    } else if (metrica === "ABANDONO_FUND") {
      const v = m.abandono_fund_total ?? null;
      // invertido: abandono baixo = bom (verde). 0% → 5.0; 5% → 4.0; 10% → 3.0...
      composite = v !== null ? Math.max(0, 5 - v / 2.5) : null;
    }
    out[m.codigo_ibge] = { ...m, ideb_composite: composite };
  }
  return out;
}

function getColorIdeb(ideb: number | null): string {
  if (ideb === null) return "#cbd5e1";
  if (ideb >= 5.0) return "#22c55e";
  if (ideb >= 4.5) return "#84cc16";
  if (ideb >= 4.0) return "#eab308";
  if (ideb >= 3.5) return "#f97316";
  return "#ef4444";
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

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

export default function PainelEducacaoClient() {
  const [resp, setResp] = useState<ApiResp | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [edicaoSel, setEdicaoSel] = useState<number | null>(null);
  const [metricaMapa, setMetricaMapa] = useState<MetricaMapa>("composite");
  const [viewMode, setViewMode] = useState<ViewMode>("mapa");
  const [filtroNome, setFiltroNome] = useState("");
  const [detalhe, setDetalhe] = useState<Municipio | null>(null);

  // Carga inicial (último ano)
  useEffect(() => {
    setCarregando(true);
    const url = edicaoSel ? `/api/educacao/mapa-acre?edicao=${edicaoSel}` : "/api/educacao/mapa-acre";
    fetch(url)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d: ApiResp) => {
        setResp(d);
        if (edicaoSel === null && d.edicao) setEdicaoSel(d.edicao);
      })
      .catch((e) => setErro(String(e)))
      .finally(() => setCarregando(false));
  }, [edicaoSel]);

  const dadosMapa = useMemo(
    () => resp ? dadosParaMapa(resp.municipios, metricaMapa) : {},
    [resp, metricaMapa],
  );

  const municipiosFiltrados = useMemo(() => {
    if (!resp) return [];
    if (!filtroNome.trim()) return resp.municipios;
    const q = filtroNome.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    return resp.municipios.filter((m) =>
      (m.nome ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(q),
    );
  }, [resp, filtroNome]);

  if (erro) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
        Erro ao carregar dados: {erro}
      </div>
    );
  }

  const kpis = resp?.kpis;
  const aprovMedia    = resp ? media(resp.municipios.map((m) => m.aprovacao_fund_total ?? null)) : null;
  const abandonoMedio = resp ? media(resp.municipios.map((m) => m.abandono_fund_total ?? null)) : null;

  return (
    <div className="space-y-4">
      {/* ─── KPIs ─── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {carregando ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Municípios</p>
              <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">{kpis?.total_municipios ?? 0}</p>
              <p className="mt-1 text-[10px] text-gray-400">Edição IDEB {resp?.edicao ?? "—"}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-white p-4 dark:border-emerald-800/40 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-500">IDEB — Anos Iniciais</p>
              <p className="mt-1 text-3xl font-bold" style={{ color: getColorIdeb(kpis?.ideb_medio_ai ?? null) }}>{fmt(kpis?.ideb_medio_ai)}</p>
              <p className="mt-1 text-[10px] text-gray-400">Meta média {fmt(kpis?.ideb_medio_ai ?? null)}</p>
            </div>
            <div className="rounded-xl border border-blue-200 bg-white p-4 dark:border-blue-800/40 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wide text-blue-500">IDEB — Anos Finais</p>
              <p className="mt-1 text-3xl font-bold" style={{ color: getColorIdeb(kpis?.ideb_medio_af ?? null) }}>{fmt(kpis?.ideb_medio_af)}</p>
              <p className="mt-1 text-[10px] text-gray-400">Rede pública</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-white p-4 dark:border-amber-800/40 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wide text-amber-600">Aprovação Fund.</p>
              <p className="mt-1 text-3xl font-bold text-amber-700 dark:text-amber-400">{fmt(aprovMedia)}%</p>
              <p className="mt-1 text-[10px] text-gray-400">Média estadual</p>
            </div>
            <div className="rounded-xl border border-red-200 bg-white p-4 dark:border-red-800/40 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wide text-red-500">Abandono Fund.</p>
              <p className="mt-1 text-3xl font-bold text-red-600 dark:text-red-400">{fmt(abandonoMedio)}%</p>
              <p className="mt-1 text-[10px] text-gray-400">Quanto menor, melhor</p>
            </div>
          </>
        )}
      </div>

      {/* ─── Toolbar (filtros + toggle) ─── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {/* Toggle de view */}
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-100 p-1 dark:border-gray-700 dark:bg-gray-800">
            {(["mapa", "lista", "analise"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                  viewMode === mode
                    ? "bg-white text-brand-600 shadow dark:bg-gray-700 dark:text-brand-400"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
                }`}
              >
                {mode === "mapa" ? "Mapa" : mode === "lista" ? "Lista" : "Análise"}
              </button>
            ))}
          </div>

          {/* Filtro de período (edição IDEB) */}
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500 dark:text-gray-400">Período IDEB:</label>
            <select
              value={edicaoSel ?? ""}
              onChange={(e) => setEdicaoSel(parseInt(e.target.value, 10))}
              disabled={!resp || resp.edicoes.length === 0}
              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-700 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
            >
              {resp?.edicoes.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          {viewMode === "mapa" && (
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500 dark:text-gray-400">Colorir por:</label>
              <select
                value={metricaMapa}
                onChange={(e) => setMetricaMapa(e.target.value as MetricaMapa)}
                className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-700 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
              >
                <option value="composite">IDEB (média etapas)</option>
                <option value="AI">IDEB — Anos Iniciais</option>
                <option value="AF">IDEB — Anos Finais</option>
                <option value="EM">IDEB — Ensino Médio</option>
                <option value="APROV_FUND">Aprovação Fund.</option>
                <option value="ABANDONO_FUND">Abandono Fund. (invertido)</option>
              </select>
            </div>
          )}

          {viewMode === "lista" && (
            <input
              type="text"
              placeholder="Buscar município…"
              value={filtroNome}
              onChange={(e) => setFiltroNome(e.target.value)}
              className="w-48 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          )}
        </div>
      </div>

      {/* ─── View: Mapa ─── */}
      {viewMode === "mapa" && (
        <div
          className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
          style={{ height: 480, isolation: "isolate" }}
        >
          {carregando ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
            </div>
          ) : (
            <MapaEducacao
              dados={dadosMapa}
              etapa={metricaMapa === "composite" || metricaMapa === "AI" || metricaMapa === "AF" || metricaMapa === "EM" ? metricaMapa : "composite"}
              onSelect={(m) => m && setDetalhe(m)}
            />
          )}
        </div>
      )}

      {/* ─── View: Lista ─── */}
      {viewMode === "lista" && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/50">
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Município</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">IDEB AI</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">IDEB AF</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">IDEB EM</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-emerald-600">Aprov. Fund.</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-orange-600">Reprov. Fund.</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-red-600">Abandono Fund.</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {carregando
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}>{Array.from({ length: 8 }).map((__, j) => (
                        <td key={j} className="px-3 py-2"><div className="h-4 animate-pulse rounded bg-gray-100 dark:bg-gray-700" /></td>
                      ))}</tr>
                    ))
                  : municipiosFiltrados.map((m) => (
                      <tr key={m.codigo_ibge} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{m.nome ?? "—"}</td>
                        <td className="px-3 py-2 text-center font-bold" style={{ color: getColorIdeb(m.ideb_ai ?? null) }}>{fmt(m.ideb_ai)}</td>
                        <td className="px-3 py-2 text-center font-bold" style={{ color: getColorIdeb(m.ideb_af ?? null) }}>{fmt(m.ideb_af)}</td>
                        <td className="px-3 py-2 text-center font-bold" style={{ color: getColorIdeb(m.ideb_em ?? null) }}>{fmt(m.ideb_em)}</td>
                        <td className="px-3 py-2 text-center text-emerald-700 dark:text-emerald-400">{fmt(m.aprovacao_fund_total)}%</td>
                        <td className="px-3 py-2 text-center text-orange-700 dark:text-orange-400">{fmt(m.reprovacao_fund_total)}%</td>
                        <td className="px-3 py-2 text-center text-red-700 dark:text-red-400">{fmt(m.abandono_fund_total)}%</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => abrirDetalheDaLista(m, setDetalhe)}
                            className="rounded-lg border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                          >Detalhar</button>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── View: Análise ─── */}
      {viewMode === "analise" && resp && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Evolução estadual */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">Evolução estadual do IDEB</h3>
            <p className="mb-3 text-xs text-gray-400">Média dos 22 municípios (rede Pública), por edição.</p>
            <ChartEvolucao evolucao={resp.evolucao} />
          </div>

          {/* Top IDEB AF */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
              Top municípios — IDEB Anos Finais ({resp.edicao})
            </h3>
            <ChartBarras
              municipios={[...resp.municipios].filter((m) => m.ideb_af !== null).sort((a, b) => (b.ideb_af ?? 0) - (a.ideb_af ?? 0)).slice(0, 10)}
              valor={(m) => m.ideb_af ?? 0}
              max={7}
              corPositiva
            />
          </div>

          {/* Maiores abandonos */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
              Maiores taxas de abandono — Ensino Fundamental
            </h3>
            <p className="mb-3 text-xs text-gray-400">Quanto menor, melhor. Top 10 piores.</p>
            <ChartBarras
              municipios={[...resp.municipios].filter((m) => m.abandono_fund_total !== null).sort((a, b) => (b.abandono_fund_total ?? 0) - (a.abandono_fund_total ?? 0)).slice(0, 10)}
              valor={(m) => m.abandono_fund_total ?? 0}
              max={Math.max(10, ...resp.municipios.map((m) => m.abandono_fund_total ?? 0))}
              corPositiva={false}
            />
          </div>

          {/* Aprovação x IDEB AF (scatter simples como bar combo) */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
              IDEB Anos Finais × Aprovação Fund.
            </h3>
            <p className="mb-3 text-xs text-gray-400">Cruzamento gasto/qualidade × fluxo (rendimento).</p>
            <ChartScatter
              municipios={resp.municipios.filter((m) => m.ideb_af !== null && m.aprovacao_fund_total !== null)}
            />
          </div>
        </div>
      )}

      {/* ─── Modal detalhe ─── */}
      {detalhe && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" style={{ zIndex: 99999 }}
          onClick={(e) => { if (e.target === e.currentTarget) setDetalhe(null); }}
        >
          <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-start justify-between border-b border-gray-200 px-5 py-3 dark:border-gray-700">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white">{detalhe.nome}</h2>
                <p className="text-xs text-gray-400">Cód. IBGE {detalhe.codIBGE}{detalhe.populacao !== null ? ` · Pop. ${detalhe.populacao.toLocaleString("pt-BR")}` : ""}</p>
              </div>
              <button onClick={() => setDetalhe(null)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700">✕</button>
            </div>
            <div className="space-y-4 p-5 text-sm">
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">IDEB {detalhe.edicao_ideb ?? ""} — rede Pública</h3>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase text-gray-400"><th>Etapa</th><th className="text-right">Observado</th><th className="text-right">Meta</th><th className="text-right">Δ</th></tr>
                  </thead>
                  <tbody>
                    {([
                      { label: "Anos Iniciais", obs: detalhe.ideb_ai, meta: detalhe.meta_ai },
                      { label: "Anos Finais",   obs: detalhe.ideb_af, meta: detalhe.meta_af },
                      { label: "Ensino Médio",  obs: detalhe.ideb_em, meta: detalhe.meta_em },
                    ] as const).map((e) => {
                      const delta = (e.obs !== null && e.meta !== null) ? e.obs - e.meta : null;
                      return (
                        <tr key={e.label} className="border-t border-gray-100 dark:border-gray-700">
                          <td className="py-1.5">{e.label}</td>
                          <td className="py-1.5 text-right font-bold" style={{ color: getColorIdeb(e.obs) }}>{fmt(e.obs)}</td>
                          <td className="py-1.5 text-right text-gray-500">{fmt(e.meta)}</td>
                          <td className="py-1.5 text-right font-medium" style={{ color: delta === null ? "#9ca3af" : delta >= 0 ? "#16a34a" : "#dc2626" }}>
                            {delta === null ? "—" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>

              {detalhe.ano_rendimento !== null && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Rendimento {detalhe.ano_rendimento} — Ensino Fundamental</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-center dark:border-emerald-800/30 dark:bg-emerald-900/10">
                      <p className="text-[10px] uppercase text-emerald-600">Aprovação</p>
                      <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{fmt(detalhe.aprovacao_fund_total)}%</p>
                    </div>
                    <div className="rounded-lg border border-orange-200 bg-orange-50/50 p-3 text-center dark:border-orange-800/30 dark:bg-orange-900/10">
                      <p className="text-[10px] uppercase text-orange-600">Reprovação</p>
                      <p className="text-xl font-bold text-orange-700 dark:text-orange-400">{fmt(detalhe.reprovacao_fund_total)}%</p>
                    </div>
                    <div className="rounded-lg border border-red-200 bg-red-50/50 p-3 text-center dark:border-red-800/30 dark:bg-red-900/10">
                      <p className="text-[10px] uppercase text-red-600">Abandono</p>
                      <p className="text-xl font-bold text-red-700 dark:text-red-400">{fmt(detalhe.abandono_fund_total)}%</p>
                    </div>
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-componentes de gráfico
// ---------------------------------------------------------------------------

function ChartEvolucao({ evolucao }: { evolucao: ApiResp["evolucao"] }) {
  const categorias = evolucao.map((e) => String(e.ano));
  const options: ApexOptions = {
    chart: { type: "line", toolbar: { show: false }, fontFamily: "inherit" },
    colors: ["#22c55e", "#3b82f6", "#f59e0b"],
    stroke: { width: 3, curve: "smooth" },
    markers: { size: 4 },
    xaxis: { categories: categorias, labels: { style: { fontSize: "11px" } } },
    yaxis: { min: 0, max: 7, labels: { style: { fontSize: "11px" }, formatter: (v) => v.toFixed(1) } },
    grid: { borderColor: "#f0f0f0", strokeDashArray: 4 },
    legend: { position: "bottom", fontSize: "12px" },
    tooltip: { y: { formatter: (v) => `IDEB ${v.toFixed(1)}` } },
  };
  const series = [
    { name: "Anos Iniciais", data: evolucao.map((e) => e.ai ?? null) },
    { name: "Anos Finais",   data: evolucao.map((e) => e.af ?? null) },
    { name: "Ensino Médio",  data: evolucao.map((e) => e.em ?? null) },
  ];
  return <Chart type="line" options={options} series={series} height={260} />;
}

function ChartBarras({
  municipios, valor, max, corPositiva,
}: {
  municipios: ApiMunicipio[];
  valor: (m: ApiMunicipio) => number;
  max: number;
  corPositiva: boolean;
}) {
  const categorias = municipios.map((m) => m.nome ?? m.codigo_ibge);
  const valores = municipios.map(valor);
  const options: ApexOptions = {
    chart: { type: "bar", toolbar: { show: false }, fontFamily: "inherit" },
    colors: [corPositiva ? "#3B82F6" : "#dc2626"],
    plotOptions: { bar: { borderRadius: 4, horizontal: true, dataLabels: { position: "top" } } },
    dataLabels: { enabled: true, formatter: (v) => (typeof v === "number" ? v.toFixed(1) : String(v)), offsetX: 22, style: { fontSize: "11px", colors: ["#374151"] } },
    xaxis: { categories: categorias, min: 0, max, labels: { style: { fontSize: "11px" } } },
    yaxis: { labels: { style: { fontSize: "11px" } } },
    grid: { borderColor: "#f0f0f0", strokeDashArray: 4 },
  };
  return <Chart type="bar" options={options} series={[{ data: valores }]} height={260} />;
}

function ChartScatter({ municipios }: { municipios: ApiMunicipio[] }) {
  const pontos = municipios.map((m) => ({ x: m.ideb_af ?? 0, y: m.aprovacao_fund_total ?? 0, nome: m.nome }));
  const options: ApexOptions = {
    chart: { type: "scatter", toolbar: { show: false }, fontFamily: "inherit", zoom: { enabled: false } },
    colors: ["#3B82F6"],
    xaxis: { title: { text: "IDEB Anos Finais", style: { fontSize: "11px" } }, min: 2, max: 7, tickAmount: 5, labels: { style: { fontSize: "11px" }, formatter: (v) => (typeof v === "string" ? parseFloat(v) : v).toFixed(1) } },
    yaxis: { title: { text: "Aprovação Fund. (%)", style: { fontSize: "11px" } }, min: 60, max: 100, labels: { style: { fontSize: "11px" } } },
    grid: { borderColor: "#f0f0f0", strokeDashArray: 4 },
    tooltip: {
      custom: ({ seriesIndex, dataPointIndex, w }: { seriesIndex: number; dataPointIndex: number; w: { config: { series: Array<{ data: Array<{ x: number; y: number; nome: string | null }> }> } } }) => {
        const p = w.config.series[seriesIndex].data[dataPointIndex];
        return `<div style="padding:6px 10px;font-size:12px"><strong>${p.nome ?? "—"}</strong><br/>IDEB ${p.x.toFixed(1)} · Aprovação ${p.y.toFixed(1)}%</div>`;
      },
    },
    markers: { size: 6 },
  };
  return <Chart type="scatter" options={options} series={[{ name: "Municípios", data: pontos }]} height={260} />;
}

// ---------------------------------------------------------------------------
// Util — abrir modal de detalhe a partir de um ApiMunicipio
// ---------------------------------------------------------------------------

function abrirDetalheDaLista(m: ApiMunicipio, set: (mu: Municipio | null) => void) {
  set({
    nome: m.nome ?? "—",
    codIBGE: m.codigo_ibge,
    lat: 0, lng: 0,
    ideb: m.ideb_composite ?? null,
    ideb_ai: m.ideb_ai ?? null,
    ideb_af: m.ideb_af ?? null,
    ideb_em: m.ideb_em ?? null,
    meta_ai: m.meta_ai ?? null,
    meta_af: m.meta_af ?? null,
    meta_em: m.meta_em ?? null,
    edicao_ideb: m.edicao_ideb ?? null,
    populacao: m.populacao ?? null,
    ano_rendimento: m.ano_rendimento ?? null,
    aprovacao_fund_total: m.aprovacao_fund_total ?? null,
    reprovacao_fund_total: m.reprovacao_fund_total ?? null,
    abandono_fund_total: m.abandono_fund_total ?? null,
  });
}

function media(vals: Array<number | null>): number | null {
  const v = vals.filter((x): x is number => x !== null);
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}
