import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type DadosProcesso = {
  processo?: number | null;
  classe?: string | null;
  assunto?: string | null;
  orgao?: string | null;
  relator?: string | null;
  atividade_atual?: string | null;
  grupo_atual?: string | null;
  nivel_alerta?: string | null;
  tipo_alerta?: string | null;
  titulo_alerta?: string | null;
  duracao_setor_dias?: number | null;
  dias_em_atraso?: number | null;
  data_chegada_setor_atual?: string | null;
};

function montarPrompt(dados: DadosProcesso): string {
  const linhas: string[] = [
    `Número do processo: ${dados.processo ?? "não informado"}`,
    `Classe processual: ${dados.classe ?? "não informada"}`,
    `Assunto: ${dados.assunto ?? "não informado"}`,
    `Órgão jurisdicionado: ${dados.orgao ?? "não informado"}`,
    `Conselheiro relator: ${dados.relator ?? "não informado"}`,
    `Atividade atual: ${dados.atividade_atual ?? "não informada"}`,
    `Setor/gabinete atual: ${dados.grupo_atual ?? "não informado"}`,
    `Tipo de alerta: ${dados.tipo_alerta ?? "não informado"}`,
    `Título do alerta: ${dados.titulo_alerta ?? "não informado"}`,
    `Nível de risco identificado: ${dados.nivel_alerta ?? "não informado"}`,
    `Dias no setor atual: ${dados.duracao_setor_dias != null ? `${dados.duracao_setor_dias} dias` : "não informado"}`,
    `Dias em atraso regulamentar: ${dados.dias_em_atraso != null ? `${dados.dias_em_atraso} dias` : "sem atraso"}`,
    `Data de chegada ao setor: ${dados.data_chegada_setor_atual ?? "não informada"}`,
  ];

  return linhas.join("\n");
}

export async function POST(req: NextRequest) {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION;

  if (!endpoint || !apiKey || !deployment || !apiVersion) {
    return NextResponse.json(
      { error: "Variáveis de ambiente do Azure OpenAI não configuradas." },
      { status: 500 }
    );
  }

  let dados: DadosProcesso;
  try {
    dados = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const systemPrompt = `Você é um assistente jurídico especializado em controle externo, atuando como suporte ao gabinete de conselheiro do Tribunal de Contas do Estado do Acre (TCE/AC).

Sua função é analisar processos administrativos e judiciais sob a ótica do controle externo estadual, com foco em:
- Regularidade dos atos jurisdicionados
- Cumprimento de prazos regulamentares
- Riscos à Administração Pública e ao erário
- Subsídios para o exercício da competência fiscalizatória do Tribunal

Baseie-se nas normas do TCE/AC, na Lei Orgânica do TCE/AC (Lei Complementar nº 38/1993 e atualizações), no Regimento Interno do TCE/AC, na Lei de Responsabilidade Fiscal (LC 101/2000), na Lei nº 8.666/1993 e posteriores alterações (incluindo a Lei nº 14.133/2021), e nos princípios constitucionais da Administração Pública (art. 37 da CF/88).

Responda APENAS em JSON válido, sem texto fora do JSON, seguindo exatamente a estrutura abaixo:
{
  "resumo_executivo": "string — síntese objetiva do processo em 2 a 4 frases",
  "nivel_risco": "alto" | "medio" | "baixo",
  "justificativa_risco": "string — fundamentação do nível de risco atribuído",
  "pontos_de_atencao": ["string", ...],
  "perguntas_para_o_gabinete": ["string", ...],
  "sugestao_encaminhamento": "string — recomendação de encaminhamento processual",
  "minuta_despacho": "string — minuta de despacho formal para o gabinete do conselheiro"
}`;

  const userPrompt = `Analise o seguinte processo que está sob acompanhamento do gabinete do conselheiro:\n\n${montarPrompt(dados)}`;

  const url = `${endpoint.replace(/\/$/, "")}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

  try {
    const resposta = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_completion_tokens: 16384,
        temperature: 0.3,
      }),
    });

    if (!resposta.ok) {
      const erro = await resposta.text();
      console.error("[api/ia/analisar-processo] erro OpenAI:", erro);
      return NextResponse.json(
        { error: "Erro ao chamar a OpenAI API." },
        { status: 502 }
      );
    }

    const json = await resposta.json();
    const conteudo = json?.choices?.[0]?.message?.content;

    if (!conteudo) {
      return NextResponse.json(
        { error: "Resposta vazia da OpenAI." },
        { status: 502 }
      );
    }

    const analise = JSON.parse(conteudo);
    return NextResponse.json(analise);
  } catch (err) {
    console.error("[api/ia/analisar-processo]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
