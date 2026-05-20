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
  /**
   * Módulo(s) cuja execução precede este. Reflete o encadeamento real
   * implementado em etl/schedule.ts — se um pai falha no cron, o filho é
   * pulado. O painel /seguranca/etl usa este campo para sinalizar visualmente
   * as dependências e bloqueios em cascata.
   */
  dependeDe?: string | string[];
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
    dependeDe: "despesa_full_postgres",
    execucao: {
      tipoCargaPadrao: "full",
      modoCargaPadrao: "full_truncate_insert",
      escopoCarga: "tudo",
      preservaHistoricoAnterior: true,
      requerConfirmacaoManual: true,
      observacaoRegraNegocio:
        "Disparado automaticamente após despesa_full_postgres. Sem botão próprio — use 'Recarregar' em Despesa (Empenhos) para reprocessar toda a cadeia.",
    },
    // Sem execucaoManual: o card aparece sem botão.
  },
  processos_gabinete: {
    nomeExibicao: "Processos Gabinete",
    periodicidade: "diaria",
    toleranciaDias: 1,
    ativoPainel: true,
  },
  processos_ce: {
    nomeExibicao: "Processos CE (Cadastro)",
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
        "Carrega todos os processos de Controle Externo (Id_Tipo_Proc = 2) do EPROCESS para public.processo. Pré-requisito para processos_eprocess (arquivos/movimentações).",
    },
    execucaoManual: {
      permiteExecucaoManual: true,
      permiteFullManual: false,
      permiteIncrementalManual: true,
      labelBotao: "Recarregar",
      mensagemConfirmacao:
        "Esta ação irá sincronizar o cadastro de processos CE do eProcessos. Deseja continuar?",
    },
  },
  processos_eprocess: {
    nomeExibicao: "Processos — Arquivos e Movimentações (eProcessos)",
    periodicidade: "diaria",
    toleranciaDias: 1,
    ativoPainel: true,
    dependeDe: "processos_ce",
    execucao: {
      tipoCargaPadrao: "incremental",
      modoCargaPadrao: "upsert",
      escopoCarga: "tudo",
      preservaHistoricoAnterior: true,
      requerConfirmacaoManual: false,
      observacaoRegraNegocio:
        "Disparado automaticamente após processos_ce. Sem botão próprio no painel — use 'Recarregar' em Processos CE para reprocessar toda a cadeia.",
    },
    // Sem execucaoManual: o painel renderiza o card sem botão. O reprocessamento
    // é disparado pelo pai (processos_ce → carga-processos:postgres).
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
  saude_completa: {
    nomeExibicao: "Saúde — Carga Completa",
    periodicidade: "semanal",
    toleranciaDias: 7,
    ativoPainel: true,
    descricaoPeriodicidade:
      "Macro que executa todos os 7 ETLs de saúde em sequência + refresh do Consolidado.",
    execucao: {
      tipoCargaPadrao: "full",
      modoCargaPadrao: "full_truncate_insert",
      escopoCarga: "tudo",
      preservaHistoricoAnterior: true,
      requerConfirmacaoManual: true,
      observacaoRegraNegocio:
        'Macro que invoca "carga-saude:postgres". Cada etapa loga seu próprio status; este módulo agrega como "iniciado/concluído" do conjunto. PNI Cobertura e Mortalidade dependem de arquivos manuais.',
    },
    execucaoManual: {
      permiteExecucaoManual: true,
      permiteFullManual: true,
      permiteIncrementalManual: false,
      labelBotao: "Recarregar tudo (saúde)",
      mensagemConfirmacao:
        "Esta ação roda em sequência todos os ETLs de saúde (SIOPS, CNES/UBS, SISAGUA, InfoDengue, PNI, PNI Cobertura, Mortalidade) e refresca o Consolidado. Pode levar 10 a 30 min. Deseja continuar?",
    },
  },
  mart_saude_consolidado: {
    nomeExibicao: "Saúde — Consolidado",
    periodicidade: "semanal",
    toleranciaDias: 7,
    ativoPainel: true,
    // Multi-pai: o consolidado é refrescado automaticamente após qualquer um dos
    // marts de saúde rodar (via scripts carga-*:postgres em etl/package.json).
    dependeDe: [
      "mart_siops",
      "mart_sisagua",
      "mart_pni",
      "mart_pni_cobertura",
      "mart_infodengue",
      "mart_saude_estrutura",
      "mart_mortalidade",
    ],
    execucao: {
      tipoCargaPadrao: "full",
      modoCargaPadrao: "full_truncate_insert",
      escopoCarga: "tudo",
      preservaHistoricoAnterior: true,
      requerConfirmacaoManual: true,
      observacaoRegraNegocio:
        "Recompõe a visão consolidada da saúde a partir de todos os marts de saúde já carregados no DW. Útil rodar diretamente sem refetch quando algum dos marts foi atualizado externamente. Nos scripts carga-*:postgres dos marts pais, este refresh é disparado automaticamente ao final.",
    },
    execucaoManual: {
      permiteExecucaoManual: true,
      permiteFullManual: true,
      permiteIncrementalManual: false,
      labelBotao: "Recarregar consolidado",
      mensagemConfirmacao:
        "Esta ação reconstrói a visão consolidada da saúde a partir dos marts existentes no DW (não recoleta da fonte). Deseja continuar?",
    },
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
    dependeDe: "remessas_full_postgres",
    execucao: {
      tipoCargaPadrao: "full",
      modoCargaPadrao: "full_truncate_insert",
      escopoCarga: "tudo",
      preservaHistoricoAnterior: true,
      requerConfirmacaoManual: true,
      observacaoRegraNegocio:
        "Disparado automaticamente após remessas_full_postgres (via carga-remessas:postgres). Sem botão próprio.",
    },
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
  siconfi_rreo_incremental: {
    nomeExibicao: "SICONFI RREO — Coleta API",
    periodicidade: "diaria",
    toleranciaDias: 1,
    ativoPainel: true,
    descricaoPeriodicidade:
      "Coleta incremental dos relatórios RREO via API pública do SICONFI/Tesouro Nacional. Pré-requisito de mart_siconfi_rreo.",
    execucao: {
      tipoCargaPadrao: "incremental",
      modoCargaPadrao: "incremental_upsert",
      escopoCarga: "exercicio_corrente",
      campoReferencia: "an_exercicio",
      preservaHistoricoAnterior: true,
      requerConfirmacaoManual: true,
      observacaoRegraNegocio:
        "Job que efetivamente popula dw.fato_siconfi_rreo. Ao final invoca o refresh do mart_siconfi_rreo internamente.",
    },
    execucaoManual: {
      permiteExecucaoManual: true,
      permiteFullManual: false,
      permiteIncrementalManual: true,
      labelBotao: "Recarregar",
      mensagemConfirmacao:
        "Esta ação irá coletar os relatórios RREO mais recentes via API pública do SICONFI/Tesouro Nacional. A carga pode levar vários minutos. Deseja continuar?",
    },
  },
  mart_siconfi_rreo: {
    nomeExibicao: "RREO (SICONFI)",
    periodicidade: "diaria",
    toleranciaDias: 1,
    ativoPainel: true,
    dependeDe: "siconfi_rreo_incremental",
    execucao: {
      tipoCargaPadrao: "full",
      modoCargaPadrao: "full_delete_insert",
      escopoCarga: "exercicio_corrente",
      campoReferencia: "an_exercicio",
      preservaHistoricoAnterior: true,
      requerConfirmacaoManual: true,
      observacaoRegraNegocio:
        "Disparado automaticamente após siconfi_rreo_incremental. Sem botão próprio — use 'Recarregar' em SICONFI RREO — Coleta API.",
    },
    // Sem execucaoManual.
  },
  siconfi_rgf_full: {
    nomeExibicao: "SICONFI RGF — Coleta API",
    periodicidade: "diaria",
    toleranciaDias: 1,
    ativoPainel: true,
    descricaoPeriodicidade:
      "Coleta full dos relatórios RGF via API pública do SICONFI (extrato_entregas). Pré-requisito de mart_siconfi_rgf.",
    execucao: {
      tipoCargaPadrao: "full",
      modoCargaPadrao: "full_delete_insert",
      escopoCarga: "exercicio_corrente",
      campoReferencia: "an_exercicio",
      preservaHistoricoAnterior: true,
      requerConfirmacaoManual: true,
      observacaoRegraNegocio:
        "Carrega entregas RGF do extrato_entregas para dw.fato_siconfi_extrato_entregas. Pré-requisito de mart_siconfi_rgf.",
    },
    execucaoManual: {
      permiteExecucaoManual: true,
      permiteFullManual: true,
      permiteIncrementalManual: false,
      labelBotao: "Recarregar",
      mensagemConfirmacao:
        "Esta ação irá recarregar os dados RGF de todos os municípios do Acre a partir da API pública do SICONFI. A carga pode levar vários minutos. Deseja continuar?",
    },
  },
  mart_siconfi_rgf: {
    nomeExibicao: "RGF (SICONFI)",
    periodicidade: "diaria",
    toleranciaDias: 1,
    ativoPainel: true,
    dependeDe: "siconfi_rgf_full",
    execucao: {
      tipoCargaPadrao: "full",
      modoCargaPadrao: "full_delete_insert",
      escopoCarga: "tudo",
      preservaHistoricoAnterior: true,
      requerConfirmacaoManual: true,
      observacaoRegraNegocio:
        "Disparado automaticamente após siconfi_rgf_full (via carga-siconfi-rgf:postgres). Sem botão próprio.",
    },
    // Sem execucaoManual.
  },
  credor_preparar: {
    nomeExibicao: "Credor — Preparar candidatos",
    periodicidade: "diaria",
    toleranciaDias: 1,
    ativoPainel: true,
    descricaoPeriodicidade:
      "Extrai documentos distintos de fato_empenho para dw.dim_credor_enriquecido. Primeira etapa da cadeia de enriquecimento.",
    execucao: {
      tipoCargaPadrao: "incremental",
      modoCargaPadrao: "incremental_upsert",
      escopoCarga: "tudo",
      preservaHistoricoAnterior: false,
      requerConfirmacaoManual: true,
      observacaoRegraNegocio:
        "Primeira etapa da cadeia de enriquecimento de credores. Idempotente.",
    },
    execucaoManual: {
      permiteExecucaoManual: true,
      permiteFullManual: false,
      permiteIncrementalManual: true,
      labelBotao: "Recarregar",
      mensagemConfirmacao:
        "Esta ação irá extrair os documentos distintos da tabela fato_empenho. Deseja continuar?",
    },
  },
  credor_enriquecer_interno: {
    nomeExibicao: "Credor — Enriquecer (fontes internas)",
    periodicidade: "diaria",
    toleranciaDias: 1,
    ativoPainel: true,
    dependeDe: "credor_preparar",
    execucao: {
      tipoCargaPadrao: "incremental",
      modoCargaPadrao: "incremental_update",
      escopoCarga: "tudo",
      preservaHistoricoAnterior: true,
      requerConfirmacaoManual: true,
      observacaoRegraNegocio:
        "Disparado automaticamente após credor_preparar (via credor:enriquecimento). Sem botão próprio.",
    },
    // Sem execucaoManual.
  },
  credor_enriquecer_cnpj: {
    nomeExibicao: "Credor — Enriquecer (API CNPJ)",
    periodicidade: "diaria",
    toleranciaDias: 1,
    ativoPainel: true,
    dependeDe: "credor_enriquecer_interno",
    execucao: {
      tipoCargaPadrao: "incremental",
      modoCargaPadrao: "incremental_update",
      escopoCarga: "tudo",
      preservaHistoricoAnterior: true,
      requerConfirmacaoManual: true,
      observacaoRegraNegocio:
        "Disparado automaticamente após credor_enriquecer_interno (via credor:enriquecimento). Sem botão próprio.",
    },
    // Sem execucaoManual.
  },
  mart_credor_despesa: {
    nomeExibicao: "Mart Credores (despesa)",
    periodicidade: "diaria",
    toleranciaDias: 1,
    ativoPainel: true,
    dependeDe: "credor_enriquecer_cnpj",
    execucao: {
      tipoCargaPadrao: "full",
      modoCargaPadrao: "full_truncate_insert",
      escopoCarga: "tudo",
      preservaHistoricoAnterior: true,
      requerConfirmacaoManual: true,
      observacaoRegraNegocio:
        "Disparado automaticamente após a cadeia credor_* (via credor:enriquecimento). Sem botão próprio.",
    },
    // Sem execucaoManual.
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
