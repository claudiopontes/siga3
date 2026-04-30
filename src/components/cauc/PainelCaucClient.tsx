"use client";

import { useEffect, useState, useMemo } from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import MapaCauc from "./MapaCauc";
import type { AlertaMapRow } from "./MapaCaucContent";
import { getCaucItem } from "./cauc-itens";

// ─── Tipos ───────────────────────────────────────────────────────────────────

type AlertaRow = {
  codigo_ibge: string;
  nome_ente: string;
  uf: string;
  total_itens: number;
  total_pendencias: number;
  total_regulares: number;
  data_referencia: string;
  atualizado_em: string;
  nivel_alerta: "alto" | "medio" | "baixo";
  descricao_alerta: string;
};

type SituacaoItem = {
  id: number;
  nome_ente: string;
  item_codigo: string;
  item_descricao: string;
  grupo: string | null;
  situacao: string | null;
  situacao_normalizada: string;
};

type UltimaCarga = {
  carga_id: number;
  data_referencia: string;
  status: string;
  registros: number;
  finalizado_em: string;
};

type OrdemColuna = "nome_ente" | "total_pendencias" | "total_regulares" | "nivel_alerta";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NIVEL_ORDER: Record<string, number> = { alto: 0, medio: 1, baixo: 2 };

function nivelBadge(nivel: string) {
  if (nivel === "alto")
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
        Alto
      </span>
    );
  if (nivel === "medio")
    return (
      <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
        Médio
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
      Baixo
    </span>
  );
}

function situacaoBadge(normalizada: string, raw: string | null) {
  if (normalizada === "nao_atendido")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
        <span>●</span> Pendente
      </span>
    );
  if (normalizada === "atendido")
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400"
        title={raw ?? undefined}
      >
        <span>●</span> Regular {raw && raw !== "atendido" ? `até ${raw}` : ""}
      </span>
    );
  if (normalizada === "nao_aplicavel")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
        N/A
      </span>
    );
  if (normalizada === "nao_informado")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-400 dark:bg-gray-700">
        —
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
      {raw ?? "—"}
    </span>
  );
}

function formatarData(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR");
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-2 h-3 w-24 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="h-7 w-16 rounded bg-gray-200 dark:bg-gray-700" />
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function PainelCaucClient() {
  const [alertas, setAlertas] = useState<AlertaRow[]>([]);
  const [carga, setCarga] = useState<UltimaCarga | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<"mapa" | "tabela">("mapa");
  const [filtroNome, setFiltroNome] = useState("");
  const [filtroNivel, setFiltroNivel] = useState<string>("todos");
  const [ordem, setOrdem] = useState<OrdemColuna>("total_pendencias");
  const [ordemAsc, setOrdemAsc] = useState(false);

  const [municipioDetalhe, setMunicipioDetalhe] = useState<AlertaRow | null>(null);
  const [itensDetalhe, setItensDetalhe] = useState<SituacaoItem[]>([]);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setErro("Supabase não configurado.");
      setCarregando(false);
      return;
    }
    Promise.all([
      supabase
        .from("vw_alertas_cauc_ac")
        .select("*")
        .order("total_pendencias", { ascending: false }),
      supabase.from("vw_cauc_ultima_carga").select("*").limit(1).single(),
    ]).then(([resAlertas, resCarga]) => {
      if (resAlertas.error) { setErro(resAlertas.error.message); return; }
      setAlertas((resAlertas.data ?? []) as AlertaRow[]);
      if (!resCarga.error && resCarga.data) setCarga(resCarga.data as UltimaCarga);
    }).catch((e) => setErro(String(e)))
      .finally(() => setCarregando(false));
  }, []);

  async function abrirDetalhe(row: AlertaRow) {
    setMunicipioDetalhe(row);
    setItensDetalhe([]);
    setCarregandoDetalhe(true);
    const { data } = await supabase!
      .from("vw_cauc_ac_ultima_situacao")
      .select("id,nome_ente,item_codigo,item_descricao,grupo,situacao,situacao_normalizada")
      .eq("codigo_ibge", row.codigo_ibge)
      .order("item_codigo");
    setItensDetalhe((data ?? []) as SituacaoItem[]);
    setCarregandoDetalhe(false);
  }

  const dadosMapa = useMemo<Record<string, AlertaMapRow>>(() => {
    return Object.fromEntries(
      alertas.map((r) => [
        r.codigo_ibge,
        {
          codigo_ibge: r.codigo_ibge,
          nome_ente: r.nome_ente,
          total_itens: r.total_itens,
          total_pendencias: r.total_pendencias,
          total_regulares: r.total_regulares,
          nivel_alerta: r.nivel_alerta,
        },
      ])
    );
  }, [alertas]);

  const alertasFiltrados = useMemo(() => {
    let lista = [...alertas];
    if (filtroNome.trim()) {
      const q = filtroNome.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      lista = lista.filter((r) =>
        r.nome_ente.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(q)
      );
    }
    if (filtroNivel !== "todos") lista = lista.filter((r) => r.nivel_alerta === filtroNivel);
    lista.sort((a, b) => {
      let va: number | string, vb: number | string;
      if (ordem === "nivel_alerta") {
        va = NIVEL_ORDER[a.nivel_alerta] ?? 9;
        vb = NIVEL_ORDER[b.nivel_alerta] ?? 9;
      } else if (ordem === "nome_ente") {
        va = a.nome_ente; vb = b.nome_ente;
      } else {
        va = a[ordem] as number; vb = b[ordem] as number;
      }
      if (va < vb) return ordemAsc ? -1 : 1;
      if (va > vb) return ordemAsc ? 1 : -1;
      return 0;
    });
    return lista;
  }, [alertas, filtroNome, filtroNivel, ordem, ordemAsc]);

  const totalAlto = alertas.filter((r) => r.nivel_alerta === "alto").length;
  const totalMedio = alertas.filter((r) => r.nivel_alerta === "medio").length;
  const totalBaixo = alertas.filter((r) => r.nivel_alerta === "baixo").length;

  function toggleOrdem(col: OrdemColuna) {
    if (ordem === col) setOrdemAsc((v) => !v);
    else { setOrdem(col); setOrdemAsc(false); }
  }

  function ThIcon({ col }: { col: OrdemColuna }) {
    if (ordem !== col) return <span className="ml-1 text-gray-300">↕</span>;
    return <span className="ml-1">{ordemAsc ? "↑" : "↓"}</span>;
  }

  if (erro) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
        Erro ao carregar dados: {erro}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {carregando ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Total municípios</p>
              <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">{alertas.length}</p>
            </div>
            <div className="rounded-xl border border-red-200 bg-white p-4 dark:border-red-800/40 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wide text-red-400">Alerta alto</p>
              <p className="mt-1 text-3xl font-bold text-red-600 dark:text-red-400">{totalAlto}</p>
            </div>
            <div className="rounded-xl border border-yellow-200 bg-white p-4 dark:border-yellow-700/40 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wide text-yellow-500">Alerta médio</p>
              <p className="mt-1 text-3xl font-bold text-yellow-600 dark:text-yellow-400">{totalMedio}</p>
            </div>
            <div className="rounded-xl border border-green-200 bg-white p-4 dark:border-green-800/40 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wide text-green-500">Sem pendência</p>
              <p className="mt-1 text-3xl font-bold text-green-600 dark:text-green-400">{totalBaixo}</p>
            </div>
            <div className="rounded-xl border border-blue-200 bg-white p-4 dark:border-blue-800/40 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wide text-blue-400">Referência</p>
              <p className="mt-1 text-xl font-bold text-blue-600 dark:text-blue-400">
                {carga ? formatarData(carga.data_referencia) : "—"}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Toggle Mapa / Tabela */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-100 p-1 dark:border-gray-700 dark:bg-gray-800">
          {(["mapa", "tabela"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-all ${
                viewMode === mode
                  ? "bg-white text-brand-600 shadow dark:bg-gray-700 dark:text-brand-400"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
              }`}
            >
              {mode === "mapa" ? "Mapa" : "Tabela"}
            </button>
          ))}
        </div>

        {viewMode === "tabela" && (
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              placeholder="Buscar município..."
              value={filtroNome}
              onChange={(e) => setFiltroNome(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500 sm:w-64"
            />
            <div className="flex gap-2">
              {(["todos", "alto", "medio", "baixo"] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => setFiltroNivel(n)}
                  className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                    filtroNivel === n
                      ? "bg-brand-500 text-white"
                      : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  }`}
                >
                  {n === "todos" ? "Todos" : n.charAt(0).toUpperCase() + n.slice(1)}
                </button>
              ))}
            </div>
            {alertasFiltrados.length !== alertas.length && (
              <span className="text-xs text-gray-400">{alertasFiltrados.length} de {alertas.length}</span>
            )}
          </div>
        )}
      </div>

      {/* Mapa */}
      {viewMode === "mapa" && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800" style={{ height: 480, isolation: "isolate" }}>
          {carregando ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
            </div>
          ) : (
            <MapaCauc
              dados={dadosMapa}
              bloqueado={!!municipioDetalhe}
              onSelect={(row) => row && abrirDetalhe(alertas.find((a) => a.codigo_ibge === row.codigo_ibge)!)}
            />
          )}
        </div>
      )}

      {/* Tabela */}
      {viewMode === "tabela" && <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/50">
                <th
                  className="cursor-pointer px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700 dark:text-gray-400"
                  onClick={() => toggleOrdem("nome_ente")}
                >
                  Município <ThIcon col="nome_ente" />
                </th>
                <th
                  className="cursor-pointer px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700 dark:text-gray-400"
                  onClick={() => toggleOrdem("total_pendencias")}
                >
                  Pendências <ThIcon col="total_pendencias" />
                </th>
                <th
                  className="cursor-pointer px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700 dark:text-gray-400"
                  onClick={() => toggleOrdem("total_regulares")}
                >
                  Regulares <ThIcon col="total_regulares" />
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Itens
                </th>
                <th
                  className="cursor-pointer px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700 dark:text-gray-400"
                  onClick={() => toggleOrdem("nivel_alerta")}
                >
                  Alerta <ThIcon col="nivel_alerta" />
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {carregando
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 animate-pulse rounded bg-gray-100 dark:bg-gray-700" />
                        </td>
                      ))}
                    </tr>
                  ))
                : alertasFiltrados.map((row) => (
                    <tr
                      key={row.codigo_ibge}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/30"
                    >
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                        {row.nome_ente}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`font-bold ${
                            row.total_pendencias > 0
                              ? "text-red-600 dark:text-red-400"
                              : "text-gray-400"
                          }`}
                        >
                          {row.total_pendencias}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-medium text-green-600 dark:text-green-400">
                          {row.total_regulares}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-500 dark:text-gray-400">
                        {row.total_itens}
                      </td>
                      <td className="px-4 py-3 text-center">{nivelBadge(row.nivel_alerta)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => abrirDetalhe(row)}
                          className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                        >
                          Detalhar
                        </button>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>}

      {/* Modal de detalhe */}
      {municipioDetalhe && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" style={{ zIndex: 99999 }}
          onClick={(e) => { if (e.target === e.currentTarget) setMunicipioDetalhe(null); }}
        >
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800">
            {/* Header modal */}
            <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white">
                  {municipioDetalhe.nome_ente}
                </h2>
                <div className="mt-1 flex items-center gap-2">
                  {nivelBadge(municipioDetalhe.nivel_alerta)}
                  <span className="text-xs text-gray-400">
                    {municipioDetalhe.total_pendencias} pendência(s) · {municipioDetalhe.total_regulares} regular(es) · {municipioDetalhe.total_itens} itens
                  </span>
                </div>
              </div>
              <button
                onClick={() => setMunicipioDetalhe(null)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Aviso */}
            <div className="border-b border-amber-100 bg-amber-50 px-5 py-2 text-xs text-amber-700 dark:border-amber-800/30 dark:bg-amber-900/10 dark:text-amber-400">
              ⚠️ Dado gerencial. Não substitui o extrato oficial do CAUC.
            </div>

            {/* Itens */}
            <div className="flex-1 overflow-y-auto p-4">
              {carregandoDetalhe ? (
                <div className="space-y-2">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700" />
                  ))}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-400">
                      <th className="pb-2 pr-4 font-medium">Item</th>
                      <th className="pb-2 pr-4 font-medium">Descrição</th>
                      <th className="pb-2 font-medium">Situação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                    {itensDetalhe.map((item) => {
                      const info = getCaucItem(item.item_codigo);
                      return (
                        <tr key={item.id} className={item.situacao_normalizada === "nao_atendido" ? "bg-red-50/50 dark:bg-red-900/10" : ""}>
                          <td className="py-2 pr-4 font-mono text-xs text-gray-500 dark:text-gray-400">
                            {item.item_codigo.replace(/_/g, ".")}
                          </td>
                          <td className="py-2 pr-4 text-gray-700 dark:text-gray-300">
                            {info?.descricao ?? item.item_descricao}
                            {info?.tipo && (
                              <span className="ml-1.5 text-[10px] text-gray-400 dark:text-gray-500">
                                [{info.tipo}]
                              </span>
                            )}
                          </td>
                          <td className="py-2">
                            {situacaoBadge(item.situacao_normalizada, item.situacao)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cabeçalho */}
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
        <div>
          <h1 className="text-base font-bold text-gray-900 dark:text-white">
            CAUC — Municípios do Acre
          </h1>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Situação dos requisitos do Cadastro Único de Convênios (CAUC)
          </p>
        </div>
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-400">
          ⚠️ <strong>Dado gerencial para alerta interno.</strong> Não substitui o extrato oficial do CAUC nem deve ser apresentado como certidão.
        </div>
      </div>
    </div>
  );
}
