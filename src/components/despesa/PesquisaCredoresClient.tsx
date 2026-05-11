"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

// --- Tipos ---

interface CredorRow {
  cpf_cnpj_credor: string;
  nome_exibicao: string | null;
  tipo_documento: string | null;
  municipio: string | null;
  uf: string | null;
  valor_empenhado_liquido: string;
  valor_liquidado: string;
  valor_pago: string;
  valor_a_pagar: string;
  qtd_empenhos: number;
  qtd_entidades: number;
  primeiro_empenho: string | null;
  ultimo_empenho: string | null;
  fonte_enriquecimento: string | null;
  status_consulta: string | null;
}

interface SearchResult {
  total: number;
  page: number;
  pageSize: number;
  registros: CredorRow[];
}

type Tipo = "all" | "CPF" | "CNPJ" | "DESCONHECIDO";
type OrderBy = "valor_pago" | "valor_empenhado_liquido" | "ultimo_empenho" | "nome";

// --- Helpers ---

function toNum(v: string | number | null | undefined): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const p = parseFloat(v.replace(",", "."));
    return Number.isFinite(p) ? p : 0;
  }
  return 0;
}

function fmtMoeda(v: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function fmtCompacto(v: number): string {
  const s = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (a >= 1e9) return `${s}R$ ${(a / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} bi`;
  if (a >= 1e6) return `${s}R$ ${(a / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi`;
  if (a >= 1e3) return `${s}R$ ${(a / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return fmtMoeda(v);
}

function fmtNum(v: number): string {
  return v.toLocaleString("pt-BR");
}

function fmtData(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s.slice(0, 10);
  return d.toLocaleDateString("pt-BR");
}

function formatCpfCnpj(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return digits;
}

function tipoBadge(tipo: string | null) {
  if (!tipo) return null;
  const cores: Record<string, string> = {
    CPF: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
    CNPJ: "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300",
    DESCONHECIDO: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${cores[tipo] ?? cores.DESCONHECIDO}`}>
      {tipo}
    </span>
  );
}

// --- Componente principal ---

const PAGE_SIZE = 20;

export default function PesquisaCredoresClient() {
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState<Tipo>("all");
  const [orderBy, setOrderBy] = useState<OrderBy>("valor_pago");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchResultados = useCallback(
    (query: string, tipoFiltro: Tipo, ordem: OrderBy, pagina: number) => {
      setLoading(true);
      setError(null);

      const sp = new URLSearchParams({
        q: query,
        tipoDocumento: tipoFiltro,
        orderBy: ordem,
        page: String(pagina),
        pageSize: String(PAGE_SIZE),
      });

      fetch(`/api/despesa/credores/search?${sp.toString()}`)
        .then((r) => {
          if (!r.ok) throw new Error("Erro ao buscar credores.");
          return r.json() as Promise<SearchResult>;
        })
        .then(setResult)
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false));
    },
    [],
  );

  // Dispara busca com debounce ao mudar q; imediato ao mudar outros filtros
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchResultados(q, tipo, orderBy, page);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, tipo, orderBy, page]);

  function handleQ(value: string) {
    setQ(value);
    setPage(1);
  }

  function handleTipo(value: Tipo) {
    setTipo(value);
    setPage(1);
  }

  function handleOrdem(value: OrderBy) {
    setOrderBy(value);
    setPage(1);
  }

  const totalPages = result ? Math.ceil(result.total / PAGE_SIZE) : 0;

  return (
    <div className="min-h-screen space-y-5 bg-slate-50 p-4 pb-10 dark:bg-slate-900 sm:p-6">

      {/* Barra de busca + filtros */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">

          {/* Campo de busca */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              value={q}
              onChange={(e) => handleQ(e.target.value)}
              placeholder="Buscar por nome, CPF ou CNPJ..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:placeholder-slate-500 dark:focus:border-teal-500 dark:focus:ring-teal-900/30"
            />
          </div>

          {/* Filtro por tipo */}
          <div className="flex gap-1.5 flex-wrap">
            {(["all", "CPF", "CNPJ", "DESCONHECIDO"] as Tipo[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => handleTipo(t)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  tipo === t
                    ? "border-teal-500 bg-teal-600 text-white dark:border-teal-400 dark:bg-teal-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300"
                }`}
              >
                {t === "all" ? "Todos" : t}
              </button>
            ))}
          </div>

          {/* Ordenação */}
          <select
            value={orderBy}
            onChange={(e) => handleOrdem(e.target.value as OrderBy)}
            className="rounded-lg border border-slate-200 bg-white py-2.5 pl-3 pr-8 text-sm text-slate-700 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
          >
            <option value="valor_pago">Maior valor pago</option>
            <option value="valor_empenhado_liquido">Maior valor empenhado</option>
            <option value="ultimo_empenho">Último empenho</option>
            <option value="nome">Nome</option>
          </select>
        </div>
      </div>

      {/* Resultados */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">

        {/* Cabeçalho da tabela / estado */}
        {loading && (
          <div className="flex items-center justify-center py-16 text-sm text-slate-500">
            <div className="mr-3 h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
            Buscando credores...
          </div>
        )}

        {!loading && error && (
          <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        {!loading && !error && result && result.registros.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-400">
            <Search className="h-8 w-8 opacity-40" />
            <span className="text-sm">Nenhum credor encontrado para os filtros informados.</span>
          </div>
        )}

        {!loading && !error && result && result.registros.length > 0 && (
          <>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <span>
                <strong className="text-slate-700 dark:text-slate-200">{fmtNum(result.total)}</strong> credores encontrados
              </span>
              <span>
                Página {result.page} de {totalPages}
              </span>
            </div>

            {/* Tabela desktop */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Credor</th>
                    <th className="px-4 py-3 text-left font-semibold">Documento</th>
                    <th className="px-4 py-3 text-left font-semibold">Município/UF</th>
                    <th className="px-4 py-3 text-right font-semibold">Empenhado</th>
                    <th className="px-4 py-3 text-right font-semibold">Pago</th>
                    <th className="px-4 py-3 text-right font-semibold">A Pagar</th>
                    <th className="px-4 py-3 text-right font-semibold">Empenhos</th>
                    <th className="px-4 py-3 text-right font-semibold">Entes</th>
                    <th className="px-4 py-3 text-right font-semibold">Último Emp.</th>
                  </tr>
                </thead>
                <tbody>
                  {result.registros.map((credor, i) => {
                    const docFormatado = formatCpfCnpj(credor.cpf_cnpj_credor);
                    const nomeExibido = credor.nome_exibicao || docFormatado;
                    const localizacao = [credor.municipio, credor.uf].filter(Boolean).join("/");
                    return (
                      <tr
                        key={credor.cpf_cnpj_credor}
                        className={`border-t border-slate-100 dark:border-slate-700/50 ${i % 2 !== 0 ? "bg-slate-50/50 dark:bg-slate-800/30" : ""}`}
                      >
                        <td className="max-w-[220px] px-4 py-3">
                          <Link
                            href={`/painel-despesa/credor/${credor.cpf_cnpj_credor}`}
                            className="block truncate font-medium text-teal-700 hover:underline dark:text-teal-400"
                            title={nomeExibido}
                          >
                            {nomeExibido}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="flex items-center gap-2">
                            {tipoBadge(credor.tipo_documento)}
                            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{docFormatado}</span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400">
                          {localizacao || "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600 dark:text-slate-300">
                          {fmtCompacto(toNum(credor.valor_empenhado_liquido))}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-green-600 dark:text-green-400">
                          {fmtCompacto(toNum(credor.valor_pago))}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-red-500 dark:text-red-400">
                          {fmtCompacto(toNum(credor.valor_a_pagar))}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-slate-500 dark:text-slate-400">
                          {fmtNum(credor.qtd_empenhos)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-slate-500 dark:text-slate-400">
                          {fmtNum(credor.qtd_entidades)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-slate-500 dark:text-slate-400">
                          {fmtData(credor.ultimo_empenho)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Cards mobile */}
            <div className="divide-y divide-slate-100 dark:divide-slate-700 lg:hidden">
              {result.registros.map((credor) => {
                const docFormatado = formatCpfCnpj(credor.cpf_cnpj_credor);
                const nomeExibido = credor.nome_exibicao || docFormatado;
                const localizacao = [credor.municipio, credor.uf].filter(Boolean).join("/");
                return (
                  <Link
                    key={credor.cpf_cnpj_credor}
                    href={`/painel-despesa/credor/${credor.cpf_cnpj_credor}`}
                    className="block p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-teal-700 dark:text-teal-400">{nomeExibido}</p>
                        <div className="mt-1 flex items-center gap-2">
                          {tipoBadge(credor.tipo_documento)}
                          <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{docFormatado}</span>
                        </div>
                        {localizacao && (
                          <p className="mt-0.5 text-xs text-slate-400">{localizacao}</p>
                        )}
                      </div>
                      <div className="shrink-0 text-right text-xs">
                        <p className="font-semibold text-green-600 dark:text-green-400">{fmtCompacto(toNum(credor.valor_pago))}</p>
                        <p className="text-slate-400">pago</p>
                      </div>
                    </div>
                    <div className="mt-2 flex gap-4 text-xs text-slate-500 dark:text-slate-400">
                      <span>Empenhado: <strong className="text-slate-600 dark:text-slate-300">{fmtCompacto(toNum(credor.valor_empenhado_liquido))}</strong></span>
                      <span>Empenhos: <strong>{fmtNum(credor.qtd_empenhos)}</strong></span>
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Paginação */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300"
                >
                  <ChevronLeft className="h-4 w-4" /> Anterior
                </button>

                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {page} / {totalPages}
                </span>

                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300"
                >
                  Próxima <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
