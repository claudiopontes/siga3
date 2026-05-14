export type NivelRisco = "baixo" | "medio" | "alto" | "critico";

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
