import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/access-control";
import { dbQuery } from "@/lib/db";

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

export async function GET() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Acesso restrito a administradores." }, { status: 403 });
  }

  const [logs, cargas] = await Promise.all([
    // Última execução por módulo (audit.etl_log)
    dbQuery<UltimaExecucao>(`
      SELECT DISTINCT ON (modulo)
        modulo, status, registros, duracao_ms, mensagem,
        criado_em AS executado_em
      FROM audit.etl_log
      ORDER BY modulo, criado_em DESC
    `),

    // Última carga por módulo (audit.etl_carga)
    dbQuery<UltimaCarga>(`
      SELECT DISTINCT ON (modulo)
        modulo, status, registros_lidos, registros_gravados,
        iniciado_em, finalizado_em, mensagem
      FROM audit.etl_carga
      ORDER BY modulo, iniciado_em DESC
    `).catch(() => [] as UltimaCarga[]),
  ]);

  // Indexa cargas por módulo para merge
  const cargasPorModulo = Object.fromEntries(
    cargas.map((c) => [c.modulo, c])
  );

  const resultado = logs.map((log) => ({
    modulo: log.modulo,
    status: log.status,
    registros: log.registros,
    duracao_ms: log.duracao_ms,
    mensagem: log.mensagem,
    executado_em: log.executado_em,
    carga: cargasPorModulo[log.modulo] ?? null,
  }));

  return NextResponse.json(resultado);
}
