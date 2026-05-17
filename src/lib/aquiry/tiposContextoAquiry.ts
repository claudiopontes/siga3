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
export type OrigemRespostaAquiry = {
  /** Contexto real da tela foi recebido e incluído no prompt */
  usouContextoTela: boolean;
  /** Contexto inferido pela rota foi recebido e incluído no prompt */
  usouContextoRota: boolean;
  /** Conhecimento geral da IA foi a base principal (sempre true nesta fase) */
  usouConhecimentoGeral: boolean;
  /** Análise contextual determinística do Varadouro foi gerada e incluída no prompt */
  usouAnaliseContextual: boolean;
  /** Lista amigável das bases usadas, para exibição no frontend */
  bases: string[];
};
