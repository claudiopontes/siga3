export type NivelRisco = "baixo" | "medio" | "alto" | "critico";

// ─── Tipos para análise individual de processo em pauta ───────────────────────

export type TipoDocumentoProcesso =
  | "voto_relator"
  | "relatorio_tecnico"
  | "parecer_mpc"
  | "defesa_manifestacao"
  | "decisao_acordao"
  | "outro";

export interface DocumentoProcessoParaIA {
  id_proc_arqv: number;
  nm_proc_arqv: string;
  tipo_documento: TipoDocumentoProcesso;
  nm_tipo_docm: string | null;
  nr_pagn: number | null;
  texto_extraido: string;    // truncado por tipo antes de enviar à IA
  hash_conteudo: string;     // SHA-256 do texto_extraido
}

export interface ResumoDocumentoOutput {
  id_proc_arqv: number;
  tipo_documento: TipoDocumentoProcesso;
  nm_proc_arqv: string;
  resumo: string;
  do_cache: boolean;
}

export interface AnaliseProcessoPautaInput {
  processo_id: number;
  numero_fmt: string | null;
  nome_classe: string | null;
  assunto: string | null;
  objeto: string | null;
  nome_relator: string | null;
  nome_orgao: string | null;
  nome_1_parte: string | null;
  situacao: string | null;
  setor_atual: string | null;
  resumos_documentos: ResumoDocumentoOutput[];
}

export interface AnaliseProcessoPautaOutput {
  processo_id: number;
  numero_fmt: string | null;
  resumo_executivo: string;
  ponto_central: string;
  risco_percebido: NivelRisco;
  motivo_do_risco: string;
  documentos_analisados: {
    tipo: string;
    nome: string;
    resumo: string;
  }[];
  pontos_para_atencao: string[];
  perguntas_sugeridas: string[];
  informacoes_ausentes: string[];
  aviso_revisao: string;
  gerado_em: string;
  do_cache: boolean;
  // Campos HTML opcionais — gerados localmente a partir do JSON, nunca pela IA
  html_linha_sucinta?: string;
  html_relatorio?: string;
  formato_html_versao?: string;
  // Documentos cujo texto não pôde ser extraído — para diagnóstico no modal
  documentos_com_falha_extracao?: { nome: string; tipo: string; motivo: string }[];
}

export type TipoFonteInstitucional =
  | "constitucional"
  | "legal"
  | "regimental"
  | "institucional"
  | "jurisprudencial"
  | "processual";

export interface FonteInstitucional {
  id: string;
  titulo: string;
  tipo: TipoFonteInstitucional;
  temas: string[];
  resumo: string;
}

export interface ProcessoPautaInput {
  numero?: string;
  classe?: string;
  jurisdicionado?: string;
  municipio?: string;
  relator?: string;
  interessado?: string;
  assunto?: string;
  objeto?: string;
  valor?: string | number | null;
  situacao?: string;
  unidade_tecnica?: string;
  indicacao_voto?: string;
  alertas_varadouro?: string[];
  observacoes?: string;
}

export interface ResumoPautaInput {
  processos: ProcessoPautaInput[];
  contexto_adicional?: string;
}

export interface ProcessoResumoPautaOutput {
  numero: string;
  resumo_para_conselheiro: string;
  ponto_central: string;
  risco_percebido: NivelRisco;
  motivo_do_risco: string;
  pontos_para_atencao_na_sessao: string[];
  perguntas_sugeridas: string[];
  informacoes_ausentes: string[];
}

export interface ResumoPautaOutput {
  resumo_geral_da_pauta: string;
  processos: ProcessoResumoPautaOutput[];
  observacoes_gerais: string[];
  aviso_revisao: string;
}
