import "dotenv/config";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { pgQuery, withPgTransaction, closePgPool } from "../connectors/postgres";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const MIGRAR_TABELAS = (process.env.MIGRAR_TABELAS ?? "dim_ente,dim_credor,fato_empenho")
  .split(",").map((t) => t.trim()).filter(Boolean);
const MIGRAR_MODO = process.env.MIGRAR_MODO ?? "truncate_insert";
const BATCH_SIZE = Number(process.env.MIGRAR_BATCH_SIZE ?? "1000");

const ALLOWLIST = ["dim_ente", "dim_credor", "fato_empenho"];

async function lerTabela(supabase: SupabaseClient, tabela: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(tabela)
      .select("*")
      .range(from, from + BATCH_SIZE - 1);
    if (error) throw new Error(`Erro ao ler ${tabela} do Supabase: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...(data as Record<string, unknown>[]));
    if (data.length < BATCH_SIZE) break;
    from += BATCH_SIZE;
  }
  return rows;
}

async function inserirTabelaTruncate(tabela: string, rows: Record<string, unknown>[]): Promise<void> {
  await withPgTransaction(async (client) => {
    await client.query(`TRUNCATE TABLE public.${tabela} CASCADE`);
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const cols = Object.keys(batch[0]);
      const colsSql = cols.map((c) => `"${c}"`).join(", ");
      const placeholders = batch.map((_, ri) =>
        `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(", ")})`
      ).join(", ");
      const values = batch.flatMap((r) => cols.map((c) => r[c]));
      await client.query(
        `INSERT INTO public.${tabela} (${colsSql}) VALUES ${placeholders}`,
        values
      );
    }
  });
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.");
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const inicio = Date.now();

  for (const tabela of MIGRAR_TABELAS) {
    if (!ALLOWLIST.includes(tabela)) {
      console.warn(`[migrar] Tabela '${tabela}' não está na allowlist. Ignorando.`);
      continue;
    }
    console.log(`[migrar] Lendo ${tabela} do Supabase...`);
    const rows = await lerTabela(supabase, tabela);
    console.log(`[migrar] ${rows.length} registros lidos de ${tabela}.`);

    if (rows.length === 0) {
      console.log(`[migrar] Nenhum dado para ${tabela}. Pulando.`);
      continue;
    }

    console.log(`[migrar] Gravando ${tabela} no PostgreSQL (modo: ${MIGRAR_MODO})...`);
    if (MIGRAR_MODO === "truncate_insert") {
      await inserirTabelaTruncate(tabela, rows);
    } else {
      throw new Error(`Modo '${MIGRAR_MODO}' não implementado ainda.`);
    }
    console.log(`[migrar] ${tabela} concluída — ${rows.length} registros.`);

    await pgQuery(
      `INSERT INTO audit.etl_log (modulo, status, mensagem, registros, duracao_ms)
       VALUES ($1, $2, $3, $4, $5)`,
      ["migrar:" + tabela, "ok", `Migração Supabase → Postgres`, rows.length, Date.now() - inicio]
    );
  }

  console.log("[migrar] Migração concluída.");
  await closePgPool();
}

main().catch((err) => {
  console.error("[migrar] Erro:", (err as Error).message);
  process.exit(1);
});
