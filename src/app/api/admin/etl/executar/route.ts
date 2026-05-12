import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/access-control";
import { dbQuery } from "@/lib/db";
import { ETL_CONFIG, type TipoCarga } from "@/lib/etl-config";

export const runtime = "nodejs";

interface PayloadExecutar {
  modulo?: unknown;
  tipoSolicitado?: unknown;
  confirmado?: unknown;
}

const TIPOS_SUPORTADOS: TipoCarga[] = ["full", "incremental", "incremental_com_janela"];

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

  // 1. Validar presença de modulo
  const modulo = typeof body.modulo === "string" ? body.modulo.trim() : "";
  if (!modulo) {
    return NextResponse.json({ message: "Campo 'modulo' é obrigatório." }, { status: 400 });
  }

  // 2. Validar se módulo existe na configuração
  const config = ETL_CONFIG[modulo];
  if (!config) {
    return NextResponse.json(
      { message: `Módulo '${modulo}' não encontrado na configuração ETL.` },
      { status: 404 },
    );
  }

  // 3. Validar se bloco execucao existe
  if (!config.execucao) {
    return NextResponse.json(
      { message: "Este módulo ainda não possui configuração de execução." },
      { status: 400 },
    );
  }

  // 4. Validar permissão de execução manual
  if (!config.execucaoManual?.permiteExecucaoManual) {
    return NextResponse.json(
      { message: "Execução manual não permitida para este módulo." },
      { status: 403 },
    );
  }

  // 5. Definir tipoEfetivo
  const tipoEfetivo: TipoCarga =
    typeof body.tipoSolicitado === "string" && body.tipoSolicitado.trim()
      ? (body.tipoSolicitado.trim() as TipoCarga)
      : config.execucao.tipoCargaPadrao;

  // 6. Validar tipoEfetivo contra permissões declaradas
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

  // 7. Validar confirmação quando exigida
  if (config.execucao.requerConfirmacaoManual && body.confirmado !== true) {
    return NextResponse.json(
      {
        message: "Confirmação manual obrigatória. Envie { confirmado: true } para prosseguir.",
        mensagemConfirmacao: config.execucaoManual.mensagemConfirmacao ?? null,
      },
      { status: 400 },
    );
  }

  // 8. Verificar concorrência em audit.etl_carga
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

  // 9. Solicitação validada — despacho real será implementado na próxima etapa
  return NextResponse.json(
    {
      ok: true,
      status: "validado",
      modulo,
      tipoEfetivo,
      modoCarga: config.execucao.modoCargaPadrao,
      escopoCarga: config.execucao.escopoCarga,
      mensagem: "Solicitação validada. O despacho da execução será implementado na próxima etapa.",
    },
    { status: 202 },
  );
}
