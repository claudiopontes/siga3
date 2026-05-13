import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import type { PoolClient } from "pg";
import { requireAdminSession } from "@/lib/auth/access-control";
import { dbQuery, getDb } from "@/lib/db";
import { ETL_CONFIG, type EtlConfigEntry, type TipoCarga } from "@/lib/etl-config";
import { ETL_JOB_COMMANDS } from "@/lib/etl-job-commands";

export const runtime = "nodejs";

interface PayloadExecutar {
  modulo?: unknown;
  tipoSolicitado?: unknown;
  confirmado?: unknown;
}

interface ConfigExecucaoDbRow {
  modulo: string;
  ativo_painel: boolean;
  nome_exibicao: string;
  periodicidade: string;
  tolerancia_dias: number;
  descricao: string | null;
  tipo_carga_padrao: TipoCarga | null;
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

const TIPOS_SUPORTADOS: TipoCarga[] = ["full", "incremental", "incremental_com_janela"];

function escaparArgWindows(arg: string) {
  if (!arg.includes(" ") && !arg.includes("\"")) return arg;
  return `"${arg.replace(/\"/g, '\\\"')}"`;
}

function mapDbRowToConfig(row: ConfigExecucaoDbRow): EtlConfigEntry {
  const hasExecucao = row.tipo_carga_padrao !== null && row.modo_carga_padrao !== null && row.escopo_carga !== null;

  return {
    nomeExibicao: row.nome_exibicao,
    periodicidade: row.periodicidade as EtlConfigEntry["periodicidade"],
    toleranciaDias: row.tolerancia_dias,
    ativoPainel: row.ativo_painel,
    descricaoPeriodicidade: row.descricao ?? undefined,
    execucao: hasExecucao
      ? {
          tipoCargaPadrao: row.tipo_carga_padrao as TipoCarga,
          modoCargaPadrao: row.modo_carga_padrao!,
          escopoCarga: row.escopo_carga as EtlConfigEntry["execucao"] extends infer E
            ? E extends { escopoCarga: infer S }
              ? S
              : never
            : never,
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

async function carregarConfigExecucao(modulo: string): Promise<EtlConfigEntry | null> {
  try {
    const rows = await dbQuery<ConfigExecucaoDbRow>(
      `
      SELECT
        m.modulo,
        m.ativo_painel,
        m.nome_exibicao,
        m.periodicidade,
        m.tolerancia_dias,
        m.descricao,
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
      WHERE m.modulo = $1
      LIMIT 1
      `,
      [modulo],
    );

    if (rows.length === 0) return null;
    return mapDbRowToConfig(rows[0]);
  } catch (err) {
    console.warn("[etl/executar] Falha ao carregar configuração de execução no banco. Usando fallback ETL_CONFIG.", {
      modulo,
      erro: err,
    });
    return null;
  }
}

export async function POST(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Acesso restrito a administradores." }, { status: 403 });
  }

  let body: PayloadExecutar;
  try {
    body = (await req.json()) as PayloadExecutar;
  } catch {
    return NextResponse.json({ message: "Payload inválido." }, { status: 400 });
  }

  const modulo = typeof body.modulo === "string" ? body.modulo.trim() : "";
  if (!modulo) {
    return NextResponse.json({ message: "Campo 'modulo' é obrigatório." }, { status: 400 });
  }

  const config = (await carregarConfigExecucao(modulo)) ?? ETL_CONFIG[modulo];
  if (!config) {
    return NextResponse.json(
      { message: `Módulo '${modulo}' não encontrado na configuração ETL.` },
      { status: 404 },
    );
  }

  if (!config.execucao) {
    return NextResponse.json(
      { message: "Este módulo ainda não possui configuração de execução." },
      { status: 400 },
    );
  }

  if (!config.execucaoManual?.permiteExecucaoManual) {
    return NextResponse.json(
      { message: "Execução manual não permitida para este módulo." },
      { status: 403 },
    );
  }

  const tipoEfetivo: TipoCarga =
    typeof body.tipoSolicitado === "string" && body.tipoSolicitado.trim()
      ? (body.tipoSolicitado.trim() as TipoCarga)
      : config.execucao.tipoCargaPadrao;

  if (!TIPOS_SUPORTADOS.includes(tipoEfetivo)) {
    return NextResponse.json(
      { message: `Tipo de carga '${tipoEfetivo}' não é suportado para execução manual.` },
      { status: 400 },
    );
  }
  if (tipoEfetivo === "full" && !config.execucaoManual.permiteFullManual) {
    return NextResponse.json(
      { message: "Carga full manual não é permitida para este módulo." },
      { status: 400 },
    );
  }
  if (
    (tipoEfetivo === "incremental" || tipoEfetivo === "incremental_com_janela") &&
    !config.execucaoManual.permiteIncrementalManual
  ) {
    return NextResponse.json(
      { message: "Carga incremental manual não é permitida para este módulo." },
      { status: 400 },
    );
  }

  if (config.execucao.requerConfirmacaoManual && body.confirmado !== true) {
    return NextResponse.json(
      {
        message: "Confirmação manual obrigatória. Envie { confirmado: true } para prosseguir.",
        mensagemConfirmacao: config.execucaoManual.mensagemConfirmacao ?? null,
      },
      { status: 400 },
    );
  }

  try {
    const emExecucao = await dbQuery<{ id_carga: number; iniciado_em: string }>(
      `SELECT id_carga, iniciado_em
       FROM audit.etl_carga
       WHERE modulo = $1
         AND status = 'executando'
       ORDER BY iniciado_em DESC
       LIMIT 1`,
      [modulo],
    );

    if (emExecucao.length > 0) {
      return NextResponse.json(
        {
          message: "Já existe uma execução em andamento para este módulo.",
          idCargaAtiva: emExecucao[0].id_carga,
          iniciadoEm: emExecucao[0].iniciado_em,
        },
        { status: 409 },
      );
    }
  } catch (err) {
    console.error("[etl/executar] Erro ao verificar concorrência:", err);
    return NextResponse.json(
      { message: "Erro interno ao verificar estado de execução." },
      { status: 500 },
    );
  }

  const jobCommand = ETL_JOB_COMMANDS[modulo];
  if (!jobCommand) {
    return NextResponse.json(
      { message: "Execução manual ainda não implementada para este módulo." },
      { status: 501 },
    );
  }

  const lockKey = `etl_manual:${modulo}`;
  let lockClient: PoolClient | null = null;
  let lockLiberado = false;

  const liberarLockEConexao = async (origem: string) => {
    if (!lockClient || lockLiberado) return;
    lockLiberado = true;
    try {
      await lockClient.query("SELECT pg_advisory_unlock(hashtext($1))", [lockKey]);
      console.info("[etl/executar] Advisory lock liberado.", { modulo, origem, lockKey });
    } catch (unlockErr) {
      console.error("[etl/executar] Erro ao liberar advisory lock.", {
        modulo,
        origem,
        lockKey,
        erro: unlockErr,
      });
    } finally {
      lockClient.release();
      lockClient = null;
    }
  };

  try {
    const connectedClient = await getDb().connect();
    lockClient = connectedClient;
    const lockRes = await connectedClient.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
      [lockKey],
    );

    const locked = lockRes.rows[0]?.locked === true;
    if (!locked) {
      console.info("[etl/executar] Advisory lock recusado.", { modulo, lockKey });
      connectedClient.release();
      lockClient = null;
      return NextResponse.json(
        { message: "Já existe uma solicitação de execução em andamento para este módulo." },
        { status: 409 },
      );
    }

    console.info("[etl/executar] Advisory lock obtido.", { modulo, lockKey });
  } catch (lockErr) {
    if (lockClient) {
      lockClient.release();
      lockClient = null;
    }
    console.error("[etl/executar] Erro ao obter advisory lock.", { modulo, lockKey, erro: lockErr });
    return NextResponse.json(
      { message: "Erro interno ao adquirir trava de execução." },
      { status: 500 },
    );
  }

  let child;
  try {
    child = spawn(jobCommand.command, jobCommand.args, {
      cwd: process.cwd(),
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    const isWinEinval =
      process.platform === "win32" &&
      err instanceof Error &&
      "code" in err &&
      (err as { code?: string }).code === "EINVAL";

    if (!isWinEinval) {
      console.error("[etl/executar] Falha ao iniciar processo ETL:", err);
      await liberarLockEConexao("spawn_exception");
      return NextResponse.json(
        { message: "Erro interno ao iniciar execução ETL." },
        { status: 500 },
      );
    }

    const cmdLine = [jobCommand.command, ...jobCommand.args].map(escaparArgWindows).join(" ");

    try {
      child = spawn("cmd.exe", ["/d", "/s", "/c", cmdLine], {
        cwd: process.cwd(),
        env: process.env,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      console.info("[etl/executar] Spawn com fallback cmd.exe aplicado após EINVAL.");
    } catch (fallbackErr) {
      console.error("[etl/executar] Falha ao iniciar processo ETL (fallback cmd.exe):", fallbackErr);
      await liberarLockEConexao("spawn_fallback_exception");
      return NextResponse.json(
        { message: "Erro interno ao iniciar execução ETL." },
        { status: 500 },
      );
    }
  }

  const processoIniciado = await new Promise<boolean>((resolve) => {
    let settled = false;

    child.once("spawn", () => {
      if (settled) return;
      settled = true;
      resolve(true);
    });

    child.once("error", (err: Error) => {
      if (settled) return;
      settled = true;
      console.error("[etl/executar] Erro no spawn do ETL:", err);
      resolve(false);
    });
  });

  if (!processoIniciado) {
    await liberarLockEConexao("spawn_error_event");
    return NextResponse.json(
      { message: "Erro interno ao iniciar execução ETL." },
      { status: 500 },
    );
  }

  const logPrefix = `[ETL ${modulo}]`;

  child.stdout?.on("data", (chunk: Buffer | string) => {
    const text = chunk.toString();
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) {
        console.info(`${logPrefix} ${line}`);
      }
    }
  });

  child.stderr?.on("data", (chunk: Buffer | string) => {
    const text = chunk.toString();
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) {
        console.error(`${logPrefix} ${line}`);
      }
    }
  });

  child.on("exit", (code, signal) => {
    if (code === 0) {
      console.info(`${logPrefix} processo finalizado com sucesso (code=0).`);
    } else {
      console.error(
        `${logPrefix} processo finalizado com falha (code=${code ?? "null"}, signal=${signal ?? "null"}).`,
      );
    }
    void liberarLockEConexao("child_exit");
  });

  child.on("error", (err) => {
    console.error(`${logPrefix} erro de processo filho:`, err);
    void liberarLockEConexao("child_error");
  });

  console.info("[etl/executar] Execução manual iniciada.", {
    modulo,
    tipoEfetivo,
    modoCarga: config.execucao.modoCargaPadrao,
    comando: [jobCommand.command, ...jobCommand.args].join(" "),
  });

  return NextResponse.json(
    {
      ok: true,
      status: "iniciado",
      modulo,
      tipoEfetivo,
      modoCarga: config.execucao.modoCargaPadrao,
      escopoCarga: config.execucao.escopoCarga,
      mensagem: "Execução manual iniciada. Acompanhe o status na tabela de cargas.",
    },
    { status: 202 },
  );
}
