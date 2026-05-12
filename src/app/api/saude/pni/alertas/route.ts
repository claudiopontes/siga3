import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";

const NIVEIS_VALIDOS  = new Set(["CRITICO", "ALTO", "MEDIO", "BAIXO"]);
const TIPOS_VALIDOS   = new Set([
  "pni_sem_dado_recente",
  "pni_queda_mes_anterior",
  "pni_queda_ano_anterior",
  "pni_baixa_aplicacao_relativa",
]);

export async function GET(req: NextRequest) {
  const sp        = req.nextUrl.searchParams;
  const home      = sp.get("home") === "1";
  const nivelParam = sp.get("nivel");
  const tipoParam  = sp.get("tipo_alerta");
  const municipio  = sp.get("municipio");

  const nivel      = nivelParam && NIVEIS_VALIDOS.has(nivelParam) ? nivelParam : null;
  const tipoAlerta = tipoParam  && TIPOS_VALIDOS.has(tipoParam)   ? tipoParam  : null;

  const tabela = home ? "mart.pni_alertas_home" : "mart.pni_alertas";
  const ordem  = home
    ? "ORDER BY prioridade ASC, nome_municipio ASC"
    : "ORDER BY nivel ASC, tipo_alerta ASC, nome_municipio ASC";

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (nivel) {
    params.push(nivel);
    conditions.push(`nivel = $${params.length}`);
  }
  if (tipoAlerta) {
    params.push(tipoAlerta);
    conditions.push(`tipo_alerta = $${params.length}`);
  }
  if (municipio) {
    params.push(`%${municipio}%`);
    conditions.push(`nome_municipio ILIKE $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await dbQuery(
    `SELECT * FROM ${tabela} ${where} ${ordem} LIMIT 100`,
    params
  );

  return NextResponse.json(rows);
}
