"use client";

import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import {
  buildMunicipioIndex,
  inferMunicipioCodeFromEntidade,
  normalizeName,
} from "@/components/combustivel/filter-utils";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type MunicipioRow = {
  codigo: string;
  nome: string;
  uf_codigo: string | null;
};

type TipoRow = {
  entidade: string;
  tipo_combustivel: string;
  emitente: string;
  ano?: number;
  mes?: number;
};

type Option = {
  value: string;
  label: string;
};

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

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const msg = (error as { message?: unknown }).message;
    return typeof msg === "string" ? msg : String(msg);
  }
  return String(error);
}

function isMissingEmitenteColumnError(error: unknown): boolean {
  const message = extractErrorMessage(error).toLowerCase();
  return (
    message.includes("emitente") &&
    (message.includes("column") ||
      message.includes("coluna") ||
      message.includes("schema cache") ||
      message.includes("does not exist") ||
      message.includes("nao existe"))
  );
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function buildTitle(options: Option[], value: string, allLabel: string): string {
  if (value === "all") return allLabel;
  return options.find((item) => item.value === value)?.label ?? allLabel;
}

function buildMultiTitle(options: Option[], selectedValues: string[]): string {
  if (selectedValues.length === 0) return "Todos";
  if (selectedValues.length === 1) {
    return options.find((item) => item.value === selectedValues[0])?.label ?? "1 selecionado";
  }
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
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120000] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Fechar diálogo"
        className="absolute inset-0 bg-gray-900/40"
        onClick={onClose}
      />
      <div className="relative max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Fechar
          </button>
        </div>
        <div className="max-h-[55vh] overflow-auto p-4">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-700">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SingleFilterDialog({
  title,
  isOpen,
  options,
  selectedValue,
  allLabel,
  onClose,
  onSelect,
}: SingleFilterDialogProps) {
  const [term, setTerm] = useState("");

  const visibleOptions = useMemo(() => {
    const normalized = normalizeText(term);
    if (!normalized) return options;
    return options.filter((opt) => normalizeText(opt.label).includes(normalized));
  }, [options, term]);

  return (
    <DialogShell title={title} isOpen={isOpen} onClose={onClose}>
      <div className="space-y-3">
        <input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Buscar..."
          className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-700 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-950 dark:text-white/90"
        />

        <button
          type="button"
          onClick={() => {
            onSelect("all");
            onClose();
          }}
          className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
            selectedValue === "all"
              ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-900/20 dark:text-brand-300"
              : "border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          }`}
        >
          <span>{allLabel}</span>
          {selectedValue === "all" ? <span>Selecionado</span> : null}
        </button>

        <div className="space-y-2">
          {visibleOptions.map((opt) => {
            const isSelected = selectedValue === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onSelect(opt.value);
                  onClose();
                }}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
                  isSelected
                    ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-900/20 dark:text-brand-300"
                    : "border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                }`}
              >
                <span>{opt.label}</span>
                {isSelected ? <span>Selecionado</span> : null}
              </button>
            );
          })}
          {visibleOptions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              Nenhum item encontrado.
            </p>
          ) : null}
        </div>
      </div>
    </DialogShell>
  );
}

function MultiFilterDialog({
  title,
  isOpen,
  options,
  selectedValues,
  onClose,
  onApply,
}: MultiFilterDialogProps) {
  const [term, setTerm] = useState("");

  const visibleOptions = useMemo(() => {
    const normalized = normalizeText(term);
    if (!normalized) return options;
    return options.filter((opt) => normalizeText(opt.label).includes(normalized));
  }, [options, term]);

  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);

  const toggleItem = (value: string) => {
    if (selectedSet.has(value)) {
      onApply(selectedValues.filter((item) => item !== value));
      return;
    }
    onApply([...selectedValues, value]);
  };

  return (
    <DialogShell
      title={title}
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={() => onApply([])}
            className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Limpar
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-medium text-white hover:bg-brand-600"
          >
            Fechar ({selectedValues.length})
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
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
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleItem(opt.value)}
                  className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
              </label>
            );
          })}
          {visibleOptions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              Nenhum item encontrado.
            </p>
          ) : null}
        </div>
      </div>
    </DialogShell>
  );
}

export default function CombustivelHeaderFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [municipios, setMunicipios] = useState<MunicipioRow[]>([]);
  const [entidades, setEntidades] = useState<string[]>([]);
  const [tipos, setTipos] = useState<string[]>([]);
  const [emitentes, setEmitentes] = useState<string[]>([]);
  const [, setLatestMonthLabel] = useState<string | null>(null);

  const [municipioDialogOpen, setMunicipioDialogOpen] = useState(false);
  const [entidadeDialogOpen, setEntidadeDialogOpen] = useState(false);
  const [tipoDialogOpen, setTipoDialogOpen] = useState(false);
  const [emitenteDialogOpen, setEmitenteDialogOpen] = useState(false);

  const selectedMunicipio = searchParams.get("municipio") ?? "all";
  const selectedEntidade = searchParams.get("entidade") ?? "all";
  const selectedTipos = searchParams.getAll("tipo").filter((item) => item.length > 0);
  const selectedEmitente = searchParams.get("emitente") ?? "all";

  useEffect(() => {
    let active = true;

    async function fetchMensalMeta(): Promise<{
      tipos: string[];
      entidades: string[];
      emitentes: string[];
      latestMonthLabel: string | null;
    }> {
      if (!supabase) return { tipos: [], entidades: [], emitentes: [], latestMonthLabel: null };

      const pageSize = 1000;
      let offset = 0;
      const tipoSet = new Set<string>();
      const entidadeSet = new Set<string>();
      const emitenteSet = new Set<string>();
      let latestYear = 0;
      let latestMonth = 0;

      while (true) {
        const { data, error } = await supabase
          .from("combustivel_mensal")
          .select("entidade, tipo_combustivel, emitente, ano, mes")
          .order("entidade", { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (error) throw error;
        const batch = (data ?? []) as TipoRow[];
        batch.forEach((row) => {
          if (row.tipo_combustivel) tipoSet.add(row.tipo_combustivel);
          if (row.entidade) entidadeSet.add(row.entidade);
          if (row.emitente) emitenteSet.add(row.emitente);
          if (typeof row.ano === "number" && typeof row.mes === "number") {
            if (row.ano > latestYear || (row.ano === latestYear && row.mes > latestMonth)) {
              latestYear = row.ano;
              latestMonth = row.mes;
            }
          }
        });

        if (batch.length < pageSize || offset >= 9000) break;
        offset += pageSize;
      }

      return {
        tipos: [...tipoSet].sort((a, b) => a.localeCompare(b, "pt-BR")),
        entidades: [...entidadeSet].sort((a, b) => a.localeCompare(b, "pt-BR")),
        emitentes: [...emitenteSet].sort((a, b) => a.localeCompare(b, "pt-BR")),
        latestMonthLabel: latestYear > 0 ? `${String(latestMonth).padStart(2, "0")}/${latestYear}` : null,
      };
    }

    async function fetchMensalMetaLegacy(): Promise<{
      tipos: string[];
      entidades: string[];
      emitentes: string[];
      latestMonthLabel: string | null;
    }> {
      if (!supabase) return { tipos: [], entidades: [], emitentes: [], latestMonthLabel: null };

      const pageSize = 1000;
      let offset = 0;
      const tipoSet = new Set<string>();
      const entidadeSet = new Set<string>();
      let latestYear = 0;
      let latestMonth = 0;

      while (true) {
        const { data, error } = await supabase
          .from("combustivel_mensal")
          .select("entidade, tipo_combustivel, ano, mes")
          .order("entidade", { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (error) throw error;
        const batch = (data ?? []) as Array<{ entidade: string; tipo_combustivel: string; ano?: number; mes?: number }>;
        batch.forEach((row) => {
          if (row.tipo_combustivel) tipoSet.add(row.tipo_combustivel);
          if (row.entidade) entidadeSet.add(row.entidade);
          if (typeof row.ano === "number" && typeof row.mes === "number") {
            if (row.ano > latestYear || (row.ano === latestYear && row.mes > latestMonth)) {
              latestYear = row.ano;
              latestMonth = row.mes;
            }
          }
        });

        if (batch.length < pageSize || offset >= 9000) break;
        offset += pageSize;
      }

      const emitenteRes = await supabase
        .from("combustivel_emitente")
        .select("emitente")
        .order("emitente", { ascending: true })
        .range(0, 9999);

      if (emitenteRes.error) throw emitenteRes.error;
      const emitentes = (emitenteRes.data ?? [])
        .map((row) => row.emitente)
        .filter((value): value is string => Boolean(value))
        .sort((a, b) => a.localeCompare(b, "pt-BR"));

      return {
        tipos: [...tipoSet].sort((a, b) => a.localeCompare(b, "pt-BR")),
        entidades: [...entidadeSet].sort((a, b) => a.localeCompare(b, "pt-BR")),
        emitentes,
        latestMonthLabel: latestYear > 0 ? `${String(latestMonth).padStart(2, "0")}/${latestYear}` : null,
      };
    }

    async function load() {
      setLoading(true);
      setError(null);

      if (!isSupabaseConfigured || !supabase) {
        if (!active) return;
        setLoading(false);
        setError("Supabase não configurado");
        return;
      }

      try {
        const [municipioRes, mensalMeta] = await Promise.all([
          supabase
            .from("aux_dim_municipio")
            .select("codigo, nome, uf_codigo")
            .eq("uf_codigo", "12")
            .order("nome", { ascending: true }),
          (async () => {
            try {
              return await fetchMensalMeta();
            } catch (error) {
              if (isMissingEmitenteColumnError(error)) {
                return fetchMensalMetaLegacy();
              }
              throw error;
            }
          })(),
        ]);

        if (!active) return;

        if (municipioRes.error) {
          setError(municipioRes.error.message ?? "Falha ao carregar filtros");
          setLoading(false);
          return;
        }

        setMunicipios((municipioRes.data ?? []) as MunicipioRow[]);
        setEntidades(mensalMeta.entidades);
        setTipos(mensalMeta.tipos);
        setEmitentes(mensalMeta.emitentes);
        setLatestMonthLabel(mensalMeta.latestMonthLabel);
        setLoading(false);
      } catch (error) {
        if (!active) return;
        setError(extractErrorMessage(error) || "Falha ao carregar filtros");
        setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  const replaceParams = (updater: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    updater(params);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const municipioOptions = useMemo<Option[]>(
    () => municipios.map((item) => ({ value: item.codigo, label: item.nome })),
    [municipios],
  );

  const municipioIndex = useMemo(() => buildMunicipioIndex(municipios), [municipios]);

  const entidadeOptions = useMemo<Option[]>(() => {
    if (selectedMunicipio === "all") {
      return entidades.map((item) => ({ value: normalizeName(item), label: item }));
    }
    const targetMunicipio = selectedMunicipio.replace(/\D/g, "").replace(/^0+/, "");
    return entidades
      .filter((nomeEntidade) => inferMunicipioCodeFromEntidade(nomeEntidade, municipioIndex) === targetMunicipio)
      .map((item) => ({ value: normalizeName(item), label: item }));
  }, [entidades, municipioIndex, selectedMunicipio]);

  const tipoOptions = useMemo<Option[]>(() => tipos.map((item) => ({ value: item, label: item })), [tipos]);
  const emitenteOptions = useMemo<Option[]>(
    () => emitentes.map((item) => ({ value: item, label: item })),
    [emitentes],
  );

  const selectedMunicipioTitle = buildTitle(municipioOptions, selectedMunicipio, "Todos");
  const selectedEntidadeTitle = buildTitle(entidadeOptions, selectedEntidade, "Todos");
  const selectedTipoTitle = buildMultiTitle(tipoOptions, selectedTipos);
  const selectedEmitenteTitle = buildTitle(emitenteOptions, selectedEmitente, "Todos");
  const hasActiveFilters =
    selectedMunicipio !== "all" ||
    selectedEntidade !== "all" ||
    selectedTipos.length > 0 ||
    selectedEmitente !== "all";
  const activeFilterCount =
    (selectedMunicipio !== "all" ? 1 : 0) +
    (selectedEntidade !== "all" ? 1 : 0) +
    selectedTipos.length +
    (selectedEmitente !== "all" ? 1 : 0);

  return (
    <>
      <div className="flex w-full items-center gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setMunicipioDialogOpen(true)}
          disabled={loading || Boolean(error)}
          className="h-11 min-w-[180px] shrink-0 rounded-lg border border-gray-200 bg-transparent px-3 text-left text-sm text-gray-800 shadow-theme-xs disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-white/90 lg:min-w-0 lg:flex-1 lg:shrink"
        >
          <span className="mr-2 text-xs text-gray-500 dark:text-gray-400">Município:</span>
          <span className="inline-block max-w-[72%] truncate align-bottom font-medium">{selectedMunicipioTitle}</span>
        </button>

        <button
          type="button"
          onClick={() => setEntidadeDialogOpen(true)}
          disabled={loading || Boolean(error)}
          className="h-11 min-w-[220px] shrink-0 rounded-lg border border-gray-200 bg-transparent px-3 text-left text-sm text-gray-800 shadow-theme-xs disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-white/90 lg:min-w-0 lg:flex-1 lg:shrink"
        >
          <span className="mr-2 text-xs text-gray-500 dark:text-gray-400">Entidade:</span>
          <span className="inline-block max-w-[72%] truncate align-bottom font-medium">{selectedEntidadeTitle}</span>
        </button>

        <button
          type="button"
          onClick={() => setTipoDialogOpen(true)}
          disabled={loading || Boolean(error)}
          className="h-11 min-w-[220px] shrink-0 rounded-lg border border-gray-200 bg-transparent px-3 text-left text-sm text-gray-800 shadow-theme-xs disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-white/90 lg:min-w-0 lg:flex-1 lg:shrink"
        >
          <span className="mr-2 text-xs text-gray-500 dark:text-gray-400">Tipo:</span>
          <span className="inline-block max-w-[72%] truncate align-bottom font-medium">{selectedTipoTitle}</span>
        </button>

        <button
          type="button"
          onClick={() => setEmitenteDialogOpen(true)}
          disabled={loading || Boolean(error)}
          className="h-11 min-w-[260px] shrink-0 rounded-lg border border-gray-200 bg-transparent px-3 text-left text-sm text-gray-800 shadow-theme-xs disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-white/90 lg:min-w-0 lg:flex-1 lg:shrink"
        >
          <span className="mr-2 text-xs text-gray-500 dark:text-gray-400">Emitente:</span>
          <span className="inline-block max-w-[72%] truncate align-bottom font-medium">
            {selectedEmitenteTitle}
          </span>
        </button>

        {hasActiveFilters ? (
          <button
            type="button"
            onClick={() => {
              replaceParams((params) => {
                params.delete("municipio");
                params.delete("entidade");
                params.delete("tipo");
                params.delete("emitente");
                params.delete("periodo");
              });
            }}
            className="h-11 shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-800/70 dark:bg-red-900/20 dark:text-red-300 dark:hover:bg-red-900/35"
          >
            Limpar filtros ({activeFilterCount})
          </button>
        ) : null}

        {loading ? (
          <span className="shrink-0 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
            Carregando filtros...
          </span>
        ) : null}
        {error ? (
          <span className="max-w-[220px] shrink-0 truncate text-xs text-red-600 dark:text-red-400">
            {error}
          </span>
        ) : null}
      </div>

      {hasActiveFilters ? (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {selectedMunicipio !== "all" ? (
            <button
              type="button"
              onClick={() => {
                replaceParams((params) => {
                  params.delete("municipio");
                  params.delete("entidade");
                  params.delete("periodo");
                });
              }}
              className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <span>Município: {selectedMunicipioTitle}</span>
              <span className="font-semibold">x</span>
            </button>
          ) : null}

          {selectedEntidade !== "all" ? (
            <button
              type="button"
              onClick={() => {
                replaceParams((params) => {
                  params.delete("entidade");
                  params.delete("periodo");
                });
              }}
              className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <span>Entidade: {selectedEntidadeTitle}</span>
              <span className="font-semibold">x</span>
            </button>
          ) : null}

          {selectedTipos.map((tipo) => (
            <button
              key={tipo}
              type="button"
              onClick={() => {
                replaceParams((params) => {
                  const nextTipos = selectedTipos.filter((item) => item !== tipo);
                  params.delete("tipo");
                  nextTipos.forEach((item) => params.append("tipo", item));
                  params.delete("periodo");
                });
              }}
              className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <span>Tipo: {tipo}</span>
              <span className="font-semibold">x</span>
            </button>
          ))}

          {selectedEmitente !== "all" ? (
            <button
              type="button"
              onClick={() => {
                replaceParams((params) => {
                  params.delete("emitente");
                });
              }}
              className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <span>Emitente: {selectedEmitenteTitle}</span>
              <span className="font-semibold">x</span>
            </button>
          ) : null}
        </div>
      ) : null}

      <SingleFilterDialog
        title="Selecionar Município"
        isOpen={municipioDialogOpen}
        options={municipioOptions}
        selectedValue={selectedMunicipio}
        allLabel="Todos"
        onClose={() => setMunicipioDialogOpen(false)}
        onSelect={(value) => {
          replaceParams((params) => {
            if (value === "all") params.delete("municipio");
            else params.set("municipio", value);
            params.delete("entidade");
            params.delete("periodo");
          });
        }}
      />

      <SingleFilterDialog
        title="Selecionar Entidade"
        isOpen={entidadeDialogOpen}
        options={entidadeOptions}
        selectedValue={selectedEntidade}
        allLabel="Todos"
        onClose={() => setEntidadeDialogOpen(false)}
        onSelect={(value) => {
          replaceParams((params) => {
            if (value === "all") params.delete("entidade");
            else params.set("entidade", value);
            params.delete("periodo");
          });
        }}
      />

      <MultiFilterDialog
        title="Selecionar Tipos de Combustível"
        isOpen={tipoDialogOpen}
        options={tipoOptions}
        selectedValues={selectedTipos}
        onClose={() => setTipoDialogOpen(false)}
        onApply={(values) => {
          replaceParams((params) => {
            params.delete("tipo");
            values.forEach((value) => params.append("tipo", value));
            params.delete("periodo");
          });
        }}
      />

      <SingleFilterDialog
        title="Selecionar Emitente"
        isOpen={emitenteDialogOpen}
        options={emitenteOptions}
        selectedValue={selectedEmitente}
        allLabel="Todos"
        onClose={() => setEmitenteDialogOpen(false)}
        onSelect={(value) => {
          replaceParams((params) => {
            if (value === "all") params.delete("emitente");
            else params.set("emitente", value);
          });
        }}
      />
    </>
  );
}
