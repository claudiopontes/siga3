export type EtlTarget = "postgres" | "supabase";

export function getEtlTarget(): EtlTarget {
  const v = (process.env.ETL_TARGET ?? "postgres").toLowerCase().trim();
  if (v === "supabase") return "supabase";
  return "postgres";
}

export function isPostgresTarget(): boolean {
  return getEtlTarget() === "postgres";
}

export function isSupabaseTarget(): boolean {
  return getEtlTarget() === "supabase";
}
