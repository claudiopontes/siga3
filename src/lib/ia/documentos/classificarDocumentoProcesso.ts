import type { TipoDocumentoProcesso } from "../tipos";

// Mapeamento direto de tags explícitas do banco (nm_tipo_docm como categoria).
// Prioridade sobre classificação por palavras-chave.
const TAGS_BANCO: Record<string, TipoDocumentoProcesso> = {
  "RELATORIO":  "relatorio_tecnico",
  "PARECER MP": "parecer_mpc",
  "VOTO":       "voto_relator",
};

// Regras de palavras-chave — usadas quando não há tag explícita do banco.
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
  // Prioridade 1: tag explícita do banco (categoria estruturada)
  if (nmTipoDocm) {
    const tag = nmTipoDocm.trim().toUpperCase();
    if (tag in TAGS_BANCO) return TAGS_BANCO[tag];
  }

  // Prioridade 2: palavras-chave no nm_tipo_docm + nm_proc_arqv
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
