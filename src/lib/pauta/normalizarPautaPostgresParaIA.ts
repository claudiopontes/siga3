// TODO: enriquecer futuramente com dados do processo (assunto, objeto, entidade, município)
//       a partir do ETL de processos do gabinete, documentos PDF e jurisprudência.
import type { ResumoPautaInput, ProcessoPautaInput } from "@/lib/ia/tipos";
import { normalizarBooleano } from "./normalizarBooleano";

const LIMITE_ITENS = 30;

function formatarData(valor: unknown): string | null {
  if (!valor) return null;
  const d = new Date(String(valor));
  if (isNaN(d.getTime())) return String(valor);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function normalizarPautaPostgresParaIA(params: {
  sessao: Record<string, unknown>;
  itens: Record<string, unknown>[];
}): ResumoPautaInput {
  const { sessao, itens } = params;

  // Ordenar por sequencia crescente, nulos no final.
  const itensOrdenados = [...itens]
    .sort((a, b) => {
      const sa = a.sequencia != null ? Number(a.sequencia) : Infinity;
      const sb = b.sequencia != null ? Number(b.sequencia) : Infinity;
      return sa - sb;
    })
    .slice(0, LIMITE_ITENS);

  const processos: ProcessoPautaInput[] = itensOrdenados.map((item) => {
    const numero = String(item.numero_processo ?? item.processo_id ?? "").trim() || undefined;
    const relator = String(item.relator_tratamento ?? item.nome_relator ?? "").trim() || undefined;
    const situacao = String(item.situacao ?? "").trim() || undefined;

    // Alertas construídos a partir dos campos disponíveis
    const alertas: string[] = ["Processo incluído em pauta de julgamento"];

    const qtdePron = Number(item.qtde_pron ?? 0);
    if (qtdePron > 0) {
      alertas.push("Possui pronunciamento do Ministério Público de Contas");
    } else {
      alertas.push("Não consta pronunciamento do Ministério Público de Contas nos dados consultados");
    }

    if (normalizarBooleano(item.julgado)) alertas.push("Processo marcado como julgado");
    if (normalizarBooleano(item.eletronico)) alertas.push("Processo eletrônico");

    // Observações de contexto da sessão para cada item
    const linhasObs: string[] = [];
    if (sessao.numero) linhasObs.push(`Sessão: ${sessao.numero}`);
    const dtFormatada = formatarData(sessao.dt_realizacao);
    if (dtFormatada) linhasObs.push(`Data da sessão: ${dtFormatada}`);
    if (sessao.tipo) linhasObs.push(`Tipo da sessão: ${sessao.tipo}`);
    if (sessao.local_sessao) linhasObs.push(`Local: ${sessao.local_sessao}`);
    if (item.sequencia != null) linhasObs.push(`Sequência na pauta: ${item.sequencia}`);
    const nomeRevisor = String(item.nome_revisor ?? "").trim();
    if (nomeRevisor) linhasObs.push(`Revisor: ${nomeRevisor}`);

    const observacoes = linhasObs.length > 0 ? linhasObs.join(" | ") : undefined;

    return {
      numero,
      relator,
      situacao,
      alertas_varadouro: alertas,
      observacoes,
    };
  });

  return {
    processos,
    contexto_adicional:
      "Pauta de julgamento carregada no Varadouro Digital a partir do EJURIS por ETL. A sessão está em situação PARA JULGAMENTO. Os dados disponíveis são básicos e devem ser tratados como apoio preliminar.",
  };
}
