"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowDownUp, Clock, ExternalLink, FileText, Gavel } from "lucide-react";

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
  numero_fmt: string | null;
  ano: number | null;
  objeto: string | null;
  nome_classe: string | null;
  assunto: string | null;
  nome_orgao: string | null;
  nome_relator: string | null;
  nome_1_parte: string | null;
  partes: string | null;
  situacao: string | null;
  nm_status: number | null;
  processos_apensados: string | null;
  dt_criacao: string | null;
  setor_atual: string | null;
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
  dt_criac: string | null;
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

type CategoriaDocumento = "relatorio" | "parecer-ministerial" | "decisao" | null;

function categorizarDocumento(tipo: string | null): CategoriaDocumento {
  const t = (tipo ?? "").toUpperCase().trim();
  if (
    t === "ACÓRDÃO" || t === "VOTO" || t === "PROPOSTA DE VOTO" ||
    t === "PARECER PRÉVIO"
  ) return "decisao";
  if (t === "PARECER MINISTERIAL") return "parecer-ministerial";
  if (
    t.startsWith("RELATÓRIO CONCLUSIVO") ||
    t.startsWith("RELATÓRIO TÉCNICO") ||
    t.startsWith("RELATÓRIO COMPLEMENTAR") ||
    t.startsWith("RELATÓRIO PRELIMINAR DE ANÁLISE") ||
    t.startsWith("RELATÓRIO DE ANÁLISE TÉCNICA")
  ) return "relatorio";
  return null;
}

function BadgeTipoDocumento({ tipo }: { tipo: string | null }) {
  const categoria = categorizarDocumento(tipo);
  const label = tipo ?? "—";

  if (categoria === "decisao") {
    return (
      <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700 ring-1 ring-inset ring-green-600/20 dark:bg-green-900/30 dark:text-green-400 dark:ring-green-500/30">
        {label}
      </span>
    );
  }
  if (categoria === "parecer-ministerial") {
    return (
      <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-900/30 dark:text-amber-400 dark:ring-amber-500/30">
        {label}
      </span>
    );
  }
  if (categoria === "relatorio") {
    return (
      <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 ring-1 ring-inset ring-blue-600/20 dark:bg-blue-900/30 dark:text-blue-400 dark:ring-blue-500/30">
        {label}
      </span>
    );
  }
  return <span className="text-xs text-gray-700 dark:text-gray-300">{label}</span>;
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

                <div className={`rounded-lg border px-3.5 py-2.5 transition-colors ${
                  !m.dt_saida
                    ? "border-blue-200 bg-blue-50/60 hover:bg-blue-50 dark:border-blue-800/60 dark:bg-blue-900/20"
                    : "border-gray-100 bg-gray-50/60 hover:border-gray-200 hover:bg-white dark:border-gray-700/60 dark:bg-gray-800/40 dark:hover:bg-gray-800"
                }`}>
                  {/* Setor + badge atual */}
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className={`text-xs font-semibold ${!m.dt_saida ? "text-blue-700 dark:text-blue-300" : "text-gray-800 dark:text-gray-200"}`}>
                      {m.grupo_desc ?? m.item_fluxo_desc ?? "—"}
                    </span>
                    {!m.dt_saida && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-600 dark:bg-blue-800/50 dark:text-blue-300">
                        Aqui agora
                      </span>
                    )}
                  </div>

                  {/* Chegada / Saída */}
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[10px] text-gray-500 dark:text-gray-400">
                    <span>
                      <span className="font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Chegada: </span>
                      {formatarData(m.dt_mov) ?? "—"}
                    </span>
                    <span>
                      <span className="font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Saída: </span>
                      {m.dt_saida ? formatarData(m.dt_saida) : <span className="italic text-gray-300 dark:text-gray-600">em aberto</span>}
                    </span>
                  </div>

                  {/* Fase / atividade / documento / usuário */}
                  {(() => {
                    const nGrupo = normText(m.grupo_desc);
                    const nFluxo = normText(m.item_fluxo_desc);
                    const showFluxo = !!m.item_fluxo_desc && nFluxo !== nGrupo;
                    const nAtividade = normText(m.atividade);
                    const showAtividade = !!m.atividade && nAtividade !== nGrupo && nAtividade !== nFluxo;
                    const nFase = normText(m.fase);
                    const showFase = !!m.fase && nFase !== nGrupo && nFase !== nFluxo && nFase !== nAtividade;
                    return (showFluxo || showAtividade || showFase || m.nome_usuario || m.usuario_login || m.tipo_documento) ? (
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        {showFluxo && (
                          <span className="text-[10px] text-gray-500 dark:text-gray-400">{m.item_fluxo_desc}</span>
                        )}
                        {showAtividade && (
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">
                            <span className="font-semibold uppercase tracking-wide">Atividade: </span>{m.atividade}
                          </span>
                        )}
                        {showFase && (
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">
                            <span className="font-semibold uppercase tracking-wide">Fase: </span>{m.fase}
                          </span>
                        )}
                        {(m.nome_usuario ?? m.usuario_login) && (
                          <span className="text-[10px] text-gray-500 dark:text-gray-400">
                            {m.nome_usuario ?? m.usuario_login}
                          </span>
                        )}
                        {m.tipo_documento && (
                          <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                            <span className="font-semibold uppercase tracking-wide text-gray-400">Doc.: </span>
                            {m.tipo_documento}
                          </span>
                        )}
                      </div>
                    ) : null;
                  })()}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aba Arquivos — split-screen lista + PDF inline
// ---------------------------------------------------------------------------

function BadgeCategoria({ tipo }: { tipo: string | null }) {
  const cat = categorizarDocumento(tipo);
  if (cat === "decisao")
    return <span className="rounded bg-green-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-green-700 dark:bg-green-900/30 dark:text-green-400">Decisão</span>;
  if (cat === "parecer-ministerial")
    return <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Parecer MP</span>;
  if (cat === "relatorio")
    return <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Relatório</span>;
  return null;
}

function ordenarArquivos(lista: ArquivoRow[], desc: boolean): ArquivoRow[] {
  return [...lista].sort((a, b) => {
    const ta = a.dt_criac ? new Date(a.dt_criac).getTime() : 0;
    const tb = b.dt_criac ? new Date(b.dt_criac).getTime() : 0;
    const diff = ta !== tb ? ta - tb : a.id_proc_arqv - b.id_proc_arqv;
    return desc ? -diff : diff;
  });
}

function AbaArquivos({
  arquivos,
  loading,
  processoId,
}: {
  arquivos: ArquivoRow[];
  loading: boolean;
  processoId: number;
}) {
  const [desc, setDesc] = useState(true);
  const [ativo, setAtivo] = useState<ArquivoRow | null>(null);

  const lista = ordenarArquivos(arquivos, desc);
  const total = lista.length;

  const pdfUrl = ativo?.nm_proc_arqv
    ? `/api/processos/${processoId}/arquivos/${ativo.id_proc_arqv}/pdf#navpanes=0`
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10">
        <Spinner className="h-4 w-4 text-blue-500" />
        <span className="text-sm text-gray-400">Carregando arquivos...</span>
      </div>
    );
  }

  if (!total) {
    return <p className="py-10 text-center text-sm text-gray-400">Nenhum arquivo encontrado.</p>;
  }

  return (
    <div className="flex min-h-[65vh] gap-0 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
      {/* Lista */}
      <div className="flex w-64 shrink-0 flex-col border-r border-gray-200 dark:border-gray-700 lg:w-72">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2 dark:border-gray-700">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            {total} documento{total !== 1 ? "s" : ""}
          </span>
          <button
            type="button"
            onClick={() => setDesc((v) => !v)}
            title={desc ? "Ordem crescente" : "Ordem decrescente"}
            className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          >
            <ArrowDownUp className="h-3 w-3" />
            {desc ? "Mais recente" : "Mais antigo"}
          </button>
        </div>

        {/* Itens */}
        <div className="flex-1 overflow-y-auto p-1.5">
          <div className="space-y-0.5">
            {lista.map((a, i) => {
              const posicao = desc ? total - i : i + 1;
              const isAtivo = ativo?.id_proc_arqv === a.id_proc_arqv;
              return (
                <div
                  key={a.id_proc_arqv}
                  onClick={() => setAtivo(a)}
                  className={`group flex cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 transition-colors ${
                    isAtivo ? "bg-blue-100 dark:bg-blue-900/40" : "hover:bg-gray-100 dark:hover:bg-gray-700/50"
                  }`}
                >
                  <span className={`mt-0.5 w-5 shrink-0 text-right font-mono text-[10px] ${isAtivo ? "text-blue-500" : "text-gray-300 dark:text-gray-600"}`}>
                    {posicao}
                  </span>
                  <FileText className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${isAtivo ? "text-blue-600 dark:text-blue-400" : "text-gray-400"}`} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-medium leading-snug ${isAtivo ? "text-blue-700 dark:text-blue-300" : "text-gray-700 dark:text-gray-300"}`}>
                      {a.nm_tipo_docm ?? "Sem tipo"}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <BadgeCategoria tipo={a.nm_tipo_docm} />
                      {a.nr_pagn != null && (
                        <span className="text-[10px] text-gray-400">{a.nr_pagn} pág.</span>
                      )}
                      {a.dt_criac && (
                        <span className="text-[10px] text-gray-400">{formatarData(a.dt_criac)}</span>
                      )}
                    </div>
                  </div>
                  {a.nm_proc_arqv && (
                    <a
                      href={`/api/processos/${processoId}/arquivos/${a.id_proc_arqv}/pdf#navpanes=0`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Abrir em nova aba"
                      onClick={(e) => e.stopPropagation()}
                      className="mt-0.5 shrink-0 rounded p-0.5 text-gray-400 opacity-0 transition hover:text-blue-600 group-hover:opacity-100 dark:hover:text-blue-400"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Visualizador PDF */}
      <div className="flex min-w-0 flex-1 flex-col bg-gray-100 dark:bg-gray-900">
        {pdfUrl ? (
          <iframe
            key={pdfUrl}
            src={pdfUrl}
            className="h-full w-full border-0"
            title={ativo?.nm_tipo_docm ?? "Documento"}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-gray-400 dark:text-gray-600">
            <FileText className="h-10 w-10 opacity-30" />
            <p className="text-sm">Selecione um documento para visualizar</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProcessoDetalheClient({ processoId }: { processoId: number }) {
  const router = useRouter();
  const [abaAtiva, setAbaAtiva] = useState<Aba>("arquivos");

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
    { id: "arquivos",      label: "Documentos",    icon: <FileText className="h-4 w-4" />, count: arquivos?.length ?? 0,      loading: loadingArq },
    { id: "movimentacoes", label: "Movimentações", icon: <Clock className="h-4 w-4" />,    count: movimentacoes?.length ?? 0, loading: loadingMov },
    { id: "sessoes",       label: "Sessões",       icon: <Gavel className="h-4 w-4" />,    count: sessoes?.length ?? 0,       loading: loadingSess },
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
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
          {/* Coluna esquerda */}
          <div className="space-y-3">
            <div>
              <h1 className="text-lg font-bold text-blue-700 dark:text-blue-400">
                {processo.numero_fmt ?? `ID ${processo.processo_id}`}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                {processo.nome_classe && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">{processo.nome_classe}</span>
                )}
                {processo.situacao && (
                  <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                    {processo.situacao}
                  </span>
                )}
                {processo.ano && (
                  <span className="text-[10px] text-gray-400">{processo.ano}</span>
                )}
              </div>
            </div>
            {processo.objeto && (
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Objeto</dt>
                <dd className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">{processo.objeto}</dd>
              </div>
            )}
            {processo.nome_1_parte && (
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Partes</dt>
                <dd className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">{processo.nome_1_parte}</dd>
              </div>
            )}
          </div>

          {/* Coluna direita */}
          <div className="space-y-3">
            {processo.nome_orgao && (
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Entidade</dt>
                <dd className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">{processo.nome_orgao}</dd>
              </div>
            )}
            {processo.nome_relator && (
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Relator</dt>
                <dd className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">{processo.nome_relator}</dd>
              </div>
            )}
            {processo.setor_atual && (
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Localização atual</dt>
                <dd className="mt-0.5">
                  <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20 dark:bg-blue-900/30 dark:text-blue-300 dark:ring-blue-500/30">
                    {processo.setor_atual}
                  </span>
                </dd>
              </div>
            )}
            {processo.assunto && (
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Assunto</dt>
                <dd className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">{processo.assunto}</dd>
              </div>
            )}
          </div>
        </div>
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
            <AbaArquivos arquivos={arquivos ?? []} loading={loadingArq} processoId={processoId} />
          )}
        </div>
      </div>
    </div>
  );
}
