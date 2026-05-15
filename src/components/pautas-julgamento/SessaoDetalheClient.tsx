"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import TabelaProcessosPauta from "./TabelaProcessosPauta";
import type { ProcessoPautaJulgamentoView, SessaoJulgamentoView } from "./tipos";

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

export default function SessaoDetalheClient({ sessaoId }: { sessaoId: number }) {
  const router = useRouter();

  const [sessao, setSessao] = useState<SessaoJulgamentoView | null>(null);
  const [loadingSessao, setLoadingSessao] = useState(true);
  const [erroSessao, setErroSessao] = useState<string | null>(null);

  const [processos, setProcessos] = useState<ProcessoPautaJulgamentoView[]>([]);
  const [loadingProcessos, setLoadingProcessos] = useState(true);
  const [erroProcessos, setErroProcessos] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    fetch(`/api/pauta-julgamento/sessoes-abertas/${sessaoId}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelado) { if (d?.error) setErroSessao(d.error); else setSessao(d); } })
      .catch(() => { if (!cancelado) setErroSessao("Falha ao carregar sessão."); })
      .finally(() => { if (!cancelado) setLoadingSessao(false); });

    fetch(`/api/pauta-julgamento?sessaoId=${sessaoId}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelado) { if (d?.error) setErroProcessos(d.error); else setProcessos(Array.isArray(d) ? d : []); } })
      .catch(() => { if (!cancelado) setErroProcessos("Falha ao carregar processos."); })
      .finally(() => { if (!cancelado) setLoadingProcessos(false); });

    return () => { cancelado = true; };
  }, [sessaoId]);

  if (loadingSessao) {
    return (
      <div className="flex items-center justify-center gap-3 py-20">
        <Spinner className="h-5 w-5 text-blue-500" />
        <span className="text-sm text-gray-500 dark:text-gray-400">Carregando sessão...</span>
      </div>
    );
  }

  if (erroSessao || !sessao) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
        {erroSessao ?? "Sessão não encontrada."}
      </div>
    );
  }

  return (
    <div className="space-y-4 p-1">
      {/* Voltar */}
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar para sessões
      </button>

      {/* Card da sessão */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">
          {sessao.numero ? `${sessao.numero}ª Sessão` : `Sessão #${sessao.id}`}
          {sessao.tipo && <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">· {sessao.tipo}</span>}
        </h1>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
          {sessao.orgao_julgador && (
            <div className="col-span-2 sm:col-span-3 lg:col-span-2">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Órgão Julgador</dt>
              <dd className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">{sessao.orgao_julgador}</dd>
            </div>
          )}
          {sessao.local_sessao && (
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Local</dt>
              <dd className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">{sessao.local_sessao}</dd>
            </div>
          )}
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Realização</dt>
            <dd className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">{formatarData(sessao.dt_realizacao)}</dd>
          </div>
        </dl>

        {/* Contadores */}
        {((sessao.qtd_julgado ?? 0) > 0 || (sessao.qtd_vistas ?? 0) > 0 || (sessao.qtd_julgamento ?? 0) > 0) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {(sessao.qtd_julgamento ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                {sessao.qtd_julgamento} na pauta
              </span>
            )}
            {(sessao.qtd_julgado ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
                {sessao.qtd_julgado} julgados
              </span>
            )}
            {(sessao.qtd_vistas ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                {sessao.qtd_vistas} vistas
              </span>
            )}
          </div>
        )}
      </div>

      {/* Processos */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="border-b border-gray-100 px-5 py-3 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Processos da Pauta
            {!loadingProcessos && (
              <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">
                {processos.length} processo{processos.length !== 1 ? "s" : ""}
              </span>
            )}
          </h2>
        </div>
        <div className="p-4">
          {loadingProcessos ? (
            <div className="flex items-center justify-center gap-2 py-10">
              <Spinner className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-gray-400">Carregando processos...</span>
            </div>
          ) : erroProcessos ? (
            <p className="py-6 text-center text-sm text-red-500">{erroProcessos}</p>
          ) : (
            <TabelaProcessosPauta processos={processos} />
          )}
        </div>
      </div>
    </div>
  );
}
