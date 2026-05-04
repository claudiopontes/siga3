import { getAdminSupabase } from "@/lib/supabase-admin";

export type AuthorizedUser = {
  username: string;
  displayName?: string;
  email?: string;
  profile: string;
};

type AuthorizationRow = {
  usuario_ad: string;
  nome: string | null;
  email: string | null;
  perfil: string | null;
  ativo: boolean | null;
};

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export async function getAuthorizedUser(username: string) {
  const table = process.env.AUTH_USERS_TABLE || "usuarios_autorizados";
  const normalizedUsername = normalizeUsername(username);
  const { data, error } = await getAdminSupabase()
    .from(table)
    .select("usuario_ad,nome,email,perfil,ativo")
    .eq("usuario_ad", normalizedUsername)
    .eq("ativo", true)
    .maybeSingle<AuthorizationRow>();

  if (error) {
    throw new Error(`Falha ao consultar autorização no Supabase: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    username: data.usuario_ad,
    displayName: data.nome ?? undefined,
    email: data.email ?? undefined,
    profile: data.perfil ?? "usuario",
  } satisfies AuthorizedUser;
}
