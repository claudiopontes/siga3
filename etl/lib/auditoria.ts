import { pgQuery } from "../connectors/postgres";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type StatusCarga = "sucesso" | "erro" | "ok";
export type StatusLog = "sucesso" | "erro" | "ok" | "aviso";

// ---------------------------------------------------------------------------
// iniciarCargaEtl
// ---------------------------------------------------------------------------

export async function iniciarCargaEtl(params: {
  modulo: string;
  modoCarga: string;
  origem?: string | null;
  destino?: string | null;
  mensagem?: string | null;
}): Promise<number> {
  const { modulo, modoCarga, origem = null, destino = null, mensagem = null } = params;
  try {
    const rows = await pgQuery<{ id_carga: number }>(
      `INSERT INTO audit.etl_carga
         (modulo, origem, destino, modo_carga, status, mensagem, iniciado_em)
       VALUES ($1, $2, $3, $4, 'executando', $5, now())
       RETURNING id_carga`,
      [modulo, origem, destino, modoCarga, mensagem],
    );
    return rows[0].id_carga;
  } catch (err) {
    console.warn(`[auditoria] Falha ao iniciar registro de carga para "${modulo}":`, err);
    return -1;
  }
}

// ---------------------------------------------------------------------------
// finalizarCargaEtl
// ---------------------------------------------------------------------------

export async function finalizarCargaEtl(params: {
  idCarga: number;
  status: StatusCarga;
  registrosLidos?: number;
  registrosGravados?: number;
  mensagem?: string | null;
}): Promise<void> {
  const {
    idCarga,
    status,
    registrosLidos = 0,
    registrosGravados = 0,
    mensagem = null,
  } = params;
  if (idCarga < 0) return;
  try {
    await pgQuery(
      `UPDATE audit.etl_carga
       SET status = $1, registros_lidos = $2, registros_gravados = $3,
           finalizado_em = now(), mensagem = $4
       WHERE id_carga = $5`,
      [status, registrosLidos, registrosGravados, mensagem, idCarga],
    );
  } catch (err) {
    console.warn(`[auditoria] Falha ao finalizar registro de carga id=${idCarga}:`, err);
  }
}

// ---------------------------------------------------------------------------
// registrarLogEtl
// ---------------------------------------------------------------------------

export async function registrarLogEtl(params: {
  modulo: string;
  status: StatusLog;
  registros?: number;
  duracaoMs?: number | null;
  mensagem?: string | null;
}): Promise<void> {
  const { modulo, status, registros = 0, duracaoMs = null, mensagem = null } = params;
  try {
    await pgQuery(
      `INSERT INTO audit.etl_log (modulo, status, registros, duracao_ms, mensagem)
       VALUES ($1, $2, $3, $4, $5)`,
      [modulo, status, registros, duracaoMs, mensagem],
    );
  } catch (err) {
    console.warn(`[auditoria] Falha ao gravar etl_log para "${modulo}":`, err);
  }
}

// ---------------------------------------------------------------------------
// executarMartComAuditoria
// Wrapper para jobs refresh-mart-*: garante que toda execução (sucesso ou erro)
// deixe rastro estruturado em audit.etl_carga e audit.etl_log, sem repetir o
// boilerplate de iniciarCarga/try/finalizar em cada job.
// ---------------------------------------------------------------------------

export interface MartAuditoriaParams {
  modulo: string;
  origem: string;
  destino: string;
  /** default: "full_truncate_insert" */
  modoCarga?: string;
}

export interface MartAuditoriaResultado {
  registrosLidos?: number;
  registrosGravados?: number;
  mensagem?: string;
}

export async function executarMartComAuditoria(
  params: MartAuditoriaParams,
  fn: () => Promise<MartAuditoriaResultado | void>,
): Promise<void> {
  const { modulo, origem, destino } = params;
  const modoCarga = params.modoCarga ?? "full_truncate_insert";
  const inicio = Date.now();

  const idCarga = await iniciarCargaEtl({ modulo, modoCarga, origem, destino });

  try {
    const out = (await fn()) ?? {};
    const duracaoMs = Date.now() - inicio;
    const mensagem = out.mensagem ?? "Refresh concluído";
    await registrarLogEtl({
      modulo,
      status: "ok",
      registros: out.registrosGravados ?? 0,
      duracaoMs,
      mensagem,
    });
    await finalizarCargaEtl({
      idCarga,
      status: "ok",
      registrosLidos: out.registrosLidos ?? 0,
      registrosGravados: out.registrosGravados ?? 0,
      mensagem,
    });
  } catch (error) {
    const duracaoMs = Date.now() - inicio;
    const mensagem = error instanceof Error ? error.message : String(error);
    await registrarLogEtl({
      modulo,
      status: "erro",
      registros: 0,
      duracaoMs,
      mensagem,
    }).catch(() => void 0);
    await finalizarCargaEtl({
      idCarga,
      status: "erro",
      registrosLidos: 0,
      registrosGravados: 0,
      mensagem,
    }).catch(() => void 0);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// normalizarStatusAuditoria
// Padroniza variantes de status recebidas dos jobs legados.
// Criada para uso futuro na Fase 2B-2C+ — não altera comportamento atual.
// ---------------------------------------------------------------------------

export function normalizarStatusAuditoria(raw: string): StatusCarga {
  switch (raw.toLowerCase().trim()) {
    case "ok":
    case "sucesso":
    case "success":
      return "sucesso";
    case "erro":
    case "error":
      return "erro";
    default:
      return "ok";
  }
}
