"use client";

import { useEffect, useRef } from "react";
import { useAssistenteAquiryContext } from "./AssistenteAquiryProvider";
import type { ContextoTelaAquiry } from "@/lib/aquiry/tiposContextoAquiry";

/**
 * Registra o contexto real da tela atual para o Assistente Aquiry.
 *
 * - Atualiza automaticamente quando os dados mudam (comparação por valor JSON).
 * - Limpa o contexto quando o componente desmonta (navegação para outra página).
 * - Não faz nenhuma chamada à API — usa apenas dados já disponíveis no estado da tela.
 *
 * @example
 * useContextoAquiry({
 *   titulo: "Painel de Mortalidade Infantil",
 *   dados: { anoSelecionado: 2025, totalObitosInfantis: 42 },
 *   observacoes: ["Dados exibidos na tela para o ano selecionado."]
 * });
 */
export function useContextoAquiry(contexto: ContextoTelaAquiry): void {
  const { registrarContexto, limparContexto } = useAssistenteAquiryContext();

  // Armazena o JSON serializado da última versão registrada
  const jsonAnteriorRef = useRef<string | null>(null);

  // Atualiza o contexto no provider sempre que o valor mudar
  useEffect(() => {
    let json: string;
    try {
      json = JSON.stringify(contexto);
    } catch {
      return;
    }

    if (json !== jsonAnteriorRef.current) {
      jsonAnteriorRef.current = json;
      try {
        registrarContexto(JSON.parse(json) as ContextoTelaAquiry);
      } catch {
        registrarContexto(contexto);
      }
    }
  });

  // Limpa o contexto ao desmontar (usuário navegou para outra página)
  useEffect(() => {
    return () => {
      jsonAnteriorRef.current = null;
      limparContexto();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
