// Camada centralizada para chamadas ao Azure OpenAI — não expor no frontend.
// PDFs, jurisprudência e SQL Server serão integrados em etapas futuras por seleção de trechos relevantes, não por envio integral.

type Mensagem = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ParamsChamada = {
  messages: Mensagem[];
  temperature?: number;
  maxCompletionTokens?: number;
  jsonMode?: boolean;
};

export async function chamarAzureOpenAI(params: ParamsChamada): Promise<string> {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION;

  if (!endpoint || !apiKey || !deployment || !apiVersion) {
    throw new Error("Variáveis de ambiente do Azure OpenAI não configuradas.");
  }

  const url = `${endpoint.replace(/\/$/, "")}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

  const body: Record<string, unknown> = {
    messages: params.messages,
    temperature: params.temperature ?? 0.2,
    max_completion_tokens: params.maxCompletionTokens ?? 12000,
  };

  if (params.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const resposta = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!resposta.ok) {
    const erro = await resposta.text();
    throw new Error(`Erro Azure OpenAI (HTTP ${resposta.status}): ${erro}`);
  }

  const json = await resposta.json();
  const conteudo: string | undefined = json?.choices?.[0]?.message?.content;

  if (!conteudo) {
    const finishReason = json?.choices?.[0]?.finish_reason;
    const usage = json?.usage;
    throw new Error(
      `Resposta vazia do Azure OpenAI (finish_reason=${finishReason ?? "?"}, usage=${
        usage ? JSON.stringify(usage) : "?"
      }).`,
    );
  }

  return conteudo;
}
