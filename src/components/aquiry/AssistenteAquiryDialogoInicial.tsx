"use client";

import { useEffect, useRef, useState } from "react";

interface AssistenteAquiryDialogoInicialProps {
  aberto: boolean;
  onComecar: (naoMostrarNovamente: boolean) => void;
  onFechar: () => void;
  onSelecionarSugestao?: (texto: string) => void;
}

const SUGESTOES_INICIAIS = [
  "Resumir o que esta tela mostra",
  "Quais pontos merecem atenção?",
  "Como interpretar os indicadores desta página?",
];

export default function AssistenteAquiryDialogoInicial({
  aberto,
  onComecar,
  onFechar,
  onSelecionarSugestao,
}: AssistenteAquiryDialogoInicialProps) {
  const [naoMostrarNovamente, setNaoMostrarNovamente] = useState(false);
  const [sugestoesAbertas, setSugestoesAbertas] = useState(true);
  const botaoComecarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!aberto) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onFechar();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    const t = setTimeout(() => botaoComecarRef.current?.focus(), 60);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      clearTimeout(t);
    };
  }, [aberto, onFechar]);

  if (!aberto) return null;

  function handleComecar() {
    onComecar(naoMostrarNovamente);
  }

  function handleSugestao(texto: string) {
    onComecar(naoMostrarNovamente);
    onSelecionarSugestao?.(texto);
  }

  return (
    <div
      className="fixed inset-0 z-99995 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="aquiry-dialogo-inicial-titulo"
      aria-describedby="aquiry-dialogo-inicial-descricao"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Fechar diálogo"
        onClick={onFechar}
        className="absolute inset-0 cursor-default bg-gray-900/55 backdrop-blur-sm transition-opacity motion-reduce:transition-none"
      />

      {/* Conteúdo */}
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        {/* Cabeçalho institucional */}
        <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/aquiry/logo-aquiry.png"
            alt=""
            aria-hidden="true"
            width={56}
            height={56}
            className="h-14 w-14 shrink-0 object-contain"
          />
          <div className="min-w-0 flex-1">
            <h2
              id="aquiry-dialogo-inicial-titulo"
              className="text-base font-semibold text-gray-900 dark:text-white"
            >
              Assistente Aquiry
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Inteligência de apoio ao gabinete — TCE-AC
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar diálogo"
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

        {/* Corpo rolável */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p
            id="aquiry-dialogo-inicial-descricao"
            className="text-sm leading-relaxed text-gray-700 dark:text-gray-300"
          >
            O Aquiry apoia a leitura de painéis, processos e pautas. Ele organiza
            informações, explica telas e ajuda a identificar pontos de atenção a partir
            dos dados visíveis e da base institucional do Varadouro.
          </p>

          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] leading-relaxed text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
            <p>
              <span className="font-semibold">Atenção:</span> o Aquiry{" "}
              <span className="font-semibold">não substitui</span> o juízo técnico,
              jurídico ou institucional. Não emite voto, não conclui irregularidade sem
              base documental e não produz parecer oficial. Toda resposta é insumo
              sujeito a <span className="font-semibold">revisão humana</span>.
            </p>
          </div>

          <div className="mt-4">
            <button
              type="button"
              onClick={() => setSugestoesAbertas((v) => !v)}
              aria-expanded={sugestoesAbertas}
              aria-controls="aquiry-dialogo-inicial-sugestoes"
              className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wider text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <span>Exemplos de perguntas</span>
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className={`transition-transform ${sugestoesAbertas ? "rotate-180" : ""}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {sugestoesAbertas && (
              <div
                id="aquiry-dialogo-inicial-sugestoes"
                className="mt-2 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap"
              >
                {SUGESTOES_INICIAIS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSugestao(s)}
                    className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-left text-[12px] text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/40"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Rodapé */}
        <div className="flex shrink-0 flex-col gap-3 border-t border-gray-100 bg-gray-50/60 px-5 py-3 dark:border-gray-800 dark:bg-gray-900/50 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex cursor-pointer select-none items-center gap-2 text-[12px] text-gray-600 dark:text-gray-400">
            <input
              type="checkbox"
              checked={naoMostrarNovamente}
              onChange={(e) => setNaoMostrarNovamente(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800"
            />
            Não mostrar novamente nesta sessão
          </label>
          <button
            ref={botaoComecarRef}
            type="button"
            onClick={handleComecar}
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-blue-500 dark:hover:bg-blue-600 dark:focus:ring-offset-gray-900"
          >
            Começar
          </button>
        </div>
      </div>
    </div>
  );
}
