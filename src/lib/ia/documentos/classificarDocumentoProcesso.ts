import type { TipoDocumentoProcesso } from "../tipos";

// Mapas de palavras-chave por tipo de documento — classificação local sem IA.
const REGRAS: Array<{ tipo: TipoDocumentoProcesso; termos: string[] }> = [
  {
    tipo: "voto_relator",
    termos: ["voto", "voto do relator", "minuta de voto", "voto relator"],
  },
  {
    tipo: "relatorio_tecnico",
    termos: [
      "relatorio", "relatório", "instrução", "instrucao",
      "nota técnica", "nota tecnica", "parecer técnico", "parecer tecnico",
      "análise técnica", "analise tecnica",
    ],
  },
  {
    tipo: "parecer_mpc",
    termos: [
      "parecer", "mpc", "ministério público", "ministerio publico",
      "procurador", "parecer do ministério",
    ],
  },
  {
    tipo: "defesa_manifestacao",
    termos: [
      "defesa", "manifestação", "manifestacao", "contrarrazões",
      "contrarrazoes", "alegação", "alegacao", "recurso", "impugnação",
      "impugnacao", "requerimento",
    ],
  },
  {
    tipo: "decisao_acordao",
    termos: [
      "acórdão", "acordao", "decisão", "decisao", "resolução",
      "resolucao", "despacho", "extrato",
    ],
  },
];

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

export function classificarDocumentoProcesso(
  nmTipoDocm: string | null,
  nmProcArqv: string | null,
): TipoDocumentoProcesso {
  const fonte = normalizar([nmTipoDocm, nmProcArqv].filter(Boolean).join(" "));

  for (const regra of REGRAS) {
    for (const termo of regra.termos) {
      if (fonte.includes(normalizar(termo))) {
        return regra.tipo;
      }
    }
  }

  return "outro";
}
