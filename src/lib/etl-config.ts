export type Periodicidade = "diaria" | "semanal" | "mensal" | "bimestral" | "anual" | "variavel";

export type StatusCarga = "ok" | "erro" | "pendente" | "desatualizado" | "muito_desatualizado";

export interface EtlConfigEntry {
  nomeExibicao: string;
  periodicidade: Periodicidade;
  toleranciaDias: number;
  ativoPainel: boolean;
  descricaoPeriodicidade?: string;
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
