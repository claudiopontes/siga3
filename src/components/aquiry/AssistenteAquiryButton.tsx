"use client";

interface AssistenteAquiryButtonProps {
  aberto: boolean;
  onClick: () => void;
}

export default function AssistenteAquiryButton({ aberto, onClick }: AssistenteAquiryButtonProps) {
  if (aberto) return null;

  return (
    <div className="fixed bottom-5 right-5 z-99990">
      <button
        type="button"
        onClick={onClick}
        aria-label="Abrir Assistente Aquiry"
        aria-expanded={false}
        title="Assistente Aquiry — clique para abrir"
        className="relative flex items-center justify-center bg-transparent transition-transform duration-200 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:scale-100"
      >
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
