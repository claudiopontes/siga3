import LogoutButton from "@/components/auth/LogoutButton";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { Database, KeyRound, Mail, ShieldCheck, UserRound } from "lucide-react";
import { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Perfil | Varadouro Digital",
  description: "Perfil do usuário — Varadouro Digital TCE-AC",
};

export const dynamic = "force-dynamic";

function formatProfile(profile?: string) {
  if (!profile) {
    return "Usuário";
  }

  return profile
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getInitials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return "VD";
  }

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export default async function Profile() {
  const cookieStore = await cookies();
  const session = await verifySessionToken(cookieStore.get(AUTH_COOKIE_NAME)?.value);

  if (!session) {
    redirect("/signin");
  }

  const displayName = session.displayName ?? session.username;
  const email = session.email ?? "Não informado";
  const profile = formatProfile(session.profile);
  const authTable = process.env.AUTH_USERS_TABLE || "usuarios_autorizados";

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-brand-100 bg-brand-50 text-xl font-semibold text-brand-700 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-300">
              {getInitials(displayName)}
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                Perfil autenticado
              </p>
              <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
                {displayName}
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {session.username} | {profile}
              </p>
            </div>
          </div>
          <LogoutButton className="w-full sm:w-auto" />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6 xl:col-span-2">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300">
              <UserRound className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                Dados do usuário
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Informações usadas pelo Varadouro Digital após o login de rede.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InfoItem label="Nome" value={displayName} icon={<UserRound className="h-4 w-4" />} />
            <InfoItem label="Usuário AD" value={session.username} icon={<KeyRound className="h-4 w-4" />} />
            <InfoItem label="E-mail" value={email} icon={<Mail className="h-4 w-4" />} />
            <InfoItem label="Perfil" value={profile} icon={<ShieldCheck className="h-4 w-4" />} />
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                Autorização
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Controle mantido no Supabase.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <InfoItem label="Fonte" value="Supabase" />
            <InfoItem label="Tabela" value={authTable} />
            <InfoItem label="Status" value="Acesso ativo" />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Modelo de acesso
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
              O Active Directory valida a identidade com usuário e senha de rede. A autorização
              e o perfil de acesso ficam separados na tabela de usuários do Supabase.
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 dark:border-gray-800 dark:text-gray-300">
            AD + Supabase
          </div>
        </div>
      </section>
    </div>
  );
}

function InfoItem({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-white/[0.02]">
      <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {icon}
        {label}
      </div>
      <p className="break-words text-sm font-semibold text-gray-800 dark:text-white/90">
        {value}
      </p>
    </div>
  );
}
