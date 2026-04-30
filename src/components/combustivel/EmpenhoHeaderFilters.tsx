"use client";

import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { normalizeName } from "@/components/combustivel/filter-utils";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type Option = { value: string; label: string };

type SingleFilterDialogProps = {
  title: string;
  isOpen: boolean;
  options: Option[];
  selectedValue: string;
  allLabel: string;
  onClose: () => void;
  onSelect: (value: string) => void;
};

type MultiFilterDialogProps = {
  title: string;
  isOpen: boolean;
  options: Option[];
  selectedValues: string[];
  onClose: () => void;
  onApply: (values: string[]) => void;
};

function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function buildTitle(options: Option[], value: string, allLabel: string): string {
  if (value === "all") return allLabel;
  return options.find((item) => item.value === value)?.label ?? allLabel;
}

function buildMultiTitle(options: Option[], selectedValues: string[]): string {
  if (selectedValues.length === 0) return "Todos";
  if (selectedValues.length === 1)
    return options.find((item) => item.value === selectedValues[0])?.label ?? "1 selecionado";
  return `${selectedValues.length} selecionados`;
}

function DialogShell({
  title,
  isOpen,
  onClose,
  children,
  footer,
}: {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!isOpen) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-120000 flex items-center justify-center p-4">
      <button type="button" aria-label="Fechar" className="absolute inset-0 bg-gray-900/40" onClick={onClose} />
      <div className="relative max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">
            Fechar
          </button>
        </div>
        <div className="max-h-[55vh] overflow-auto p-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-700">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

function SingleFilterDialog({ title, isOpen, options, selectedValue, allLabel, onClose, onSelect }: SingleFilterDialogProps) {
  const [term, setTerm] = useState("");
  const visibleOptions = useMemo(() => {
    const norm = normalizeText(term);
    return norm ? options.filter((opt) => normalizeText(opt.label).includes(norm)) : options;
  }, [options, term]);

  return (
    <DialogShell title={title} isOpen={isOpen} onClose={onClose}>
      <div className="space-y-3">
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Buscar..."
          className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-700 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-950 dark:text-white/90"
        />
        <button
          type="button"
          onClick={() => { onSelect("all"); onClose(); }}
          className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
            selectedValue === "all"
              ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-900/20 dark:text-brand-300"
              : "border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          }`}
        >
          <span>{allLabel}</span>
          {selectedValue === "all" && <span>Selecionado</span>}
        </button>
        <div className="space-y-2">
          {visibleOptions.map((opt) => {
            const isSelected = selectedValue === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onSelect(opt.value); onClose(); }}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
                  isSelected
                    ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-900/20 dark:text-brand-300"
                    : "border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                }`}
              >
                <span>{opt.label}</span>
                {isSelected && <span>Selecionado</span>}
              </button>
            );
          })}
          {visibleOptions.length === 0 && (
            <p className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              Nenhum item encontrado.
            </p>
          )}
        </div>
      </div>
    </DialogShell>
  );
}

function MultiFilterDialog({ title, isOpen, options, selectedValues, onClose, onApply }: MultiFilterDialogProps) {
  const [term, setTerm] = useState("");
  const visibleOptions = useMemo(() => {
    const norm = normalizeText(term);
    return norm ? options.filter((opt) => normalizeText(opt.label).includes(norm)) : options;
  }, [options, term]);
  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);

  const toggleItem = (value: string) => {
    if (selectedSet.has(value)) onApply(selectedValues.filter((v) => v !== value));
    else onApply([...selectedValues, value]);
  };

  return (
    <DialogShell
      title={title}
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={() => onApply([])} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
            Limpar
          </button>
          <button type="button" onClick={onClose} className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-medium text-white hover:bg-brand-600">
            Fechar ({selectedValues.length})
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Buscar..."
          className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-700 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-950 dark:text-white/90"
        />
        <div className="space-y-2">
          {visibleOptions.map((opt) => {
            const checked = selectedSet.has(opt.value);
            return (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                  checked
                    ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-900/20 dark:text-brand-300"
                    : "border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                }`}
              >
                <span>{opt.label}</span>
                <input type="checkbox" checked={checked} onChange={() => toggleItem(opt.value)} className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
              </label>
            );
          })}
          {visibleOptions.length === 0 && (
            <p className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              Nenhum item encontrado.
            </p>
          )}
        </div>
      </div>
    </DialogShell>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

type FilterDropdownProps = {
  activeCount: number;
  loading: boolean;
  children: React.ReactNode;
};

function FilterDropdown({ activeCount, loading, children }: FilterDropdownProps) {
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
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
        <span>Filtros</span>
        {activeCount > 0 && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-600 text-[10px] font-bold text-white dark:bg-teal-500">
            {activeCount}
          </span>
        )}
        {loading && (
          <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
          <div className="grid grid-cols-2 gap-2">{children}</div>
        </div>
      )}
    </div>
  );
}

export default function EmpenhoHeaderFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [entidades, setEntidades] = useState<string[]>([]);
  const [tipos, setTipos] = useState<string[]>([]);
  const [credores, setCredores] = useState<string[]>([]);
  const [formas, setFormas] = useState<string[]>([]);
  const [anos, setAnos] = useState<number[]>([]);

  const [entidadeDialogOpen, setEntidadeDialogOpen] = useState(false);
  const [tipoDialogOpen, setTipoDialogOpen] = useState(false);
  const [credorDialogOpen, setCredorDialogOpen] = useState(false);
  const [formaDialogOpen, setFormaDialogOpen] = useState(false);
  const [anoDialogOpen, setAnoDialogOpen] = useState(false);

  const selectedEntidade = searchParams.get("entidade") ?? "all";
  const selectedTipos = searchParams.getAll("tipo").filter((t) => t.length > 0);
  const selectedCredor = searchParams.get("credor") ?? "all";
  const selectedForma = searchParams.get("forma") ?? "all";
  const selectedAnoInicio = searchParams.get("anoInicio") ?? "";
  const selectedAnoFim = searchParams.get("anoFim") ?? "";

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      if (!isSupabaseConfigured || !supabase) {
        setLoading(false);
        setError("Supabase não configurado");
        return;
      }

      try {
        const pageSize = 1000;
        let offset = 0;
        const entidadeSet = new Set<string>();
        const tipoSet = new Set<string>();
        const credorSet = new Set<string>();
        const formaSet = new Set<string>();
        const anoSet = new Set<number>();

        while (true) {
          const { data, error } = await supabase
            .from("combustivel_empenho_mensal")
            .select("entidade, tipo_combustivel, nome_credor, forma_fornecimento, ano")
            .order("entidade", { ascending: true })
            .range(offset, offset + pageSize - 1);

          if (error) throw error;
          const batch = (data ?? []) as Array<{
            entidade: string;
            tipo_combustivel: string;
            nome_credor: string;
            forma_fornecimento: string;
            ano: number;
          }>;

          batch.forEach((row) => {
            if (row.entidade) entidadeSet.add(row.entidade);
            if (row.tipo_combustivel) tipoSet.add(row.tipo_combustivel);
            if (row.nome_credor) credorSet.add(row.nome_credor);
            if (row.forma_fornecimento) formaSet.add(row.forma_fornecimento);
            if (row.ano) anoSet.add(row.ano);
          });

          if (batch.length < pageSize) break;
          offset += pageSize;
        }

        if (!active) return;
        setEntidades([...entidadeSet].sort((a, b) => a.localeCompare(b, "pt-BR")));
        setTipos([...tipoSet].sort((a, b) => a.localeCompare(b, "pt-BR")));
        setCredores([...credorSet].sort((a, b) => a.localeCompare(b, "pt-BR")));
        setFormas([...formaSet].sort());
        setAnos([...anoSet].sort((a, b) => a - b));
        setLoading(false);
      } catch (err) {
        if (!active) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg || "Falha ao carregar filtros");
        setLoading(false);
      }
    }

    load();
    return () => { active = false; };
  }, []);

  const replaceParams = (updater: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    updater(params);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const entidadeOptions = useMemo<Option[]>(
    () => entidades.map((e) => ({ value: normalizeName(e), label: e })),
    [entidades],
  );
  const tipoOptions = useMemo<Option[]>(() => tipos.map((t) => ({ value: t, label: t })), [tipos]);
  const credorOptions = useMemo<Option[]>(() => credores.map((c) => ({ value: c, label: c })), [credores]);
  const formaOptions = useMemo<Option[]>(() => formas.map((f) => ({ value: f, label: f })), [formas]);

  const entidadeTitle = buildTitle(entidadeOptions, selectedEntidade, "Todos");
  const tipoTitle = buildMultiTitle(tipoOptions, selectedTipos);
  const credorTitle = buildTitle(credorOptions, selectedCredor, "Todos");
  const formaTitle = buildTitle(formaOptions, selectedForma, "Todos");
  const hasAnoFilter = !!selectedAnoInicio || !!selectedAnoFim;
  const anoTitle = useMemo(() => {
    if (!selectedAnoInicio && !selectedAnoFim) return "Todos";
    if (selectedAnoInicio && selectedAnoFim) return `${selectedAnoInicio}–${selectedAnoFim}`;
    if (selectedAnoInicio) return `A partir de ${selectedAnoInicio}`;
    return `Até ${selectedAnoFim}`;
  }, [selectedAnoInicio, selectedAnoFim]);

  const hasActiveFilters =
    selectedEntidade !== "all" || selectedTipos.length > 0 || selectedCredor !== "all" ||
    selectedForma !== "all" || hasAnoFilter;
  const activeFilterCount =
    (selectedEntidade !== "all" ? 1 : 0) + selectedTipos.length +
    (selectedCredor !== "all" ? 1 : 0) + (selectedForma !== "all" ? 1 : 0) +
    (hasAnoFilter ? 1 : 0);

  const filterBtnClass = (active: boolean) =>
    `flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 min-w-0 flex-1 ${
      active
        ? "border-teal-300 bg-teal-50 dark:border-teal-700 dark:bg-teal-900/20"
        : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
    }`;

  return (
    <>
      {/* Linha de controle: botão funil + chips ativos */}
      <div className="flex items-center gap-2">
        <FilterDropdown activeCount={activeFilterCount} loading={loading}>
          <button type="button" onClick={() => setEntidadeDialogOpen(true)} disabled={loading} className={filterBtnClass(selectedEntidade !== "all")}>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Entidade</span>
            <span className={`truncate text-xs font-medium ${selectedEntidade !== "all" ? "text-teal-700 dark:text-teal-300" : "text-gray-700 dark:text-gray-200"}`}>{entidadeTitle}</span>
          </button>

          <button type="button" onClick={() => setTipoDialogOpen(true)} disabled={loading} className={filterBtnClass(selectedTipos.length > 0)}>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Tipo</span>
            <span className={`truncate text-xs font-medium ${selectedTipos.length > 0 ? "text-teal-700 dark:text-teal-300" : "text-gray-700 dark:text-gray-200"}`}>{tipoTitle}</span>
          </button>

          <button type="button" onClick={() => setCredorDialogOpen(true)} disabled={loading} className={filterBtnClass(selectedCredor !== "all")}>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Credor</span>
            <span className={`truncate text-xs font-medium ${selectedCredor !== "all" ? "text-teal-700 dark:text-teal-300" : "text-gray-700 dark:text-gray-200"}`}>{credorTitle}</span>
          </button>

          <button type="button" onClick={() => setFormaDialogOpen(true)} disabled={loading} className={filterBtnClass(selectedForma !== "all")}>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Fornecimento</span>
            <span className={`truncate text-xs font-medium ${selectedForma !== "all" ? "text-teal-700 dark:text-teal-300" : "text-gray-700 dark:text-gray-200"}`}>{formaTitle}</span>
          </button>

          <button type="button" onClick={() => setAnoDialogOpen(true)} disabled={loading} className={filterBtnClass(hasAnoFilter)}>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Ano</span>
            <span className={`truncate text-xs font-medium ${hasAnoFilter ? "text-orange-600 dark:text-orange-400" : "text-gray-700 dark:text-gray-200"}`}>{anoTitle}</span>
          </button>
        </FilterDropdown>

        {/* Chips filtros ativos */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-1.5">
            {selectedEntidade !== "all" && (
              <button type="button" onClick={() => replaceParams((p) => p.delete("entidade"))}
                className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700 hover:bg-teal-100 dark:border-teal-700/50 dark:bg-teal-900/20 dark:text-teal-300">
                {entidadeTitle} <span className="opacity-60">×</span>
              </button>
            )}
            {selectedTipos.map((tipo) => (
              <button key={tipo} type="button"
                onClick={() => replaceParams((p) => { const next = selectedTipos.filter((t) => t !== tipo); p.delete("tipo"); next.forEach((t) => p.append("tipo", t)); })}
                className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700 hover:bg-teal-100 dark:border-teal-700/50 dark:bg-teal-900/20 dark:text-teal-300">
                {tipo} <span className="opacity-60">×</span>
              </button>
            ))}
            {selectedCredor !== "all" && (
              <button type="button" onClick={() => replaceParams((p) => p.delete("credor"))}
                className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700 hover:bg-teal-100 dark:border-teal-700/50 dark:bg-teal-900/20 dark:text-teal-300">
                {credorTitle} <span className="opacity-60">×</span>
              </button>
            )}
            {selectedForma !== "all" && (
              <button type="button" onClick={() => replaceParams((p) => p.delete("forma"))}
                className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700 hover:bg-teal-100 dark:border-teal-700/50 dark:bg-teal-900/20 dark:text-teal-300">
                {formaTitle} <span className="opacity-60">×</span>
              </button>
            )}
            {hasAnoFilter && (
              <button type="button" onClick={() => replaceParams((p) => { p.delete("anoInicio"); p.delete("anoFim"); })}
                className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700 hover:bg-orange-100 dark:border-orange-700/50 dark:bg-orange-900/20 dark:text-orange-300">
                {anoTitle} <span className="opacity-60">×</span>
              </button>
            )}
            <button type="button"
              onClick={() => replaceParams((p) => { p.delete("entidade"); p.delete("tipo"); p.delete("credor"); p.delete("forma"); p.delete("anoInicio"); p.delete("anoFim"); })}
              className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-100 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400">
              Limpar tudo
            </button>
          </div>
        )}

        {error && <span className="truncate text-xs text-red-600 dark:text-red-400">{error}</span>}
      </div>

      <SingleFilterDialog title="Selecionar Entidade" isOpen={entidadeDialogOpen} options={entidadeOptions} selectedValue={selectedEntidade} allLabel="Todos" onClose={() => setEntidadeDialogOpen(false)} onSelect={(v) => replaceParams((p) => { if (v === "all") p.delete("entidade"); else p.set("entidade", v); })} />
      <MultiFilterDialog title="Selecionar Tipos de Combustível" isOpen={tipoDialogOpen} options={tipoOptions} selectedValues={selectedTipos} onClose={() => setTipoDialogOpen(false)} onApply={(values) => replaceParams((p) => { p.delete("tipo"); values.forEach((v) => p.append("tipo", v)); })} />
      <SingleFilterDialog title="Selecionar Credor" isOpen={credorDialogOpen} options={credorOptions} selectedValue={selectedCredor} allLabel="Todos" onClose={() => setCredorDialogOpen(false)} onSelect={(v) => replaceParams((p) => { if (v === "all") p.delete("credor"); else p.set("credor", v); })} />
      <SingleFilterDialog title="Selecionar Forma de Fornecimento" isOpen={formaDialogOpen} options={formaOptions} selectedValue={selectedForma} allLabel="Todos" onClose={() => setFormaDialogOpen(false)} onSelect={(v) => replaceParams((p) => { if (v === "all") p.delete("forma"); else p.set("forma", v); })} />
      <AnoFiltroDialog
        isOpen={anoDialogOpen}
        anos={anos}
        anoInicio={selectedAnoInicio}
        anoFim={selectedAnoFim}
        onClose={() => setAnoDialogOpen(false)}
        onApply={(inicio, fim) =>
          replaceParams((p) => {
            if (inicio) p.set("anoInicio", inicio); else p.delete("anoInicio");
            if (fim) p.set("anoFim", fim); else p.delete("anoFim");
          })
        }
      />
    </>
  );
}

function AnoFiltroDialog({
  isOpen, anos, anoInicio, anoFim, onClose, onApply,
}: {
  isOpen: boolean;
  anos: number[];
  anoInicio: string;
  anoFim: string;
  onClose: () => void;
  onApply: (inicio: string, fim: string) => void;
}) {
  const [inicio, setInicio] = useState(anoInicio);
  const [fim, setFim] = useState(anoFim);

  useEffect(() => {
    if (isOpen) { setInicio(anoInicio); setFim(anoFim); }
  }, [isOpen, anoInicio, anoFim]);

  const selectClass = "h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-700 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-950 dark:text-white/90";

  return (
    <DialogShell
      title="Filtrar por Ano"
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={() => { onApply("", ""); onClose(); }} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
            Limpar
          </button>
          <button type="button" onClick={() => { onApply(inicio, fim); onClose(); }} className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-medium text-white hover:bg-brand-600">
            Aplicar
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Ano inicial</label>
          <select value={inicio} onChange={(e) => setInicio(e.target.value)} className={selectClass}>
            <option value="">Todos</option>
            {anos.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Ano final</label>
          <select value={fim} onChange={(e) => setFim(e.target.value)} className={selectClass}>
            <option value="">Todos</option>
            {anos.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        {inicio && fim && Number(inicio) > Number(fim) && (
          <p className="text-xs text-red-500">O ano inicial não pode ser maior que o ano final.</p>
        )}
      </div>
    </DialogShell>
  );
}
