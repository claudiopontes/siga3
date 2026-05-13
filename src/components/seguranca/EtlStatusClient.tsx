"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
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

type SortBy = "modulo" | "status" | "periodicidade" | "registros" | "duracao" | "executado_em";
type SortDir = "asc" | "desc";
type GroupBy = "nenhum" | "status" | "periodicidade";

function labelModulo(item: EtlStatus) {
  return item.nomeExibicao ?? ETL_CONFIG[item.modulo]?.nomeExibicao ?? item.modulo;
}

function formatDuracao(ms: number | null) {
  if (!ms) return "-";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms / 60000)} min`;
}

function formatDataHora(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function tempoRelativo(iso: string | null) {
  if (!iso) return "-";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  const h = Math.floor(min / 60);
  const dias = Math.floor(h / 24);
  if (dias > 0) return `há ${dias} dia${dias !== 1 ? "s" : ""}`;
  if (h > 0) return `há ${h}h`;
  if (min > 0) return `há ${min} min`;
  return "agora";
}

function StatusBadge({ statusCarga }: { statusCarga: StatusCarga }) {
  if (statusCarga === "ok") return <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 dark:bg-green-900/20 dark:text-green-400"><span className="h-1.5 w-1.5 rounded-full bg-green-500" />OK</span>;
  if (statusCarga === "erro") return <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 dark:bg-red-900/20 dark:text-red-400"><span className="h-1.5 w-1.5 rounded-full bg-red-500" />Erro</span>;
  if (statusCarga === "pendente") return <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500 dark:bg-gray-700/40 dark:text-gray-400"><span className="h-1.5 w-1.5 rounded-full bg-gray-400" />Pendente</span>;
  if (statusCarga === "muito_desatualizado") return <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-50 px-2.5 py-1 text-xs font-semibold text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400"><span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />Muito desatualizado</span>;
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-50 px-2.5 py-1 text-xs font-semibold text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300"><span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />Desatualizado</span>;
}

function SemaforoIndicador({ statusCarga }: { statusCarga: StatusCarga }) {
  if (statusCarga === "erro") return <span className="h-3 w-3 rounded-full bg-red-500" title="Erro na última execução" />;
  if (statusCarga === "pendente") return <span className="h-3 w-3 rounded-full bg-gray-400" title="Nunca executado" />;
  if (statusCarga === "muito_desatualizado") return <span className="h-3 w-3 rounded-full bg-yellow-500" title="Muito desatualizado" />;
  if (statusCarga === "desatualizado") return <span className="h-3 w-3 rounded-full bg-yellow-300" title="Desatualizado" />;
  return <span className="h-3 w-3 rounded-full bg-green-500" title="Atualizado" />;
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
  const [groupBy, setGroupBy] = useState<GroupBy>("nenhum");
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [itensPorPagina, setItensPorPagina] = useState(50);

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
      setPaginaAtual(1);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar status ETL.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  useEffect(() => {
    if (!mensagemAcao || mensagemAcao.tipo !== "sucesso") return;
    const timer = setTimeout(() => setMensagemAcao(null), 6000);
    return () => clearTimeout(timer);
  }, [mensagemAcao]);

  async function solicitarExecucaoManual(item: EtlStatus) {
    const config = item.execucao ? item : { ...item, execucao: ETL_CONFIG[item.modulo]?.execucao, execucaoManual: ETL_CONFIG[item.modulo]?.execucaoManual };
    const mensagemConfirmacao = config.execucaoManual?.mensagemConfirmacao;
    if (mensagemConfirmacao && !window.confirm(mensagemConfirmacao)) return;

    setModuloEmExecucao(item.modulo);
    setMensagemAcao(null);
    try {
      const res = await fetch("/api/admin/etl/executar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modulo: item.modulo, tipoSolicitado: config.execucao?.tipoCargaPadrao, confirmado: true }),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string; mensagem?: string };
      if (res.status === 202) {
        setMensagemAcao({ tipo: "sucesso", texto: body.mensagem ?? "Execução manual iniciada." });
        return;
      }
      if (!res.ok) throw new Error(body.message ?? body.mensagem ?? `Erro ao validar solicitação (HTTP ${res.status}).`);
      setMensagemAcao({ tipo: "sucesso", texto: body.mensagem ?? "Solicitação validada." });
    } catch (e) {
      setMensagemAcao({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro ao validar solicitação de execução." });
    } finally {
      setModuloEmExecucao(null);
    }
  }

  const dadosClassificados = useMemo(() => dados.map((d) => {
    if (!d.executado_em) return { ...d, statusCarga: d.status.toLowerCase() === "erro" ? "erro" as StatusCarga : "pendente" as StatusCarga };
    const fallback = classificarCarga(d.status, d.executado_em, d.modulo);
    const tolerancia = d.toleranciaDias ?? ETL_CONFIG[d.modulo]?.toleranciaDias;
    if (!tolerancia) return { ...d, statusCarga: fallback };

    const s = d.status.toLowerCase();
    if (s === "erro" || s === "error") return { ...d, statusCarga: "erro" as StatusCarga };
    const diasDesde = Math.floor((Date.now() - new Date(d.executado_em).getTime()) / 86400000);
    if (diasDesde > tolerancia * 2) return { ...d, statusCarga: "muito_desatualizado" as StatusCarga };
    if (diasDesde > tolerancia) return { ...d, statusCarga: "desatualizado" as StatusCarga };
    return { ...d, statusCarga: "ok" as StatusCarga };
  }), [dados]);

  const dadosOrdenados = useMemo(() => {
    const pesosStatus: Record<StatusCarga, number> = { erro: 0, muito_desatualizado: 1, desatualizado: 2, pendente: 3, ok: 4 };
    const list = [...dadosClassificados];
    list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "modulo") cmp = labelModulo(a).localeCompare(labelModulo(b), "pt-BR");
      if (sortBy === "status") cmp = pesosStatus[a.statusCarga] - pesosStatus[b.statusCarga];
      if (sortBy === "periodicidade") cmp = (a.periodicidade ?? ETL_CONFIG[a.modulo]?.periodicidade ?? "").localeCompare(b.periodicidade ?? ETL_CONFIG[b.modulo]?.periodicidade ?? "", "pt-BR");
      if (sortBy === "registros") cmp = a.registros - b.registros;
      if (sortBy === "duracao") cmp = (a.duracao_ms ?? -1) - (b.duracao_ms ?? -1);
      if (sortBy === "executado_em") cmp = new Date(a.executado_em ?? 0).getTime() - new Date(b.executado_em ?? 0).getTime();
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [dadosClassificados, sortBy, sortDir]);

  const totalPaginas = Math.max(1, Math.ceil(dadosOrdenados.length / itensPorPagina));
  const dadosPaginados = useMemo(() => dadosOrdenados.slice((paginaAtual - 1) * itensPorPagina, paginaAtual * itensPorPagina), [dadosOrdenados, paginaAtual, itensPorPagina]);

  const gruposPagina = useMemo(() => {
    const map = new Map<string, typeof dadosPaginados>();
    for (const item of dadosPaginados) {
      let chave = "Todos";
      if (groupBy === "status") chave = item.statusCarga;
      if (groupBy === "periodicidade") chave = item.periodicidade ?? ETL_CONFIG[item.modulo]?.periodicidade ?? "não definido";
      const arr = map.get(chave) ?? [];
      arr.push(item);
      map.set(chave, arr);
    }
    return Array.from(map.entries());
  }, [dadosPaginados, groupBy]);

  function alternarOrdenacao(coluna: SortBy) {
    setPaginaAtual(1);
    if (sortBy === coluna) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(coluna);
    setSortDir(coluna === "modulo" || coluna === "periodicidade" || coluna === "status" ? "asc" : "desc");
  }

  const totalOk = dadosClassificados.filter((d) => d.statusCarga === "ok").length;
  const totalErro = dadosClassificados.filter((d) => d.statusCarga === "erro").length;
  const totalDesatualizado = dadosClassificados.filter((d) => d.statusCarga === "desatualizado" || d.statusCarga === "muito_desatualizado").length;

  return (
    <div className="space-y-4 p-4 md:p-6">
      {!carregando && dados.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-green-200 bg-white p-4 dark:border-green-800/40 dark:bg-gray-800"><p className="text-xs font-medium uppercase tracking-wide text-green-500">OK</p><p className="mt-1 text-3xl font-bold text-green-600 dark:text-green-400">{totalOk}</p></div>
          <div className="rounded-xl border border-yellow-200 bg-white p-4 dark:border-yellow-700/40 dark:bg-gray-800"><p className="text-xs font-medium uppercase tracking-wide text-yellow-500">Desatualizados</p><p className="mt-1 text-3xl font-bold text-yellow-600 dark:text-yellow-400">{totalDesatualizado}</p></div>
          <div className="rounded-xl border border-red-200 bg-white p-4 dark:border-red-800/40 dark:bg-gray-800"><p className="text-xs font-medium uppercase tracking-wide text-red-400">Com erro</p><p className="mt-1 text-3xl font-bold text-red-600 dark:text-red-400">{totalErro}</p></div>
        </div>
      )}

      {!carregando && dados.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-gray-500 dark:text-gray-400">Exibindo {dadosPaginados.length} de {dadosOrdenados.length} registros</div>
          <div className="flex items-center gap-2"><label className="text-xs font-medium text-gray-600 dark:text-gray-300">Agrupar por</label><select value={groupBy} onChange={(e) => { setGroupBy(e.target.value as GroupBy); setPaginaAtual(1); }} className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"><option value="nenhum">Sem agrupamento</option><option value="status">Status</option><option value="periodicidade">Periodicidade</option></select></div>
          <div className="flex items-center gap-2"><label className="text-xs font-medium text-gray-600 dark:text-gray-300">Itens/página</label><select value={itensPorPagina} onChange={(e) => { setItensPorPagina(Number(e.target.value)); setPaginaAtual(1); }} className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select></div>
          <div className="flex items-center gap-3">
            {atualizadoEm && <div className="text-xs text-gray-500 dark:text-gray-400">Consultado às {atualizadoEm.toLocaleTimeString("pt-BR", { timeStyle: "short" })}</div>}
            <button type="button" onClick={() => void carregar()} disabled={carregando} className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 disabled:opacity-50 dark:border-blue-800/60 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30"><RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />Atualizar</button>
          </div>
        </div>
      )}

      {mensagemAcao && <div className={`rounded-xl border p-4 text-sm ${mensagemAcao.tipo === "sucesso" ? "border-green-200 bg-green-50 text-green-700 dark:border-green-800/40 dark:bg-green-900/20 dark:text-green-300" : "border-red-200 bg-red-50 text-red-700 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-300"}`}>{mensagemAcao.texto}</div>}

      {erro ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-300"><p className="font-semibold">Erro ao carregar status</p><p className="mt-1 font-mono text-xs">{erro}</p></div>
      ) : carregando ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"><div className="flex items-center gap-3"><div className="h-3 w-3 rounded-full bg-gray-200 dark:bg-gray-700" /><div className="h-3 w-48 rounded bg-gray-200 dark:bg-gray-700" /><div className="ml-auto h-5 w-12 rounded-full bg-gray-200 dark:bg-gray-700" /></div></div>)}</div>
      ) : dados.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">Nenhum registro de execução ETL encontrado.</div>
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <table className="w-full min-w-[1200px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"><button type="button" onClick={() => alternarOrdenacao("modulo")} className="hover:text-gray-800 dark:hover:text-gray-200">Base/Módulo</button></th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"><button type="button" onClick={() => alternarOrdenacao("status")} className="hover:text-gray-800 dark:hover:text-gray-200">Status</button></th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"><button type="button" onClick={() => alternarOrdenacao("periodicidade")} className="hover:text-gray-800 dark:hover:text-gray-200">Periodicidade</button></th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"><button type="button" onClick={() => alternarOrdenacao("registros")} className="hover:text-gray-800 dark:hover:text-gray-200">Registros</button></th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"><button type="button" onClick={() => alternarOrdenacao("duracao")} className="hover:text-gray-800 dark:hover:text-gray-200">Duração</button></th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"><button type="button" onClick={() => alternarOrdenacao("executado_em")} className="hover:text-gray-800 dark:hover:text-gray-200">Última execução</button></th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Mensagem</th>
                  <th className="sticky right-0 z-10 bg-gray-50 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {gruposPagina.map(([grupo, itensGrupo]) => (
                  <Fragment key={`group-${grupo}`}>
                    {groupBy !== "nenhum" && <tr className="bg-gray-50/70 dark:bg-gray-900/20"><td colSpan={8} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Grupo: {grupo.replaceAll("_", " ")} ({itensGrupo.length})</td></tr>}
                    {itensGrupo.map((item) => {
                      const fallback = ETL_CONFIG[item.modulo];
                      const configExecucaoManual = item.execucaoManual ?? fallback?.execucaoManual;
                      const configPeriodicidade = item.periodicidade ?? fallback?.periodicidade;
                      const tolerancia = item.toleranciaDias ?? fallback?.toleranciaDias;
                      const executandoLinha = moduloEmExecucao === item.modulo;
                      const permiteExecucaoManual = configExecucaoManual?.permiteExecucaoManual === true;
                      return (
                        <tr key={`${grupo}-${item.modulo}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                          <td className="px-4 py-3"><div className="flex items-center gap-2"><SemaforoIndicador statusCarga={item.statusCarga} /><p className="font-medium text-gray-900 dark:text-white">{labelModulo(item)}</p></div></td>
                          <td className="px-4 py-3"><StatusBadge statusCarga={item.statusCarga} /></td>
                          <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{configPeriodicidade ? <span title={`Tolerância: ${tolerancia ?? "-"} dia(s)`}>{configPeriodicidade}</span> : <span className="text-gray-300 dark:text-gray-600">-</span>}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-gray-700 dark:text-gray-300">{item.registros > 0 ? item.registros.toLocaleString("pt-BR") : "-"}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-gray-700 dark:text-gray-300">{formatDuracao(item.duracao_ms)}</td>
                          <td className="px-4 py-3"><p className="text-xs font-medium text-gray-700 dark:text-gray-300">{formatDataHora(item.executado_em)}</p><p className="text-xs text-gray-400 dark:text-gray-500">{tempoRelativo(item.executado_em)}</p></td>
                          <td className="max-w-xs px-4 py-3 text-xs text-gray-500 dark:text-gray-400"><span className="block max-w-[320px] truncate" title={item.mensagem ?? "-"}>{item.mensagem ?? "-"}</span></td>
                          <td className="sticky right-0 bg-white px-4 py-3 text-right dark:bg-gray-800">{permiteExecucaoManual ? <button type="button" onClick={() => void solicitarExecucaoManual(item)} disabled={executandoLinha} className="inline-flex items-center justify-center rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-700/70 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/30">{executandoLinha ? "Validando..." : configExecucaoManual?.labelBotao ?? "Forçar atualização"}</button> : <span className="text-gray-300 dark:text-gray-600">-</span>}</td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400">Página {paginaAtual} de {totalPaginas}</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPaginaAtual((p) => Math.max(1, p - 1))} disabled={paginaAtual === 1} className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300">Anterior</button>
              <button type="button" onClick={() => setPaginaAtual((p) => Math.min(totalPaginas, p + 1))} disabled={paginaAtual === totalPaginas} className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300">Próxima</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
