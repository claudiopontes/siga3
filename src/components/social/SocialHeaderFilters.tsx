"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type SelectOption = { value: string; label: string };

type MunicipioFiltroRow = {
  codigo_ibge_municipio: string;
  nome_municipio: string;
};

function fmtComp(anomes: string): string {
  if (!anomes || anomes.length < 7) return anomes;
  return `${anomes.slice(5, 7)}/${anomes.slice(0, 4)}`;
}

// ---------------------------------------------------------------------------
// FilterDropdown
// ---------------------------------------------------------------------------

function FilterDropdown({
  activeCount,
  loading,
  children,
}: {
  activeCount: number;
  loading: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        className={`flex h-11 items-center gap-2 rounded-lg border px-4 text-sm font-medium shadow-theme-xs transition-colors disabled:opacity-60 ${
          open || activeCount > 0
            ? "border-teal-400 bg-teal-50 text-teal-700 dark:border-teal-600 dark:bg-teal-900/20 dark:text-teal-300"
            : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
        }`}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
        <span>Filtros</span>
        {activeCount > 0 && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-600 text-[10px] font-bold text-white dark:bg-teal-500">
            {activeCount}
          </span>
        )}
        {loading && (
          <svg
            className="animate-spin"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        )}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`ml-auto transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-110000 w-[480px] max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-700 dark:bg-gray-900">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
            Filtros disponíveis
          </p>
          <div className="space-y-2">{children}</div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FilterTrigger
// ---------------------------------------------------------------------------

function FilterTrigger({
  label,
  value,
  placeholder,
  options,
  onClick,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: SelectOption[];
  onClick: () => void;
}) {
  const selectedLabel =
    value === "all" || value === ""
      ? placeholder
      : options.find((o) => o.value === value)?.label || value;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-11 min-w-[170px] max-w-[260px] items-center gap-2 rounded-lg border px-3 text-left shadow-theme-xs transition hover:bg-gray-50 dark:hover:bg-gray-800 ${
        value !== "all" && value !== ""
          ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/70 dark:bg-blue-900/20 dark:text-blue-300"
          : "border-gray-200 bg-transparent text-gray-700 dark:border-gray-700 dark:text-gray-200"
      }`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
        {label}
      </span>
      <span className="min-w-0 truncate text-xs font-semibold">{selectedLabel}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// FilterDialog
// ---------------------------------------------------------------------------

function FilterDialog({
  title,
  isOpen,
  value,
  placeholder,
  options,
  onClose,
  onSelect,
}: {
  title: string;
  isOpen: boolean;
  value: string;
  placeholder: string;
  options: SelectOption[];
  onClose: () => void;
  onSelect: (value: string) => void;
}) {
  const [term, setTerm] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [isOpen, onClose]);

  const visibleOptions = useMemo(() => {
    const q = term.trim().toLocaleLowerCase("pt-BR");
    if (!q) return options;
    return options.filter((item) =>
      item.label.toLocaleLowerCase("pt-BR").includes(q)
    );
  }, [options, term]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-120000 flex items-center justify-center p-3 sm:p-4">
      <button
        type="button"
        aria-label="Fechar filtro"
        className="absolute inset-0 bg-gray-900/45 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div className="relative w-full max-w-2xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Fechar
          </button>
        </div>
        <div className="space-y-3 p-4">
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Pesquisar..."
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-700 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-950 dark:text-white/90"
          />
          <div className="max-h-[55vh] overflow-auto rounded-lg border border-gray-200 p-1 dark:border-gray-700">
            <button
              type="button"
              onClick={() => {
                onSelect("all");
                onClose();
              }}
              className={`block w-full rounded-md px-3 py-2 text-left text-sm ${
                value === "all"
                  ? "bg-blue-50 font-semibold text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                  : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
              }`}
            >
              {placeholder}
            </button>
            {visibleOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onSelect(option.value);
                  onClose();
                }}
                className={`block w-full rounded-md px-3 py-2 text-left text-sm ${
                  option.value === value
                    ? "bg-blue-50 font-semibold text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                    : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                }`}
              >
                {option.label}
              </button>
            ))}
            {visibleOptions.length === 0 && (
              <p className="px-3 py-5 text-sm text-gray-500 dark:text-gray-400">
                Nenhum resultado encontrado.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function SocialHeaderFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [competencias, setCompetencias] = useState<string[]>([]);
  const [municipioOptions, setMunicipioOptions] = useState<SelectOption[]>([]);
  const [dialog, setDialog] = useState<
    null | "compInicio" | "compFim" | "municipio"
  >(null);

  const selectedCompInicio = searchParams.get("compInicio") ?? "";
  const selectedCompFim    = searchParams.get("compFim")    ?? "";
  const selectedMunicipio  = searchParams.get("municipio")  ?? "all";

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/social/mis/filtros");
        if (!active) return;
        const d = res.ok
          ? await res.json()
          : { competencias: [], municipios: [] };
        setCompetencias(d.competencias ?? []);
        setMunicipioOptions(
          (d.municipios ?? []).map((m: MunicipioFiltroRow) => ({
            value: m.codigo_ibge_municipio,
            label: m.nome_municipio,
          }))
        );
      } catch {
        if (!active) return;
        setCompetencias([]);
        setMunicipioOptions([]);
      } finally {
        if (active) {
          setLoading(false);
          setHasLoadedOnce(true);
        }
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  const defaultCompInicio = useMemo(() => {
    const anoAtual = new Date().getFullYear();
    return `${anoAtual - 1}-01`;
  }, []);

  const defaultCompFim = useMemo(() => competencias.at(-1) ?? "", [competencias]);

  // Aplica defaults na URL na primeira carga, se não há params definidos
  useEffect(() => {
    if (!hasLoadedOnce) return;
    if (selectedCompInicio || selectedCompFim) return;
    if (!defaultCompFim) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set("compInicio", defaultCompInicio);
    next.set("compFim", defaultCompFim);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [
    hasLoadedOnce,
    selectedCompInicio,
    selectedCompFim,
    defaultCompInicio,
    defaultCompFim,
    searchParams,
    pathname,
    router,
  ]);

  const displayedCompInicio = selectedCompInicio || defaultCompInicio;
  const displayedCompFim    = selectedCompFim    || defaultCompFim;

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value === "all" || value === "") next.delete(key);
    else next.set(key, value);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const clearAllFilters = () => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("municipio");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const hasMunicipio  = selectedMunicipio  !== "all" && selectedMunicipio  !== "";
  const hasCompInicio = selectedCompInicio !== "" && selectedCompInicio !== defaultCompInicio;
  const hasCompFim    = selectedCompFim    !== "" && selectedCompFim    !== defaultCompFim;
  const hasActiveFilters  = hasMunicipio || hasCompInicio || hasCompFim;
  const activeFilterCount = [hasMunicipio, hasCompInicio || hasCompFim].filter(Boolean).length;

  const compOptions: SelectOption[] = useMemo(
    () => competencias.map((c) => ({ value: c, label: fmtComp(c) })),
    [competencias]
  );

  type DialogKey = NonNullable<typeof dialog>;

  const optionsByDialog: Record<DialogKey, SelectOption[]> = {
    compInicio: compOptions,
    compFim:    compOptions,
    municipio:  municipioOptions,
  };

  const valueByDialog: Record<DialogKey, string> = {
    compInicio: displayedCompInicio,
    compFim:    displayedCompFim,
    municipio:  selectedMunicipio,
  };

  return (
    <>
      <div className="flex w-full flex-wrap items-center gap-2 pb-1">
        <FilterDropdown
          activeCount={activeFilterCount}
          loading={loading && !hasLoadedOnce}
        >
          {/* Bloco de período */}
          <div className="flex h-11 items-center gap-1 rounded-lg border border-gray-200 bg-transparent px-2 shadow-theme-xs dark:border-gray-700">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Competência
            </span>
            <button
              type="button"
              onClick={() => setDialog("compInicio")}
              className="h-7 rounded-md border border-gray-200 bg-transparent px-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              {displayedCompInicio ? fmtComp(displayedCompInicio) : "—"}
            </button>
            <span className="text-xs text-gray-400">a</span>
            <button
              type="button"
              onClick={() => setDialog("compFim")}
              className="h-7 rounded-md border border-gray-200 bg-transparent px-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              {displayedCompFim ? fmtComp(displayedCompFim) : "—"}
            </button>
          </div>

          {/* Filtro de município */}
          <FilterTrigger
            label="Município"
            value={selectedMunicipio}
            placeholder="Todos"
            options={municipioOptions}
            onClick={() => setDialog("municipio")}
          />

          {/* Limpar */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="h-11 rounded-lg border border-red-200 bg-red-50 px-3 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-800/70 dark:bg-red-900/20 dark:text-red-300 dark:hover:bg-red-900/35"
            >
              Limpar filtros ({activeFilterCount})
            </button>
          )}
        </FilterDropdown>

        {loading && !hasLoadedOnce && (
          <span className="shrink-0 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
            Carregando filtros...
          </span>
        )}
      </div>

      <FilterDialog
        key={dialog ?? "closed"}
        title={
          dialog === "compInicio"
            ? "Selecionar competência inicial"
            : dialog === "compFim"
              ? "Selecionar competência final"
              : "Selecionar município"
        }
        isOpen={dialog !== null}
        value={dialog ? valueByDialog[dialog] : "all"}
        placeholder={dialog === "municipio" ? "Todos" : "—"}
        options={dialog ? optionsByDialog[dialog] : []}
        onClose={() => setDialog(null)}
        onSelect={(value) => {
          if (dialog === "compInicio") setFilter("compInicio", value);
          else if (dialog === "compFim") setFilter("compFim", value);
          else if (dialog === "municipio") setFilter("municipio", value);
        }}
      />
    </>
  );
}
