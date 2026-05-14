// Modelo específico para resumo de pauta.
// O resumo de pauta usa dados estruturados primeiro para reduzir custo com tokens.
export const modeloResumoPauta = {
  nome: "resumo_pauta",
  versao: "1.0.0",
  objetivo:
    "Permitir que o conselheiro conheça rapidamente os processos submetidos à votação, com base apenas nos dados básicos disponíveis na pauta e nos alertas do Varadouro.",

  instrucaoEspecifica: `Para cada processo da pauta, gere um resumo prático e condensado indicando:
- Do que trata o processo.
- Qual é o ponto central para deliberação.
- Qual o risco percebido (baixo, medio, alto, critico).
- Quais pontos merecem atenção na sessão.
- Quais perguntas o gabinete pode querer fazer antes da votação.
- Quais informações estão ausentes nos dados enviados.

Seja cauteloso:
- Se não houver voto do relator, parecer do MPC ou relatório técnico nos dados enviados, não presuma seu conteúdo.
- Não afirme irregularidade se os dados não permitirem.
- Não invente jurisprudência nem fundamento jurídico específico sem fonte enviada.
- Use linguagem como "possível", "aparente", "merece verificação" quando adequado.

Gere também um resumo geral da pauta e observações gerais aplicáveis a mais de um processo.`,

  schemaObrigatorio: `{
  "resumo_geral_da_pauta": "string",
  "processos": [
    {
      "numero": "string",
      "resumo_para_conselheiro": "string",
      "ponto_central": "string",
      "risco_percebido": "baixo | medio | alto | critico",
      "motivo_do_risco": "string",
      "pontos_para_atencao_na_sessao": ["string"],
      "perguntas_sugeridas": ["string"],
      "informacoes_ausentes": ["string"]
    }
  ],
  "observacoes_gerais": ["string"],
  "aviso_revisao": "string"
}`,

  avisoRevisao:
    "Análise gerada por IA para apoio preliminar do gabinete. Revise antes de utilizar em manifestação, voto ou decisão oficial.",
};
