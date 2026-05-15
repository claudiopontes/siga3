import type { TipoDocumentoProcesso } from "../tipos";

// Padrões que marcam o início da seção conclusiva em cada tipo de documento.
// Para parecer_mpc, a decisão do procurador normalmente começa com uma dessas
// expressões e está ao final do documento.
// Para relatorio_tecnico, a recomendação formal fica em "PROPOSTA DE ENCAMINHAMENTO"
// (que vem após "CONCLUSÃO"), também perto do final.
const PADROES_CONCLUSAO: Partial<Record<TipoDocumentoProcesso, RegExp[]>> = {
  parecer_mpc: [
    /ANTE\s+AO\s+EXPOSTO/i,
    /ANTE\s+O\s+EXPOSTO/i,
    /DIANTE\s+DO\s+EXPOSTO/i,
    /DIANTE\s+DE\s+TODO\s+O\s+EXPOSTO/i,
    /ISTO\s+POSTO/i,
    /ANTE\s+AO\s+POSTO/i,
    /ANTE\s+O\s+POSTO/i,
  ],
  relatorio_tecnico: [
    /PROPOSTA\s+DE\s+ENCAMINHAMENTO/i,
    /CONCLUS[ÃA]O/i,
  ],
};

// Chars mantidos do início do documento (contexto/objeto/partes).
const RESERVA_INICIO: Partial<Record<TipoDocumentoProcesso, number>> = {
  parecer_mpc:      1200,
  relatorio_tecnico: 1800,
};

// Chars de margem antes da âncora para não cortar no meio de uma frase anterior.
const MARGEM_ANTES_ANCORA = 400;

const SEPARADOR = "\n\n[...trecho omitido...]\n\n";

/**
 * Seleciona os trechos mais relevantes de um documento para envio à IA.
 *
 * Estratégia:
 * 1. Se o texto cabe inteiro dentro do limite, retorna sem alterar.
 * 2. Procura a âncora de conclusão (ex.: "ANTE AO EXPOSTO", "PROPOSTA DE ENCAMINHAMENTO").
 *    Se encontrada, retorna: início do documento + trecho da âncora ao fim (ou até o limite).
 * 3. Fallback: início do documento + final do documento.
 *
 * O separador "[...trecho omitido...]" sinaliza à IA que há conteúdo intermediário não enviado.
 */
export function extrairTrechoRelevante(
  textoCompleto: string,
  tipo: TipoDocumentoProcesso,
  limiteChars: number,
): string {
  if (textoCompleto.length <= limiteChars) {
    return textoCompleto;
  }

  const reservaInicio = RESERVA_INICIO[tipo] ?? Math.floor(limiteChars * 0.30);
  const reservaFim    = limiteChars - reservaInicio - SEPARADOR.length;

  const padroes = PADROES_CONCLUSAO[tipo] ?? [];

  // Busca a última ocorrência de cada padrão — preferimos a ocorrência mais próxima do fim,
  // que tende a ser a seção conclusiva real e não uma menção anterior ao mesmo termo.
  let posAncora = -1;
  for (const padrao of padroes) {
    const padraoBuscaGlobal = new RegExp(padrao.source, padrao.flags.includes("g") ? padrao.flags : padrao.flags + "g");
    const ocorrencias = [...textoCompleto.matchAll(padraoBuscaGlobal)];
    if (ocorrencias.length > 0) {
      const ultima = ocorrencias[ocorrencias.length - 1];
      if (ultima.index !== undefined && ultima.index > posAncora) {
        posAncora = ultima.index;
      }
      break; // Usa o primeiro padrão que encontrou ocorrência (ordem de prioridade)
    }
  }

  const inicio = textoCompleto.slice(0, reservaInicio);

  if (posAncora !== -1) {
    const posComMargem = Math.max(reservaInicio + 1, posAncora - MARGEM_ANTES_ANCORA);
    const trecho = textoCompleto.slice(posComMargem);

    if (posComMargem <= reservaInicio) {
      // Âncora está perto do início; retorna simplesmente o início + fim normal
    } else if (trecho.length <= reservaFim) {
      return inicio + SEPARADOR + trecho;
    } else {
      // Seção conclusiva é longa; pega início da âncora + final da âncora
      const metadeFim = Math.floor(reservaFim * 0.5);
      return inicio + SEPARADOR + trecho.slice(0, metadeFim) + SEPARADOR + trecho.slice(-metadeFim);
    }
  }

  // Fallback: início + final do documento
  return inicio + SEPARADOR + textoCompleto.slice(-reservaFim);
}
