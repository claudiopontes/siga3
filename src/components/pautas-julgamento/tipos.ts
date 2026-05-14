export type SessaoJulgamentoView = {
  id: number;
  numero: string | number | null;
  dt_realizacao: string | null;
  orgao_julgador_id: number | null;
  local_sessao: string | null;
  tipo: string | null;
  situacao: string | null;
  numero_publicacao: string | number | null;
  data_publicacao: string | null;
  tipo_publicacao: string | null;
  arquivo_sessao: string | null;
};

export type ProcessoPautaJulgamentoView = {
  id: number;
  sessao_id: number | null;
  sessao_numero: string | number | null;
  processo_id: string | number | null;
  numero_processo: string | number | null;
  situacao: string | null;
  sequencia: number | null;
  relator_id: number | null;
  nome_relator: string | null;
  cargo_relator: string | null;
  titulo_relator: string | null;
  relator_tratamento: string | null;
  revisor_id: number | null;
  nome_revisor: string | null;
  cargo_revisor: string | null;
  titulo_revisor: string | null;
  eletronico: boolean | number | string | null;
  qtde_pron: number | null;
  incluir_interessados: boolean | number | string | null;
  julgado: boolean | number | string | null;
};
