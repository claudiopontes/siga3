"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileText, ChevronLeft, ChevronRight, Search, Loader2,
  BarChart2, Bot, CheckCircle, XCircle, Trash2, RefreshCw, AlertCircle,
} from "lucide-react";
import type { SessaoJulgamentoView } from "./tipos";
import ModalRelatorioResumoPauta from "./ModalRelatorioResumoPauta";
import type { RelatorioResumoPautaResult } from "@/lib/ia/relatorios/montarRelatorioResumoPauta";
import type { JobAnalisePauta, StatusJobAnalisePauta } from "@/lib/ia/jobs/tipos";

const POR_PAGINA = 20;
const POLLING_INTERVALO_MS = 5000;

const STATUS_JOB_ATIVO: StatusJobAnalisePauta[] = ["pendente", "executando"];
const STATUS_JOB_FINAL: StatusJobAnalisePauta[] = ["concluido", "concluido_com_erros", "erro", "cancelado"];

function isAdminProfile(profile?: string | null): boolean {
  const n = profile?.trim().toLowerCase();
  return n === "admin" || n === "administrador";
}

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

function textoProgressoJob(job: JobAnalisePauta): string {
  if (job.status === "pendente") return "Aguardando início...";
  if (job.status === "executando") {
    return `Processando ${job.total_processados} de ${job.total_pendentes}` +
      (job.total_ja_analisados > 0 ? ` · ${job.total_ja_analisados} já existiam` : "") +
      (job.total_erros > 0 ? ` · ${job.total_erros} com erro` : "");
  }
  return "";
}

function toastJobMensagem(status: StatusJobAnalisePauta, job: JobAnalisePauta): string {
  const partes: string[] = [];
  if (job.total_analisados > 0) partes.push(`${job.total_analisados} gerada(s)`);
  if (job.total_ja_analisados > 0) partes.push(`${job.total_ja_analisados} já existiam`);
  if (job.total_erros > 0) partes.push(`${job.total_erros} com erro`);
  const detalhe = partes.length > 0 ? ` · ${partes.join(" · ")}` : "";

  if (status === "concluido") return `Análises concluídas${detalhe}.`;
  if (status === "concluido_com_erros") return `Concluído com erros${detalhe}.`;
  if (status === "erro") return `A geração de análises falhou.${job.erro ? ` ${job.erro}` : ""}`;
  if (status === "cancelado") return "A geração foi cancelada.";
  return "Job finalizado.";
}

export default function PautasJulgamentoClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [sessoes, setSessoes] = useState<SessaoJulgamentoView[]>([]);

  const [userProfile, setUserProfile] = useState<string | null>(null);
  const ehAdmin = isAdminProfile(userProfile);

  const [relatorioAberto, setRelatorioAberto] = useState(false);
  const [relatorioSessaoId, setRelatorioSessaoId] = useState<number | null>(null);
  const [relatorioLabel, setRelatorioLabel] = useState("");
  const [relatorioData, setRelatorioData] = useState<RelatorioResumoPautaResult | null>(null);
  const [relatorioLoading, setRelatorioLoading] = useState<number | null>(null);
  const [relatorioErro, setRelatorioErro] = useState<string | null>(null);

  // --- Job de geração de análises ---
  // Mapa: sessaoId → job ativo (ou null se não há)
  const [jobsPorSessao, setJobsPorSessao] = useState<Map<number, JobAnalisePauta>>(new Map());
  const [loadingIniciarJob, setLoadingIniciarJob] = useState<number | null>(null);
  const [erroJob, setErroJob] = useState<string | null>(null);
  const [toastJob, setToastJob] = useState<{ status: StatusJobAnalisePauta; job: JobAnalisePauta } | null>(null);

  // Referência para os timers de polling (sessaoId → timerId)
  const pollingTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  async function carregarRelatorio(sessaoId: number): Promise<RelatorioResumoPautaResult | null> {
    const res = await fetch(`/api/ia/relatorio-resumo-pauta?sessaoId=${sessaoId}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error ?? "Erro ao montar relatório.");
    return json as RelatorioResumoPautaResult;
  }

  async function abrirRelatorio(sessao: SessaoJulgamentoView) {
    const label = sessao.numero ? `${sessao.numero}ª Sessão — ${formatarData(sessao.dt_realizacao)}` : `Sessão #${sessao.id}`;
    setRelatorioLabel(label);
    setRelatorioSessaoId(sessao.id);
    setRelatorioData(null);
    setRelatorioErro(null);
    setRelatorioAberto(true);
    setRelatorioLoading(sessao.id);
    try {
      setRelatorioData(await carregarRelatorio(sessao.id));
    } catch (e) {
      setRelatorioErro(e instanceof Error ? e.message : "Falha na comunicação com o servidor.");
    } finally {
      setRelatorioLoading(null);
    }
  }

  // Atualiza o job de uma sessão no mapa de estado
  const setJobSessao = useCallback((sessaoId: number, job: JobAnalisePauta | null) => {
    setJobsPorSessao((prev) => {
      const next = new Map(prev);
      if (job) {
        next.set(sessaoId, job);
      } else {
        next.delete(sessaoId);
      }
      return next;
    });
  }, []);

  // Cancela polling de uma sessão
  const cancelarPolling = useCallback((sessaoId: number) => {
    const timer = pollingTimers.current.get(sessaoId);
    if (timer !== undefined) {
      clearTimeout(timer);
      pollingTimers.current.delete(sessaoId);
    }
  }, []);

  // Polling recursivo por sessaoId
  const iniciarPolling = useCallback((sessaoId: number, jobId: number) => {
    cancelarPolling(sessaoId);

    const tick = async () => {
      try {
        const res = await fetch(`/api/ia/pauta/gerar-analises-job/status?jobId=${jobId}`);
        if (!res.ok) return;
        const json = await res.json() as { job: JobAnalisePauta | null };
        if (!json.job) return;

        setJobSessao(sessaoId, json.job);

        if (STATUS_JOB_FINAL.includes(json.job.status)) {
          // Job concluiu: mostra toast e para polling
          cancelarPolling(sessaoId);
          setToastJob({ status: json.job.status, job: json.job });

          // Se o modal desta sessão estiver aberto, recarrega o relatório
          setRelatorioSessaoId((relSessaoId) => {
            if (relSessaoId === sessaoId) {
              carregarRelatorio(sessaoId)
                .then((r) => { if (r) setRelatorioData(r); })
                .catch(() => null);
            }
            return relSessaoId;
          });
        } else {
          // Ainda ativo: agenda próxima verificação
          const timer = setTimeout(tick, POLLING_INTERVALO_MS);
          pollingTimers.current.set(sessaoId, timer);
        }
      } catch {
        // Silencioso — tenta novamente no próximo ciclo
        const timer = setTimeout(tick, POLLING_INTERVALO_MS);
        pollingTimers.current.set(sessaoId, timer);
      }
    };

    const timer = setTimeout(tick, POLLING_INTERVALO_MS);
    pollingTimers.current.set(sessaoId, timer);
  }, [cancelarPolling, setJobSessao]);

  // Verifica se há job ativo ao carregar a lista de sessões
  const verificarJobAtivo = useCallback(async (sessaoId: number) => {
    try {
      const res = await fetch(`/api/ia/pauta/gerar-analises-job/status?sessaoId=${sessaoId}`);
      if (!res.ok) return;
      const json = await res.json() as { job: JobAnalisePauta | null };
      if (!json.job) return;

      setJobSessao(sessaoId, json.job);

      if (STATUS_JOB_ATIVO.includes(json.job.status)) {
        iniciarPolling(sessaoId, json.job.id);
      }
    } catch {
      // Silencioso
    }
  }, [setJobSessao, iniciarPolling]);

  async function iniciarJobAnalises(sessao: SessaoJulgamentoView) {
    setLoadingIniciarJob(sessao.id);
    setErroJob(null);
    setToastJob(null);
    try {
      const res = await fetch("/api/ia/pauta/gerar-analises-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessaoId: sessao.id }),
      });
      const json = await res.json() as { jobId?: number; status?: StatusJobAnalisePauta; existente?: boolean; error?: string };

      if (!res.ok) {
        setErroJob(json?.error ?? "Erro ao iniciar geração de análises.");
        return;
      }

      if (!json.jobId) return;

      // Busca estado inicial do job e inicia polling
      const statusRes = await fetch(`/api/ia/pauta/gerar-analises-job/status?jobId=${json.jobId}`);
      if (statusRes.ok) {
        const statusJson = await statusRes.json() as { job: JobAnalisePauta | null };
        if (statusJson.job) setJobSessao(sessao.id, statusJson.job);
      }

      iniciarPolling(sessao.id, json.jobId);
    } catch {
      setErroJob("Falha na comunicação com o servidor.");
    } finally {
      setLoadingIniciarJob(null);
    }
  }

  // --- Descarte total da análise da pauta (somente admin) ---

  type DescartarResultado = {
    sessaoId: number;
    total_processos_pauta: number;
    total_analises_descartadas: number;
    total_relatorios_descartados: number;
  };

  const [descartarLoading, setDescartarLoading] = useState<number | null>(null);
  const [descartarToast, setDescartarToast] = useState<DescartarResultado | null>(null);
  const [descartarErro, setDescartarErro] = useState<string | null>(null);

  async function descartarAnalisePauta(sessao: SessaoJulgamentoView) {
    const confirmacao = window.prompt(
      "⚠️ AÇÃO ADMINISTRATIVA — DESCARTE DE ANÁLISE DA PAUTA\n\n" +
      "Esta ação descartará as análises IA individuais de todos os processos desta pauta " +
      "e também as versões consolidadas do relatório.\n\n" +
      "Os registros serão mantidos para auditoria, mas deixarão de ser usados.\n" +
      "Os resumos dos documentos serão preservados para economia de IA.\n\n" +
      "Para confirmar, digite: DESCARTAR",
    );
    if (confirmacao === null) return;
    if (confirmacao.trim() !== "DESCARTAR") {
      window.alert("Confirmação incorreta. Operação cancelada.");
      return;
    }

    const motivo = window.prompt("Informe o motivo do descarte (opcional):");
    if (motivo === null) return;

    setDescartarLoading(sessao.id);
    setDescartarToast(null);
    setDescartarErro(null);
    try {
      const res = await fetch("/api/ia/pauta/descartar-analise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessaoId: sessao.id, motivo }),
      });
      const json = await res.json();
      if (res.status === 401) { setDescartarErro("Você precisa estar autenticado para executar esta ação."); return; }
      if (res.status === 403) { setDescartarErro("Apenas administradores podem descartar a análise completa da pauta."); return; }
      if (!res.ok) { setDescartarErro(json?.error ?? "Erro ao descartar análise."); return; }
      setDescartarToast(json as DescartarResultado);
      if (relatorioSessaoId === sessao.id) {
        setRelatorioAberto(false);
        setRelatorioData(null);
      }
    } catch {
      setDescartarErro("Falha na comunicação com o servidor.");
    } finally {
      setDescartarLoading(null);
    }
  }

  const [filtroBusca, setFiltroBusca] = useState("");
  const [filtroAno, setFiltroAno] = useState(String(new Date().getFullYear()));
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { user?: { profile?: string } } | null) => setUserProfile(d?.user?.profile ?? null))
      .catch(() => setUserProfile(null));
  }, []);

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
        const lista: SessaoJulgamentoView[] = Array.isArray(dados) ? dados : [];
        setSessoes(lista);

        // Verifica jobs ativos para cada sessão visível
        lista.forEach((s) => { void verificarJobAtivo(s.id); });
      } catch {
        if (!cancelado) setErro("Falha na comunicação com o servidor.");
      } finally {
        if (!cancelado) setLoading(false);
      }
    }
    void carregar();
    return () => { cancelado = true; };
  }, [verificarJobAtivo]);

  // Limpa todos os timers ao desmontar
  useEffect(() => {
    const timers = pollingTimers.current;
    return () => { timers.forEach((t) => clearTimeout(t)); };
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

  function mudarFiltro(fn: () => void) { fn(); setPagina(1); }

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
                  <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Processos</th>
                  <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Vistas</th>
                  <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"></th>
                </tr>
              </thead>
              <tbody>
                {sessoesPagina.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
                      Nenhuma sessão encontrada para os filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  sessoesPagina.map((s, i) => {
                    const job = jobsPorSessao.get(s.id) ?? null;
                    const jobAtivo = job && STATUS_JOB_ATIVO.includes(job.status);
                    const botaoJobDesabilitado = loadingIniciarJob === s.id || !!jobAtivo;

                    return (
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
                          {(s.qtd_julgamento ?? 0) > 0 ? (
                            <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                              {s.qtd_julgamento}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
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
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-end gap-1.5">
                            {/* Botões de ação */}
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => router.push(`/pautas-julgamento/${s.id}`)}
                                title="Ver processos da sessão"
                                aria-label="Ver processos"
                                className="rounded-lg border border-blue-200 bg-blue-50 p-2 text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-blue-400 dark:hover:bg-blue-900/40"
                              >
                                <FileText className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => abrirRelatorio(s)}
                                disabled={relatorioLoading === s.id}
                                title="Relatório da pauta — abre relatório consolidado com as análises já salvas. Não chama a IA."
                                aria-label="Relatório da pauta"
                                className="rounded-lg border border-purple-200 bg-purple-50 p-2 text-purple-700 transition hover:border-purple-300 hover:bg-purple-100 disabled:opacity-60 dark:border-purple-900/70 dark:bg-purple-950/30 dark:text-purple-400 dark:hover:bg-purple-900/40"
                              >
                                {relatorioLoading === s.id
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <BarChart2 className="h-3.5 w-3.5" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => iniciarJobAnalises(s)}
                                disabled={botaoJobDesabilitado}
                                title={
                                  jobAtivo
                                    ? "Há uma geração de análises em andamento para esta pauta."
                                    : "Gerar análises pendentes — gera análise IA apenas para processos sem análise válida."
                                }
                                aria-label={jobAtivo ? "Processando análises..." : "Gerar análises pendentes"}
                                className="rounded-lg border border-green-200 bg-green-50 p-2 text-green-700 transition hover:border-green-300 hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-green-900/70 dark:bg-green-950/30 dark:text-green-400 dark:hover:bg-green-900/40"
                              >
                                {(loadingIniciarJob === s.id || jobAtivo)
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <Bot className="h-3.5 w-3.5" />}
                              </button>
                              {ehAdmin && (
                                <button
                                  type="button"
                                  onClick={() => descartarAnalisePauta(s)}
                                  disabled={descartarLoading === s.id}
                                  title="Descartar análise da pauta — descarta análises individuais e relatório consolidado para permitir reprocessamento. Apenas administradores."
                                  aria-label="Descartar análise da pauta"
                                  className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-700 transition hover:border-red-300 hover:bg-red-100 disabled:opacity-60 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-900/40"
                                >
                                  {descartarLoading === s.id
                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    : <RefreshCw className="h-3.5 w-3.5" />}
                                </button>
                              )}
                            </div>

                            {/* Progresso do job (visível apenas quando ativo) */}
                            {jobAtivo && job && (
                              <div className="flex items-center gap-1.5 rounded-md bg-green-50 px-2 py-1 text-[10px] text-green-700 dark:bg-green-900/20 dark:text-green-400">
                                <Spinner className="h-2.5 w-2.5" />
                                <span>{textoProgressoJob(job)}</span>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
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

      {/* Toast: job concluído */}
      {toastJob && (
        <div className={`fixed bottom-4 left-1/2 z-50 -translate-x-1/2 max-w-sm rounded-xl border px-5 py-3 shadow-lg ${
          toastJob.status === "concluido"
            ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
            : toastJob.status === "concluido_com_erros"
            ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20"
            : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
        }`}>
          <div className="flex items-start gap-3">
            {toastJob.status === "concluido" && <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />}
            {toastJob.status === "concluido_com_erros" && <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />}
            {(toastJob.status === "erro" || toastJob.status === "cancelado") && <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />}
            <div className={`text-xs ${
              toastJob.status === "concluido" ? "text-green-800 dark:text-green-200"
              : toastJob.status === "concluido_com_erros" ? "text-amber-800 dark:text-amber-200"
              : "text-red-800 dark:text-red-200"
            }`}>
              <p className="font-semibold">
                {toastJob.status === "concluido" ? "Análises concluídas" :
                 toastJob.status === "concluido_com_erros" ? "Concluído com erros" :
                 toastJob.status === "erro" ? "Falha na geração" : "Job cancelado"}
              </p>
              <p className="mt-0.5">{toastJobMensagem(toastJob.status, toastJob.job)}</p>
            </div>
            <button type="button" onClick={() => setToastJob(null)} className="ml-2 font-bold text-gray-500 dark:text-gray-400">×</button>
          </div>
        </div>
      )}

      {/* Toast: erro ao iniciar job */}
      {erroJob && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-red-200 bg-red-50 px-5 py-3 shadow-lg dark:border-red-800 dark:bg-red-900/20">
          <div className="flex items-center gap-3">
            <XCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            <span className="text-xs text-red-800 dark:text-red-200">{erroJob}</span>
            <button type="button" onClick={() => setErroJob(null)} className="ml-2 font-bold text-red-600 dark:text-red-400">×</button>
          </div>
        </div>
      )}

      {/* Toast: sucesso no descarte total da análise da pauta (admin) */}
      {descartarToast && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 max-w-sm rounded-xl border border-orange-200 bg-orange-50 px-5 py-3 shadow-lg dark:border-orange-800 dark:bg-orange-900/20">
          <div className="flex items-start gap-3">
            <Trash2 className="mt-0.5 h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" />
            <div className="text-xs text-orange-800 dark:text-orange-200">
              <p className="font-semibold">Análise da pauta descartada.</p>
              <p className="mt-0.5">
                {descartarToast.total_analises_descartadas} análise(s) individual(is) e {descartarToast.total_relatorios_descartados} relatório(s) foram descartados.
                Os resumos dos documentos foram preservados para reduzir custo de reprocessamento.
              </p>
            </div>
            <button type="button" onClick={() => setDescartarToast(null)} className="ml-2 font-bold text-orange-600 dark:text-orange-400">×</button>
          </div>
        </div>
      )}

      {/* Toast: erro no descarte total (admin) */}
      {descartarErro && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-red-200 bg-red-50 px-5 py-3 shadow-lg dark:border-red-800 dark:bg-red-900/20">
          <div className="flex items-center gap-3">
            <XCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            <span className="text-xs text-red-800 dark:text-red-200">{descartarErro}</span>
            <button type="button" onClick={() => setDescartarErro(null)} className="ml-2 font-bold text-red-600 dark:text-red-400">×</button>
          </div>
        </div>
      )}

      {/* Erro relatório */}
      {relatorioErro && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700 shadow-lg dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {relatorioErro}
          <button type="button" onClick={() => setRelatorioErro(null)} className="ml-3 font-bold">×</button>
        </div>
      )}

      {/* Modal relatório resumo */}
      <ModalRelatorioResumoPauta
        aberto={relatorioAberto && !relatorioLoading}
        onFechar={() => { setRelatorioAberto(false); setRelatorioData(null); }}
        sessaoLabel={relatorioLabel}
        relatorio={relatorioData}
        onDescartado={() => {
          setRelatorioData(null);
          setRelatorioAberto(false);
        }}
      />
    </div>
  );
}
