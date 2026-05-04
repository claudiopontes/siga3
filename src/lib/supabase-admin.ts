import { createClient } from "@supabase/supabase-js";

function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} não configurado.`);
  }

  if (name === "SUPABASE_SERVICE_ROLE_KEY" && value.includes("COLE_AQUI")) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY ainda esta com valor placeholder.");
  }

  return value;
}

export function getAdminSupabase() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
