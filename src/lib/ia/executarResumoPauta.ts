import { chamarAzureOpenAI } from "./azureOpenAI";
import { instrucaoBaseGabinete } from "./modelos/baseGabinete";
import { modeloResumoPauta } from "./modelos/resumoPauta";
import { buscarFontesRelevantes } from "./fontes/buscarFontesRelevantes";
import { compactarProcessoParaIA } from "./tokenBudget";
import type { ResumoPautaInput, ResumoPautaOutput } from "./tipos";

const AVISO_REVISAO =
  "Análise gerada por IA para apoio preliminar do gabinete. Revise antes de utilizar em manifestação, voto ou decisão oficial.";

export async function executarResumoPauta(input: ResumoPautaInput): Promise<ResumoPautaOutput> {
  const processosCompactos = input.processos.map(compactarProcessoParaIA);

  const textoParaBusca = processosCompactos
    .map((p) =>
      [p.classe, p.assunto, p.objeto, p.situacao, p.indicacao_voto, ...(p.alertas_varadouro ?? [])].join(" "),
    )
    .join(" ");

  const fontesRelevantes = buscarFontesRelevantes(textoParaBusca, 5);
  const fontesTrecho = fontesRelevantes.map((f) => `[${f.titulo}] ${f.resumo}`).join("\n");

  const dadosPauta = JSON.stringify(
    { processos: processosCompactos, contexto_adicional: input.contexto_adicional },
    null,
    2,
  );

  const systemPrompt = [
    instrucaoBaseGabinete,
    "",
    "=== ROTINA: RESUMO DE PAUTA ===",
    modeloResumoPauta.instrucaoEspecifica,
    "",
    "=== FONTES INSTITUCIONAIS RELEVANTES ===",
    fontesTrecho,
    "",
    "=== SCHEMA OBRIGATÓRIO DE SAÍDA (JSON) ===",
    modeloResumoPauta.schemaObrigatorio,
  ].join("\n");

  const userPrompt = [
    "Gere o resumo de pauta para os seguintes processos:",
    "",
    dadosPauta,
    "",
    `O campo "aviso_revisao" deve ser exatamente: "${AVISO_REVISAO}"`,
  ].join("\n");

  const conteudoBruto = await chamarAzureOpenAI({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
    maxCompletionTokens: 12000,
    jsonMode: true,
  });

  if (!conteudoBruto) {
    throw new Error("Resposta vazia do serviço de IA.");
  }

  let resultado: ResumoPautaOutput;
  try {
    resultado = JSON.parse(conteudoBruto);
  } catch {
    const raw = conteudoBruto.slice(0, 2000);
    throw new Error(`Resposta da IA não é JSON válido. Raw: ${raw}`);
  }

  // Garante o aviso padronizado independentemente do que a IA retornar.
  resultado.aviso_revisao = AVISO_REVISAO;

  return resultado;
}
