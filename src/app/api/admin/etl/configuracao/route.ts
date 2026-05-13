import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/access-control";
import { dbQuery, getDb } from "@/lib/db";
import { hasEtlJobCommand } from "@/lib/etl-job-commands";

export const runtime = "nodejs";

const PERIODICIDADES_VALIDAS = ["diaria", "semanal", "mensal", "bimestral", "anual", "variavel"];
const TIPOS_CARGA_VALIDOS = ["full", "incremental", "incremental_com_janela", "manual", "nao_aplicavel"];
const ESCOPOS_VALIDOS = ["exercicio_corrente", "competencia", "periodo", "janela", "tudo", "variavel"];

interface ConfigRow {
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

function mapRow(row: ConfigRow) {
  return {
    execucaoManualImplementada: hasEtlJobCommand(row.modulo),
    modulo: row.modulo,
    nomeExibicao: row.nome_exibicao,
    periodicidade: row.periodicidade,
    toleranciaDias: row.tolerancia_dias,
    ativoPainel: row.ativo_painel,
    descricao: row.descricao,
    ordemExibicao: row.ordem_exibicao,
    execucao: {
      tipoCargaPadrao: row.tipo_carga_padrao,
      modoCargaPadrao: row.modo_carga_padrao,
      escopoCarga: row.escopo_carga,
      campoReferencia: row.campo_referencia,
      janelaReprocessamentoDias: row.janela_reprocessamento_dias,
      preservaHistorico: row.preserva_historico,
      requerConfirmacaoManual: row.requer_confirmacao_manual,
      permiteExecucaoManual: row.permite_execucao_manual,
      permiteFullManual: row.permite_full_manual,
      permiteIncrementalManual: row.permite_incremental_manual,
      labelBotao: row.label_botao,
      mensagemConfirmacao: row.mensagem_confirmacao,
      parametrosObrigatorios: row.parametros_obrigatorios,
      observacaoRegraNegocio: row.observacao_regra_negocio,
    },
  };
}

const SELECT_SQL = `
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
`;

export async function GET() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Acesso restrito a administradores." }, { status: 403 });
  }

  const rows = await dbQuery<ConfigRow>(
    SELECT_SQL + " ORDER BY m.ordem_exibicao NULLS LAST, m.modulo"
  );

  return NextResponse.json(rows.map(mapRow));
}

export async function PATCH(request: NextRequest) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Acesso restrito a administradores." }, { status: 403 });
  }

  const body = (await request.json()) as {
    modulo?: string;
    monitoramento?: {
      nomeExibicao?: string;
      periodicidade?: string;
      toleranciaDias?: number;
      ativoPainel?: boolean;
      descricao?: string | null;
      ordemExibicao?: number | null;
    };
    execucao?: {
      tipoCargaPadrao?: string;
      modoCargaPadrao?: string;
      escopoCarga?: string;
      campoReferencia?: string | null;
      janelaReprocessamentoDias?: number | null;
      preservaHistorico?: boolean;
      requerConfirmacaoManual?: boolean;
      permiteExecucaoManual?: boolean;
      permiteFullManual?: boolean;
      permiteIncrementalManual?: boolean;
      labelBotao?: string | null;
      mensagemConfirmacao?: string | null;
      parametrosObrigatorios?: string[] | null;
      observacaoRegraNegocio?: string | null;
    };
  };

  if (!body.modulo) {
    return NextResponse.json({ message: "O campo 'modulo' é obrigatório." }, { status: 400 });
  }

  const { monitoramento, execucao } = body;

  // Validações de monitoramento
  if (monitoramento?.periodicidade !== undefined) {
    if (!PERIODICIDADES_VALIDAS.includes(monitoramento.periodicidade)) {
      return NextResponse.json(
        { message: `Periodicidade inválida. Valores aceitos: ${PERIODICIDADES_VALIDAS.join(", ")}.` },
        { status: 400 }
      );
    }
  }
  if (monitoramento?.toleranciaDias !== undefined) {
    if (!Number.isInteger(monitoramento.toleranciaDias) || monitoramento.toleranciaDias < 0) {
      return NextResponse.json(
        { message: "toleranciaDias deve ser um inteiro >= 0." },
        { status: 400 }
      );
    }
  }

  // Validações de execução
  if (execucao?.tipoCargaPadrao !== undefined) {
    if (!TIPOS_CARGA_VALIDOS.includes(execucao.tipoCargaPadrao)) {
      return NextResponse.json(
        { message: `tipoCargaPadrao inválido. Valores aceitos: ${TIPOS_CARGA_VALIDOS.join(", ")}.` },
        { status: 400 }
      );
    }
  }
  if (execucao?.escopoCarga !== undefined) {
    if (!ESCOPOS_VALIDOS.includes(execucao.escopoCarga)) {
      return NextResponse.json(
        { message: `escopoCarga inválido. Valores aceitos: ${ESCOPOS_VALIDOS.join(", ")}.` },
        { status: 400 }
      );
    }
  }
  if (
    execucao?.permiteExecucaoManual === true &&
    execucao?.requerConfirmacaoManual === true &&
    !execucao?.mensagemConfirmacao
  ) {
    return NextResponse.json(
      { message: "mensagemConfirmacao é obrigatória quando requerConfirmacaoManual = true e permiteExecucaoManual = true." },
      { status: 400 }
    );
  }

  const client = await getDb().connect();
  try {
    await client.query("BEGIN");

    // Verifica que o módulo existe
    const existe = await client.query<{ modulo: string }>(
      "SELECT modulo FROM audit.etl_monitoramento_config WHERE modulo = $1",
      [body.modulo]
    );
    if (!existe.rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json({ message: `Módulo '${body.modulo}' não encontrado.` }, { status: 404 });
    }

    // Atualiza etl_monitoramento_config
    if (monitoramento && Object.keys(monitoramento).length > 0) {
      const setClauses: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      const add = (col: string, val: unknown) => {
        setClauses.push(`${col} = $${idx++}`);
        params.push(val);
      };

      if (monitoramento.nomeExibicao !== undefined) add("nome_exibicao", monitoramento.nomeExibicao);
      if (monitoramento.periodicidade !== undefined) add("periodicidade", monitoramento.periodicidade);
      if (monitoramento.toleranciaDias !== undefined) add("tolerancia_dias", monitoramento.toleranciaDias);
      if (monitoramento.ativoPainel !== undefined) add("ativo_painel", monitoramento.ativoPainel);
      if (monitoramento.descricao !== undefined) add("descricao", monitoramento.descricao);
      if (monitoramento.ordemExibicao !== undefined) add("ordem_exibicao", monitoramento.ordemExibicao);

      if (setClauses.length > 0) {
        params.push(body.modulo);
        await client.query(
          `UPDATE audit.etl_monitoramento_config SET ${setClauses.join(", ")} WHERE modulo = $${idx}`,
          params
        );
      }
    }

    // UPSERT em etl_execucao_config
    if (execucao && Object.keys(execucao).length > 0) {
      const cols: string[] = ["modulo"];
      const vals: unknown[] = [body.modulo];
      const updates: string[] = [];
      let idx = 2;

      const add = (col: string, val: unknown) => {
        cols.push(col);
        vals.push(val);
        updates.push(`${col} = EXCLUDED.${col}`);
        idx++;
      };

      if (execucao.tipoCargaPadrao !== undefined) add("tipo_carga_padrao", execucao.tipoCargaPadrao);
      if (execucao.modoCargaPadrao !== undefined) add("modo_carga_padrao", execucao.modoCargaPadrao);
      if (execucao.escopoCarga !== undefined) add("escopo_carga", execucao.escopoCarga);
      if (execucao.campoReferencia !== undefined) add("campo_referencia", execucao.campoReferencia);
      if (execucao.janelaReprocessamentoDias !== undefined) add("janela_reprocessamento_dias", execucao.janelaReprocessamentoDias);
      if (execucao.preservaHistorico !== undefined) add("preserva_historico", execucao.preservaHistorico);
      if (execucao.requerConfirmacaoManual !== undefined) add("requer_confirmacao_manual", execucao.requerConfirmacaoManual);
      if (execucao.permiteExecucaoManual !== undefined) add("permite_execucao_manual", execucao.permiteExecucaoManual);
      if (execucao.permiteFullManual !== undefined) add("permite_full_manual", execucao.permiteFullManual);
      if (execucao.permiteIncrementalManual !== undefined) add("permite_incremental_manual", execucao.permiteIncrementalManual);
      if (execucao.labelBotao !== undefined) add("label_botao", execucao.labelBotao);
      if (execucao.mensagemConfirmacao !== undefined) add("mensagem_confirmacao", execucao.mensagemConfirmacao);
      if (execucao.parametrosObrigatorios !== undefined) add("parametros_obrigatorios", execucao.parametrosObrigatorios);
      if (execucao.observacaoRegraNegocio !== undefined) add("observacao_regra_negocio", execucao.observacaoRegraNegocio);

      if (cols.length > 1) {
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
        await client.query(
          `INSERT INTO audit.etl_execucao_config (${cols.join(", ")})
           VALUES (${placeholders})
           ON CONFLICT (modulo) DO UPDATE SET ${updates.join(", ")}`,
          vals
        );
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[etl/configuracao PATCH] Erro na transação:", err);
    return NextResponse.json({ message: "Erro interno ao salvar configuração." }, { status: 500 });
  } finally {
    client.release();
  }

  // Retorna o item atualizado
  const rows = await dbQuery<ConfigRow>(
    SELECT_SQL + " WHERE m.modulo = $1",
    [body.modulo]
  );

  return NextResponse.json(mapRow(rows[0]));
}
