// Auditoria/métricas básicas de uso do Assistente Aquiry.
//
// Princípios de privacidade desta camada:
// - NÃO registrar conteúdo da pergunta nem da resposta.
// - NÃO registrar stack trace, payloads do Gemini/Azure nem API keys.
// - NÃO registrar fontes externas completas ou documentos da base.
// - Apenas metadados: tipo de evento, rota, estratégia, flags da origem,
//   tamanhos numéricos, tempo de resposta e código de erro sanitizado.
//
// Persistência:
// - Sempre emite console.info estruturado com prefixo "[Aquiry][audit]".
// - Quando AQUIRY_AUDIT_PERSIST=true, também grava em public.aquiry_evento_uso
//   (migration 260_aquiry_audit.sql). Falha de persistência NUNCA quebra a
//   resposta ao usuário — apenas console.warn.
// - Persistência segue política institucional de retenção, segurança e LGPD.

export type EstrategiaAquiryAuditoria =
  | "varadouro"
  | "conhecimento_geral"
  | "busca_externa";

export type EventoAquiry = {
  tipo: "pergunta" | "resposta" | "erro";
  timestamp: string;
  rota?: string;
  tipoPagina?: string;
  estrategia?: EstrategiaAquiryAuditoria;
  bases?: string[];
  usouContextoTela?: boolean;
  usouAnaliseContextual?: boolean;
  usouBaseDocumental?: boolean;
  usouPesquisaExterna?: boolean;
  pesquisaExternaSuficiente?: boolean;
  exigeFonteEstruturada?: boolean;
  fonteEstruturadaEncontrada?: boolean;
  fontesOficiaisEncontradas?: boolean;
  tamanhoPergunta?: number;
  tamanhoResposta?: number;
  tempoRespostaMs?: number;
  erroCodigo?: string;
};

// Sanitiza um identificador de erro: mantém apenas letras, dígitos, _ e -.
// Evita vazar mensagens livres ou trechos de stack trace.
export function sanitizarCodigoErro(codigo: unknown): string {
  if (typeof codigo !== "string") return "erro_desconhecido";
  const limpo = codigo.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  return limpo.slice(0, 60) || "erro_desconhecido";
}

// Limites defensivos — evitam payloads anormais entrarem na auditoria.
const MAX_ROTA = 200;
const MAX_TIPO_PAGINA = 50;
const MAX_BASES = 12;
const MAX_BASE_LEN = 80;
const TIPOS_VALIDOS = new Set(["pergunta", "resposta", "erro"]);
const ESTRATEGIAS_VALIDAS = new Set([
  "varadouro",
  "conhecimento_geral",
  "busca_externa",
]);

function clamp(s: unknown, max: number): string | undefined {
  if (typeof s !== "string") return undefined;
  const t = s.trim();
  return t ? t.slice(0, max) : undefined;
}

function clampInt(n: unknown): number | undefined {
  if (typeof n !== "number" || !Number.isFinite(n)) return undefined;
  // Mantém apenas inteiros não-negativos plausíveis.
  if (n < 0) return undefined;
  if (n > 2_000_000_000) return 2_000_000_000;
  return Math.trunc(n);
}

function normalizarEvento(evento: EventoAquiry): EventoAquiry {
  const tipo = TIPOS_VALIDOS.has(evento.tipo) ? evento.tipo : "erro";
  const estrategia =
    evento.estrategia && ESTRATEGIAS_VALIDAS.has(evento.estrategia)
      ? evento.estrategia
      : undefined;
  const bases = Array.isArray(evento.bases)
    ? evento.bases
        .filter((b): b is string => typeof b === "string")
        .slice(0, MAX_BASES)
        .map((b) => b.slice(0, MAX_BASE_LEN))
    : undefined;
  return {
    tipo,
    timestamp: evento.timestamp,
    rota: clamp(evento.rota, MAX_ROTA),
    tipoPagina: clamp(evento.tipoPagina, MAX_TIPO_PAGINA),
    estrategia,
    bases: bases && bases.length > 0 ? bases : undefined,
    usouContextoTela: typeof evento.usouContextoTela === "boolean" ? evento.usouContextoTela : undefined,
    usouAnaliseContextual: typeof evento.usouAnaliseContextual === "boolean" ? evento.usouAnaliseContextual : undefined,
    usouBaseDocumental: typeof evento.usouBaseDocumental === "boolean" ? evento.usouBaseDocumental : undefined,
    usouPesquisaExterna: typeof evento.usouPesquisaExterna === "boolean" ? evento.usouPesquisaExterna : undefined,
    pesquisaExternaSuficiente: typeof evento.pesquisaExternaSuficiente === "boolean" ? evento.pesquisaExternaSuficiente : undefined,
    exigeFonteEstruturada: typeof evento.exigeFonteEstruturada === "boolean" ? evento.exigeFonteEstruturada : undefined,
    fonteEstruturadaEncontrada: typeof evento.fonteEstruturadaEncontrada === "boolean" ? evento.fonteEstruturadaEncontrada : undefined,
    fontesOficiaisEncontradas: typeof evento.fontesOficiaisEncontradas === "boolean" ? evento.fontesOficiaisEncontradas : undefined,
    tamanhoPergunta: clampInt(evento.tamanhoPergunta),
    tamanhoResposta: clampInt(evento.tamanhoResposta),
    tempoRespostaMs: clampInt(evento.tempoRespostaMs),
    erroCodigo: clamp(evento.erroCodigo, 60),
  };
}

async function persistirEvento(payload: EventoAquiry): Promise<void> {
  // Import dinâmico para evitar carregar `pg` em ambientes onde a auditoria
  // está desligada e o módulo de db não foi inicializado.
  const { dbQuery } = await import("@/lib/db");
  await dbQuery(
    `INSERT INTO public.aquiry_evento_uso (
       timestamp, tipo, rota, tipo_pagina, estrategia, bases,
       usou_contexto_tela, usou_analise_contextual, usou_base_documental,
       usou_pesquisa_externa, pesquisa_externa_suficiente,
       exige_fonte_estruturada, fonte_estruturada_encontrada,
       fontes_oficiais_encontradas,
       tamanho_pergunta, tamanho_resposta, tempo_resposta_ms, erro_codigo
     ) VALUES (
       $1, $2, $3, $4, $5, $6::jsonb,
       $7, $8, $9, $10, $11,
       $12, $13, $14, $15, $16, $17, $18
     )`,
    [
      payload.timestamp,
      payload.tipo,
      payload.rota ?? null,
      payload.tipoPagina ?? null,
      payload.estrategia ?? null,
      payload.bases ? JSON.stringify(payload.bases) : null,
      payload.usouContextoTela ?? null,
      payload.usouAnaliseContextual ?? null,
      payload.usouBaseDocumental ?? null,
      payload.usouPesquisaExterna ?? null,
      payload.pesquisaExternaSuficiente ?? null,
      payload.exigeFonteEstruturada ?? null,
      payload.fonteEstruturadaEncontrada ?? null,
      payload.fontesOficiaisEncontradas ?? null,
      payload.tamanhoPergunta ?? null,
      payload.tamanhoResposta ?? null,
      payload.tempoRespostaMs ?? null,
      payload.erroCodigo ?? null,
    ],
  );
}

export function registrarEventoAquiry(evento: EventoAquiry): void {
  const payload = normalizarEvento(evento);

  // Versão "log-only" para console — remove undefined para ficar enxuto.
  const paraLog: Record<string, unknown> = { ...payload };
  for (const k of Object.keys(paraLog)) {
    if (paraLog[k] === undefined) delete paraLog[k];
  }
  console.info("[Aquiry][audit]", JSON.stringify(paraLog));

  // Persistência opcional: ativada por env AQUIRY_AUDIT_PERSIST=true.
  // Fire-and-forget — nunca bloqueia o caller nem propaga erro.
  if (process.env.AQUIRY_AUDIT_PERSIST === "true") {
    persistirEvento(payload).catch((err) => {
      console.warn(
        "[Aquiry][audit] persistência falhou:",
        err instanceof Error ? err.message : String(err),
      );
    });
  }
}
