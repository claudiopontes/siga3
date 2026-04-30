// Mapeamento oficial dos itens CAUC (código → descrição completa e tipo)
// Fonte: Tesouro Nacional — Cadastro Único de Convênios (CAUC)
// Códigos normalizados: separador "." (ex: "1.1", "2.1.1")

export type CaucItemInfo = {
  descricao: string;
  tipo: string;
};

export const CAUC_ITENS: Record<string, CaucItemInfo> = {
  "1.1":   { descricao: "Regularidade quanto a Tributos, Contribuições Previdenciárias Federais e à Dívida Ativa da União", tipo: "Obrigações de Adimplência Financeira" },
  "1.2":   { descricao: "Regularidade no pagamento de precatórios judiciais", tipo: "Obrigações de Adimplência Financeira" },
  "1.3":   { descricao: "Regularidade quanto a Contribuições para o FGTS", tipo: "Obrigações de Adimplência Financeira" },
  "1.4":   { descricao: "Regularidade em relação à Adimplência Financeira em Empréstimos e Financiamentos concedidos pela União", tipo: "Obrigações de Adimplência Financeira" },
  "1.5":   { descricao: "Regularidade perante o Poder Público Federal", tipo: "Obrigações de Adimplência Financeira" },
  "2.1.1": { descricao: "Prestação de Contas — SIAFI/Subsistema Transferências", tipo: "Adimplemento na Prestação de Contas de Convênios" },
  "2.1.2": { descricao: "Prestação de Contas — Transferegov.br", tipo: "Adimplemento na Prestação de Contas de Convênios" },
  "3.1.1": { descricao: "Publicação do Relatório de Gestão Fiscal (RGF)", tipo: "Obrigações de Transparência" },
  "3.1.2": { descricao: "Encaminhamento do Relatório de Gestão Fiscal ao Siconfi", tipo: "Obrigações de Transparência" },
  "3.2.1": { descricao: "Publicação do Relatório Resumido de Execução Orçamentária (RREO)", tipo: "Obrigações de Transparência" },
  "3.2.2": { descricao: "Encaminhamento do RREO ao Siconfi", tipo: "Obrigações de Transparência" },
  "3.2.3": { descricao: "Encaminhamento do Anexo 8 do RREO ao Siope", tipo: "Obrigações de Transparência" },
  "3.2.4": { descricao: "Encaminhamento do Anexo 12 do RREO ao Siops", tipo: "Obrigações de Transparência" },
  "3.3":   { descricao: "Encaminhamento das Contas Anuais", tipo: "Obrigações de Transparência" },
  "3.4.1": { descricao: "Encaminhamento da Matriz de Saldos Contábeis Mensal", tipo: "Obrigações de Transparência" },
  "3.4.2": { descricao: "Encaminhamento da Matriz de Saldos Contábeis de Encerramento", tipo: "Obrigações de Transparência" },
  "3.5":   { descricao: "Encaminhamento de Informações para o Cadastro da Dívida Pública (CDP)", tipo: "Obrigações de Transparência" },
  "3.6":   { descricao: "Transparência da execução orçamentária e financeira em meio eletrônico de acesso público", tipo: "Obrigações de Transparência" },
  "3.7":   { descricao: "Adoção de Sistema Integrado de Administração Financeira e Controle (Siafic)", tipo: "Obrigações de Transparência" },
  "4.1":   { descricao: "Exercício da Plena Competência Tributária", tipo: "Adimplemento de Obrigações Constitucionais ou Legais" },
  "4.2":   { descricao: "Regularidade Previdenciária", tipo: "Adimplemento de Obrigações Constitucionais ou Legais" },
  "4.3":   { descricao: "Regularidade quanto à Concessão de Incentivos Fiscais", tipo: "Adimplemento de Obrigações Constitucionais ou Legais" },
  "5.1":   { descricao: "Aplicação Mínima de recursos em Educação", tipo: "Cumprimento de Limites Constitucionais e Legais" },
  "5.2":   { descricao: "Aplicação Mínima de recursos em Saúde", tipo: "Cumprimento de Limites Constitucionais e Legais" },
  "5.3":   { descricao: "Limite de Despesas com Parcerias Público-Privadas (PPP)", tipo: "Cumprimento de Limites Constitucionais e Legais" },
  "5.4":   { descricao: "Limite de operações de crédito, inclusive por antecipação de receita", tipo: "Cumprimento de Limites Constitucionais e Legais" },
  "5.5":   { descricao: "Regularidade na aplicação mínima do Fundeb para pagamento de profissionais da educação básica", tipo: "Cumprimento de Limites Constitucionais e Legais" },
  "5.6":   { descricao: "Regularidade na aplicação mínima da complementação da União ao Fundeb em despesas de capital", tipo: "Cumprimento de Limites Constitucionais e Legais" },
  "5.7":   { descricao: "Regularidade na aplicação de 50% da complementação VAAT do Fundeb na educação infantil", tipo: "Cumprimento de Limites Constitucionais e Legais" },
  "5.8":   { descricao: "Regularidade na destinação mínima de recursos para a constituição do Fundeb", tipo: "Cumprimento de Limites Constitucionais e Legais" },
};

// Normaliza o código do item do banco (ex: "1_1", "2_1_1") para a chave do mapa ("1.1", "2.1.1")
export function normalizarCodigoItem(codigo: string): string {
  return codigo.replace(/_/g, ".");
}

export function getCaucItem(codigo: string): CaucItemInfo | undefined {
  return CAUC_ITENS[normalizarCodigoItem(codigo)];
}
