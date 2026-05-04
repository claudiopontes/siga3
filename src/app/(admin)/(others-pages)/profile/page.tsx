import LogoutButton from "@/components/auth/LogoutButton";
import ProfilePhotoUploader from "@/components/user-profile/ProfilePhotoUploader";
import { getAuthorizedUser } from "@/lib/auth/authorization";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { KeyRound, Mail, ShieldCheck, UserRound } from "lucide-react";
import { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Perfil | Varadouro Digital",
  description: "Perfil do usuário - Varadouro Digital TCE-AC",
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

export default async function Profile() {
  const cookieStore = await cookies();
  const session = await verifySessionToken(cookieStore.get(AUTH_COOKIE_NAME)?.value);

  if (!session) {
    redirect("/signin");
  }

  const authorizedUser = await getAuthorizedUser(session.username).catch(() => null);
  const displayName = authorizedUser?.displayName ?? session.displayName ?? session.username;
  const email = authorizedUser?.email ?? session.email ?? "Não informado";
  const profile = formatProfile(authorizedUser?.profile ?? session.profile);
  const photoUrl = authorizedUser?.photoUrl ?? session.photoUrl;
  const photoPosition = authorizedUser?.photoPosition ?? session.photoPosition ?? "center center";

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <ProfilePhotoUploader
              displayName={displayName}
              initialPhotoUrl={photoUrl}
              initialPhotoPosition={photoPosition}
            />
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

      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
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
