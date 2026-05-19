// Tipos compartilhados entre provider, hook, endpoint e painel para o Assistente Aquiry.

/**
 * Contexto mínimo e seguro que uma página pode registrar para o Assistente Aquiry.
 * Representa apenas dados já carregados e visíveis na tela — não implica consulta adicional.
 */
export type ContextoTelaAquiry = {
  /** Título descritivo da tela ou seção atual */
  titulo?: string;
  /** Descrição funcional da tela */
  descricao?: string;
  /** Dados resumidos da tela: filtros ativos, indicadores principais, contagens */
  dados?: Record<string, unknown>;
  /** Observações explícitas sobre a origem e limitações dos dados */
  observacoes?: string[];
  /** Fontes de dados visíveis na tela (ex: "SIOPS 2024", "SIM 2023") */
  fontes?: string[];
};

/**
 * Metadados sobre a origem/base usada para gerar uma resposta.
 * Calculado pelo backend de forma determinística — não inferido pela IA.
 *
 * Preparado para crescer nas fases futuras com bases como:
 * processos, pautas, documentos, jurisprudência, pesquisa externa.
 */
export type EstrategiaRespostaAquiry =
  | "varadouro"
  | "conhecimento_geral"
  | "busca_externa";

export type TipoFonteExternaAquiry =
  | "textual"
  | "oficial_textual"
  | "estruturada"
  | "indeterminada";

export type FonteExternaAquiry = {
  titulo: string;
  url: string;
  fonte?: string;
  tipoFonte?: TipoFonteExternaAquiry;
};

export type DocumentoBaseAquiry = {
  titulo: string;
  area: string;
  caminho: string;
};

export type OrigemRespostaAquiry = {
  /** Contexto real da tela foi recebido e incluído no prompt */
  usouContextoTela: boolean;
  /** Contexto inferido pela rota foi recebido e incluído no prompt */
  usouContextoRota: boolean;
  /** Conhecimento geral da IA foi base da resposta */
  usouConhecimentoGeral: boolean;
  /** Análise contextual determinística do Varadouro foi gerada e incluída no prompt */
  usouAnaliseContextual: boolean;
  /** A pergunta foi classificada como dependente de busca externa */
  requerBuscaExterna?: boolean;
  /** Busca externa foi efetivamente executada e retornou resultados */
  usouPesquisaExterna?: boolean;
  /** Fontes externas usadas na resposta, para exibição no frontend */
  fontesExternas?: FonteExternaAquiry[];
  /** Quão bem as fontes externas cobrem o recorte da pergunta */
  aderenciaFontesExternas?: "alta" | "media" | "baixa";
  /** Justificativa textual da aderência atribuída */
  observacaoAderenciaFontes?: string;
  /** Tipos de fonte presentes nos resultados (textual, oficial_textual, estruturada, indeterminada) */
  tipoFontesExternas?: TipoFonteExternaAquiry[];
  /** A pesquisa externa atendeu ao "nível de prova" exigido pela pergunta */
  pesquisaExternaSuficiente?: boolean;
  /** A pergunta exige fonte estruturada (csv/api/microdados) para resposta segura */
  exigeFonteEstruturada?: boolean;
  /** Pelo menos uma fonte estruturada foi retornada */
  fonteEstruturadaEncontrada?: boolean;
  /** Pelo menos uma fonte oficial foi retornada */
  fontesOficiaisEncontradas?: boolean;
  /** A base documental versionada do projeto foi consultada e usada */
  usouBaseDocumental?: boolean;
  /** Documentos da base versionada do projeto que entraram no prompt */
  documentosBase?: DocumentoBaseAquiry[];
  /** Estratégia escolhida pelo classificador para responder */
  estrategia?: EstrategiaRespostaAquiry;
  /** Lista amigável das bases usadas, para exibição no frontend */
  bases: string[];
};
