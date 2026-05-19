"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import AssistenteAquiryButton from "./AssistenteAquiryButton";
import AssistenteAquiryPanel, { type MensagemChat } from "./AssistenteAquiryPanel";
import { useAssistenteAquiryContext } from "./AssistenteAquiryProvider";
import {
  identificarContextoPaginaAquiry,
  montarMensagemBoasVindas,
  type ContextoPaginaPayload,
} from "@/lib/aquiry/identificarContextoPaginaAquiry";
import type { ContextoTelaAquiry, OrigemRespostaAquiry } from "@/lib/aquiry/tiposContextoAquiry";

// Janela de histórico enviada à API (exclui a mensagem de boas-vindas)
const HISTORICO_MAX_LOCAL = 10;

export default function AssistenteAquiry() {
  const pathname = usePathname();
  const { contextoTela } = useAssistenteAquiryContext();

  const contexto = useMemo(
    () => identificarContextoPaginaAquiry(pathname ?? "/"),
    [pathname]
  );

  const [aberto, setAberto] = useState(false);
  const [mensagens, setMensagens] = useState<MensagemChat[]>(() => [
    { role: "assistant", content: montarMensagemBoasVindas(contexto) },
  ]);
  const [carregando, setCarregando] = useState(false);
  const [valorInput, setValorInput] = useState("");

  // Atualiza a mensagem de boas-vindas ao navegar, mas não interrompe conversa em andamento
  useEffect(() => {
    setMensagens((prev) => {
      if (prev.length === 1 && prev[0].role === "assistant") {
        return [{ role: "assistant", content: montarMensagemBoasVindas(contexto) }];
      }
      return prev;
    });
  }, [contexto]);

  const enviar = useCallback(
    async (perguntaOverride?: string) => {
      const texto = (perguntaOverride ?? valorInput).trim();
      if (!texto || carregando) return;

      const novaMensagemUsuario: MensagemChat = { role: "user", content: texto };
      const historicoAtualizado = [...mensagens, novaMensagemUsuario];

      setMensagens(historicoAtualizado);
      setValorInput("");
      setCarregando(true);

      const historico = mensagens
        .slice(1)
        .slice(-HISTORICO_MAX_LOCAL)
        .map((m) => ({ role: m.role, content: m.content }));

      const contextoPaginaPayload: ContextoPaginaPayload = {
        rota: contexto.rota,
        tipoPagina: contexto.tipoPagina,
        titulo: contexto.titulo,
        descricao: contexto.descricao,
      };

      const body: {
        pergunta: string;
        historico: typeof historico;
        paginaAtual: string | undefined;
        contextoPagina: ContextoPaginaPayload;
        contextoTela?: ContextoTelaAquiry;
      } = {
        pergunta: texto,
        historico,
        paginaAtual: pathname ?? undefined,
        contextoPagina: contextoPaginaPayload,
      };

      if (contextoTela) {
        body.contextoTela = contextoTela;
      }

      try {
        const res = await fetch("/api/assistente-aquiry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const dados = await res.json();

        const conteudoResposta: string = res.ok
          ? (dados.resposta ?? "Não foi possível obter uma resposta.")
          : "O assistente não está disponível no momento. Tente novamente em instantes.";

        const origem: OrigemRespostaAquiry | undefined =
          res.ok && dados.origem ? (dados.origem as OrigemRespostaAquiry) : undefined;

        setMensagens([...historicoAtualizado, { role: "assistant", content: conteudoResposta, origem }]);
      } catch {
        setMensagens([
          ...historicoAtualizado,
          {
            role: "assistant",
            content:
              "Não foi possível conectar ao assistente. Verifique sua conexão e tente novamente.",
          },
        ]);
      } finally {
        setCarregando(false);
      }
    },
    [valorInput, carregando, mensagens, pathname, contexto, contextoTela]
  );

  // Reinicia a conversa restaurando a mensagem inicial contextual da tela atual.
  // Não recarrega a página nem altera o contexto.
  const novaConversa = useCallback(() => {
    setMensagens([
      { role: "assistant", content: montarMensagemBoasVindas(contexto) },
    ]);
    setValorInput("");
  }, [contexto]);

  return (
    <>
      <AssistenteAquiryPanel
        aberto={aberto}
        onFechar={() => setAberto(false)}
        mensagens={mensagens}
        carregando={carregando}
        valorInput={valorInput}
        onChangeInput={setValorInput}
        onEnviar={enviar}
        onNovaConversa={novaConversa}
        sugestoes={contexto.sugestoes}
      />
      <AssistenteAquiryButton aberto={aberto} onClick={() => setAberto((v) => !v)} />
    </>
  );
}
