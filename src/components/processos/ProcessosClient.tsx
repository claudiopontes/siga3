"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, ChevronLeft, ChevronRight, FileText, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { useContextoAquiry } from "@/components/aquiry/useContextoAquiry";

const POR_PAGINA = 25;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeText(v: string) {
  return v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className ?? "h-4 w-4"}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type ProcessoRow = {
  processo_id: number;
  numero_fmt: string | null;
  ano: number | null;
  objeto: string | null;
  nome_classe: string | null;
  nome_1_parte: string | null;
  situacao: string | null;
  nome_orgao: string | null;
  nome_relator: string | null;
};

type SortCol = "numero_fmt" | "nome_classe" | "objeto" | "nome_1_parte" | "relator";

type Option = { value: string; label: string };

type FiltrosData = {
  anos: number[];
  classes: string[];
  situacoes: string[];
  relatores: string[];
};

// ---------------------------------------------------------------------------
// SortIcon
// ---------------------------------------------------------------------------

function SortIcon({ active, dir }: { active: boolean; dir: "ASC" | "DESC" }) {
  if (!active) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
  return dir === "ASC" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
}

// ---------------------------------------------------------------------------
// FilterDialog (seleção única com busca textual)
// ---------------------------------------------------------------------------

function FilterDialog({
  title, isOpen, options, selectedValue, allLabel, onClose, onSelect,
}: {
  title: string; isOpen: boolean; options: Option[]; selectedValue: string;
  allLabel: string; onClose: () => void; onSelect: (v: string) => void;
}) {
  const [term, setTerm] = useState("");
  const visible = useMemo(() => {
    const n = normalizeText(term);
    return n ? options.filter((o) => normalizeText(o.label).includes(n)) : options;
  }, [options, term]);

  useEffect(() => {
    if (!isOpen) return;
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const itemClass = (active: boolean) =>
    `flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
      active
        ? "border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-700 dark:bg-teal-900/20 dark:text-teal-300"
        : "border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
    }`;

  return (
    <div className="fixed inset-0 z-120000 flex items-center justify-center p-4">
      <button type="button" aria-label="Fechar" className="absolute inset-0 bg-gray-900/40" onClick={onClose} />
      <div className="relative max-h-[80vh] w-full max-w-md overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">Fechar</button>
        </div>
        <div className="max-h-[55vh] overflow-auto p-4 space-y-3">
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Buscar..."
            className="h-9 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-700 focus:border-teal-400 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-white" />
          <button type="button" onClick={() => { onSelect(""); onClose(); }} className={itemClass(!selectedValue)}>
            <span>{allLabel}</span>{!selectedValue && <span className="text-xs">✓</span>}
          </button>
          <div className="space-y-1.5">
            {visible.map((opt) => (
              <button key={opt.value} type="button" onClick={() => { onSelect(opt.value); onClose(); }} className={itemClass(selectedValue === opt.value)}>
                <span>{opt.label}</span>{selectedValue === opt.value && <span className="text-xs">✓</span>}
              </button>
            ))}
            {visible.length === 0 && (
              <p className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500 dark:border-gray-700">Nenhum item encontrado.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FilterDropdown — botão + painel inline
// ---------------------------------------------------------------------------

function FilterDropdown({
  activeCount, loading, filtros, searchParams, onReplace,
}: {
  activeCount: number; loading: boolean; filtros: FiltrosData;
  searchParams: URLSearchParams; onReplace: (updater: (p: URLSearchParams) => void) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<"ano" | "classe" | "situacao" | "relator" | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", handler); document.removeEventListener("keydown", esc); };
  }, [open]);

  const selectedAno      = searchParams.get("ano") ?? "";
  const selectedClasse   = searchParams.get("classe") ?? "";
  const selectedSituacao = searchParams.get("situacao") ?? "";
  const selectedRelator  = searchParams.get("relator") ?? "";

  const anoOptions    = useMemo<Option[]>(() => filtros.anos.map((a) => ({ value: String(a), label: String(a) })), [filtros.anos]);
  const classeOptions = useMemo<Option[]>(() => filtros.classes.map((c) => ({ value: c, label: c })), [filtros.classes]);
  const situOptions   = useMemo<Option[]>(() => filtros.situacoes.map((s) => ({ value: s, label: s })), [filtros.situacoes]);
  const relOptions    = useMemo<Option[]>(() => filtros.relatores.map((r) => ({ value: r, label: r })), [filtros.relatores]);

  function buildTitle(options: Option[], value: string, allLabel: string) {
    if (!value) return allLabel;
    return options.find((o) => o.value === value)?.label ?? allLabel;
  }

  const filterItemClass = (active: boolean) =>
    `flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-left text-xs transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${
      active ? "border-teal-300 bg-teal-50 dark:border-teal-700 dark:bg-teal-900/20" : "border-gray-200 dark:border-gray-700"
    }`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        className={`flex h-[30px] items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors disabled:opacity-60 ${
          open || activeCount > 0
            ? "border-teal-400 bg-teal-50 text-teal-700 dark:border-teal-600 dark:bg-teal-900/20 dark:text-teal-300"
            : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
        }`}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
        Filtros
        {activeCount > 0 && (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-teal-600 text-[9px] font-bold text-white">{activeCount}</span>
        )}
        {loading && <Spinner className="h-3 w-3 text-gray-400" />}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-110000 w-[420px] max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white p-3 shadow-xl dark:border-gray-700 dark:bg-gray-900">
          <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Filtros disponíveis</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setDialog("ano")} disabled={loading} className={filterItemClass(!!selectedAno)}>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Ano</span>
              <span className={`truncate font-medium ${selectedAno ? "text-teal-700 dark:text-teal-300" : "text-gray-700 dark:text-gray-200"}`}>{selectedAno || "Todos"}</span>
            </button>
            <button type="button" onClick={() => setDialog("classe")} disabled={loading} className={filterItemClass(!!selectedClasse)}>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Classe</span>
              <span className={`truncate font-medium ${selectedClasse ? "text-teal-700 dark:text-teal-300" : "text-gray-700 dark:text-gray-200"}`}>{buildTitle(classeOptions, selectedClasse, "Todas")}</span>
            </button>
            <button type="button" onClick={() => setDialog("situacao")} disabled={loading} className={filterItemClass(!!selectedSituacao)}>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Situação</span>
              <span className={`truncate font-medium ${selectedSituacao ? "text-teal-700 dark:text-teal-300" : "text-gray-700 dark:text-gray-200"}`}>{buildTitle(situOptions, selectedSituacao, "Todas")}</span>
            </button>
            <button type="button" onClick={() => setDialog("relator")} disabled={loading} className={filterItemClass(!!selectedRelator)}>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Relator</span>
              <span className={`truncate font-medium ${selectedRelator ? "text-teal-700 dark:text-teal-300" : "text-gray-700 dark:text-gray-200"}`}>{buildTitle(relOptions, selectedRelator, "Todos")}</span>
            </button>
          </div>
          {activeCount > 0 && (
            <button type="button" onClick={() => { onReplace((p) => { p.delete("ano"); p.delete("classe"); p.delete("situacao"); p.delete("relator"); }); setOpen(false); }}
              className="mt-2.5 w-full rounded-lg border border-red-200 bg-red-50 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400">
              Limpar todos os filtros
            </button>
          )}
        </div>
      )}

      <FilterDialog title="Selecionar Ano" isOpen={dialog === "ano"} options={anoOptions}
        selectedValue={selectedAno} allLabel="Todos os anos"
        onClose={() => setDialog(null)}
        onSelect={(v) => { onReplace((p) => { if (v) p.set("ano", v); else p.delete("ano"); }); }} />
      <FilterDialog title="Selecionar Classe" isOpen={dialog === "classe"} options={classeOptions}
        selectedValue={selectedClasse} allLabel="Todas as classes"
        onClose={() => setDialog(null)}
        onSelect={(v) => { onReplace((p) => { if (v) p.set("classe", v); else p.delete("classe"); }); }} />
      <FilterDialog title="Selecionar Situação" isOpen={dialog === "situacao"} options={situOptions}
        selectedValue={selectedSituacao} allLabel="Todas as situações"
        onClose={() => setDialog(null)}
        onSelect={(v) => { onReplace((p) => { if (v) p.set("situacao", v); else p.delete("situacao"); }); }} />
      <FilterDialog title="Selecionar Relator" isOpen={dialog === "relator"} options={relOptions}
        selectedValue={selectedRelator} allLabel="Todos os relatores"
        onClose={() => setDialog(null)}
        onSelect={(v) => { onReplace((p) => { if (v) p.set("relator", v); else p.delete("relator"); }); }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function ProcessosClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [dados, setDados] = useState<ProcessoRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<FiltrosData>({ anos: [], classes: [], situacoes: [], relatores: [] });
  const [loadingFiltros, setLoadingFiltros] = useState(true);

  const busca   = searchParams.get("busca") ?? "";
  const pagina  = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const sortCol = (searchParams.get("sort") ?? "numero_fmt") as SortCol;
  const sortDir = (searchParams.get("dir")?.toUpperCase() === "ASC" ? "ASC" : "DESC") as "ASC" | "DESC";

  const selectedAno      = searchParams.get("ano") ?? "";
  const selectedClasse   = searchParams.get("classe") ?? "";
  const selectedSituacao = searchParams.get("situacao") ?? "";
  const selectedRelator  = searchParams.get("relator") ?? "";
  const activeFilterCount = (selectedAno ? 1 : 0) + (selectedClasse ? 1 : 0) + (selectedSituacao ? 1 : 0) + (selectedRelator ? 1 : 0);

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  // Carrega opções de filtros uma vez
  useEffect(() => {
    fetch("/api/processos/filtros")
      .then((r) => r.json())
      .then((d: FiltrosData) => setFiltros(d))
      .catch(() => {})
      .finally(() => setLoadingFiltros(false));
  }, []);

  function replaceParams(updater: (p: URLSearchParams) => void) {
    const p = new URLSearchParams(searchParams.toString());
    updater(p);
    p.delete("page");
    router.replace(`?${p.toString()}`, { scroll: false });
  }

  function setParam(key: string, value: string | null) {
    const p = new URLSearchParams(searchParams.toString());
    if (value === null || value === "") p.delete(key);
    else p.set(key, value);
    if (key !== "page") p.delete("page");
    router.replace(`?${p.toString()}`, { scroll: false });
  }

  function toggleSort(col: SortCol) {
    const p = new URLSearchParams(searchParams.toString());
    if (sortCol === col) p.set("dir", sortDir === "DESC" ? "ASC" : "DESC");
    else { p.set("sort", col); p.set("dir", "DESC"); }
    p.delete("page");
    router.replace(`?${p.toString()}`, { scroll: false });
  }

  const buscarDados = useCallback(async (sp: URLSearchParams) => {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch(`/api/processos?${sp.toString()}`);
      const json = await res.json();
      if (!res.ok) { setErro(json?.error ?? "Erro ao carregar processos."); return; }
      setDados(Array.isArray(json.dados) ? json.dados : []);
      setTotal(Number(json.total ?? 0));
    } catch {
      setErro("Falha na comunicação com o servidor.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void buscarDados(searchParams); }, [searchParams, buscarDados]);

  // --- Contexto para o Assistente Aquiry ---
  // Resumo agregado da listagem visível: filtros, total e classes/relatores
  // presentes nas linhas atuais. Sem dado processual individual.
  const aquiryDados = useMemo(() => {
    if (loading) return { carregando: true } as const;
    const classes = Array.from(
      new Set(dados.map((d) => d.nome_classe).filter((c): c is string => !!c)),
    ).slice(0, 5);
    const relatores = Array.from(
      new Set(dados.map((d) => d.nome_relator).filter((r): r is string => !!r)),
    ).slice(0, 5);
    return {
      totalGeral: total,
      visiveisNaPagina: dados.length,
      pagina,
      totalPaginas,
      filtroBusca: busca || null,
      filtroAno: selectedAno || null,
      filtroClasse: selectedClasse || null,
      filtroSituacao: selectedSituacao || null,
      filtroRelator: selectedRelator || null,
      filtrosAtivos: activeFilterCount,
      classesNaPagina: classes.join("; ") || null,
      relatoresNaPagina: relatores.join("; ") || null,
    };
  }, [
    loading, dados, total, pagina, totalPaginas, busca,
    selectedAno, selectedClasse, selectedSituacao, selectedRelator,
    activeFilterCount,
  ]);

  useContextoAquiry({
    titulo: "Processos — listagem",
    descricao: "Listagem paginada de processos do TCE-AC, com filtros aplicáveis.",
    dados: aquiryDados,
    observacoes: [
      "Contexto reflete apenas a página/filtros atualmente visíveis.",
      "O assistente não acessou conteúdo processual nesta fase.",
    ],
    fontes: ["Contexto da tela de processos"],
  });

  function thClass(col: SortCol) {
    return `cursor-pointer select-none px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide transition-colors hover:text-gray-800 dark:hover:text-gray-200 ${
      sortCol === col ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"
    }`;
  }

  // Chips de filtros ativos
  const chipClass = "inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700 hover:bg-teal-100 dark:border-teal-700/50 dark:bg-teal-900/20 dark:text-teal-300";

  return (
    <div className="space-y-3 p-1">
      {/* Barra: busca + filtros + chips */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        {/* Campo de busca compacto */}
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Número, parte, relator ou objeto..."
            defaultValue={busca}
            onChange={(e) => {
              const v = e.target.value;
              const p = new URLSearchParams(searchParams.toString());
              if (v) p.set("busca", v); else p.delete("busca");
              p.delete("page");
              const t = setTimeout(() => router.replace(`?${p.toString()}`, { scroll: false }), 400);
              return () => clearTimeout(t);
            }}
            className="h-[30px] w-full rounded-lg border border-gray-200 bg-gray-50 pl-7 pr-2 text-xs text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-500"
          />
        </div>

        {/* Botão de filtros */}
        <FilterDropdown
          activeCount={activeFilterCount}
          loading={loadingFiltros}
          filtros={filtros}
          searchParams={searchParams}
          onReplace={replaceParams}
        />

        {/* Chips de filtros ativos */}
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {selectedAno && (
              <button type="button" onClick={() => setParam("ano", null)} className={chipClass}>
                {selectedAno} <span className="opacity-60">×</span>
              </button>
            )}
            {selectedClasse && (
              <button type="button" onClick={() => setParam("classe", null)} className={chipClass}>
                {selectedClasse} <span className="opacity-60">×</span>
              </button>
            )}
            {selectedSituacao && (
              <button type="button" onClick={() => setParam("situacao", null)} className={chipClass}>
                {selectedSituacao} <span className="opacity-60">×</span>
              </button>
            )}
            {selectedRelator && (
              <button type="button" onClick={() => setParam("relator", null)} className={chipClass}>
                {selectedRelator} <span className="opacity-60">×</span>
              </button>
            )}
          </div>
        )}

        {!loading && (
          <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
            {total.toLocaleString("pt-BR")} {total !== 1 ? "processos" : "processo"}
          </span>
        )}
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40">
                <th className={thClass("numero_fmt")} onClick={() => toggleSort("numero_fmt")}>
                  <span className="inline-flex items-center gap-1">Processo <SortIcon active={sortCol === "numero_fmt"} dir={sortDir} /></span>
                </th>
                <th className={thClass("nome_classe")} onClick={() => toggleSort("nome_classe")}>
                  <span className="inline-flex items-center gap-1">Classe <SortIcon active={sortCol === "nome_classe"} dir={sortDir} /></span>
                </th>
                <th className={thClass("objeto")} onClick={() => toggleSort("objeto")}>
                  <span className="inline-flex items-center gap-1">Objeto <SortIcon active={sortCol === "objeto"} dir={sortDir} /></span>
                </th>
                <th className={thClass("nome_1_parte")} onClick={() => toggleSort("nome_1_parte")}>
                  <span className="inline-flex items-center gap-1">Partes <SortIcon active={sortCol === "nome_1_parte"} dir={sortDir} /></span>
                </th>
                <th className={thClass("relator")} onClick={() => toggleSort("relator")}>
                  <span className="inline-flex items-center gap-1">Relator <SortIcon active={sortCol === "relator"} dir={sortDir} /></span>
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Entidade/Órgão</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
                      <Spinner className="h-4 w-4 text-blue-500" />
                      Carregando processos...
                    </div>
                  </td>
                </tr>
              ) : erro ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-red-500">{erro}</td></tr>
              ) : dados.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400 dark:text-gray-500">Nenhum processo encontrado para os filtros aplicados.</td></tr>
              ) : (
                dados.map((p, i) => (
                  <tr key={p.processo_id} className={`border-t border-gray-100 dark:border-gray-700/50 hover:bg-blue-50/40 dark:hover:bg-blue-900/10 ${i % 2 !== 0 ? "bg-slate-50 dark:bg-slate-800/30" : ""}`}>
                    <td className="px-4 py-2.5">
                      <span className="block font-semibold text-blue-700 dark:text-blue-400">{p.numero_fmt ?? `ID ${p.processo_id}`}</span>
                      {p.situacao && <span className="mt-0.5 block text-[10px] text-gray-400 dark:text-gray-500">{p.situacao}</span>}
                    </td>
                    <td className="max-w-40 px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">{p.nome_classe ?? "—"}</td>
                    <td className="max-w-60 px-4 py-2.5">
                      {p.objeto ? <p className="truncate text-xs text-gray-700 dark:text-gray-300" title={p.objeto}>{p.objeto}</p> : <span className="text-xs text-gray-400">—</span>}
                    </td>
                    <td className="max-w-48 px-4 py-2.5 text-xs text-gray-600 dark:text-gray-300">
                      {p.nome_1_parte ? <p className="truncate" title={p.nome_1_parte}>{p.nome_1_parte}</p> : "—"}
                    </td>
                    <td className="max-w-40 px-4 py-2.5 text-xs text-gray-700 dark:text-gray-300">{p.nome_relator ?? "—"}</td>
                    <td className="max-w-48 px-4 py-2.5 text-xs text-gray-600 dark:text-gray-300">
                      {p.nome_orgao ? <p className="truncate" title={p.nome_orgao}>{p.nome_orgao}</p> : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <button type="button" onClick={() => router.push(`/eprocessos-ce/processos/${p.processo_id}`)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-blue-400 dark:hover:bg-blue-900/40">
                        <FileText className="h-3.5 w-3.5" />
                        Detalhar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPaginas > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 dark:border-gray-700">
            <span className="text-xs text-gray-400 dark:text-gray-500">Página {pagina} de {totalPaginas}</span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setParam("page", String(pagina - 1))} disabled={pagina === 1}
                className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => setParam("page", String(pagina + 1))} disabled={pagina === totalPaginas}
                className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
