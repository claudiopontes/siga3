export type StatusJobAnalisePauta =
  | "pendente"
  | "executando"
  | "concluido"
  | "concluido_com_erros"
  | "erro"
  | "cancelado";

export type StatusItemJobAnalisePauta =
  | "pendente"
  | "ja_analisado"
  | "analisando"
  | "analisado"
  | "erro"
  | "ignorado";

export interface JobAnalisePauta {
  id: number;
  sessao_id: number;
  status: StatusJobAnalisePauta;
  total_processos: number;
  total_pendentes: number;
  total_processados: number;
  total_analisados: number;
  total_ja_analisados: number;
  total_erros: number;
  iniciado_por: string | null;
  criado_em: string;
  iniciado_em: string | null;
  finalizado_em: string | null;
  mensagem: string | null;
  erro: string | null;
  cancelado: boolean;
}

export interface ItemJobAnalisePauta {
  id: number;
  job_id: number;
  processo_id: number;
  numero_processo: string | null;
  sequencia: number | null;
  status: StatusItemJobAnalisePauta;
  mensagem: string | null;
  erro: string | null;
  iniciado_em: string | null;
  finalizado_em: string | null;
}

export const STATUS_JOB_ATIVO: StatusJobAnalisePauta[] = ["pendente", "executando"];
export const STATUS_JOB_FINAL: StatusJobAnalisePauta[] = ["concluido", "concluido_com_erros", "erro", "cancelado"];
