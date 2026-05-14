import type { ProcessoPautaInput } from "./tipos";

export function limitarTexto(texto: string | undefined | null, maxCaracteres: number): string {
  if (!texto) return "";
  return texto.length <= maxCaracteres ? texto : texto.slice(0, maxCaracteres) + "…";
}

// Remove campos vazios e limita campos longos para reduzir custo com tokens.
export function compactarProcessoParaIA(processo: ProcessoPautaInput): ProcessoPautaInput {
  const compactado: ProcessoPautaInput = {};

  if (processo.numero) compactado.numero = processo.numero;
  if (processo.classe) compactado.classe = processo.classe;
  if (processo.jurisdicionado) compactado.jurisdicionado = processo.jurisdicionado;
  if (processo.municipio) compactado.municipio = processo.municipio;
  if (processo.relator) compactado.relator = processo.relator;
  if (processo.interessado) compactado.interessado = limitarTexto(processo.interessado, 150);
  if (processo.assunto) compactado.assunto = limitarTexto(processo.assunto, 200);
  if (processo.objeto) compactado.objeto = limitarTexto(processo.objeto, 300);
  if (processo.valor != null) compactado.valor = processo.valor;
  if (processo.situacao) compactado.situacao = processo.situacao;
  if (processo.unidade_tecnica) compactado.unidade_tecnica = processo.unidade_tecnica;
  if (processo.indicacao_voto) compactado.indicacao_voto = limitarTexto(processo.indicacao_voto, 200);
  if (processo.alertas_varadouro?.length) compactado.alertas_varadouro = processo.alertas_varadouro;
  if (processo.observacoes) compactado.observacoes = limitarTexto(processo.observacoes, 300);

  return compactado;
}
