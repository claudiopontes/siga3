// Fontes compactas evitam enviar leis/documentos inteiros para a IA.
// Cada fonte contém apenas resumo e temas para seleção contextual econômica.
// Jurisprudência e documentos processuais serão integrados em etapas futuras
// por seleção de trechos relevantes, não por envio integral.
import type { FonteInstitucional } from "../tipos";

export const fontesInstitucionais: FonteInstitucional[] = [
  {
    id: "cf88-art37",
    titulo: "Constituição Federal de 1988 — art. 37",
    tipo: "constitucional",
    temas: [
      "administração pública",
      "legalidade",
      "impessoalidade",
      "moralidade",
      "publicidade",
      "eficiência",
      "controle externo",
    ],
    resumo: "Princípios básicos da administração pública.",
  },
  {
    id: "lrf-lc101",
    titulo: "Lei de Responsabilidade Fiscal (LC nº 101/2000)",
    tipo: "legal",
    temas: [
      "responsabilidade fiscal",
      "planejamento",
      "transparência",
      "equilíbrio fiscal",
      "limites",
      "despesa pública",
    ],
    resumo:
      "Gestão fiscal responsável pressupõe ação planejada, transparente, prevenção de riscos e correção de desvios.",
  },
  {
    id: "lei14133",
    titulo: "Lei nº 14.133/2021 — Nova Lei de Licitações",
    tipo: "legal",
    temas: [
      "licitação",
      "contrato",
      "contratação pública",
      "planejamento",
      "governança",
      "competitividade",
    ],
    resumo:
      "Contratações públicas devem observar planejamento, transparência, competitividade, governança e seleção adequada da proposta.",
  },
  {
    id: "lei8666",
    titulo: "Lei nº 8.666/1993 — Licitações e Contratos",
    tipo: "legal",
    temas: [
      "licitação",
      "contrato",
      "execução contratual",
      "habilitação",
      "julgamento",
      "fiscalização contratual",
    ],
    resumo:
      "Regime anterior de licitações e contratos, ainda relevante para processos antigos e contratos regidos por essa norma.",
  },
  {
    id: "lce38-tceac",
    titulo: "Lei Complementar Estadual nº 38/1993 — Lei Orgânica do TCE/AC",
    tipo: "institucional",
    temas: [
      "TCE Acre",
      "controle externo",
      "competência",
      "julgamento de contas",
      "fiscalização",
    ],
    resumo:
      "Norma orgânica do Tribunal de Contas do Estado do Acre, relevante para competências e atuação do controle externo.",
  },
  {
    id: "ritceac",
    titulo: "Regimento Interno do TCE/AC",
    tipo: "regimental",
    temas: [
      "rito processual",
      "sessão",
      "votação",
      "relatoria",
      "julgamento",
      "pauta",
      "tramitação",
    ],
    resumo:
      "Disciplina aspectos regimentais da tramitação, deliberação e julgamento no âmbito do TCE/AC.",
  },
  {
    id: "jurisprudencia-tceac",
    titulo: "Jurisprudência do TCE/AC",
    tipo: "jurisprudencial",
    temas: [
      "jurisprudência",
      "precedente",
      "entendimento",
      "decisão",
      "acórdão",
      "deliberação",
    ],
    resumo:
      "Base de decisões e entendimentos do Tribunal que deverá ser consultada em etapa futura por banco de dados próprio.",
  },
  {
    id: "docs-processuais",
    titulo: "Documentos do processo eletrônico",
    tipo: "processual",
    temas: [
      "voto do relator",
      "relatório técnico",
      "parecer MPC",
      "defesa",
      "acórdão",
      "instrução",
      "manifestação",
    ],
    resumo:
      "Documentos processuais oficiais que poderão ser lidos em etapa futura a partir do repositório de PDFs.",
  },
];
