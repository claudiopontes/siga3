import UsuariosSegurancaClient from "@/components/seguranca/UsuariosSegurancaClient";
import { isAdminProfile, getCurrentSession } from "@/lib/auth/access-control";
import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Segurança | Usuários e perfis",
  description: "Cadastro de usuários autorizados do Varadouro Digital",
};

export const dynamic = "force-dynamic";

export default async function UsuariosSegurancaPage() {
  const session = await getCurrentSession();

  if (!session) {
    redirect("/signin");
  }

  if (!isAdminProfile(session.profile)) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
        <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">
          Acesso restrito
        </h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Apenas usuários com perfil administrador podem gerenciar usuários e perfis.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
        >
          Voltar ao painel
        </Link>
      </div>
    );
  }

  return <UsuariosSegurancaClient />;
}
