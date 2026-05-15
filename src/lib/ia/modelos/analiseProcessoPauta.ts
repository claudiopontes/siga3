import { instrucaoBaseGabinete } from "./baseGabinete";

export const AVISO_REVISAO_PROCESSO =
  "Análise gerada por IA para apoio preliminar do gabinete. Revise antes de utilizar em manifestação, voto ou decisão oficial.";

export const modeloAnaliseProcessoPauta = {
  nome: "analise_processo_pauta",
  versao: "1.5.0",
};

const instrucaoEspecifica = `Para o processo enviado, gere uma análise preliminar para apoio do conselheiro na fase de PAUTA DE JULGAMENTO, contendo:

- resumo_executivo: síntese do objeto do processo, do que está sendo apreciado e do contexto atual (3-5 frases).
- ponto_central: qual a questão jurídica ou fática principal a decidir (1-2 frases).
- risco_percebido: nível de risco (baixo, medio, alto, critico) com base nos documentos analisados.
- motivo_do_risco: justificativa objetiva para o nível de risco, considerando a conclusão da instrução técnica e do MPC.
- ha_divergencia: true se houver divergência relevante entre a conclusão da unidade técnica (instrução/relatório) e a conclusão do MPC (parecer/pronunciamento); false caso contrário.
- tipo_divergencia: quando ha_divergencia for true, classificar como "juridica", "valorativa", "tecnica" ou "procedimental" (null quando false).
- pontos_para_atencao: lista de pontos que merecem atenção do conselheiro na sessão.
- perguntas_sugeridas: perguntas que o gabinete pode querer fazer antes da votação.
- informacoes_ausentes: informações relevantes que não estavam disponíveis. Não incluir ausência de voto/relatório do relator — esse documento normalmente não está disponível na fase de pauta.

CONTEXTO INSTITUCIONAL IMPORTANTE:
- Na fase de pauta de julgamento, o voto/relatório do conselheiro relator normalmente NÃO está disponível no processo — ele só é disponibilizado após o julgamento. Portanto:
  - NÃO liste a ausência de voto do relator como informação ausente.
  - NÃO aumente o risco por ausência de voto.
  - NÃO mencione "resumo do voto do relator" nem o considere faltante.
- O foco desta análise preliminar deve ser:
  - Objeto do processo e o que está sendo apreciado.
  - Conclusão da unidade técnica (instrução/relatório técnico).
  - Conclusão do Ministério Público de Contas (parecer/pronunciamento).
  - Convergência ou divergência entre a unidade técnica e o MPC.
  - Pontos para atenção do gabinete na sessão.
  - Perguntas úteis antes da votação.

Seja cauteloso:
- Não afirme irregularidade se os dados não permitirem.
- Use linguagem como "possível", "aparente", "merece verificação" quando adequado.
- Não invente jurisprudência nem fundamento jurídico específico sem fonte enviada.`;

const schemaObrigatorio = `{
  "resumo_executivo": "string",
  "ponto_central": "string",
  "risco_percebido": "baixo | medio | alto | critico",
  "motivo_do_risco": "string",
  "ha_divergencia": "boolean",
  "tipo_divergencia": "juridica | valorativa | tecnica | procedimental | null",
  "pontos_para_atencao": ["string"],
  "perguntas_sugeridas": ["string"],
  "informacoes_ausentes": ["string"],
  "objeto": "string (≤ 180 caracteres) — usado apenas como fallback se o processo não tiver objeto cadastrado",
  "resumo_tecnico": "string (≤ 220 caracteres)",
  "resumo_mpc": "string (≤ 220 caracteres)",
  "aviso_revisao": "string"
}`;

export function montarSystemPromptAnalise(): string {
  return [
    instrucaoBaseGabinete,
    "",
    "=== ROTINA: ANÁLISE PRELIMINAR DE PROCESSO EM PAUTA ===",
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
  eh_recurso?: boolean;
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

  // Relatório técnico e parecer MPC são os documentos-alvo desta fase.
  // Voto do relator aparece por último e apenas se estiver disponível.
  const ordemExibicao: { tipo: string; rotulo: string }[] = [
    { tipo: "relatorio_tecnico",   rotulo: "RELATÓRIO TÉCNICO (INSTRUÇÃO)" },
    { tipo: "parecer_mpc",         rotulo: "PARECER DO MPC" },
    { tipo: "defesa_manifestacao", rotulo: "DEFESA / MANIFESTAÇÃO" },
    { tipo: "decisao_acordao",     rotulo: "DECISÃO / ACÓRDÃO" },
    { tipo: "voto_relator",        rotulo: "VOTO DO RELATOR (se disponível)" },
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

  const comFalha = dados.resumos.filter((r) => r.resumo.startsWith("[FALHA NA EXTRAÇÃO"));
  const avisoFalhas = comFalha.length
    ? `\nATENÇÃO: Os seguintes documentos tiveram falha na leitura e não puderam ser analisados:\n` +
      comFalha.map((r) => `- ${r.tipo.toUpperCase()}: ${r.nome}`).join("\n")
    : "";

  const avisoRecurso = dados.eh_recurso
    ? `\nATENÇÃO: Este processo parece ser um recurso/embargos/reconsideração. Os dados do processo originário/recorrido não foram localizados nos dados estruturados disponíveis.`
    : "";

  return [
    "=== DADOS DO PROCESSO ===",
    cabecalho,
    "",
    "=== RESUMOS DOS DOCUMENTOS (relatório técnico e parecer MPC são os documentos-alvo desta fase) ===",
    resumosPorTipo || "Nenhum documento analisado.",
    avisoFalhas,
    avisoRecurso,
    "",
    "=== INSTRUÇÕES GERAIS ===",
    "Use os resumos acima para preencher os campos do JSON de saída.",
    "Os resumos já foram extraídos dos documentos reais do processo.",
    "Não escreva 'Não disponível' se houver conteúdo nos resumos acima.",
    "O campo ha_divergencia deve comparar SOMENTE a conclusão da instrução técnica com a conclusão do MPC.",
    "Não liste ausência de voto do relator em informacoes_ausentes — não é esperado nesta fase.",
    "",
    "=== CAMPOS PARA A LINHA DA TABELA DE PAUTA: objeto / resumo_tecnico / resumo_mpc ===",
    "A tabela já exibe em colunas separadas: Nº, Proc., Entidade, Objeto, Respons., Advog.(s), Relator.",
    "Esses três campos NÃO devem repetir NENHUMA dessas informações.",
    "",
    "objeto (máx. 180 caracteres):",
    "- Usado apenas como fallback: se o processo já tiver objeto nos dados estruturados, este campo pode ser ignorado.",
    "- Se precisar preencher: o que o processo trata, em uma frase direta.",
    "- NÃO incluir número do processo, entidade, responsável nem relator.",
    "- Evitar 'Trata-se de...', 'O processo nº...', 'A entidade...'.",
    "",
    "resumo_tecnico (máx. 220 caracteres):",
    "- Trazer APENAS: conclusão da instrução técnica; débito, multa ou sanção se houver; ponto sensível para julgamento; informação crítica ausente se necessário.",
    "- NÃO repetir número do processo, entidade, responsável, relator.",
    "- NÃO recontar o objeto (ele já aparece na coluna Objeto).",
    "- NÃO escrever histórico processual.",
    "- Linguagem direta. Frases curtas.",
    "- Evitar 'Trata-se de...', 'O processo nº...', 'A entidade...', 'Sob responsabilidade de...'.",
    "",
    "resumo_mpc (máx. 220 caracteres):",
    "- Trazer APENAS: conclusão do MPC/parecer; débito, multa ou sanção se houver; divergência com a instrução técnica.",
    "- Se a conclusão não for localizável, escrever: 'Conclusão do MPC não localizada no trecho analisado.'",
    "- NÃO recontar o objeto.",
    "- Mesmas restrições de repetição do resumo_tecnico.",
    "",
    "Exemplos bons:",
    "objeto: 'Prestação de contas de convênio — aquisição de medicamentos.'",
    "resumo_tecnico: 'Técnica aponta ausência de registros no LICON/SIPAC e falta de defesa; risco de irregularidade.'",
    "resumo_mpc: 'MPC opina pela irregularidade, débito de R$ 178,7 mil e multas.'",
    "",
    "Exemplos ruins:",
    "resumo_tecnico: 'Trata-se do processo nº 141.831/2022 referente ao Fundo Municipal de Saúde de Bujari...'",
    "resumo_mpc: 'Sob responsabilidade de Denise dos Santos, o MPC se manifesta no sentido de...'",
    "resumo_tecnico: 'Prestação de contas de convênio para aquisição de medicamentos. Técnica aponta...'  ← repete o objeto",
    "",
    `O campo "aviso_revisao" deve ser exatamente: "${AVISO_REVISAO_PROCESSO}"`,
  ].join("\n");
}
