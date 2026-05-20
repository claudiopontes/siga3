"use client";

import { useEffect, useRef, useState } from "react";
import type { UsePosicaoBotaoAquiryRetorno } from "./usePosicaoBotaoAquiry";

const MENSAGENS = [
  "Posso ajudar com algo?",
  "Tem dúvidas sobre esta tela?",
  "Estou disponível!",
  "Clique para conversar.",
  "Como posso ajudar?",
  "Alguma dúvida no gabinete?",
];

const BALAO_DURACAO_MS = 4500;
const BALAO_FADE_MS = 380;
const INTERVALO_MIN_MS = 25000;
const INTERVALO_JITTER_MS = 15000;

interface AssistenteAquiryButtonProps {
  aberto: boolean;
  onClick: () => void;
  posicao: UsePosicaoBotaoAquiryRetorno;
}

export default function AssistenteAquiryButton({ aberto, onClick, posicao }: AssistenteAquiryButtonProps) {
  const { estiloBotao, mobile, arrastando, onPointerDown, onKeyDown, consumiuArrasto } = posicao;

  const [balao, setBalao] = useState<string | null>(null);
  const [saindo, setSaindo] = useState(false);
  const idxRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Suprime balão enquanto o botão está sendo arrastado para evitar bolha
  // "fantasma" longe do cursor durante o reposicionamento.
  useEffect(() => {
    if (arrastando) {
      setBalao(null);
      setSaindo(false);
    }
  }, [arrastando]);

  useEffect(() => {
    // Respeita prefers-reduced-motion: não dispara balão automático.
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const timers = timersRef.current;
    const addTimer = (t: ReturnType<typeof setTimeout>) => {
      timers.push(t);
    };
    const clearAll = () => {
      timers.forEach(clearTimeout);
      timers.length = 0;
    };

    function mostrar() {
      clearAll();
      setSaindo(false);
      setBalao(MENSAGENS[idxRef.current % MENSAGENS.length]);
      idxRef.current++;
      addTimer(
        setTimeout(() => {
          setSaindo(true);
          addTimer(setTimeout(() => setBalao(null), BALAO_FADE_MS));
        }, BALAO_DURACAO_MS),
      );
    }

    function agendar() {
      const delay = INTERVALO_MIN_MS + Math.random() * INTERVALO_JITTER_MS;
      addTimer(
        setTimeout(() => {
          mostrar();
          agendar();
        }, delay),
      );
    }

    agendar();
    return clearAll;
  }, []);

  if (aberto) return null;

  function handleClick() {
    if (consumiuArrasto()) return;
    onClick();
  }

  return (
    <div
      onPointerDown={onPointerDown}
      style={{
        ...estiloBotao,
        zIndex: 100000,
        userSelect: "none",
        WebkitUserSelect: "none",
        touchAction: mobile ? "auto" : "none",
        cursor: mobile ? "pointer" : arrastando ? "grabbing" : "grab",
      }}
    >
      {/* Balão de fala periódico — relativo ao botão (acompanha a posição arrastada) */}
      {balao && !arrastando && (
        <div
          className="pointer-events-none absolute right-0 flex justify-end"
          style={{
            bottom: "calc(100% + 12px)",
            animation: saindo
              ? `aquiry-pop-out ${BALAO_FADE_MS}ms cubic-bezier(.4,0,.6,1) forwards`
              : `aquiry-pop-in ${BALAO_FADE_MS}ms cubic-bezier(.2,1.3,.5,1) forwards`,
          }}
        >
          <div className="relative max-w-[230px] rounded-2xl rounded-br-sm bg-linear-to-br from-emerald-400 to-emerald-600 px-4 py-3 shadow-2xl shadow-emerald-500/35">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-2xl bg-linear-to-b from-white/20 to-transparent" />
            <p className="text-[13px] font-semibold leading-snug tracking-tight text-white drop-shadow-sm">
              {balao}
            </p>
            <span
              aria-hidden="true"
              className="absolute -bottom-[9px] right-4"
              style={{
                width: 0,
                height: 0,
                borderLeft: "9px solid transparent",
                borderRight: "9px solid transparent",
                borderTop: "10px solid #059669",
              }}
            />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={handleClick}
        onKeyDown={onKeyDown}
        aria-label="Abrir Assistente Aquiry. Use Alt mais seta para cima ou para baixo para reposicionar."
        title="Assistente Aquiry — clique para abrir"
        aria-expanded={false}
        draggable={false}
        className="relative flex items-center justify-center bg-transparent transition-transform duration-200 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:scale-100"
      >
        {/* Anéis pulsantes durante o balão */}
        {balao && !arrastando && (
          <>
            <span
              className="pointer-events-none absolute inset-0 animate-ping rounded-full border-2 border-emerald-400 opacity-60 motion-reduce:hidden"
              aria-hidden="true"
            />
            <span
              className="pointer-events-none absolute -inset-2 animate-ping rounded-full border border-emerald-300 opacity-30 motion-reduce:hidden"
              style={{ animationDelay: "0.4s" }}
              aria-hidden="true"
            />
          </>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/aquiry/logo-aquiry.png"
          alt=""
          aria-hidden="true"
          width={72}
          height={72}
          draggable={false}
          className="pointer-events-none relative h-[72px] w-[72px] object-contain"
          style={{ filter: "drop-shadow(0 4px 12px rgba(59,130,246,0.45)) drop-shadow(0 2px 4px rgba(0,0,0,0.25))" }}
        />
      </button>
    </div>
  );
}
