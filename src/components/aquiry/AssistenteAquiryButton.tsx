"use client";

import { useEffect, useRef, useState } from "react";

const MENSAGENS = [
  "Posso ajudar com algo?",
  "Tem dúvidas sobre esta tela?",
  "Estou disponível!",
  "Clique para conversar.",
  "Como posso ajudar?",
  "Alguma dúvida no gabinete?",
];

interface AssistenteAquiryButtonProps {
  aberto: boolean;
  onClick: () => void;
}

export default function AssistenteAquiryButton({ aberto, onClick }: AssistenteAquiryButtonProps) {
  const [balao, setBalao] = useState<string | null>(null);
  const [saindo, setSaindo] = useState(false);
  const idxRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  function addTimer(t: ReturnType<typeof setTimeout>) {
    timersRef.current.push(t);
  }

  function clearAll() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }

  function mostrar() {
    clearAll();
    setSaindo(false);
    setBalao(MENSAGENS[idxRef.current % MENSAGENS.length]);
    idxRef.current++;
    addTimer(
      setTimeout(() => {
        setSaindo(true);
        addTimer(setTimeout(() => setBalao(null), 380));
      }, 4500),
    );
  }

  // Ref sempre atualizado para evitar closure estale no timer periódico
  const mostrarRef = useRef(mostrar);
  mostrarRef.current = mostrar;

  useEffect(() => {
    function agendar() {
      const delay = 25000 + Math.random() * 15000;
      addTimer(
        setTimeout(() => {
          mostrarRef.current();
          agendar();
        }, delay),
      );
    }
    agendar();
    return clearAll;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (aberto) return null;

  return (
    <div className="fixed bottom-5 right-5 z-99990">
      {/* Balão de fala */}
      {balao && (
        <div
          className="absolute bottom-[88px] right-0 flex justify-end"
          style={{
            animation: saindo
              ? "aquiry-pop-out 0.38s cubic-bezier(.4,0,.6,1) forwards"
              : "aquiry-pop-in 0.38s cubic-bezier(.2,1.3,.5,1) forwards",
          }}
        >
          <div className="relative max-w-[230px] rounded-2xl rounded-br-sm bg-linear-to-br from-emerald-400 to-emerald-600 px-4 py-3 shadow-2xl shadow-emerald-500/35">
            {/* Brilho interno (efeito vidro) */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-2xl bg-linear-to-b from-white/20 to-transparent" />

            {/* Conteúdo */}
            <p className="text-[13px] font-semibold leading-snug tracking-tight text-white drop-shadow-sm">
              {balao}
            </p>

            {/* Seta apontando para o botão abaixo */}
            <span
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

      {/* Botão principal */}
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={() => mostrar()}
        aria-label="Abrir Assistente Aquiry"
        aria-expanded={false}
        className="relative flex items-center justify-center bg-transparent transition-all duration-300 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
      >
        {/* Anéis pulsantes — visíveis quando o balão está ativo */}
        {balao && (
          <>
            <span
              className="absolute inset-0 animate-ping rounded-full border-2 border-emerald-400 opacity-60"
              aria-hidden="true"
            />
            <span
              className="absolute -inset-2 animate-ping rounded-full border border-emerald-300 opacity-30"
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
          className="relative h-[72px] w-[72px] object-contain"
          style={{ filter: "drop-shadow(0 4px 12px rgba(59,130,246,0.45)) drop-shadow(0 2px 4px rgba(0,0,0,0.25))" }}
        />
      </button>
    </div>
  );
}
