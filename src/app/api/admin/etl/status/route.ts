import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/access-control";
import { dbQuery } from "@/lib/db";
import { ETL_CONFIG, type EtlConfigEntry } from "@/lib/etl-config";

export const runtime = "nodejs";

interface UltimaExecucao {
  modulo: string;
  status: string;
  registros: number;
  duracao_ms: number | null;
  mensagem: string | null;
  executado_em: string;
}

interface UltimaCarga {
  modulo: string;
  status: string;
  registros_lidos: number;
  registros_gravados: number;
  iniciado_em: string;
  finalizado_em: string | null;
  mensagem: string | null;
}

interface ConfigDbRow {
  modulo: string;
  nome_exibicao: string;
  periodicidade: string;
  tolerancia_dias: number;
  ativo_painel: boolean;
  descricao: string | null;
  ordem_exibicao: number | null;
  tipo_carga_padrao: string | null;
  modo_carga_padrao: string | null;
  escopo_carga: string | null;
  campo_referencia: string | null;
  janela_reprocessamento_dias: number | null;
  preserva_historico: boolean | null;
  requer_confirmacao_manual: boolean | null;
  permite_execucao_manual: boolean | null;
  permite_full_manual: boolean | null;
  permite_incremental_manual: boolean | null;
  label_botao: string | null;
  mensagem_confirmacao: string | null;
  parametros_obrigatorios: string[] | null;
  observacao_regra_negocio: string | null;
}

interface ConfigPainelItem {
  modulo: string;
  nomeExibicao: string;
  periodicidade: string;
  toleranciaDias: number;
  ativoPainel: boolean;
  descricaoPeriodicidade?: string;
  execucao?: {
    tipoCargaPadrao: string;
    modoCargaPadrao: string;
    escopoCarga: string;
    campoReferencia?: string;
    janelaReprocessamentoDias?: number;
    preservaHistoricoAnterior: boolean;
    requerConfirmacaoManual: boolean;
    observacaoRegraNegocio?: string;
  };
  execucaoManual?: {
    permiteExecucaoManual: boolean;
    permiteFullManual: boolean;
    permiteIncrementalManual: boolean;
    labelBotao?: string;
    mensagemConfirmacao?: string;
    parametrosObrigatorios?: string[];
  };
}

function mapDbConfigToItem(row: ConfigDbRow): ConfigPainelItem {
  const hasExecucao =
    row.tipo_carga_padrao !== null ||
    row.modo_carga_padrao !== null ||
    row.escopo_carga !== null ||
    row.permite_execucao_manual !== null;

  return {
    modulo: row.modulo,
    nomeExibicao: row.nome_exibicao,
    periodicidade: row.periodicidade,
    toleranciaDias: row.tolerancia_dias,
    ativoPainel: row.ativo_painel,
    descricaoPeriodicidade: row.descricao ?? undefined,
    execucao: hasExecucao
      ? {
          tipoCargaPadrao: row.tipo_carga_padrao ?? "nao_aplicavel",
          modoCargaPadrao: row.modo_carga_padrao ?? "nao_aplicavel",
          escopoCarga: row.escopo_carga ?? "variavel",
          campoReferencia: row.campo_referencia ?? undefined,
          janelaReprocessamentoDias: row.janela_reprocessamento_dias ?? undefined,
          preservaHistoricoAnterior: row.preserva_historico ?? false,
          requerConfirmacaoManual: row.requer_confirmacao_manual ?? true,
          observacaoRegraNegocio: row.observacao_regra_negocio ?? undefined,
        }
      : undefined,
    execucaoManual: hasExecucao
      ? {
          permiteExecucaoManual: row.permite_execucao_manual ?? false,
          permiteFullManual: row.permite_full_manual ?? false,
          permiteIncrementalManual: row.permite_incremental_manual ?? false,
          labelBotao: row.label_botao ?? undefined,
          mensagemConfirmacao: row.mensagem_confirmacao ?? undefined,
          parametrosObrigatorios: row.parametros_obrigatorios ?? undefined,
        }
      : undefined,
  };
}

function mapFallbackConfig(modulo: string, config: EtlConfigEntry): ConfigPainelItem {
  return {
    modulo,
    nomeExibicao: config.nomeExibicao,
    periodicidade: config.periodicidade,
    toleranciaDias: config.toleranciaDias,
    ativoPainel: config.ativoPainel,
    descricaoPeriodicidade: config.descricaoPeriodicidade,
    execucao: config.execucao,
    execucaoManual: config.execucaoManual,
  };
}

async function carregarConfigPainel(): Promise<ConfigPainelItem[]> {
  try {
    const rows = await dbQuery<ConfigDbRow>(`
      SELECT
        m.modulo,
        m.nome_exibicao,
        m.periodicidade,
        m.tolerancia_dias,
        m.ativo_painel,
        m.descricao,
        m.ordem_exibicao,
        e.tipo_carga_padrao,
        e.modo_carga_padrao,
        e.escopo_carga,
        e.campo_referencia,
        e.janela_reprocessamento_dias,
        e.preserva_historico,
        e.requer_confirmacao_manual,
        e.permite_execucao_manual,
        e.permite_full_manual,
        e.permite_incremental_manual,
        e.label_botao,
        e.mensagem_confirmacao,
        e.parametros_obrigatorios,
        e.observacao_regra_negocio
      FROM audit.etl_monitoramento_config m
      LEFT JOIN audit.etl_execucao_config e ON e.modulo = m.modulo
      WHERE m.ativo_painel = true
      ORDER BY m.ordem_exibicao NULLS LAST, m.modulo
    `);

    if (rows.length > 0) {
      return rows.map(mapDbConfigToItem);
    }

    console.warn("[etl/status] Configuração ETL no banco vazia. Usando fallback ETL_CONFIG.");
  } catch (err) {
    console.warn("[etl/status] Falha ao carregar configuração ETL do banco. Usando fallback ETL_CONFIG.", err);
  }

  return Object.entries(ETL_CONFIG)
    .filter(([, cfg]) => cfg.ativoPainel === true)
    .map(([modulo, cfg]) => mapFallbackConfig(modulo, cfg));
}

export async function GET() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Acesso restrito a administradores." }, { status: 403 });
  }

  const [configsAtivas, logs, cargas] = await Promise.all([
    carregarConfigPainel(),
    dbQuery<UltimaExecucao>(`
      SELECT DISTINCT ON (modulo)
        modulo, status, registros, duracao_ms, mensagem,
        criado_em AS executado_em
      FROM audit.etl_log
      ORDER BY modulo, criado_em DESC
    `),
    dbQuery<UltimaCarga>(`
      SELECT DISTINCT ON (modulo)
        modulo, status, registros_lidos, registros_gravados,
        iniciado_em, finalizado_em, mensagem
      FROM audit.etl_carga
      ORDER BY modulo, iniciado_em DESC
    `).catch(() => [] as UltimaCarga[]),
  ]);

  const logsPorModulo = Object.fromEntries(logs.map((l) => [l.modulo, l]));
  const cargasPorModulo = Object.fromEntries(cargas.map((c) => [c.modulo, c]));

  const resultado = configsAtivas.map((cfg) => {
    const log = logsPorModulo[cfg.modulo] as UltimaExecucao | undefined;
    const carga = (cargasPorModulo[cfg.modulo] as UltimaCarga | undefined) ?? null;

    return {
      modulo: cfg.modulo,
      nomeExibicao: cfg.nomeExibicao,
      periodicidade: cfg.periodicidade,
      toleranciaDias: cfg.toleranciaDias,
      ativoPainel: cfg.ativoPainel,
      descricaoPeriodicidade: cfg.descricaoPeriodicidade,
      execucao: cfg.execucao,
      execucaoManual: cfg.execucaoManual,
      status: log?.status ?? carga?.status ?? "pendente",
      registros: log?.registros ?? (carga?.registros_gravados ?? 0),
      duracao_ms: log?.duracao_ms ?? null,
      mensagem: log?.mensagem ?? carga?.mensagem ?? null,
      executado_em: log?.executado_em ?? null,
      carga,
    };
  });

  return NextResponse.json(resultado);
}
