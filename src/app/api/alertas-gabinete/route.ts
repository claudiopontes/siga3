import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

const GABINETE_ATUAL_ID = 20;

export async function GET() {
  let alertas: unknown[] = [];
  let resumoProcessos: unknown | null = null;
  let alertasProcessos: unknown[] = [];

  try {
    alertas = await dbQuery(
      `SELECT codigo_ibge, nome_ente, total_pendencias, nivel_alerta
       FROM public.vw_alertas_cauc_ac
       ORDER BY total_pendencias DESC`
    );
  } catch {
    alertas = [];
  }

  try {
    const rows = await dbQuery(
      `SELECT id_grupo, grupo_atual, total_processos, processos_mais_15_dias,
              processos_sensiveis, processos_prazo_regulamentar_vencido,
              maior_duracao_setor, media_dias_setor, atualizado_em
       FROM public.vw_processos_gabinete_por_gabinete
       WHERE id_grupo = $1
       LIMIT 1`,
      [GABINETE_ATUAL_ID]
    );
    resumoProcessos = rows[0] ?? null;
  } catch {
    resumoProcessos = null;
  }

  try {
    alertasProcessos = await dbQuery(
      `SELECT tipo_alerta, titulo_alerta, nivel_alerta, processo, grupo_atual,
              id_grupo, relator, classe, assunto, orgao, atividade_atual,
              duracao_setor_dias, dias_em_atraso, data_chegada_setor_atual, atualizado_em
       FROM public.vw_alertas_processos_gabinete
       WHERE id_grupo = $1`,
      [GABINETE_ATUAL_ID]
    );
  } catch {
    alertasProcessos = [];
  }

  return NextResponse.json({ alertas, resumoProcessos, alertasProcessos });
}
