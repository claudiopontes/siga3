import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const [ultima, controles] = await Promise.all([
      dbQuery<{ ano_mes: string; data_carga: string; fonte: string }>(`
        SELECT ano_mes, data_carga, fonte
        FROM social.cadunico_municipio_mensal
        ORDER BY ano_mes DESC, data_carga DESC
        LIMIT 1
      `),
      dbQuery<{ status: string; total: number }>(`
        SELECT status, COUNT(*)::integer AS total
        FROM social.cadunico_controle_carga
        WHERE iniciado_em >= now() - INTERVAL '30 days'
        GROUP BY status
        ORDER BY status
      `),
    ]);

    return NextResponse.json({
      ultima_competencia: ultima[0] ?? null,
      execucoes_30d: controles,
    });
  } catch (err) {
    console.error("[api/social/cadunico/status-carga]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
