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
  processos_eprocess: {
    nomeExibicao: "Processos — Arquivos e Movimentações (eProcessos)",
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
        "Carga incremental de arquivos e movimentações dos processos presentes nos itens de pauta. Deve ser executado após o ETL pauta_julgamento.",
    },
    execucaoManual: {
      permiteExecucaoManual: true,
      permiteFullManual: false,
      permiteIncrementalManual: true,
      labelBotao: "Recarregar",
      mensagemConfirmacao:
        "Esta ação irá sincronizar arquivos e movimentações dos processos do eProcessos. Deseja continuar?",
    },
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
      labelBotao: "Recarregar",
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
    nomeExibicao: "Envio SIPAC/TCE",
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
      labelBotao: "Recarregar",
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
    periodicidade: "diaria",
    toleranciaDias: 1,
    ativoPainel: true,
    execucao: {
      tipoCargaPadrao: "full",
      modoCargaPadrao: "full_delete_insert",
      escopoCarga: "exercicio_corrente",
      campoReferencia: "an_exercicio",
      preservaHistoricoAnterior: true,
      requerConfirmacaoManual: true,
      observacaoRegraNegocio:
        "Carga bimestral dos dados RREO via API pública do SICONFI/Tesouro Nacional. Cobre o exercício corrente e o anterior. Reconstrói automaticamente os marts siconfi_rreo_resumo_municipio e siconfi_rreo_alertas.",
    },
    execucaoManual: {
      permiteExecucaoManual: true,
      permiteFullManual: true,
      permiteIncrementalManual: false,
      labelBotao: "Recarregar",
      mensagemConfirmacao:
        "Esta ação irá recarregar os dados RREO de todos os municípios do Acre a partir da API pública do SICONFI/Tesouro Nacional. A carga pode levar vários minutos. Deseja continuar?",
    },
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
  inep_ideb_municipios: {
    nomeExibicao: "IDEB Municipal (INEP)",
    periodicidade: "variavel",
    toleranciaDias: 36500,           // efetivamente sem prazo — carga só ocorre quando novos arquivos são depositados
    ativoPainel: true,
    descricaoPeriodicidade:
      "Sob demanda. INEP publica em bienais (IDEB) e o download.inep.gov.br é bloqueado pela rede do TCE. Os arquivos são baixados manualmente e colocados em etl/data/inep/ideb/ — a carga só recarrega quando há ZIPs novos no diretório.",
    execucao: {
      tipoCargaPadrao: "full",
      modoCargaPadrao: "full_upsert_hash",
      escopoCarga: "tudo",
      preservaHistoricoAnterior: true,
      requerConfirmacaoManual: false,
      observacaoRegraNegocio:
        "Lê todos os ZIPs em etl/data/inep/ideb/ (uma execução processa todas as edições presentes). Filtro padrão UF=AC. Hash SHA-256 garante idempotência: arquivos já processados sem alteração apenas tocam atualizado_em.",
    },
    execucaoManual: {
      permiteExecucaoManual: true,
      permiteFullManual: true,
      permiteIncrementalManual: false,
      labelBotao: "Reprocessar IDEB",
      mensagemConfirmacao:
        "Reprocessa todos os ZIPs IDEB em etl/data/inep/ideb/. Operação idempotente — recarregar arquivos já processados não duplica dados. Deseja continuar?",
    },
  },
  inep_rendimento_municipios: {
    nomeExibicao: "Taxas de Rendimento Escolar (INEP)",
    periodicidade: "variavel",
    toleranciaDias: 36500,
    ativoPainel: true,
    descricaoPeriodicidade:
      "Sob demanda. Anual no INEP, mas a rede do TCE bloqueia o download.inep.gov.br — os ZIPs vêm de download manual em etl/data/inep/rendimento/. Carga só recarrega quando há arquivos novos.",
    execucao: {
      tipoCargaPadrao: "full",
      modoCargaPadrao: "full_upsert_hash",
      escopoCarga: "tudo",
      preservaHistoricoAnterior: true,
      requerConfirmacaoManual: false,
      observacaoRegraNegocio:
        "Lê todos os ZIPs em etl/data/inep/rendimento/. Filtro padrão UF=AC. Cada linha = município × localização × dependência; aprovação/reprovação/abandono por etapa.",
    },
    execucaoManual: {
      permiteExecucaoManual: true,
      permiteFullManual: true,
      permiteIncrementalManual: false,
      labelBotao: "Reprocessar Rendimento",
      mensagemConfirmacao:
        "Reprocessa todos os ZIPs de Taxas de Rendimento em etl/data/inep/rendimento/. Deseja continuar?",
    },
  },
  inep_ideb_escolas: {
    nomeExibicao: "IDEB por Escola (INEP)",
    periodicidade: "variavel",
    toleranciaDias: 36500,
    ativoPainel: true,
    descricaoPeriodicidade:
      "Sob demanda. Mesma cadência bienal do IDEB municipal, mas granularidade de escola individual. Arquivos baixados manualmente em etl/data/inep/ideb-escolas/.",
    execucao: {
      tipoCargaPadrao: "full",
      modoCargaPadrao: "full_upsert_hash",
      escopoCarga: "tudo",
      preservaHistoricoAnterior: true,
      requerConfirmacaoManual: false,
      observacaoRegraNegocio:
        "Lê todos os ZIPs em etl/data/inep/ideb-escolas/. Filtro padrão UF=AC (~500–800 escolas). Hash SHA-256 garante idempotência.",
    },
    execucaoManual: {
      permiteExecucaoManual: true,
      permiteFullManual: true,
      permiteIncrementalManual: false,
      labelBotao: "Reprocessar IDEB Escolas",
      mensagemConfirmacao:
        "Reprocessa todos os ZIPs IDEB-escolas em etl/data/inep/ideb-escolas/. Operação idempotente. Deseja continuar?",
    },
  },
  inep_base_dos_dados_geo: {
    nomeExibicao: "Geo das Escolas — Base dos Dados",
    periodicidade: "variavel",
    toleranciaDias: 36500,
    ativoPainel: true,
    descricaoPeriodicidade:
      "Sob demanda. Arquivo curado pela Base dos Dados (basedosdados.org) com coordenadas das escolas — necessário porque o INEP removeu lat/lng do microdado a partir de 2023.",
    execucao: {
      tipoCargaPadrao: "full",
      modoCargaPadrao: "full_upsert",
      escopoCarga: "tudo",
      preservaHistoricoAnterior: true,
      requerConfirmacaoManual: false,
      observacaoRegraNegocio:
        "Lê etl/data/inep/censo/br_bd_diretorios_brasil_escola.csv.gz, filtra UF=AC e atualiza apenas latitude/longitude em public.dim_escola_inep. Demais campos vêm do microdado INEP.",
    },
    execucaoManual: {
      permiteExecucaoManual: true,
      permiteFullManual: true,
      permiteIncrementalManual: false,
      labelBotao: "Atualizar Geo (BD)",
      mensagemConfirmacao:
        "Reprocessa o arquivo da Base dos Dados para atualizar coordenadas das escolas. Deseja continuar?",
    },
  },
  inep_censo_geo: {
    nomeExibicao: "Censo Escolar — Geo das Escolas (INEP)",
    periodicidade: "variavel",
    toleranciaDias: 36500,
    ativoPainel: true,
    descricaoPeriodicidade:
      "Sob demanda. Censo é anual, mas só consumimos coordenadas (lat/lng) e metadados das escolas, não o microdado completo. Arquivo único em etl/data/inep/censo/ (~600MB).",
    execucao: {
      tipoCargaPadrao: "full",
      modoCargaPadrao: "full_upsert",
      escopoCarga: "tudo",
      preservaHistoricoAnterior: true,
      requerConfirmacaoManual: false,
      observacaoRegraNegocio:
        "Extrai apenas o CSV de escolas do microdado, filtra UF=AC e popula public.dim_escola_inep. Microdado bruto NÃO é persistido — só os campos essenciais para localizar e filtrar escolas no painel.",
    },
    execucaoManual: {
      permiteExecucaoManual: true,
      permiteFullManual: true,
      permiteIncrementalManual: false,
      labelBotao: "Atualizar Geo Escolas",
      mensagemConfirmacao:
        "Reprocessa o microdado do Censo Escolar mais recente em etl/data/inep/censo/. Extração ~30s; ingestão ~10s. Deseja continuar?",
    },
  },
  inep_distorcao_municipios: {
    nomeExibicao: "Distorção Idade-Série (INEP)",
    periodicidade: "variavel",
    toleranciaDias: 36500,
    ativoPainel: true,
    descricaoPeriodicidade:
      "Sob demanda. Anual no INEP. Arquivos baixados manualmente em etl/data/inep/distorcao/. Complementa Rendimento Escolar e IDEB com indicador de fluxo (% alunos com 2+ anos de atraso).",
    execucao: {
      tipoCargaPadrao: "full",
      modoCargaPadrao: "full_upsert_hash",
      escopoCarga: "tudo",
      preservaHistoricoAnterior: true,
      requerConfirmacaoManual: false,
      observacaoRegraNegocio:
        "Lê todos os ZIPs em etl/data/inep/distorcao/. Filtro padrão UF=AC. Cada linha = município × localização × dependência.",
    },
    execucaoManual: {
      permiteExecucaoManual: true,
      permiteFullManual: true,
      permiteIncrementalManual: false,
      labelBotao: "Reprocessar Distorção",
      mensagemConfirmacao:
        "Reprocessa todos os ZIPs de Taxa de Distorção Idade-Série em etl/data/inep/distorcao/. Deseja continuar?",
    },
  },
  mart_painel_educacao: {
    nomeExibicao: "Painel Educação — Consolidado",
    periodicidade: "variavel",
    toleranciaDias: 36500,
    ativoPainel: true,
    descricaoPeriodicidade:
      "Mart derivado. Reconstruído automaticamente após cargas de IDEB ou Rendimento; também pode ser disparado manualmente sem reprocessar as fontes.",
    execucao: {
      tipoCargaPadrao: "full",
      modoCargaPadrao: "full_truncate_insert",
      escopoCarga: "tudo",
      preservaHistoricoAnterior: false,
      requerConfirmacaoManual: false,
      observacaoRegraNegocio:
        "Cruza última edição IDEB (rede Pública) com último ano de Rendimento (Total/Total) para alimentar /painel-educacao. Idempotente — TRUNCATE + INSERT a cada execução.",
    },
    execucaoManual: {
      permiteExecucaoManual: true,
      permiteFullManual: true,
      permiteIncrementalManual: false,
      labelBotao: "Atualizar Painel Educação",
      mensagemConfirmacao:
        "Reconstrói o mart de Educação a partir do que já está em dw.fato_inep_ideb_municipal e dw.fato_inep_rendimento_municipal. Deseja continuar?",
    },
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
