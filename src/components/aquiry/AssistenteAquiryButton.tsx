"use client";

import type { UsePosicaoBotaoAquiryRetorno } from "./usePosicaoBotaoAquiry";

interface AssistenteAquiryButtonProps {
  aberto: boolean;
  onClick: () => void;
  posicao: UsePosicaoBotaoAquiryRetorno;
}

export default function AssistenteAquiryButton({ aberto, onClick, posicao }: AssistenteAquiryButtonProps) {
  const { estiloBotao, mobile, arrastando, onPointerDown, onKeyDown, consumiuArrasto } = posicao;

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
