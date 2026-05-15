"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock, FileText, Gavel } from "lucide-react";

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

type ProcessoRow = {
  processo_id: number;
  numero_processo_fmt: string | null;
  objeto: string | null;
  nome_classe: string | null;
  assunto: string | null;
  nome_1_parte: string | null;
  situacao_funcional: string | null;
  nome_orgao: string | null;
  nome_relator: string | null;
  relator_tratamento: string | null;
  nome_revisor: string | null;
  situacao: string | null;
};

type SessaoProcessoRow = {
  id: number;
  sessao_id: number;
  sessao_numero: string | null;
  dt_realizacao: string | null;
  orgao_julgador: string | null;
  tipo_sessao: string | null;
  situacao: string | null;
  relator_tratamento: string | null;
  nome_relator: string | null;
  nome_revisor: string | null;
};

type MovimentacaoRow = {
  id: number;
  dt_mov: string | null;
  dt_saida: string | null;
  grupo_desc: string | null;
  item_fluxo_desc: string | null;
  atividade: string | null;
  fase: string | null;
  usuario_login: string | null;
  nome_usuario: string | null;
  tipo_documento: string | null;
};

type ArquivoRow = {
  id_proc_arqv: number;
  nm_tipo_docm: string | null;
  nm_proc_arqv: string | null;
  nr_pagn: number | null;
  nr_ordem: number | null;
  data_finalizado: string | null;
};

type Aba = "sessoes" | "movimentacoes" | "arquivos";

function useAsyncData<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    setErro(null);
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (cancelado) return;
        if (d?.error) setErro(d.error);
        else setData(d);
      })
      .catch(() => { if (!cancelado) setErro("Falha na comunicação com o servidor."); })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [url]);

  return { data, loading, erro };
}

function normText(v: string | null | undefined) {
  return (v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function TimelineMovimentacoes({ movimentacoes }: { movimentacoes: MovimentacaoRow[] }) {
  // Agrupa por mês/ano (já vêm em ordem DESC)
  const grupos = movimentacoes.reduce<{ chave: string; label: string; itens: MovimentacaoRow[] }[]>((acc, m) => {
    const match = m.dt_mov ? String(m.dt_mov).match(/^(\d{4})-(\d{2})/) : null;
    const chave = match ? `${match[1]}-${match[2]}` : "sem-data";
    const label = match
      ? new Date(`${match[1]}-${match[2]}-01`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
      : "Sem data";
    const ultimo = acc[acc.length - 1];
    if (ultimo?.chave === chave) { ultimo.itens.push(m); }
    else { acc.push({ chave, label, itens: [m] }); }
    return acc;
  }, []);

  return (
    <div className="space-y-6">
      {grupos.map((grupo) => (
        <div key={grupo.chave}>
          {/* Cabeçalho do grupo */}
          <div className="mb-3 flex items-center gap-3">
            <span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
              {grupo.label}
            </span>
            <span className="text-[10px] text-gray-400 dark:text-gray-500">{grupo.itens.length} registro{grupo.itens.length !== 1 ? "s" : ""}</span>
            <div className="flex-1 border-t border-gray-100 dark:border-gray-700" />
          </div>

          {/* Itens em timeline */}
          <div className="relative ml-2 space-y-0 border-l-2 border-gray-100 pl-5 dark:border-gray-700">
            {grupo.itens.map((m) => (
              <div key={m.id} className="relative pb-4 last:pb-0">
                {/* Ponto da timeline */}
                <span className="absolute -left-[23px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-blue-300 dark:border-gray-800 dark:bg-blue-600" />

                <div className="rounded-lg border border-gray-100 bg-gray-50/60 px-3.5 py-2.5 hover:border-gray-200 hover:bg-white dark:border-gray-700/60 dark:bg-gray-800/40 dark:hover:bg-gray-800">
                  {(() => {
                    const titulo = m.item_fluxo_desc ?? m.grupo_desc ?? "—";
                    const nTitulo = normText(titulo);
                    const nGrupo = normText(m.grupo_desc);
                    const showAtividade = !!m.atividade && normText(m.atividade) !== nTitulo && normText(m.atividade) !== nGrupo;
                    const nAtividade = normText(m.atividade);
                    const showFase = !!m.fase && normText(m.fase) !== nTitulo && normText(m.fase) !== nGrupo && normText(m.fase) !== nAtividade;
                    return (
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                    {/* Descrição principal */}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{titulo}</p>
                      {showAtividade && (
                        <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
                          <span className="mr-1 font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Atividade:</span>
                          {m.atividade}
                        </p>
                      )}
                      {showFase && (
                        <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">
                          <span className="mr-1 font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Fase:</span>
                          {m.fase}
                        </p>
                      )}
                    </div>

                    {/* Data */}
                    <span className="shrink-0 whitespace-nowrap text-[10px] font-medium text-gray-400 dark:text-gray-500">
                      {formatarData(m.dt_mov)}
                      {m.dt_saida && m.dt_saida !== m.dt_mov && (
                        <span className="ml-1 text-gray-300 dark:text-gray-600">→ {formatarData(m.dt_saida)}</span>
                      )}
                    </span>
                  </div>
                    );
                  })()}

                  {/* Linha secundária: usuário + documento */}
                  {(m.nome_usuario || m.usuario_login || m.tipo_documento) && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      {(m.nome_usuario ?? m.usuario_login) && (
                        <span className="text-[10px] text-gray-500 dark:text-gray-400">
                          {m.nome_usuario ?? m.usuario_login}
                          {m.nome_usuario && m.usuario_login && (
                            <span className="ml-1 text-gray-400">({m.usuario_login})</span>
                          )}
                        </span>
                      )}
                      {m.tipo_documento && (
                        <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                          <span className="font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Doc.:</span>
                          {m.tipo_documento}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ProcessoDetalheClient({ processoId }: { processoId: number }) {
  const router = useRouter();
  const [abaAtiva, setAbaAtiva] = useState<Aba>("sessoes");

  const { data: processo, loading: loadingP, erro: erroP } =
    useAsyncData<ProcessoRow>(`/api/processos/${processoId}`);
  const { data: sessoes, loading: loadingSess } =
    useAsyncData<SessaoProcessoRow[]>(`/api/processos/${processoId}/sessoes`);
  const { data: movimentacoes, loading: loadingMov } =
    useAsyncData<MovimentacaoRow[]>(`/api/processos/${processoId}/movimentacoes`);
  const { data: arquivos, loading: loadingArq } =
    useAsyncData<ArquivoRow[]>(`/api/processos/${processoId}/arquivos`);

  if (loadingP) {
    return (
      <div className="flex items-center justify-center gap-3 py-20">
        <Spinner className="h-5 w-5 text-blue-500" />
        <span className="text-sm text-gray-500 dark:text-gray-400">Carregando processo...</span>
      </div>
    );
  }

  if (erroP || !processo) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
        {erroP ?? "Processo não encontrado."}
      </div>
    );
  }

  const abas: { id: Aba; label: string; icon: React.ReactNode; count: number; loading: boolean }[] = [
    { id: "sessoes",       label: "Sessões",       icon: <Gavel className="h-4 w-4" />,    count: sessoes?.length ?? 0,       loading: loadingSess },
    { id: "movimentacoes", label: "Movimentações", icon: <Clock className="h-4 w-4" />,    count: movimentacoes?.length ?? 0, loading: loadingMov },
    { id: "arquivos",      label: "Arquivos",      icon: <FileText className="h-4 w-4" />, count: arquivos?.length ?? 0,      loading: loadingArq },
  ];

  return (
    <div className="space-y-4 p-1">
      {/* Voltar */}
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar para a lista
      </button>

      {/* Card do processo */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-blue-700 dark:text-blue-400">
              {processo.numero_processo_fmt ?? `ID ${processo.processo_id}`}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
              {processo.nome_classe && <span>{processo.nome_classe}</span>}
              {processo.situacao_funcional && (
                <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                  {processo.situacao_funcional}
                </span>
              )}
            </div>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {processo.objeto && (
            <div className="sm:col-span-2 lg:col-span-3">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Objeto</dt>
              <dd className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">{processo.objeto}</dd>
            </div>
          )}
          {processo.nome_1_parte && (
            <div className="sm:col-span-2">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Partes</dt>
              <dd className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">{processo.nome_1_parte}</dd>
            </div>
          )}
          {processo.nome_orgao && (
            <div className="sm:col-span-2 lg:col-span-3">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Entidade</dt>
              <dd className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">{processo.nome_orgao}</dd>
            </div>
          )}
          {(processo.relator_tratamento ?? processo.nome_relator) && (
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Relator</dt>
              <dd className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">
                {processo.relator_tratamento ?? processo.nome_relator}
                {processo.nome_revisor && (
                  <span className="block text-xs text-gray-400">Rev.: {processo.nome_revisor}</span>
                )}
              </dd>
            </div>
          )}
          {processo.assunto && (
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Assunto</dt>
              <dd className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">{processo.assunto}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Abas */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex border-b border-gray-100 px-4 dark:border-gray-700 overflow-x-auto">
          {abas.map((aba) => (
            <button
              key={aba.id}
              type="button"
              onClick={() => setAbaAtiva(aba.id)}
              className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3.5 text-sm font-semibold transition ${
                abaAtiva === aba.id
                  ? "border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              }`}
            >
              {aba.icon}
              {aba.label}
              {!aba.loading && aba.count > 0 && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                  {aba.count}
                </span>
              )}
              {aba.loading && <Spinner className="h-3 w-3 text-gray-400" />}
            </button>
          ))}
        </div>

        <div className="p-4">
          {/* Sessões */}
          {abaAtiva === "sessoes" && (
            loadingSess ? (
              <div className="flex items-center justify-center gap-2 py-10">
                <Spinner className="h-4 w-4 text-blue-500" />
                <span className="text-sm text-gray-400">Carregando sessões...</span>
              </div>
            ) : !sessoes?.length ? (
              <p className="py-10 text-center text-sm text-gray-400">Processo não foi pautado em nenhuma sessão.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/60">
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Sessão</th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Órgão Julgador</th>
                      <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500">Realização</th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Situação na Pauta</th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Relator</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessoes.map((s, i) => (
                      <tr key={s.id} className={`border-t border-gray-100 dark:border-gray-700/50 hover:bg-blue-50/40 dark:hover:bg-blue-900/10 ${i % 2 !== 0 ? "bg-slate-50 dark:bg-slate-800/30" : "bg-white dark:bg-gray-800"}`}>
                        <td className="px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                          {s.sessao_numero ? `${s.sessao_numero}ª` : `#${s.sessao_id}`}
                          {s.tipo_sessao && <span className="mt-0.5 block text-[10px] text-gray-400">{s.tipo_sessao}</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-300">{s.orgao_julgador ?? "—"}</td>
                        <td className="px-3 py-2 text-center text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">{formatarData(s.dt_realizacao)}</td>
                        <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">{s.situacao ?? "—"}</td>
                        <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
                          {s.relator_tratamento ?? s.nome_relator ?? "—"}
                          {s.nome_revisor && <span className="mt-0.5 block text-[10px] text-gray-400">Rev.: {s.nome_revisor}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* Movimentações */}
          {abaAtiva === "movimentacoes" && (
            loadingMov ? (
              <div className="flex items-center justify-center gap-2 py-10">
                <Spinner className="h-4 w-4 text-blue-500" />
                <span className="text-sm text-gray-400">Carregando movimentações...</span>
              </div>
            ) : !movimentacoes?.length ? (
              <p className="py-10 text-center text-sm text-gray-400">Nenhuma movimentação encontrada.</p>
            ) : (
              <TimelineMovimentacoes movimentacoes={movimentacoes} />
            )
          )}

          {/* Arquivos */}
          {abaAtiva === "arquivos" && (
            loadingArq ? (
              <div className="flex items-center justify-center gap-2 py-10">
                <Spinner className="h-4 w-4 text-blue-500" />
                <span className="text-sm text-gray-400">Carregando arquivos...</span>
              </div>
            ) : !arquivos?.length ? (
              <p className="py-10 text-center text-sm text-gray-400">Nenhum arquivo encontrado.</p>
            ) : (
              <>
              {(() => {
                const temOrdem = arquivos.some((a) => a.nr_ordem != null);
                return (
                  <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                    <table className="w-full min-w-[500px] text-sm">
                      <thead className="sticky top-0 z-10">
                        <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/60">
                          <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500">{temOrdem ? "Ord." : "#"}</th>
                          <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Tipo</th>
                          <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Nome do Arquivo</th>
                          <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500">Págs.</th>
                          <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500">Finalizado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {arquivos.map((a, i) => (
                          <tr key={a.id_proc_arqv} className={`border-t border-gray-100 dark:border-gray-700/50 hover:bg-blue-50/40 dark:hover:bg-blue-900/10 ${i % 2 !== 0 ? "bg-slate-50 dark:bg-slate-800/30" : "bg-white dark:bg-gray-800"}`}>
                            <td className="px-3 py-2 text-center text-xs text-gray-400">{temOrdem ? (a.nr_ordem ?? "—") : i + 1}</td>
                            <td className="px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300">{a.nm_tipo_docm ?? "—"}</td>
                            <td className="max-w-72 px-3 py-2 text-xs text-gray-600 dark:text-gray-300">
                              {a.nm_proc_arqv ? <span className="block truncate" title={a.nm_proc_arqv}>{a.nm_proc_arqv}</span> : "—"}
                            </td>
                            <td className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400">{a.nr_pagn ?? "—"}</td>
                            <td className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400">{formatarData(a.data_finalizado)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
