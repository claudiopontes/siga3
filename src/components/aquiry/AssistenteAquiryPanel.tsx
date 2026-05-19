"use client";

import { useEffect, useRef, useState } from "react";
import type { OrigemRespostaAquiry } from "@/lib/aquiry/tiposContextoAquiry";

export type MensagemChat = {
  role: "user" | "assistant";
  content: string;
  /** Presente apenas em respostas da IA vindas do endpoint — não na mensagem inicial */
  origem?: OrigemRespostaAquiry;
};

interface AssistenteAquiryPanelProps {
  aberto: boolean;
  onFechar: () => void;
  mensagens: MensagemChat[];
  carregando: boolean;
  valorInput: string;
  onChangeInput: (valor: string) => void;
  onEnviar: (pergunta?: string) => void;
  onNovaConversa: () => void;
  sugestoes: string[];
}

// Limite de sugestões visíveis no estado inicial — reduz poluição visual.
const SUGESTOES_VISIVEIS = 3;

// Resumo curto da base, derivado de origem.bases — usado na linha colapsada.
function resumirBases(bases: string[] | undefined): string {
  if (!bases || bases.length === 0) return "Orientação geral da IA";
  const partes: string[] = [];
  if (bases.includes("Fonte estruturada necessária")) {
    partes.push("Fonte estruturada necessária");
  } else if (bases.includes("Pesquisa externa realizada")) {
    partes.push("Pesquisa externa");
  } else if (bases.includes("Busca externa necessária")) {
    partes.push("Busca externa necessária");
  }
  if (
    bases.includes("Contexto da tela atual") ||
    bases.includes("Análise contextual do Varadouro") ||
    bases.includes("Contexto da rota")
  ) {
    partes.push("Varadouro");
  }
  if (bases.includes("Base documental do Aquiry")) {
    partes.push("Documental");
  }
  if (partes.length === 0) return "Orientação geral da IA";
  return `${partes.join(" + ")} + IA`;
}

export default function AssistenteAquiryPanel({
  aberto,
  onFechar,
  mensagens,
  carregando,
  valorInput,
  onChangeInput,
  onEnviar,
  onNovaConversa,
  sugestoes,
}: AssistenteAquiryPanelProps) {
  const containerMensagensRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Quais respostas têm o detalhe da base expandido — controla mensagem a mensagem.
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set());

  function alternarExpandido(idx: number) {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function novaConversaHandler() {
    setExpandidos(new Set());
    onNovaConversa();
  }

  // Rola para a última mensagem sempre que o histórico atualiza ou o painel abre
  useEffect(() => {
    if (!aberto) return;
    const el = containerMensagensRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [mensagens, carregando, aberto]);

  // Foca o campo de texto ao abrir o painel
  useEffect(() => {
    if (!aberto) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(timer);
  }, [aberto]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onEnviar();
    }
    // Shift+Enter: quebra de linha — comportamento padrão do textarea
  }

  const mostrarSugestoes = mensagens.length <= 1 && !carregando;

  if (!aberto) return null;

  return (
    <div
      role="dialog"
      aria-label="Assistente Aquiry"
      aria-modal="false"
      className="fixed bottom-5 right-5 z-99989 flex w-[calc(100vw-40px)] max-w-[420px] flex-col overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-2xl dark:border-emerald-900/40 dark:bg-gray-900 sm:w-[420px]"
      style={{ maxHeight: "calc(100vh - 100px)" }}
    >
      {/* Cabeçalho */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-emerald-200 bg-white px-4 py-4 dark:border-emerald-800/40 dark:bg-gray-900">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/aquiry/logo-aquiry.png"
            alt=""
            aria-hidden="true"
            width={48}
            height={48}
            className="h-12 w-12 shrink-0 object-contain"
          />
          <div>
            <p className="text-sm font-semibold leading-tight text-gray-900 dark:text-white">Assistente Aquiry</p>
            <p className="text-[10px] leading-tight text-gray-500 dark:text-gray-400">
              Inteligência de apoio ao gabinete
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={novaConversaHandler}
            aria-label="Iniciar nova conversa"
            title="Iniciar nova conversa"
            disabled={carregando}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12a9 9 0 1 0 3-6.7" />
              <polyline points="3 4 3 10 9 10" />
            </svg>
          </button>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar assistente"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M6.04289 16.5413C5.65237 16.9318 5.65237 17.565 6.04289 17.9555C6.43342 18.346 7.06658 18.346 7.45711 17.9555L11.9987 13.4139L16.5408 17.956C16.9313 18.3466 17.5645 18.3466 17.955 17.956C18.3455 17.5655 18.3455 16.9323 17.955 16.5418L13.4129 11.9997L17.955 7.4576C18.3455 7.06707 18.3455 6.43391 17.955 6.04338C17.5645 5.65286 16.9313 5.65286 16.5408 6.04338L11.9987 10.5855L7.45711 6.0439C7.06658 5.65338 6.43342 5.65338 6.04289 6.0439C5.65237 6.43442 5.65237 7.06759 6.04289 7.45811L10.5845 11.9997L6.04289 16.5413Z"
              fill="currentColor"
            />
          </svg>
        </button>
        </div>
      </div>

      {/* Histórico de mensagens */}
      <div
        ref={containerMensagensRef}
        className="flex min-h-[120px] flex-1 flex-col gap-3 overflow-y-auto p-4"
      >
        {mensagens.map((msg, i) => (
          <div
            key={i}
            className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
          >
            {/* Balão de mensagem */}
            <div
              className={
                msg.role === "user"
                  ? "max-w-[85%] rounded-2xl rounded-br-sm bg-blue-600 px-3.5 py-2.5 text-sm text-white"
                  : "max-w-[90%] rounded-2xl rounded-bl-sm bg-gray-100 px-3.5 py-2.5 text-sm text-gray-800 dark:bg-gray-800 dark:text-gray-200"
              }
            >
              <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
            </div>

            {/* Linha de origem colapsada + expansor de detalhes */}
            {msg.role === "assistant" && msg.origem && (() => {
              const aberto = expandidos.has(i);
              const temBases = !!msg.origem.bases && msg.origem.bases.length > 0;
              const temDocumentos =
                !!msg.origem.documentosBase && msg.origem.documentosBase.length > 0;
              const temFontes =
                !!msg.origem.fontesExternas && msg.origem.fontesExternas.length > 0;
              if (!temBases && !temDocumentos && !temFontes) return null;
              const idDetalhe = `aquiry-detalhe-${i}`;
              return (
                <div className="mt-1 max-w-[90%]">
                  <button
                    type="button"
                    onClick={() => alternarExpandido(i)}
                    aria-expanded={aberto}
                    aria-controls={idDetalhe}
                    className="inline-flex items-center gap-1 text-[10px] leading-tight text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                  >
                    <span>Base: {resumirBases(msg.origem.bases)}</span>
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className={`transition-transform ${aberto ? "rotate-180" : ""}`}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                    <span className="sr-only">
                      {aberto ? "Ocultar detalhes da base" : "Ver detalhes da base"}
                    </span>
                  </button>

                  {aberto && (
                    <div
                      id={idDetalhe}
                      className="mt-1 space-y-2 rounded-md border border-gray-100 bg-gray-50/50 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-800/50"
                    >
                      {temBases && (
                        <p className="text-[10px] leading-tight text-gray-500 dark:text-gray-400">
                          <span className="font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                            Bases:
                          </span>{" "}
                          {msg.origem.bases!.join(" · ")}
                        </p>
                      )}
                      {temDocumentos && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                            Documentos-base
                          </p>
                          <ul className="mt-0.5 space-y-0.5">
                            {msg.origem.documentosBase!.slice(0, 3).map((d, idx) => (
                              <li
                                key={`${i}-doc-${idx}`}
                                className="text-[11px] leading-snug text-gray-500 dark:text-gray-400"
                              >
                                <span>{d.titulo}</span>
                                {d.area && (
                                  <span className="ml-1 text-[10px] text-gray-400 dark:text-gray-600">
                                    — {d.area}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {temFontes && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                            Fontes
                          </p>
                          <ul className="mt-0.5 space-y-0.5">
                            {msg.origem.fontesExternas!.slice(0, 3).map((f, idx) => (
                              <li
                                key={`${i}-fonte-${idx}`}
                                className="text-[11px] leading-snug"
                              >
                                <a
                                  href={f.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline dark:text-blue-400"
                                  title={f.fonte ?? f.url}
                                >
                                  {f.titulo}
                                </a>
                                {f.fonte && (
                                  <span className="ml-1 text-[10px] text-gray-400 dark:text-gray-600">
                                    · {f.fonte}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        ))}

        {carregando && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-gray-100 px-4 py-3 dark:bg-gray-800">
              <div className="flex items-center gap-1" aria-label="Assistente digitando">
                <span
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400"
                  style={{ animationDelay: "0ms" }}
                />
                <span
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400"
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400"
                  style={{ animationDelay: "300ms" }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sugestões de perguntas — visíveis apenas no início da conversa */}
      {mostrarSugestoes && (
        <div className="shrink-0 border-t border-gray-100 px-4 pb-3 pt-2 dark:border-gray-700">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Sugestões
          </p>
          <div className="flex flex-wrap gap-1.5">
            {sugestoes.slice(0, SUGESTOES_VISIVEIS).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onEnviar(s)}
                className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[11px] text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/40"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Campo de entrada */}
      <div className="shrink-0 border-t border-gray-100 p-3 dark:border-gray-700">
        <div className="flex items-end gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 focus-within:border-blue-400 dark:border-gray-700 dark:bg-gray-800 dark:focus-within:border-blue-600">
          <textarea
            ref={inputRef}
            rows={1}
            value={valorInput}
            onChange={(e) => onChangeInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua pergunta... (Enter para enviar)"
            disabled={carregando}
            aria-label="Mensagem para o Assistente Aquiry"
            className="max-h-20 min-h-6 flex-1 resize-none bg-transparent text-sm text-gray-800 placeholder-gray-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-200 dark:placeholder-gray-500"
          />
          <button
            type="button"
            onClick={() => onEnviar()}
            disabled={carregando || !valorInput.trim()}
            aria-label="Enviar mensagem"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M22 2L11 13"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M22 2L15 22L11 13L2 9L22 2Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        <p className="mt-1.5 text-center text-[9px] text-gray-400 dark:text-gray-600">
          Respostas são orientações gerais · Shift+Enter para quebrar linha
        </p>
      </div>
    </div>
  );
}
