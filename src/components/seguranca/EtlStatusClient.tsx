"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Play, Clock, Database, AlertCircle, CheckCircle2, TimerOff, GitMerge } from "lucide-react";
import { ETL_CONFIG, classificarCarga, type EtlExecucao, type EtlExecucaoManual, type StatusCarga } from "@/lib/etl-config";

interface EtlCarga {
  modulo: string;
  status: string;
  registros_lidos: number;
  registros_gravados: number;
  iniciado_em: string;
  finalizado_em: string | null;
  mensagem: string | null;
}

interface EtlStatus {
  modulo: string;
  nomeExibicao?: string;
  periodicidade?: string;
  toleranciaDias?: number;
  ativoPainel?: boolean;
  descricaoPeriodicidade?: string;
  execucao?: EtlExecucao;
  execucaoManual?: EtlExecucaoManual;
  status: string;
  registros: number;
  duracao_ms: number | null;
  mensagem: string | null;
  executado_em: string | null;
  carga: EtlCarga | null;
}

type SortBy = "modulo" | "status" | "executado_em" | "cadeia";
type SortDir = "asc" | "desc";
type FiltroStatus = "todos" | "ok" | "erro" | "desatualizado" | "pendente";

function labelModulo(item: EtlStatus) {
  return item.nomeExibicao ?? ETL_CONFIG[item.modulo]?.nomeExibicao ?? item.modulo;
}

function dependenciasDe(modulo: string): string[] {
  const dep = ETL_CONFIG[modulo]?.dependeDe;
  if (!dep) return [];
  return Array.isArray(dep) ? dep : [dep];
}

function nomeExibicaoModulo(modulo: string, dados: EtlStatus[]): string {
  const it = dados.find((d) => d.modulo === modulo);
  if (it) return labelModulo(it);
  return ETL_CONFIG[modulo]?.nomeExibicao ?? modulo;
}

function formatDuracao(ms: number | null) {
  if (!ms) return "-";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms / 60000)} min`;
}

function formatDataHora(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function tempoRelativo(iso: string | null) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  const h = Math.floor(min / 60);
  const dias = Math.floor(h / 24);
  if (dias > 0) return `há ${dias} dia${dias !== 1 ? "s" : ""}`;
  if (h > 0) return `há ${h}h`;
  if (min > 0) return `há ${min} min`;
  return "agora";
}

const STATUS_STYLES: Record<StatusCarga, { badge: string; dot: string; label: string }> = {
  ok:                { badge: "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400",   dot: "bg-green-500",  label: "OK" },
  erro:              { badge: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400",           dot: "bg-red-500",    label: "Erro" },
  pendente:          { badge: "bg-gray-100 text-gray-500 dark:bg-gray-700/40 dark:text-gray-400",      dot: "bg-gray-400",   label: "Pendente" },
  desatualizado:     { badge: "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300", dot: "bg-yellow-400", label: "Desatualizado" },
  muito_desatualizado: { badge: "bg-yellow-50 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400", dot: "bg-yellow-500", label: "Muito desatualizado" },
};

function StatusBadge({ s }: { s: StatusCarga }) {
  const st = STATUS_STYLES[s];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${st.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
      {st.label}
    </span>
  );
}

type ClassifiedItem = EtlStatus & { statusCarga: StatusCarga };

interface DependenciaInfo {
  modulo: string;
  nome: string;
  statusCarga: StatusCarga | null; // null = não há registro no painel
}

function EtlCard({
  item,
  onExecutar,
  executando,
  dependencias,
  ehFilhoNaCadeia,
}: {
  item: ClassifiedItem;
  onExecutar: () => void;
  executando: boolean;
  dependencias: DependenciaInfo[];
  /** Quando true, agrupa visualmente como filho (recuo + borda esquerda). */
  ehFilhoNaCadeia: boolean;
}) {
  const fallback = ETL_CONFIG[item.modulo];
  const configManual = item.execucaoManual ?? fallback?.execucaoManual;
  const periodicidade = item.periodicidade ?? fallback?.periodicidade;
  const tolerancia = item.toleranciaDias ?? fallback?.toleranciaDias;
  const permiteExecucao = configManual?.permiteExecucaoManual === true;
  const st = STATUS_STYLES[item.statusCarga];

  // Encadeamento: se alguma dependência está em erro/desatualizado, este módulo
  // está "bloqueado em cascata" — o cron pula a execução pra não rodar em cima
  // de fonte quebrada/desatualizada.
  const depComProblema = dependencias.find(
    (d) => d.statusCarga === "erro" || d.statusCarga === "muito_desatualizado" || d.statusCarga === "desatualizado",
  );
  const bloqueadoEmCascata = item.statusCarga !== "ok" && !!depComProblema;

  return (
    <div
      className={`rounded-xl border bg-white dark:bg-gray-800 ${
        item.statusCarga === "erro" ? "border-red-200 dark:border-red-800/50" :
        item.statusCarga === "ok"   ? "border-gray-200 dark:border-gray-700" :
        "border-yellow-200 dark:border-yellow-800/40"
      } ${ehFilhoNaCadeia ? "border-l-4 border-l-blue-300 dark:border-l-blue-700/60 ml-0 lg:ml-6" : ""}`}
    >
      {/* Cabeçalho do card */}
      <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${st.dot}`} />
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{labelModulo(item)}</p>
          </div>
          {dependencias.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pl-5 text-[11px] text-gray-500 dark:text-gray-400">
              <GitMerge className="h-3 w-3 -rotate-90 text-blue-500" />
              <span>depende de:</span>
              {dependencias.map((d, i) => {
                const corDep =
                  d.statusCarga === "erro" ? "text-red-600 dark:text-red-400 font-semibold" :
                  d.statusCarga === "desatualizado" || d.statusCarga === "muito_desatualizado" ? "text-yellow-700 dark:text-yellow-400 font-semibold" :
                  d.statusCarga === "ok" ? "text-emerald-700 dark:text-emerald-400" :
                  "text-gray-500 dark:text-gray-400";
                const sufixo =
                  d.statusCarga === "erro" ? " (em erro)" :
                  d.statusCarga === "muito_desatualizado" ? " (muito desatualizado)" :
                  d.statusCarga === "desatualizado" ? " (desatualizado)" :
                  d.statusCarga === "pendente" ? " (pendente)" :
                  "";
                return (
                  <span key={d.modulo} className={corDep}>
                    {d.nome}{sufixo}{i < dependencias.length - 1 ? "," : ""}
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge s={item.statusCarga} />
          {permiteExecucao && (
            <button
              type="button"
              onClick={onExecutar}
              disabled={executando}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-700/70 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/30"
            >
              {executando ? (
                <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Aguarde...</>
              ) : (
                <><Play className="h-3.5 w-3.5" />{configManual?.labelBotao ?? "Recarregar"}</>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Aviso de bloqueio em cascata */}
      {bloqueadoEmCascata && depComProblema && (
        <div className="flex items-start gap-2 border-t border-yellow-100 bg-yellow-50 px-4 py-2 dark:border-yellow-900/30 dark:bg-yellow-900/10">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-yellow-600 dark:text-yellow-400" />
          <p className="text-xs text-yellow-700 dark:text-yellow-300">
            Possível bloqueio em cascata: dependência <strong>{depComProblema.nome}</strong> está com problema. O cron pula esta etapa quando o pai falha.
          </p>
        </div>
      )}

      {/* Métricas */}
      <div className="grid grid-cols-2 gap-px border-t border-gray-100 bg-gray-100 dark:border-gray-700 dark:bg-gray-700 sm:grid-cols-4">
        <div className="flex flex-col gap-0.5 bg-white px-4 py-2.5 dark:bg-gray-800">
          <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            <Clock className="h-3 w-3" />Periodicidade
          </span>
          <span className="text-xs text-gray-700 dark:text-gray-300">
            {periodicidade ?? "—"}
            {tolerancia && <span className="ml-1 text-gray-400">(tol. {tolerancia}d)</span>}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 bg-white px-4 py-2.5 dark:bg-gray-800">
          <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            <Database className="h-3 w-3" />Registros
          </span>
          <span className="font-mono text-xs text-gray-700 dark:text-gray-300">
            {item.registros > 0 ? item.registros.toLocaleString("pt-BR") : "—"}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 bg-white px-4 py-2.5 dark:bg-gray-800">
          <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            <TimerOff className="h-3 w-3" />Duração
          </span>
          <span className="font-mono text-xs text-gray-700 dark:text-gray-300">{formatDuracao(item.duracao_ms)}</span>
        </div>
        <div className="flex flex-col gap-0.5 bg-white px-4 py-2.5 dark:bg-gray-800">
          <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            <Clock className="h-3 w-3" />Última execução
          </span>
          <span className="text-xs text-gray-700 dark:text-gray-300">{formatDataHora(item.executado_em)}</span>
          {item.executado_em && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500">{tempoRelativo(item.executado_em)}</span>
          )}
        </div>
      </div>

      {/* Mensagem de erro */}
      {item.mensagem && item.statusCarga === "erro" && (
        <div className="flex items-start gap-2 border-t border-red-100 bg-red-50 px-4 py-2.5 dark:border-red-900/30 dark:bg-red-900/10">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
          <p className="text-xs text-red-600 dark:text-red-400">{item.mensagem}</p>
        </div>
      )}
    </div>
  );
}

export default function EtlStatusClient() {
  const [dados, setDados] = useState<EtlStatus[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [moduloEmExecucao, setModuloEmExecucao] = useState<string | null>(null);
  const [mensagemAcao, setMensagemAcao] = useState<{ tipo: "sucesso" | "erro"; texto: string } | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("executado_em");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>("todos");
  const [busca, setBusca] = useState("");

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch("/api/admin/etl/status");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      setDados((await res.json()) as EtlStatus[]);
      setAtualizadoEm(new Date());
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar status ETL.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { void carregar(); }, []);

  useEffect(() => {
    if (!mensagemAcao || mensagemAcao.tipo !== "sucesso") return;
    const t = setTimeout(() => setMensagemAcao(null), 6000);
    return () => clearTimeout(t);
  }, [mensagemAcao]);

  async function solicitarExecucaoManual(item: EtlStatus) {
    const config = { ...item, execucao: item.execucao ?? ETL_CONFIG[item.modulo]?.execucao, execucaoManual: item.execucaoManual ?? ETL_CONFIG[item.modulo]?.execucaoManual };
    if (config.execucaoManual?.mensagemConfirmacao && !window.confirm(config.execucaoManual.mensagemConfirmacao)) return;

    setModuloEmExecucao(item.modulo);
    setMensagemAcao(null);
    try {
      const res = await fetch("/api/admin/etl/executar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modulo: item.modulo, tipoSolicitado: config.execucao?.tipoCargaPadrao, confirmado: true }),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string; mensagem?: string };
      if (res.status === 202) { setMensagemAcao({ tipo: "sucesso", texto: body.mensagem ?? "Execução iniciada." }); return; }
      if (!res.ok) throw new Error(body.message ?? body.mensagem ?? `Erro HTTP ${res.status}`);
      setMensagemAcao({ tipo: "sucesso", texto: body.mensagem ?? "Solicitação validada." });
    } catch (e) {
      setMensagemAcao({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro ao solicitar execução." });
    } finally {
      setModuloEmExecucao(null);
    }
  }

  const dadosClassificados = useMemo<ClassifiedItem[]>(() => dados.map((d) => {
    const s = d.status.toLowerCase();
    if (!d.executado_em) return { ...d, statusCarga: s === "erro" || s === "error" ? "erro" : "pendente" };
    if (s === "erro" || s === "error") return { ...d, statusCarga: "erro" };
    const tolerancia = d.toleranciaDias ?? ETL_CONFIG[d.modulo]?.toleranciaDias;
    const dias = Math.floor((Date.now() - new Date(d.executado_em).getTime()) / 86400000);
    if (tolerancia && dias > tolerancia * 2) return { ...d, statusCarga: "muito_desatualizado" };
    if (tolerancia && dias > tolerancia) return { ...d, statusCarga: "desatualizado" };
    return { ...d, statusCarga: "ok" };
  }), [dados]);

  const dadosFiltrados = useMemo(() => {
    let list = dadosClassificados;
    if (filtroStatus !== "todos") {
      list = list.filter((d) =>
        filtroStatus === "desatualizado"
          ? d.statusCarga === "desatualizado" || d.statusCarga === "muito_desatualizado"
          : d.statusCarga === filtroStatus
      );
    }
    if (busca.trim()) {
      const b = busca.trim().toLowerCase();
      list = list.filter((d) => labelModulo(d).toLowerCase().includes(b) || d.modulo.toLowerCase().includes(b));
    }
    return list;
  }, [dadosClassificados, filtroStatus, busca]);

  const dadosOrdenados = useMemo(() => {
    const pesosStatus: Record<StatusCarga, number> = { erro: 0, muito_desatualizado: 1, desatualizado: 2, pendente: 3, ok: 4 };

    if (sortBy === "cadeia") {
      // Coloca pais antes dos filhos. Itens sem dependência são pais (ou solitários).
      // Itens com dependência são posicionados imediatamente após o respectivo pai.
      const porModulo = new Map(dadosFiltrados.map((d) => [d.modulo, d]));
      const filhosPorPai = new Map<string, ClassifiedItem[]>();
      const semPai: ClassifiedItem[] = [];

      for (const d of dadosFiltrados) {
        const deps = dependenciasDe(d.modulo).filter((p) => porModulo.has(p));
        if (deps.length === 0) {
          semPai.push(d);
        } else {
          // Aninha sob o primeiro pai presente no painel (caso raro com múltiplos pais).
          const paiPrincipal = deps[0];
          const arr = filhosPorPai.get(paiPrincipal) ?? [];
          arr.push(d);
          filhosPorPai.set(paiPrincipal, arr);
        }
      }

      semPai.sort((a, b) => labelModulo(a).localeCompare(labelModulo(b), "pt-BR"));
      for (const arr of filhosPorPai.values()) {
        arr.sort((a, b) => labelModulo(a).localeCompare(labelModulo(b), "pt-BR"));
      }

      const resultado: ClassifiedItem[] = [];
      const empilhar = (item: ClassifiedItem) => {
        resultado.push(item);
        const filhos = filhosPorPai.get(item.modulo);
        if (filhos) filhos.forEach(empilhar);
      };
      semPai.forEach(empilhar);
      return resultado;
    }

    return [...dadosFiltrados].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "modulo") cmp = labelModulo(a).localeCompare(labelModulo(b), "pt-BR");
      if (sortBy === "status") cmp = pesosStatus[a.statusCarga] - pesosStatus[b.statusCarga];
      if (sortBy === "executado_em") cmp = new Date(a.executado_em ?? 0).getTime() - new Date(b.executado_em ?? 0).getTime();
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [dadosFiltrados, sortBy, sortDir]);

  // Mapeia módulo → status classificado, para resolver as dependências no card.
  const statusPorModulo = useMemo(() => {
    const m = new Map<string, StatusCarga>();
    for (const d of dadosClassificados) m.set(d.modulo, d.statusCarga);
    return m;
  }, [dadosClassificados]);

  const totalOk = dadosClassificados.filter((d) => d.statusCarga === "ok").length;
  const totalErro = dadosClassificados.filter((d) => d.statusCarga === "erro").length;
  const totalDesatualizado = dadosClassificados.filter((d) => d.statusCarga === "desatualizado" || d.statusCarga === "muito_desatualizado").length;
  const totalPendente = dadosClassificados.filter((d) => d.statusCarga === "pendente").length;

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Cards de resumo */}
      {!carregando && dados.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(["todos", "ok", "desatualizado", "erro"] as const).map((f) => {
            const count = f === "todos" ? dados.length : f === "ok" ? totalOk : f === "desatualizado" ? totalDesatualizado : f === "erro" ? totalErro : totalPendente;
            const styles = {
              todos:       "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300",
              ok:          "border-green-200 dark:border-green-800/40 text-green-700 dark:text-green-400",
              desatualizado: "border-yellow-200 dark:border-yellow-700/40 text-yellow-700 dark:text-yellow-400",
              erro:        "border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-400",
            };
            const labels = { todos: "Total", ok: "OK", desatualizado: "Desatualizados", erro: "Com erro" };
            const icons = {
              todos: <Database className="h-4 w-4" />,
              ok: <CheckCircle2 className="h-4 w-4" />,
              desatualizado: <TimerOff className="h-4 w-4" />,
              erro: <AlertCircle className="h-4 w-4" />,
            };
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFiltroStatus(f)}
                className={`rounded-xl border bg-white p-4 text-left transition hover:shadow-sm dark:bg-gray-800 ${styles[f]} ${filtroStatus === f ? "ring-2 ring-offset-1 ring-blue-400 dark:ring-blue-600" : ""}`}
              >
                <div className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${styles[f]}`}>
                  {icons[f]}{labels[f]}
                </div>
                <p className="mt-1.5 text-3xl font-bold">{count}</p>
              </button>
            );
          })}
        </div>
      )}

      {/* Barra de ferramentas */}
      {!carregando && dados.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
          <input
            type="text"
            placeholder="Buscar módulo..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="h-8 w-44 rounded-lg border border-gray-200 bg-gray-50 px-3 text-xs text-gray-800 placeholder-gray-400 focus:border-blue-400 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-500"
          />
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 dark:text-gray-400">Ordenar:</span>
            <select
              value={`${sortBy}-${sortDir}`}
              onChange={(e) => {
                const [col, dir] = e.target.value.split("-");
                setSortBy(col as SortBy);
                setSortDir(dir as SortDir);
              }}
              className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
            >
              <option value="cadeia-asc">Por cadeia (pais e filhos juntos)</option>
              <option value="executado_em-desc">Última execução (recente)</option>
              <option value="executado_em-asc">Última execução (antiga)</option>
              <option value="status-asc">Status (pior primeiro)</option>
              <option value="modulo-asc">Nome (A→Z)</option>
            </select>
          </div>
          <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
            {dadosOrdenados.length} de {dados.length} módulos
            {atualizadoEm && ` · consultado às ${atualizadoEm.toLocaleTimeString("pt-BR", { timeStyle: "short" })}`}
          </span>
          <button
            type="button"
            onClick={() => void carregar()}
            disabled={carregando}
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 disabled:opacity-50 dark:border-blue-800/60 dark:bg-blue-900/20 dark:text-blue-300"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${carregando ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
      )}

      {/* Feedback de ação */}
      {mensagemAcao && (
        <div className={`rounded-xl border p-3.5 text-sm ${mensagemAcao.tipo === "sucesso" ? "border-green-200 bg-green-50 text-green-700 dark:border-green-800/40 dark:bg-green-900/20 dark:text-green-300" : "border-red-200 bg-red-50 text-red-700 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-300"}`}>
          {mensagemAcao.texto}
        </div>
      )}

      {/* Conteúdo */}
      {erro ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-300">
          <p className="font-semibold">Erro ao carregar status</p>
          <p className="mt-1 font-mono text-xs">{erro}</p>
        </div>
      ) : carregando ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-center gap-3">
                <div className="h-2.5 w-2.5 rounded-full bg-gray-200 dark:bg-gray-700" />
                <div className="h-3 w-56 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="ml-auto h-5 w-14 rounded-full bg-gray-200 dark:bg-gray-700" />
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {Array.from({ length: 4 }).map((_, j) => <div key={j} className="h-8 rounded bg-gray-100 dark:bg-gray-700/50" />)}
              </div>
            </div>
          ))}
        </div>
      ) : dadosOrdenados.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
          {busca || filtroStatus !== "todos" ? "Nenhum módulo encontrado para o filtro aplicado." : "Nenhum registro de execução ETL encontrado."}
        </div>
      ) : (
        <div className={`grid grid-cols-1 gap-3 ${sortBy === "cadeia" ? "" : "lg:grid-cols-2"}`}>
          {dadosOrdenados.map((item) => {
            const deps = dependenciasDe(item.modulo);
            const dependencias: DependenciaInfo[] = deps.map((dm) => ({
              modulo: dm,
              nome: nomeExibicaoModulo(dm, dados),
              statusCarga: statusPorModulo.get(dm) ?? null,
            }));
            const ehFilho = sortBy === "cadeia" && dependencias.some((d) => d.statusCarga !== null);
            return (
              <EtlCard
                key={item.modulo}
                item={item}
                onExecutar={() => void solicitarExecucaoManual(item)}
                executando={moduloEmExecucao === item.modulo}
                dependencias={dependencias}
                ehFilhoNaCadeia={ehFilho}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
