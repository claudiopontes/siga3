"use client";

import { useEffect, useState } from "react";
import type { ResumoPautaOutput } from "@/lib/ia/tipos";
import CardSessaoJulgamento from "./CardSessaoJulgamento";
import TabelaProcessosPauta from "./TabelaProcessosPauta";
import ModalResumoPautaIA from "./ModalResumoPautaIA";
import type { ProcessoPautaJulgamentoView, SessaoJulgamentoView } from "./tipos";

export default function PautasJulgamentoClient() {
  const [loadingSessoes, setLoadingSessoes] = useState(true);
  const [erroSessoes, setErroSessoes] = useState<string | null>(null);
  const [sessoes, setSessoes] = useState<SessaoJulgamentoView[]>([]);

  const [sessaoSelecionada, setSessaoSelecionada] = useState<SessaoJulgamentoView | null>(null);
  const [loadingProcessos, setLoadingProcessos] = useState(false);
  const [erroProcessos, setErroProcessos] = useState<string | null>(null);
  const [processos, setProcessos] = useState<ProcessoPautaJulgamentoView[]>([]);

  const [loadingResumoIA, setLoadingResumoIA] = useState(false);
  const [erroResumoIA, setErroResumoIA] = useState<string | null>(null);
  const [resumoIA, setResumoIA] = useState<ResumoPautaOutput | null>(null);
  const [modalResumoAberto, setModalResumoAberto] = useState(false);

  // Carrega sessões em situação PARA JULGAMENTO ao montar
  useEffect(() => {
    let cancelado = false;
    async function carregarSessoes() {
      setLoadingSessoes(true);
      setErroSessoes(null);
      try {
        const res = await fetch("/api/pauta-julgamento/sessoes-abertas?situacao=PARA+JULGAMENTO");
        const dados = await res.json();
        if (cancelado) return;
        if (!res.ok) {
          setErroSessoes(dados?.error ?? "Erro ao carregar sessões.");
          return;
        }
        setSessoes(Array.isArray(dados) ? dados : []);
      } catch {
        if (!cancelado) setErroSessoes("Falha na comunicação com o servidor.");
      } finally {
        if (!cancelado) setLoadingSessoes(false);
      }
    }
    void carregarSessoes();
    return () => { cancelado = true; };
  }, []);

  // Carrega processos ao selecionar uma sessão
  async function selecionarSessao(sessao: SessaoJulgamentoView) {
    setSessaoSelecionada(sessao);
    setProcessos([]);
    setErroProcessos(null);
    setResumoIA(null);
    setLoadingProcessos(true);
    try {
      const res = await fetch(`/api/pauta-julgamento?sessaoId=${sessao.id}`);
      const dados = await res.json();
      if (!res.ok) {
        setErroProcessos(dados?.error ?? "Erro ao carregar processos da pauta.");
        return;
      }
      setProcessos(Array.isArray(dados) ? dados : []);
    } catch {
      setErroProcessos("Falha na comunicação com o servidor.");
    } finally {
      setLoadingProcessos(false);
    }
  }

  // Gera resumo da pauta com IA
  async function gerarResumoIA() {
    if (!sessaoSelecionada || processos.length === 0) return;
    setLoadingResumoIA(true);
    setErroResumoIA(null);
    try {
      const res = await fetch("/api/ia/resumo-pauta-ejuris", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessaoId: sessaoSelecionada.id }),
      });
      const dados = await res.json();
      if (!res.ok) {
        setErroResumoIA(dados?.error ?? "Erro ao gerar resumo com IA.");
        return;
      }
      setResumoIA(dados as ResumoPautaOutput);
      setModalResumoAberto(true);
    } catch {
      setErroResumoIA("Falha na comunicação com o servidor.");
    } finally {
      setLoadingResumoIA(false);
    }
  }

  return (
    <div className="space-y-4 p-1">
      {/* Cabeçalho da página */}
      <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h1 className="text-base font-bold text-gray-900 dark:text-white">
          Pautas para Julgamento
        </h1>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          Sessões em situação <span className="font-medium text-amber-600 dark:text-amber-400">PARA JULGAMENTO</span> no EJURIS/TCE-AC
        </p>
      </div>

      {/* Loading inicial */}
      {loadingSessoes && (
        <div className="flex items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white py-12 dark:border-gray-700 dark:bg-gray-800">
          <svg className="h-5 w-5 animate-spin text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
          </svg>
          <span className="text-sm text-gray-500 dark:text-gray-400">Carregando sessões...</span>
        </div>
      )}

      {/* Erro ao carregar sessões */}
      {!loadingSessoes && erroSessoes && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {erroSessoes}
        </div>
      )}

      {/* Nenhuma sessão */}
      {!loadingSessoes && !erroSessoes && sessoes.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-10 text-center dark:border-gray-700 dark:bg-gray-800">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Não há sessões em situação PARA JULGAMENTO no momento.
          </p>
        </div>
      )}

      {/* Conteúdo principal: sessões + processos */}
      {!loadingSessoes && sessoes.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          {/* Coluna de sessões */}
          <div className="space-y-2">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Sessões ({sessoes.length})
            </p>
            {sessoes.map((sessao) => (
              <CardSessaoJulgamento
                key={sessao.id}
                sessao={sessao}
                selecionada={sessaoSelecionada?.id === sessao.id}
                onSelecionar={() => selecionarSessao(sessao)}
              />
            ))}
          </div>

          {/* Coluna de processos */}
          <div className="space-y-3">
            {!sessaoSelecionada ? (
              <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500">
                Selecione uma sessão para ver os processos da pauta.
              </div>
            ) : (
              <>
                {/* Cabeçalho da sessão selecionada */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      Sessão {sessaoSelecionada.numero ?? sessaoSelecionada.id}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {[sessaoSelecionada.tipo, sessaoSelecionada.local_sessao].filter(Boolean).join(" · ")}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {erroResumoIA && (
                      <span className="text-xs text-red-600 dark:text-red-400">{erroResumoIA}</span>
                    )}
                    {resumoIA && !loadingResumoIA && (
                      <button
                        type="button"
                        onClick={() => setModalResumoAberto(true)}
                        className="rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20"
                      >
                        Ver resumo da IA
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={gerarResumoIA}
                      disabled={loadingResumoIA || loadingProcessos || processos.length === 0}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
                    >
                      {loadingResumoIA ? (
                        <>
                          <svg className="h-3.5 w-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                          </svg>
                          Gerando resumo...
                        </>
                      ) : (
                        "Gerar resumo com IA"
                      )}
                    </button>
                  </div>
                </div>

                {/* Loading processos */}
                {loadingProcessos && (
                  <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-8 dark:border-gray-700 dark:bg-gray-800">
                    <svg className="h-4 w-4 animate-spin text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                    </svg>
                    <span className="text-sm text-gray-500 dark:text-gray-400">Carregando processos...</span>
                  </div>
                )}

                {/* Erro processos */}
                {!loadingProcessos && erroProcessos && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                    {erroProcessos}
                  </div>
                )}

                {/* Tabela de processos */}
                {!loadingProcessos && !erroProcessos && (
                  <div className="rounded-xl border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-800">
                    <TabelaProcessosPauta processos={processos} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal do resumo de IA */}
      <ModalResumoPautaIA
        aberto={modalResumoAberto}
        onFechar={() => setModalResumoAberto(false)}
        resumo={resumoIA}
      />
    </div>
  );
}
