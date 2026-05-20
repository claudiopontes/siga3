"use client";

import { useEffect, useMemo, useState } from "react";
import MapaEscolas from "./MapaEscolas";
import BlocoCenso from "./BlocoCenso";
import type { EscolaPonto } from "./MapaEscolasContent";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface ApiResp {
  edicoes: number[];
  edicao: number | null;
  filtros: {
    municipios: { cod: number; nome: string | null }[];
    redes: string[];
    localizacoes: string[];
    situacoes: string[];
  } | null;
  escolas: EscolaPonto[];
  total: number;
  fonte: string;
}

type ViewMode = "mapa" | "lista";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number | null, dec = 1): string {
  if (n === null) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
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

export default function EscolasClient() {
  const [resp, setResp] = useState<ApiResp | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Filtros
  const [edicaoSel, setEdicaoSel]       = useState<number | null>(null);
  const [municipioSel, setMunicipioSel] = useState<string>("");
  const [redeSel, setRedeSel]           = useState<string>("");
  const [localSel, setLocalSel]         = useState<string>("");
  const [situacaoSel, setSituacaoSel]   = useState<string>("");
  const [busca, setBusca]               = useState<string>("");
  const [somenteComIdeb, setSomenteComIdeb] = useState<boolean>(false);
  const [modalidadeSel, setModalidadeSel] = useState<string>(""); // "indigena" | "quilombola" | ""

  // View
  const [viewMode, setViewMode] = useState<ViewMode>("mapa");
  const [detalhe, setDetalhe]   = useState<EscolaPonto | null>(null);

  // Carga
  useEffect(() => {
    setCarregando(true);
    const qs = new URLSearchParams();
    if (edicaoSel) qs.set("edicao", String(edicaoSel));
    if (municipioSel) qs.set("municipio", municipioSel);
    if (redeSel) qs.set("rede", redeSel);
    if (localSel) qs.set("localizacao", localSel);
    if (situacaoSel) qs.set("situacao", situacaoSel);
    if (busca.trim()) qs.set("busca", busca.trim());
    if (somenteComIdeb) qs.set("somente_com_ideb", "1");
    if (modalidadeSel) qs.set("modalidade", modalidadeSel);
    const url = `/api/educacao/escolas${qs.toString() ? "?" + qs.toString() : ""}`;
    fetch(url)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d: ApiResp) => {
        setResp(d);
        if (edicaoSel === null && d.edicao) setEdicaoSel(d.edicao);
      })
      .catch((e) => setErro(String(e)))
      .finally(() => setCarregando(false));
  }, [edicaoSel, municipioSel, redeSel, localSel, situacaoSel, busca, somenteComIdeb, modalidadeSel]);

  // KPIs derivados
  const kpis = useMemo(() => {
    const escolas = resp?.escolas ?? [];
    const comIdeb = escolas.filter((e) => e.ideb_composite !== null);
    const comGeo  = escolas.filter((e) => e.latitude !== null && e.longitude !== null);
    const media   = (vals: Array<number | null>) => {
      const v = vals.filter((x): x is number => x !== null);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    return {
      total: escolas.length,
      comIdeb: comIdeb.length,
      comGeo: comGeo.length,
      idebMedio: media(escolas.map((e) => e.ideb_composite)),
      abaixoMeta: escolas.filter((e) =>
        (e.ideb_ai !== null && e.meta_ai !== null && e.ideb_ai < e.meta_ai)
        || (e.ideb_af !== null && e.meta_af !== null && e.ideb_af < e.meta_af)
        || (e.ideb_em !== null && e.meta_em !== null && e.ideb_em < e.meta_em),
      ).length,
    };
  }, [resp]);

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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {carregando ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Escolas listadas</p>
              <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">{kpis.total}</p>
              <p className="mt-1 text-[10px] text-gray-400">Filtros aplicados</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-white p-4 dark:border-emerald-800/40 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-500">Com IDEB</p>
              <p className="mt-1 text-3xl font-bold text-emerald-700 dark:text-emerald-400">{kpis.comIdeb}</p>
              <p className="mt-1 text-[10px] text-gray-400">Edição {resp?.edicao ?? "—"}</p>
            </div>
            <div className="rounded-xl border border-blue-200 bg-white p-4 dark:border-blue-800/40 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wide text-blue-500">IDEB médio</p>
              <p className="mt-1 text-3xl font-bold" style={{ color: getColorIdeb(kpis.idebMedio) }}>{fmt(kpis.idebMedio)}</p>
              <p className="mt-1 text-[10px] text-gray-400">Média das etapas</p>
            </div>
            <div className="rounded-xl border border-red-200 bg-white p-4 dark:border-red-800/40 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wide text-red-500">Abaixo da meta</p>
              <p className="mt-1 text-3xl font-bold text-red-600 dark:text-red-400">{kpis.abaixoMeta}</p>
              <p className="mt-1 text-[10px] text-gray-400">≥ 1 etapa</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Geolocalizadas</p>
              <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">{kpis.comGeo}</p>
              <p className="mt-1 text-[10px] text-gray-400">Visíveis no mapa</p>
            </div>
          </>
        )}
      </div>

      {/* ─── Filtros ─── */}
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800 sm:flex-row sm:flex-wrap sm:items-end">
        {/* Toggle view */}
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-100 p-1 dark:border-gray-700 dark:bg-gray-900/50">
          {(["mapa", "lista"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                viewMode === mode
                  ? "bg-white text-brand-600 shadow dark:bg-gray-700 dark:text-brand-400"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
              }`}
            >
              {mode === "mapa" ? "Mapa" : "Lista"}
            </button>
          ))}
        </div>

        {/* Período */}
        <Field label="Período IDEB">
          <select
            value={edicaoSel ?? ""}
            onChange={(e) => setEdicaoSel(parseInt(e.target.value, 10))}
            disabled={!resp || resp.edicoes.length === 0}
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          >
            {resp?.edicoes.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </Field>

        {/* Município */}
        <Field label="Município">
          <select
            value={municipioSel}
            onChange={(e) => setMunicipioSel(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          >
            <option value="">Todos</option>
            {resp?.filtros?.municipios.map((m) => (
              <option key={m.cod} value={String(m.cod)}>{m.nome ?? m.cod}</option>
            ))}
          </select>
        </Field>

        {/* Rede */}
        <Field label="Rede">
          <select
            value={redeSel}
            onChange={(e) => setRedeSel(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          >
            <option value="">Todas</option>
            {resp?.filtros?.redes.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>

        {/* Localização */}
        <Field label="Localização">
          <select
            value={localSel}
            onChange={(e) => setLocalSel(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          >
            <option value="">Todas</option>
            {resp?.filtros?.localizacoes.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>

        {/* Situação */}
        <Field label="Situação">
          <select
            value={situacaoSel}
            onChange={(e) => setSituacaoSel(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          >
            <option value="">Todas</option>
            {resp?.filtros?.situacoes.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>

        <Field label="Modalidade">
          <select
            value={modalidadeSel}
            onChange={(e) => setModalidadeSel(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          >
            <option value="">Todas</option>
            <option value="indigena">Educação Indígena</option>
            <option value="quilombola">Educação Quilombola</option>
          </select>
        </Field>

        {/* Busca */}
        <Field label="Buscar escola">
          <input
            type="text"
            placeholder="nome contém…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-48 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          />
        </Field>

        {/* Toggle "só com IDEB" */}
        <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <input
            type="checkbox"
            checked={somenteComIdeb}
            onChange={(e) => setSomenteComIdeb(e.target.checked)}
            className="rounded border-gray-300"
          />
          Somente com IDEB
        </label>
      </div>

      {/* ─── Mapa ─── */}
      {viewMode === "mapa" && (
        <div
          className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
          style={{ height: 600, isolation: "isolate" }}
        >
          {carregando ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
            </div>
          ) : (
            <MapaEscolas escolas={resp?.escolas ?? []} onSelect={(e) => e && setDetalhe(e)} />
          )}
        </div>
      )}

      {/* ─── Lista ─── */}
      {viewMode === "lista" && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/50">
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Escola</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Município</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Rede</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Loc.</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">IDEB AI</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">IDEB AF</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">IDEB EM</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-indigo-600">Matr.</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-purple-600">Doc.</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-blue-600" title="Água potável">💧</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-amber-600" title="Energia elétrica">⚡</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-cyan-600" title="Internet">🌐</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {carregando
                  ? Array.from({ length: 10 }).map((_, i) => (
                      <tr key={i}>{Array.from({ length: 13 }).map((__, j) => (
                        <td key={j} className="px-3 py-2"><div className="h-4 animate-pulse rounded bg-gray-100 dark:bg-gray-700" /></td>
                      ))}</tr>
                    ))
                  : (resp?.escolas ?? []).slice(0, 200).map((e) => (
                      <tr key={e.cod_escola} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">
                          {e.ed_indigena && <span className="mr-1" title="Educação Indígena">🪶</span>}
                          {e.ed_quilombola && <span className="mr-1" title="Educação Quilombola">✊🏿</span>}
                          {e.nome ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500">{e.no_municipio ?? "—"}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{e.dependencia ?? "—"}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{e.localizacao ?? "—"}</td>
                        <td className="px-3 py-2 text-center font-bold" style={{ color: getColorIdeb(e.ideb_ai) }}>{fmt(e.ideb_ai)}</td>
                        <td className="px-3 py-2 text-center font-bold" style={{ color: getColorIdeb(e.ideb_af) }}>{fmt(e.ideb_af)}</td>
                        <td className="px-3 py-2 text-center font-bold" style={{ color: getColorIdeb(e.ideb_em) }}>{fmt(e.ideb_em)}</td>
                        <td className="px-3 py-2 text-center text-xs text-indigo-700 dark:text-indigo-400">
                          {e.qt_mat_bas !== null && e.qt_mat_bas !== undefined ? e.qt_mat_bas.toLocaleString("pt-BR") : "—"}
                        </td>
                        <td className="px-3 py-2 text-center text-xs text-purple-700 dark:text-purple-400">
                          {e.qt_doc_bas !== null && e.qt_doc_bas !== undefined ? e.qt_doc_bas.toLocaleString("pt-BR") : "—"}
                        </td>
                        <td className="px-3 py-2 text-center">{infraDot(e.infra?.agua_potavel)}</td>
                        <td className="px-3 py-2 text-center">{infraDot(e.infra?.energia_eletrica)}</td>
                        <td className="px-3 py-2 text-center">{infraDot(e.infra?.internet)}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => setDetalhe(e)}
                            className="rounded-lg border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                          >Detalhar</button>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
            {(resp?.escolas?.length ?? 0) > 200 && (
              <div className="border-t border-gray-100 px-4 py-2 text-xs text-gray-400 dark:border-gray-700">
                Exibindo as primeiras 200 escolas. Refine os filtros para ver outras.
              </div>
            )}
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
                <h2 className="text-base font-bold text-gray-900 dark:text-white">{detalhe.nome ?? "(sem nome)"}</h2>
                <p className="text-xs text-gray-400">
                  Cód. INEP {detalhe.cod_escola} · {detalhe.no_municipio ?? "—"}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {detalhe.ed_indigena && (
                    <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                      🪶 Educação Indígena
                    </span>
                  )}
                  {detalhe.ed_quilombola && (
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                      ✊🏿 Educação Quilombola
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => setDetalhe(null)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700">✕</button>
            </div>
            <div className="space-y-4 p-5 text-sm">
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Características</h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-gray-400">Rede:</span> <strong>{detalhe.dependencia ?? "—"}</strong></div>
                  <div><span className="text-gray-400">Localização:</span> <strong>{detalhe.localizacao ?? "—"}</strong></div>
                  <div><span className="text-gray-400">Porte:</span> <strong>{detalhe.porte ?? "—"}</strong></div>
                  <div><span className="text-gray-400">Situação:</span> <strong>{detalhe.situacao ?? "—"}</strong></div>
                  <div className="col-span-2"><span className="text-gray-400">Etapas:</span> <strong>{detalhe.etapas_atendidas ?? "—"}</strong></div>
                  {detalhe.endereco && <div className="col-span-2"><span className="text-gray-400">Endereço:</span> <strong>{detalhe.endereco}</strong></div>}
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">IDEB {detalhe.edicao_ideb ?? ""}</h3>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase text-gray-400">
                      <th>Etapa</th>
                      <th className="text-right">Observado</th>
                      <th className="text-right">Meta</th>
                      <th className="text-right">Δ</th>
                      <th className="text-right">SAEB Mat</th>
                      <th className="text-right">SAEB LP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      { label: "Anos Iniciais", obs: detalhe.ideb_ai, meta: detalhe.meta_ai, saeb: detalhe.saeb?.ai },
                      { label: "Anos Finais",   obs: detalhe.ideb_af, meta: detalhe.meta_af, saeb: detalhe.saeb?.af },
                      { label: "Ensino Médio",  obs: detalhe.ideb_em, meta: detalhe.meta_em, saeb: detalhe.saeb?.em },
                    ] as const).map((etapa) => {
                      const delta = (etapa.obs !== null && etapa.meta !== null) ? etapa.obs - etapa.meta : null;
                      return (
                        <tr key={etapa.label} className="border-t border-gray-100 dark:border-gray-700">
                          <td className="py-1.5">{etapa.label}</td>
                          <td className="py-1.5 text-right font-bold" style={{ color: getColorIdeb(etapa.obs) }}>{fmt(etapa.obs)}</td>
                          <td className="py-1.5 text-right text-gray-500">{fmt(etapa.meta)}</td>
                          <td className="py-1.5 text-right font-medium" style={{ color: delta === null ? "#9ca3af" : delta >= 0 ? "#16a34a" : "#dc2626" }}>
                            {delta === null ? "—" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`}
                          </td>
                          <td className="py-1.5 text-right text-blue-700 dark:text-blue-400">{etapa.saeb?.mat !== null && etapa.saeb?.mat !== undefined ? etapa.saeb.mat.toFixed(0) : "—"}</td>
                          <td className="py-1.5 text-right text-emerald-700 dark:text-emerald-400">{etapa.saeb?.lp !== null && etapa.saeb?.lp !== undefined ? etapa.saeb.lp.toFixed(0) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="mt-1 text-[10px] text-gray-400">SAEB: 0–500 (Mat) e 0–325 (LP) — quanto maior, melhor.</p>
              </section>

              <BlocoCenso detalhe={detalhe} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-componente: campo de filtro com label compacto
// ---------------------------------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</label>
      {children}
    </div>
  );
}

function infraDot(v: boolean | null | undefined) {
  if (v === true)  return <span className="font-bold text-emerald-600" title="Tem">✓</span>;
  if (v === false) return <span className="font-bold text-red-600"     title="Não tem">✗</span>;
  return <span className="text-gray-300" title="Não informado">—</span>;
}
