"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, ChevronLeft, ChevronRight, Search } from "lucide-react";
import type { SessaoJulgamentoView } from "./tipos";

const POR_PAGINA = 20;

function formatarData(valor: string | null) {
  if (!valor) return "—";
  const match = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const d = new Date(valor);
  if (isNaN(d.getTime())) return valor;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className ?? "h-4 w-4"}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
    </svg>
  );
}

export default function PautasJulgamentoClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [sessoes, setSessoes] = useState<SessaoJulgamentoView[]>([]);

  const [filtroBusca, setFiltroBusca] = useState("");
  const [filtroAno, setFiltroAno] = useState(String(new Date().getFullYear()));
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      setLoading(true);
      setErro(null);
      try {
        const res = await fetch("/api/pauta-julgamento/sessoes-abertas?situacao=ENCERRADA");
        const dados = await res.json();
        if (cancelado) return;
        if (!res.ok) { setErro(dados?.error ?? "Erro ao carregar sessões."); return; }
        setSessoes(Array.isArray(dados) ? dados : []);
      } catch {
        if (!cancelado) setErro("Falha na comunicação com o servidor.");
      } finally {
        if (!cancelado) setLoading(false);
      }
    }
    void carregar();
    return () => { cancelado = true; };
  }, []);

  const anos = useMemo(() => {
    const set = new Set<number>();
    sessoes.forEach((s) => {
      if (s.dt_realizacao) {
        const ano = new Date(s.dt_realizacao).getFullYear();
        if (!isNaN(ano)) set.add(ano);
      }
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [sessoes]);

  const sessoesFiltradas = useMemo(() => {
    return sessoes.filter((s) => {
      const matchBusca = filtroBusca
        ? (s.numero ?? "").toLowerCase().includes(filtroBusca.toLowerCase()) ||
          (s.orgao_julgador ?? "").toLowerCase().includes(filtroBusca.toLowerCase())
        : true;
      const matchAno = filtroAno
        ? s.dt_realizacao && new Date(s.dt_realizacao).getFullYear() === Number(filtroAno)
        : true;
      return matchBusca && matchAno;
    });
  }, [sessoes, filtroBusca, filtroAno]);

  const totalPaginas = Math.max(1, Math.ceil(sessoesFiltradas.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const sessoesPagina = sessoesFiltradas.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  function mudarFiltro(fn: () => void) {
    fn();
    setPagina(1);
  }


  return (
    <div className="space-y-4 p-1">
      {/* Filtros */}
      {!loading && !erro && sessoes.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por número ou órgão..."
              value={filtroBusca}
              onChange={(e) => mudarFiltro(() => setFiltroBusca(e.target.value))}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-3 text-xs text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-500"
            />
          </div>
          <select
            value={filtroAno}
            onChange={(e) => mudarFiltro(() => setFiltroAno(e.target.value))}
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-700 focus:border-blue-400 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
          >
            <option value="">Todos os anos</option>
            {anos.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
            {sessoesFiltradas.length} {sessoesFiltradas.length !== 1 ? "sessões" : "sessão"}
          </span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white py-12 dark:border-gray-700 dark:bg-gray-800">
          <Spinner className="h-5 w-5 text-blue-500" />
          <span className="text-sm text-gray-500 dark:text-gray-400">Carregando sessões...</span>
        </div>
      )}

      {/* Erro */}
      {!loading && erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {erro}
        </div>
      )}

      {/* Tabela de sessões */}
      {!loading && !erro && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Sessão</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Órgão Julgador</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Tipo</th>
                  <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Realização</th>
                  <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Vistas</th>
                  <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"></th>
                </tr>
              </thead>
              <tbody>
                {sessoesPagina.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
                      Nenhuma sessão encontrada para os filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  sessoesPagina.map((s, i) => (
                    <tr
                      key={s.id}
                      className={`border-t border-gray-100 dark:border-gray-700/50 hover:bg-blue-50/40 dark:hover:bg-blue-900/10 ${
                        i % 2 !== 0 ? "bg-slate-50 dark:bg-slate-800/30" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {s.numero ? `${s.numero}ª` : `#${s.id}`}
                        </span>
                      </td>
                      <td className="max-w-52 px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                        {s.orgao_julgador ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                        {s.tipo ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-gray-600 dark:text-gray-300">
                        {formatarData(s.dt_realizacao)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {(s.qtd_vistas ?? 0) > 0 ? (
                          <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            {s.qtd_vistas}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => router.push(`/pautas-julgamento/${s.id}`)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-blue-400 dark:hover:bg-blue-900/40"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          Processos
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {totalPaginas > 1 && (
            <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 dark:border-gray-700">
              <span className="text-xs text-gray-400 dark:text-gray-500">
                Página {paginaAtual} de {totalPaginas}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPagina((p) => Math.max(1, p - 1))}
                  disabled={paginaAtual === 1}
                  className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                  disabled={paginaAtual === totalPaginas}
                  className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
