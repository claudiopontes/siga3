import { instrucaoBaseGabinete } from "./baseGabinete";

export const AVISO_REVISAO_PROCESSO =
  "Análise gerada por IA para apoio preliminar do gabinete. Revise antes de utilizar em manifestação, voto ou decisão oficial.";

export const modeloAnaliseProcessoPauta = {
  nome: "analise_processo_pauta",
  versao: "1.1.0",
};

const instrucaoEspecifica = `Para o processo enviado, gere uma análise preliminar para apoio do conselheiro, contendo:
- resumo_executivo: síntese do que é o processo, o que está em julgamento e qual o contexto atual (3-5 frases).
- ponto_central: qual a questão jurídica ou fática principal a decidir (1-2 frases).
- risco_percebido: nível de risco (baixo, medio, alto, critico) com base nos documentos analisados.
- motivo_do_risco: justificativa objetiva para o nível de risco.
- pontos_para_atencao: lista de pontos que merecem atenção do conselheiro na sessão.
- perguntas_sugeridas: perguntas que o gabinete pode querer fazer antes da votação.
- informacoes_ausentes: informações relevantes que não estavam disponíveis nos documentos enviados.

Seja cauteloso:
- Não afirme irregularidade se os dados não permitirem.
- Use linguagem como "possível", "aparente", "merece verificação" quando adequado.
- Não invente jurisprudência nem fundamento jurídico específico sem fonte enviada.`;

const schemaObrigatorio = `{
  "resumo_executivo": "string",
  "ponto_central": "string",
  "risco_percebido": "baixo | medio | alto | critico",
  "motivo_do_risco": "string",
  "pontos_para_atencao": ["string"],
  "perguntas_sugeridas": ["string"],
  "informacoes_ausentes": ["string"],
  "aviso_revisao": "string"
}`;

export function montarSystemPromptAnalise(): string {
  return [
    instrucaoBaseGabinete,
    "",
    "=== ROTINA: ANÁLISE INDIVIDUAL DE PROCESSO EM PAUTA ===",
    instrucaoEspecifica,
    "",
    "=== SCHEMA OBRIGATÓRIO DE SAÍDA (JSON) ===",
    schemaObrigatorio,
  ].join("\n");
}

export type ResumosPorTipo = {
  voto_relator?: string;
  relatorio_tecnico?: string;
  parecer_mpc?: string;
  defesa_manifestacao?: string;
  decisao_acordao?: string;
  outro?: string;
};

export function montarUserPromptAnalise(dados: {
  numero_fmt: string | null;
  nome_classe: string | null;
  assunto: string | null;
  objeto: string | null;
  nome_relator: string | null;
  nome_orgao: string | null;
  nome_1_parte: string | null;
  situacao: string | null;
  setor_atual: string | null;
  resumos: { tipo: string; nome: string; resumo: string }[];
}): string {
  const cabecalho = [
    `Número: ${dados.numero_fmt ?? "não informado"}`,
    `Classe: ${dados.nome_classe ?? "não informada"}`,
    `Assunto: ${dados.assunto ?? "não informado"}`,
    `Objeto: ${dados.objeto ?? "não informado"}`,
    `Relator: ${dados.nome_relator ?? "não informado"}`,
    `Jurisdicionado/Órgão: ${dados.nome_orgao ?? "não informado"}`,
    `Parte Principal: ${dados.nome_1_parte ?? "não informada"}`,
    `Situação: ${dados.situacao ?? "não informada"}`,
    `Setor Atual: ${dados.setor_atual ?? "não informado"}`,
  ].join("\n");

  // Agrupa os resumos por tipo para facilitar a leitura pela IA
  const ordemExibicao: { tipo: string; rotulo: string }[] = [
    { tipo: "voto_relator",        rotulo: "VOTO DO RELATOR" },
    { tipo: "relatorio_tecnico",   rotulo: "RELATÓRIO TÉCNICO (INSTRUÇÃO)" },
    { tipo: "parecer_mpc",         rotulo: "PARECER DO MPC" },
    { tipo: "defesa_manifestacao", rotulo: "DEFESA / MANIFESTAÇÃO" },
    { tipo: "decisao_acordao",     rotulo: "DECISÃO / ACÓRDÃO" },
    { tipo: "outro",               rotulo: "OUTROS" },
  ];

  const resumosPorTipo = ordemExibicao
    .map(({ tipo, rotulo }) => {
      const docs = dados.resumos.filter((r) => r.tipo === tipo);
      if (!docs.length) return null;
      return docs
        .map((r) => `=== ${rotulo} | ${r.nome} ===\n${r.resumo}`)
        .join("\n\n");
    })
    .filter(Boolean)
    .join("\n\n");

  // Documentos com falha de extração (tipo contém "[FALHA")
  const comFalha = dados.resumos.filter((r) => r.resumo.startsWith("[FALHA NA EXTRAÇÃO"));
  const avisoFalhas = comFalha.length
    ? `\nATENÇÃO: Os seguintes documentos tiveram falha na leitura e não puderam ser analisados:\n` +
      comFalha.map((r) => `- ${r.tipo.toUpperCase()}: ${r.nome}`).join("\n")
    : "";

  return [
    "=== DADOS DO PROCESSO ===",
    cabecalho,
    "",
    "=== RESUMOS DOS DOCUMENTOS (agrupados por tipo) ===",
    resumosPorTipo || "Nenhum documento analisado.",
    avisoFalhas,
    "",
    "=== INSTRUÇÕES PARA PREENCHIMENTO DOS CAMPOS ===",
    "Use os resumos acima para preencher os campos do JSON de saída.",
    "Os resumos já foram extraídos dos documentos reais do processo.",
    "Não escreva 'Não disponível' se houver conteúdo nos resumos acima.",
    "",
    `O campo "aviso_revisao" deve ser exatamente: "${AVISO_REVISAO_PROCESSO}"`,
  ].join("\n");
}
