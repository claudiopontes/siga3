"use client";

import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type SelectOption = {
  value: string;
  label: string;
};

// --- FilterDropdown ---

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
        <div className="absolute left-0 top-[calc(100%+6px)] z-110000 w-[520px] max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-700 dark:bg-gray-900">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
            Filtros disponíveis
          </p>
          <div className="space-y-2">{children}</div>
        </div>
      )}
    </div>
  );
}

// --- FilterTrigger ---

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
      : (options.find((o) => o.value === value)?.label ?? value);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-11 min-w-[170px] max-w-60 items-center gap-2 rounded-lg border px-3 text-left shadow-theme-xs transition hover:bg-gray-50 dark:hover:bg-gray-800 ${
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

// --- FilterDialog ---

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

  const visible = useMemo(() => {
    const q = term.trim().toLocaleLowerCase("pt-BR");
    return q ? options.filter((o) => o.label.toLocaleLowerCase("pt-BR").includes(q)) : options;
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
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
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
            {visible.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onSelect(opt.value);
                  onClose();
                }}
                className={`block w-full rounded-md px-3 py-2 text-left text-sm ${
                  opt.value === value
                    ? "bg-blue-50 font-semibold text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                    : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                }`}
              >
                {opt.label}
              </button>
            ))}
            {visible.length === 0 && (
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

// --- Componente principal ---

export default function DespesaHeaderFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  type EntidadeOption = SelectOption & { idEnte: string };

  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [anosDisponiveis, setAnosDisponiveis] = useState<number[]>([]);
  const [entesOptions, setEntesOptions] = useState<SelectOption[]>([]);
  const [entidadesOptions, setEntidadesOptions] = useState<EntidadeOption[]>([]);
  const [dialog, setDialog] = useState<null | "anoInicio" | "anoFim" | "ente" | "entidade">(null);

  const selectedAnoInicio = searchParams.get("anoInicio") ?? "";
  const selectedAnoFim    = searchParams.get("anoFim")    ?? "";
  const selectedEnte      = searchParams.get("ente")      ?? "all";
  const selectedEntidade  = searchParams.get("entidade")  ?? "all";
  const periodoManual     = searchParams.get("periodoManual") === "1";

  // Carrega anos disponíveis, entes e entidades
  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      if (!isSupabaseConfigured || !supabase) {
        if (active) { setLoading(false); setHasLoadedOnce(true); }
        return;
      }

      try {
        const [anoMaxRes, anoMinRes, entesRes, entidadesRes] = await Promise.all([
          supabase
            .from("fato_empenho")
            .select("ano_remessa")
            .not("ano_remessa", "is", null)
            .order("ano_remessa", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("fato_empenho")
            .select("ano_remessa")
            .not("ano_remessa", "is", null)
            .order("ano_remessa", { ascending: true })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("dim_ente")
            .select("id_ente,nome")
            .order("nome", { ascending: true })
            .range(0, 9999),
          supabase
            .from("dim_entidade")
            .select("id_entidade,id_ente,nome")
            .eq("inativo", 0)
            .order("nome", { ascending: true })
            .range(0, 9999),
        ]);

        if (!active) return;

        const anoMax = Number((anoMaxRes.data as { ano_remessa?: number | null } | null)?.ano_remessa);
        const anoMin = Number((anoMinRes.data as { ano_remessa?: number | null } | null)?.ano_remessa);
        const anos =
          Number.isFinite(anoMax) && Number.isFinite(anoMin) && anoMax >= anoMin
            ? Array.from({ length: anoMax - anoMin + 1 }, (_, index) => anoMax - index)
            : [];

        // value = dim_ente.id_ente (chave usada nas materialized views)
        const entes = (entesRes.data ?? [])
          .filter((e: { id_ente: number | null; nome: string | null }) => e.id_ente != null && e.nome)
          .map((e: { id_ente: number; nome: string }) => ({
            value: String(e.id_ente),
            label: e.nome,
          }));

        // value = dim_entidade.id_entidade; idEnte = dim_entidade.id_ente para cascata
        const entidades = (entidadesRes.data ?? [])
          .filter((e: { id_entidade: number | null; id_ente: number | null; nome: string | null }) =>
            e.id_entidade != null && e.id_ente != null && e.nome)
          .map((e: { id_entidade: number; id_ente: number; nome: string }) => ({
            value: String(e.id_entidade),
            label: e.nome,
            idEnte: String(e.id_ente),
          }));

        setAnosDisponiveis(anos);
        setEntesOptions(entes);
        setEntidadesOptions(entidades);
      } catch (err) {
        console.error("Falha ao carregar filtros da despesa:", err);
      } finally {
        if (active) { setLoading(false); setHasLoadedOnce(true); }
      }
    }

    load();
    return () => { active = false; };
  }, []);

  // Defaults: ano mais recente como anoFim, anterior como anoInicio
  const defaultAnoFim = useMemo(() => {
    if (anosDisponiveis.length === 0) return String(new Date().getFullYear());
    return String(anosDisponiveis[0]);
  }, [anosDisponiveis]);

  const defaultAnoInicio = useMemo(() => {
    if (anosDisponiveis.length === 0) return String(new Date().getFullYear() - 1);
    if (anosDisponiveis.length === 1) return String(anosDisponiveis[0]);
    return String(anosDisponiveis[1]);
  }, [anosDisponiveis]);

  // Aplica defaults na URL após carregar, se ainda não definidos
  useEffect(() => {
    if (!hasLoadedOnce) return;
    if (selectedAnoInicio || selectedAnoFim) return;

    const next = new URLSearchParams(searchParams.toString());
    next.set("anoInicio", defaultAnoInicio);
    next.set("anoFim", defaultAnoFim);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [
    hasLoadedOnce,
    selectedAnoInicio,
    selectedAnoFim,
    defaultAnoInicio,
    defaultAnoFim,
    searchParams,
    pathname,
    router,
  ]);

  useEffect(() => {
    if (!hasLoadedOnce || periodoManual) return;
    if (defaultAnoInicio === defaultAnoFim) return;
    if (selectedAnoInicio !== selectedAnoFim) return;
    if (selectedAnoFim !== defaultAnoFim) return;

    const next = new URLSearchParams(searchParams.toString());
    next.set("anoInicio", defaultAnoInicio);
    next.set("anoFim", defaultAnoFim);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [
    hasLoadedOnce,
    periodoManual,
    selectedAnoInicio,
    selectedAnoFim,
    defaultAnoInicio,
    defaultAnoFim,
    searchParams,
    pathname,
    router,
  ]);

  const displayedAnoInicio = selectedAnoInicio || defaultAnoInicio;
  const displayedAnoFim    = selectedAnoFim    || defaultAnoFim;

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value === "all" || value === "") next.delete(key);
    else next.set(key, value);
    if (key === "anoInicio" || key === "anoFim") next.set("periodoManual", "1");
    // Ao trocar ente, limpa entidade (cascata)
    if (key === "ente") next.delete("entidade");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const clearFilters = () => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("ente");
    next.delete("entidade");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const hasActiveFilters = selectedEnte !== "all" || selectedEntidade !== "all";
  const activeFilterCount = [selectedEnte !== "all", selectedEntidade !== "all"].filter(Boolean).length;

  const anosOptions = useMemo(
    () => anosDisponiveis.map((a) => ({ value: String(a), label: String(a) })),
    [anosDisponiveis],
  );

  // Entidades filtradas pelo ente selecionado (cascata)
  const entidadesFiltradas = useMemo(
    () =>
      selectedEnte === "all"
        ? entidadesOptions
        : entidadesOptions.filter((e) => e.idEnte === selectedEnte),
    [entidadesOptions, selectedEnte],
  );

  const optionsByDialog: Record<"anoInicio" | "anoFim" | "ente" | "entidade", SelectOption[]> = {
    anoInicio: anosOptions,
    anoFim:    anosOptions,
    ente:      entesOptions,
    entidade:  entidadesFiltradas,
  };

  const valueByDialog: Record<"anoInicio" | "anoFim" | "ente" | "entidade", string> = {
    anoInicio: displayedAnoInicio,
    anoFim:    displayedAnoFim,
    ente:      selectedEnte,
    entidade:  selectedEntidade,
  };

  return (
    <>
      <div className="flex w-full flex-wrap items-center gap-2 pb-1">
        <FilterDropdown activeCount={activeFilterCount} loading={loading && !hasLoadedOnce}>
          {/* Período — mesmo layout da Receita */}
          <div className="flex h-11 items-center gap-1 rounded-lg border border-gray-200 bg-transparent px-2 shadow-theme-xs dark:border-gray-700">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Período</span>
            <button
              type="button"
              onClick={() => setDialog("anoInicio")}
              className="h-7 rounded-md border border-gray-200 bg-transparent px-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              {displayedAnoInicio || "—"}
            </button>
            <span className="text-xs text-gray-400">a</span>
            <button
              type="button"
              onClick={() => setDialog("anoFim")}
              className="h-7 rounded-md border border-gray-200 bg-transparent px-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              {displayedAnoFim || "—"}
            </button>
          </div>

          <FilterTrigger
            label="Ente"
            value={selectedEnte}
            placeholder="Todos"
            options={entesOptions}
            onClick={() => setDialog("ente")}
          />

          <FilterTrigger
            label="Entidade"
            value={selectedEntidade}
            placeholder="Todas"
            options={entidadesFiltradas}
            onClick={() => setDialog("entidade")}
          />

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
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
          dialog === "anoInicio" ? "Selecionar ano inicial"
          : dialog === "anoFim" ? "Selecionar ano final"
          : dialog === "ente" ? "Selecionar ente"
          : "Selecionar entidade"
        }
        isOpen={dialog !== null}
        value={dialog ? valueByDialog[dialog] : "all"}
        placeholder={dialog === "entidade" ? "Todas" : "Todos"}
        options={dialog ? optionsByDialog[dialog] : []}
        onClose={() => setDialog(null)}
        onSelect={(value) => {
          if (dialog) setFilter(dialog, value);
        }}
      />
    </>
  );
}
