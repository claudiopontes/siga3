"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { ContextoTelaAquiry } from "@/lib/aquiry/tiposContextoAquiry";

type AssistenteAquiryContextValue = {
  contextoTela: ContextoTelaAquiry | null;
  registrarContexto: (ctx: ContextoTelaAquiry) => void;
  limparContexto: () => void;
};

const AssistenteAquiryContext = createContext<AssistenteAquiryContextValue | null>(null);

export function useAssistenteAquiryContext(): AssistenteAquiryContextValue {
  const ctx = useContext(AssistenteAquiryContext);
  if (!ctx) {
    throw new Error("useAssistenteAquiryContext deve ser usado dentro de AssistenteAquiryProvider");
  }
  return ctx;
}

export function AssistenteAquiryProvider({ children }: { children: React.ReactNode }) {
  const [contextoTela, setContextoTela] = useState<ContextoTelaAquiry | null>(null);

  const registrarContexto = useCallback((ctx: ContextoTelaAquiry) => {
    setContextoTela(ctx);
  }, []);

  const limparContexto = useCallback(() => {
    setContextoTela(null);
  }, []);

  return (
    <AssistenteAquiryContext.Provider value={{ contextoTela, registrarContexto, limparContexto }}>
      {children}
    </AssistenteAquiryContext.Provider>
  );
}
