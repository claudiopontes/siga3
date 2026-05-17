/**
 * Tipos TypeScript para a API pública SICONFI
 * Base: https://apidatalake.tesouro.gov.br/ords/siconfi/tt
 */

// Envelope padrão de resposta da API SICONFI (paginado)
export interface SiconfiApiResponse<T> {
  items: T[];
  hasMore: boolean;
  limit: number;
  offset: number;
  count: number;
}

// Item genérico para respostas não mapeadas explicitamente
export type SiconfiItemGenerico = Record<string, string | number | boolean | null>;

// /entes — cadastro de entes da federação
export interface SiconfiEnte {
  cod_ibge: number;
  ente: string;
  capital: number;
  regiao_geografica: string;
  uf: string;
  esfera: string; // E=Estado, M=Município, D=DF, U=União
  exercicio: number;
  populacao: number;
  cnpj: string;
}

// /rreo — Relatório Resumido da Execução Orçamentária
export interface SiconfiItemRreo {
  an_exercicio: number;
  nr_periodo: number;
  id_municipio: number;
  no_municipio: string;
  co_tipo_demonstrativo: string;
  no_anexo: string;
  co_conta: string;
  no_conta: string;
  no_coluna: string;
  vl_conta: string | number | null;
}

// /extrato_entregas — situação de entrega dos demonstrativos
export interface SiconfiItemExtratoEntrega {
  id_ente: number;
  an_referencia: number;
  co_tipo_demonstrativo: string;
  no_tipo_demonstrativo: string;
  no_referencia: string;
  dt_referencia: string | null;
  dt_entrega: string | null;
  co_situacao: string;
  no_situacao: string;
}

// Parâmetros para consulta RREO
export interface SiconfiConsultaRreoParams {
  anoExercicio: number;
  periodo: number;
  tipoDemonstrativo: string;
  idEnte: number;
  anexo?: string;
  esfera?: string;
}

// Parâmetros para consulta de extrato de entregas
export interface SiconfiConsultaExtratoParams {
  idEnte: number;
  anoReferencia: number;
}

// ---------------------------------------------------------------------------
// RGF — Relatório de Gestão Fiscal
// Campos reais confirmados na API DataLake /rreo (co_tipo_demonstrativo=RGF)
// e /rgf (endpoint próprio). A estrutura de campos é idêntica ao RREO.
// Periodicidade: Q (quadrimestral) — 3 períodos por ano (1, 2, 3).
// Obs: o endpoint /rgf retorna os mesmos campos que /rreo com demonstrativo=RGF.
// ---------------------------------------------------------------------------
export interface SiconfiItemRgf {
  exercicio:      number;
  demonstrativo:  string;        // "RGF"
  periodo:        number;        // 1, 2 ou 3
  periodicidade:  string;        // "Q" (quadrimestral)
  instituicao:    string;        // ex: "Prefeitura Municipal de Rio Branco - AC"
  cod_ibge:       number;        // código IBGE 7 dígitos
  uf:             string;        // ex: "AC"
  populacao:      number | null;
  anexo:          string;        // ex: "RGF-Anexo 01"
  esfera:         string;        // "M" = Municipal, "E" = Estadual
  rotulo:         string | null; // ex: "Padrão"
  coluna:         string;        // ex: "DESPESAS EMPENHADAS"
  cod_conta:      string;        // código da conta
  conta:          string;        // descrição da conta
  valor:          number | null;
}

// Parâmetros para consulta RGF
export interface SiconfiConsultaRgfParams {
  anoExercicio:       number;
  periodo:            number;
  tipoDemonstrativo?: string;   // padrão "RGF"
  idEnte:             number;
  anexo?:             string;
  esfera?:            string;
}
