import type { TipoDocumentoProcesso } from "../tipos";

const ROTULOS: Record<TipoDocumentoProcesso, string> = {
  voto_relator:         "Voto do Relator",
  relatorio_tecnico:    "Relatório Técnico / Instrução",
  parecer_mpc:          "Parecer do Ministério Público de Contas",
  defesa_manifestacao:  "Defesa / Manifestação da Parte",
  decisao_acordao:      "Decisão / Acórdão",
  outro:                "Documento",
};

export function instrucaoResumoDocumento(tipo: TipoDocumentoProcesso): string {
  const rotulo = ROTULOS[tipo];
  return `Você é um assistente jurídico do gabinete do conselheiro do TCE/AC.
Analise o trecho do documento "${rotulo}" enviado e produza um resumo institucional objetivo.

Instruções:
- Identifique os pontos principais: objeto, fundamentação, conclusão ou recomendação.
- Use linguagem institucional, cautelosa e condensada.
- Se o trecho for insuficiente para conclusão, declare isso claramente.
- Não invente fatos, valores ou decisões que não constam no texto.
- Tamanho do resumo: 3 a 6 parágrafos curtos.
- Responda apenas em português do Brasil.`;
}

export const modeloResumoDocumento = {
  nome: "resumo_documento_processo",
  versao: "1.0.0",
};
