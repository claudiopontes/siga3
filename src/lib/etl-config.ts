export type Periodicidade = "diaria" | "semanal" | "mensal" | "bimestral" | "anual" | "variavel";

export type StatusCarga = "ok" | "erro" | "pendente" | "desatualizado" | "muito_desatualizado";

export type TipoCarga =
  | "full"
  | "incremental"
  | "incremental_com_janela"
  | "manual"
  | "nao_aplicavel";

export type EscopoCarga =
  | "exercicio_corrente"
  | "competencia"
  | "periodo"
  | "janela"
  | "tudo"
  | "variavel";

export interface EtlExecucao {
  tipoCargaPadrao: TipoCarga;
  modoCargaPadrao: string;
  escopoCarga: EscopoCarga;
  campoReferencia?: string;
  janelaReprocessamentoDias?: number;
  preservaHistoricoAnterior: boolean;
  requerConfirmacaoManual: boolean;
  observacaoRegraNegocio?: string;
}

export interface EtlExecucaoManual {
  permiteExecucaoManual: boolean;
  permiteFullManual: boolean;
  permiteIncrementalManual: boolean;
  labelBotao?: string;
  mensagemConfirmacao?: string;
  parametrosObrigatorios?: string[];
}

export interface EtlConfigEntry {
  nomeExibicao: string;
  periodicidade: Periodicidade;
  toleranciaDias: number;
  ativoPainel: boolean;
  descricaoPeriodicidade?: string;
  execucao?: EtlExecucao;
  execucaoManual?: EtlExecucaoManual;
}

export const ETL_CONFIG: Record<string, EtlConfigEntry> = {
  despesa_full_postgres: {
    nomeExibicao: "Despesa (Empenhos)",
    periodicidade: "diaria",
    toleranciaDias: 1,
    ativoPainel: true,
  },
  mart_despesa: {
    nomeExibicao: "Mart Despesa",
    periodicidade: "diaria",
    toleranciaDias: 1,
    ativoPainel: true,
  },
  processos_gabinete: {
    nomeExibicao: "Processos Gabinete",
    periodicidade: "diaria",
    toleranciaDias: 1,
    ativoPainel: true,
  },
  pauta_julgamento: {
    nomeExibicao: "Pautas para Julgamento (EJURIS)",
    periodicidade: "diaria",
    toleranciaDias: 1,
    ativoPainel: true,
    execucao: {
      tipoCargaPadrao: "incremental",
      modoCargaPadrao: "upsert",
      escopoCarga: "tudo",
      preservaHistoricoAnterior: true,
      requerConfirmacaoManual: false,
      observacaoRegraNegocio:
        "Carga incremental (upsert) de todas as sessões e seus itens de pauta. A situação da sessão (PARA PAUTA, PARA JULGAMENTO, ENCERRADA etc.) é atualizada a cada execução, refletindo a progressão no EJURIS.",
    },
    execucaoManual: {
      permiteExecucaoManual: true,
      permiteFullManual: false,
      permiteIncrementalManual: true,
      labelBotao: "Forçar atualização",
      mensagemConfirmacao:
        "Esta ação irá sincronizar todas as sessões e itens de pauta do EJURIS. Deseja continuar?",
    },
  },
  mart_infodengue: {
    nomeExibicao: "Vigilância Epidemiológica (InfoDengue)",
    periodicidade: "semanal",
    toleranciaDias: 7,
    ativoPainel: true,
  },
  mart_saude_consolidado: {
    nomeExibicao: "Saúde — Consolidado",
    periodicidade: "semanal",
    toleranciaDias: 7,
    ativoPainel: true,
  },
  mart_pni: {
    nomeExibicao: "Vacinação PNI",
    periodicidade: "mensal",
    toleranciaDias: 30,
    ativoPainel: true,
  },
  mart_sisagua: {
    nomeExibicao: "Qualidade da Água (SISAGUA)",
    periodicidade: "mensal",
    toleranciaDias: 30,
    ativoPainel: true,
  },
  mart_saude_estrutura: {
    nomeExibicao: "Estrutura da Rede (CNES/UBS)",
    periodicidade: "mensal",
    toleranciaDias: 30,
    ativoPainel: true,
  },
  mart_remessas: {
    nomeExibicao: "Remessas Contábeis",
    periodicidade: "mensal",
    toleranciaDias: 30,
    ativoPainel: true,
  },
  remessas_full_postgres: {
    nomeExibicao: "Carga Remessas",
    periodicidade: "mensal",
    toleranciaDias: 30,
    ativoPainel: true,
    execucao: {
      tipoCargaPadrao: "full",
      modoCargaPadrao: "full_truncate_insert",
      escopoCarga: "exercicio_corrente",
      campoReferencia: "exercicio",
      preservaHistoricoAnterior: false,
      requerConfirmacaoManual: true,
      observacaoRegraNegocio:
        "As remessas contábeis devem sempre refletir o exercício corrente. A carga é full porque não há necessidade de preservar a situação anterior.",
    },
    execucaoManual: {
      permiteExecucaoManual: true,
      permiteFullManual: true,
      permiteIncrementalManual: false,
      labelBotao: "Forçar atualização",
      mensagemConfirmacao:
        "Esta ação irá recarregar as remessas contábeis do exercício corrente. Deseja continuar?",
    },
  },
  mart_siops: {
    nomeExibicao: "Orçamento Saúde (SIOPS)",
    periodicidade: "bimestral",
    toleranciaDias: 60,
    ativoPainel: true,
  },
  mart_siconfi_rreo: {
    nomeExibicao: "RREO (SICONFI)",
    periodicidade: "bimestral",
    toleranciaDias: 60,
    ativoPainel: true,
  },
  mart_pni_cobertura: {
    nomeExibicao: "Cobertura Vacinal (PNI)",
    periodicidade: "anual",
    toleranciaDias: 365,
    ativoPainel: true,
  },
  mart_mortalidade: {
    nomeExibicao: "Mortalidade (SIM/SINASC)",
    periodicidade: "anual",
    toleranciaDias: 365,
    ativoPainel: true,
  },
};

export function classificarCarga(
  status: string,
  executado_em: string | null | undefined,
  modulo: string
): StatusCarga {
  const s = status.toLowerCase();
  if (s === "erro" || s === "error") return "erro";
  if (!executado_em) return "pendente";

  const config = ETL_CONFIG[modulo];
  const tolerancia = config?.toleranciaDias ?? 1;
  const diasDesde = Math.floor((Date.now() - new Date(executado_em).getTime()) / 86400000);

  if (diasDesde > tolerancia * 2) return "muito_desatualizado";
  if (diasDesde > tolerancia) return "desatualizado";
  return "ok";
}
