"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Option = { value: string; label: string };

function normalizeText(v: string) {
  return v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function buildTitle(options: Option[], value: string, allLabel: string) {
  if (!value) return allLabel;
  return options.find((o) => o.value === value)?.label ?? allLabel;
}

// ---------------------------------------------------------------------------
// DialogShell
// ---------------------------------------------------------------------------
function DialogShell({
  title, isOpen, onClose, children, footer,
}: {
  title: string; isOpen: boolean; onClose: () => void;
  children: React.ReactNode; footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!isOpen) return;
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120000] flex items-center justify-center p-4">
      <button type="button" aria-label="Fechar" className="absolute inset-0 bg-gray-900/40" onClick={onClose} />
      <div className="relative max-h-[80vh] w-full max-w-lg overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">Fechar</button>
        </div>
        <div className="max-h-[55vh] overflow-auto p-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-700">{footer}</div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SingleFilterDialog
// ---------------------------------------------------------------------------
function SingleFilterDialog({
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

  const itemClass = (active: boolean) =>
    `flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
      active
        ? "border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-700 dark:bg-teal-900/20 dark:text-teal-300"
        : "border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
    }`;

  return (
    <DialogShell title={title} isOpen={isOpen} onClose={onClose}>
      <div className="space-y-3">
        <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Buscar..."
          className="h-9 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-700 focus:border-teal-400 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-white" />
        <button type="button" onClick={() => { onSelect(""); onClose(); }} className={itemClass(!selectedValue)}>
          <span>{allLabel}</span>
          {!selectedValue && <span className="text-xs">✓</span>}
        </button>
        <div className="space-y-1.5">
          {visible.map((opt) => (
            <button key={opt.value} type="button" onClick={() => { onSelect(opt.value); onClose(); }} className={itemClass(selectedValue === opt.value)}>
              <span>{opt.label}</span>
              {selectedValue === opt.value && <span className="text-xs">✓</span>}
            </button>
          ))}
          {visible.length === 0 && (
            <p className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500 dark:border-gray-700">Nenhum item encontrado.</p>
          )}
        </div>
      </div>
    </DialogShell>
  );
}

// ---------------------------------------------------------------------------
// FilterDropdown
// ---------------------------------------------------------------------------
function FilterDropdown({ activeCount, loading, children }: { activeCount: number; loading: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", handler); document.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        className={`flex h-11 items-center gap-2 rounded-lg border px-4 text-sm font-medium shadow-sm transition-colors disabled:opacity-60 ${
          open || activeCount > 0
            ? "border-teal-400 bg-teal-50 text-teal-700 dark:border-teal-600 dark:bg-teal-900/20 dark:text-teal-300"
            : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
        }`}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
        <span>Filtros</span>
        {activeCount > 0 && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-600 text-[10px] font-bold text-white">
            {activeCount}
          </span>
        )}
        {loading && (
          <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        )}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`ml-auto transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-[110000] w-[480px] max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-700 dark:bg-gray-900">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Filtros disponíveis</p>
          <div className="grid grid-cols-2 gap-2">{children}</div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
type FiltrosData = {
  anos: number[];
  classes: string[];
  situacoes: string[];
  relatores: string[];
};

export default function ProcessosHeaderFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState<FiltrosData>({ anos: [], classes: [], situacoes: [], relatores: [] });

  const [dialogAberto, setDialogAberto] = useState<"ano" | "classe" | "situacao" | "relator" | null>(null);

  const selectedAno      = searchParams.get("ano") ?? "";
  const selectedClasse   = searchParams.get("classe") ?? "";
  const selectedSituacao = searchParams.get("situacao") ?? "";
  const selectedRelator  = searchParams.get("relator") ?? "";

  useEffect(() => {
    let ativo = true;
    fetch("/api/processos/filtros")
      .then((r) => r.json())
      .then((d: FiltrosData) => { if (ativo) { setFiltros(d); setLoading(false); } })
      .catch(() => { if (ativo) setLoading(false); });
    return () => { ativo = false; };
  }, []);

  const replace = (updater: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(searchParams.toString());
    updater(p);
    p.delete("page");
    const q = p.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  const anoOptions    = useMemo<Option[]>(() => filtros.anos.map((a) => ({ value: String(a), label: String(a) })), [filtros.anos]);
  const classeOptions = useMemo<Option[]>(() => filtros.classes.map((c) => ({ value: c, label: c })), [filtros.classes]);
  const situOptions   = useMemo<Option[]>(() => filtros.situacoes.map((s) => ({ value: s, label: s })), [filtros.situacoes]);
  const relOptions    = useMemo<Option[]>(() => filtros.relatores.map((r) => ({ value: r, label: r })), [filtros.relatores]);

  const activeCount =
    (selectedAno ? 1 : 0) +
    (selectedClasse ? 1 : 0) +
    (selectedSituacao ? 1 : 0) +
    (selectedRelator ? 1 : 0);

  const filterItemClass = (active: boolean) =>
    `flex flex-col gap-0.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${
      active ? "border-teal-300 bg-teal-50 dark:border-teal-700 dark:bg-teal-900/20" : "border-gray-200 dark:border-gray-700"
    }`;

  const chipClass = "inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700 hover:bg-teal-100 dark:border-teal-700/50 dark:bg-teal-900/20 dark:text-teal-300";

  return (
    <>
      <div className="flex items-center gap-3">
        <FilterDropdown activeCount={activeCount} loading={loading}>
          <button type="button" onClick={() => setDialogAberto("ano")} disabled={loading} className={filterItemClass(!!selectedAno)}>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Ano</span>
            <span className={`truncate font-medium ${selectedAno ? "text-teal-700 dark:text-teal-300" : "text-gray-700 dark:text-gray-200"}`}>
              {selectedAno || "Todos"}
            </span>
          </button>

          <button type="button" onClick={() => setDialogAberto("classe")} disabled={loading} className={filterItemClass(!!selectedClasse)}>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Classe</span>
            <span className={`truncate font-medium ${selectedClasse ? "text-teal-700 dark:text-teal-300" : "text-gray-700 dark:text-gray-200"}`}>
              {buildTitle(classeOptions, selectedClasse, "Todas")}
            </span>
          </button>

          <button type="button" onClick={() => setDialogAberto("situacao")} disabled={loading} className={filterItemClass(!!selectedSituacao)}>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Situação</span>
            <span className={`truncate font-medium ${selectedSituacao ? "text-teal-700 dark:text-teal-300" : "text-gray-700 dark:text-gray-200"}`}>
              {buildTitle(situOptions, selectedSituacao, "Todas")}
            </span>
          </button>

          <button type="button" onClick={() => setDialogAberto("relator")} disabled={loading} className={filterItemClass(!!selectedRelator)}>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Relator</span>
            <span className={`truncate font-medium ${selectedRelator ? "text-teal-700 dark:text-teal-300" : "text-gray-700 dark:text-gray-200"}`}>
              {buildTitle(relOptions, selectedRelator, "Todos")}
            </span>
          </button>
        </FilterDropdown>

        {/* Chips de filtros ativos */}
        {activeCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {selectedAno && (
              <button type="button" onClick={() => replace((p) => p.delete("ano"))} className={chipClass}>
                {selectedAno} <span className="opacity-60">×</span>
              </button>
            )}
            {selectedClasse && (
              <button type="button" onClick={() => replace((p) => p.delete("classe"))} className={chipClass}>
                {selectedClasse} <span className="opacity-60">×</span>
              </button>
            )}
            {selectedSituacao && (
              <button type="button" onClick={() => replace((p) => p.delete("situacao"))} className={chipClass}>
                {selectedSituacao} <span className="opacity-60">×</span>
              </button>
            )}
            {selectedRelator && (
              <button type="button" onClick={() => replace((p) => p.delete("relator"))} className={chipClass}>
                {selectedRelator} <span className="opacity-60">×</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => replace((p) => { p.delete("ano"); p.delete("classe"); p.delete("situacao"); p.delete("relator"); })}
              className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-100 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400"
            >
              Limpar tudo
            </button>
          </div>
        )}
      </div>

      <SingleFilterDialog title="Selecionar Ano" isOpen={dialogAberto === "ano"} options={anoOptions}
        selectedValue={selectedAno} allLabel="Todos os anos"
        onClose={() => setDialogAberto(null)}
        onSelect={(v) => replace((p) => { if (v) p.set("ano", v); else p.delete("ano"); })} />

      <SingleFilterDialog title="Selecionar Classe" isOpen={dialogAberto === "classe"} options={classeOptions}
        selectedValue={selectedClasse} allLabel="Todas as classes"
        onClose={() => setDialogAberto(null)}
        onSelect={(v) => replace((p) => { if (v) p.set("classe", v); else p.delete("classe"); })} />

      <SingleFilterDialog title="Selecionar Situação" isOpen={dialogAberto === "situacao"} options={situOptions}
        selectedValue={selectedSituacao} allLabel="Todas as situações"
        onClose={() => setDialogAberto(null)}
        onSelect={(v) => replace((p) => { if (v) p.set("situacao", v); else p.delete("situacao"); })} />

      <SingleFilterDialog title="Selecionar Relator" isOpen={dialogAberto === "relator"} options={relOptions}
        selectedValue={selectedRelator} allLabel="Todos os relatores"
        onClose={() => setDialogAberto(null)}
        onSelect={(v) => replace((p) => { if (v) p.set("relator", v); else p.delete("relator"); })} />
    </>
  );
}
