"use client";

import { useState, useCallback, useMemo } from "react";
import { usePathname } from "next/navigation";
import AssistenteAquiryButton from "./AssistenteAquiryButton";
import AssistenteAquiryPanel, { type MensagemChat } from "./AssistenteAquiryPanel";
import AssistenteAquiryDialogoInicial from "./AssistenteAquiryDialogoInicial";
import { useAssistenteAquiryContext } from "./AssistenteAquiryProvider";
import { usePosicaoBotaoAquiry } from "./usePosicaoBotaoAquiry";
import {
  identificarContextoPaginaAquiry,
  type ContextoPaginaPayload,
  type TipoPaginaAquiry,
} from "@/lib/aquiry/identificarContextoPaginaAquiry";
import type { ContextoTelaAquiry, OrigemRespostaAquiry } from "@/lib/aquiry/tiposContextoAquiry";

const HISTORICO_MAX_LOCAL = 10;
const CHAVE_DIALOGO_INICIAL = "aquiry:dialogo-inicial-visto";

// Mensagens do balão flutuante por tipo de tela. Caem no pool padrão do botão
// quando o tipo não está mapeado aqui.
const MENSAGENS_POR_TIPO_PAGINA: Partial<Record<TipoPaginaAquiry, string[]>> = {
  home: [
    "Quer ajuda na triagem dos alertas?",
    "Onde olhar primeiro hoje?",
    "Posso resumir os pontos críticos.",
    "Há algo urgente para o gabinete?",
  ],
  painel: [
    "Posso interpretar estes indicadores?",
    "Quer destacar os principais riscos?",
    "Quais pontos merecem atenção aqui?",
    "Resumo executivo deste painel?",
  ],
  pauta: [
    "Quer ajuda a analisar esta pauta?",
    "Posso indicar processos sensíveis.",
    "Como preparar a sessão?",
    "Roteiro de triagem da pauta?",
  ],
  processo: [
    "Pontos de atenção deste processo?",
    "Posso sintetizar o que está na tela.",
    "Há algo que impeça conclusão segura?",
    "Quer um roteiro de leitura?",
  ],
  fornecedor: [
    "Quer destacar riscos deste credor?",
    "Materialidade chama atenção aqui?",
    "Posso ajudar a comparar fornecedores.",
  ],
  mapa: [
    "Quer leitura por município?",
    "Posso indicar onde os indicadores se destacam.",
  ],
  calendario: [
    "Quer ver prazos próximos?",
    "Posso ajudar a priorizar entregas.",
  ],
  seguranca: [
    "Dúvidas sobre o ETL ou perfis?",
    "Posso explicar a tela.",
  ],
  perfil: [
    "Posso ajudar com algo do seu perfil?",
  ],
};

export default function AssistenteAquiry() {
  const pathname = usePathname();
  const { contextoTela } = useAssistenteAquiryContext();
  const posicaoBotao = usePosicaoBotaoAquiry();

  const contexto = useMemo(
    () => identificarContextoPaginaAquiry(pathname ?? "/"),
    [pathname]
  );

  const [aberto, setAberto] = useState(false);
  const [dialogoInicialAberto, setDialogoInicialAberto] = useState(false);
  const [mensagens, setMensagens] = useState<MensagemChat[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [valorInput, setValorInput] = useState("");

  const abrirPainel = useCallback(() => {
    if (aberto) {
      setAberto(false);
      return;
    }
    let dialogoPendente = false;
    if (typeof window !== "undefined") {
      try {
        dialogoPendente = sessionStorage.getItem(CHAVE_DIALOGO_INICIAL) !== "1";
      } catch {
        dialogoPendente = false;
      }
    }
    if (dialogoPendente) {
      setDialogoInicialAberto(true);
    } else {
      setAberto(true);
    }
  }, [aberto]);

  const fecharDialogoInicial = useCallback(() => {
    setDialogoInicialAberto(false);
    setAberto(true);
  }, []);

  const concluirDialogoInicial = useCallback((naoMostrarNovamente: boolean) => {
    setDialogoInicialAberto(false);
    setAberto(true);
    if (naoMostrarNovamente && typeof window !== "undefined") {
      try {
        sessionStorage.setItem(CHAVE_DIALOGO_INICIAL, "1");
      } catch {
        // ignora — preferência apenas na sessão
      }
    }
  }, []);

  const reabrirDialogoInicial = useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem(CHAVE_DIALOGO_INICIAL);
      } catch {
        // ignora
      }
    }
    setDialogoInicialAberto(true);
  }, []);

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

  // Reinicia a conversa esvaziando o histórico. Sugestões da tela atual permanecem acessíveis.
  const novaConversa = useCallback(() => {
    setMensagens([]);
    setValorInput("");
  }, []);

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
        onResetarPosicaoBotao={posicaoBotao.mobile ? undefined : posicaoBotao.resetarPosicao}
        onAbrirDialogoInicial={reabrirDialogoInicial}
      />
      <AssistenteAquiryButton
        aberto={aberto}
        onClick={abrirPainel}
        posicao={posicaoBotao}
        mensagens={MENSAGENS_POR_TIPO_PAGINA[contexto.tipoPagina]}
      />
      <AssistenteAquiryDialogoInicial
        aberto={dialogoInicialAberto}
        onFechar={fecharDialogoInicial}
        onComecar={concluirDialogoInicial}
        onSelecionarSugestao={(texto) => enviar(texto)}
      />
    </>
  );
}
