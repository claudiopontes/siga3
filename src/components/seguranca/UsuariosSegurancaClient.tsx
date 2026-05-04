"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ShieldCheck, UserPlus } from "lucide-react";

type SecurityUser = {
  id: string;
  usuario_ad: string;
  nome: string | null;
  email: string | null;
  perfil: string;
  ativo: boolean;
  criado_em?: string;
  atualizado_em?: string;
};

const profileOptions = [
  { value: "admin", label: "Administrador" },
  { value: "usuario", label: "Usuário" },
  { value: "gestor", label: "Gestor" },
];

const emptyForm = {
  usuarioAd: "",
  nome: "",
  email: "",
  perfil: "usuario",
  ativo: true,
};

function formatProfile(profile: string) {
  return profileOptions.find((option) => option.value === profile)?.label ?? profile;
}

export default function UsuariosSegurancaClient() {
  const [users, setUsers] = useState<SecurityUser[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const editingUser = useMemo(
    () => users.find((user) => user.id === editingId) ?? null,
    [editingId, users],
  );

  async function loadUsers() {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/seguranca/usuarios");
      const data = (await response.json()) as { users?: SecurityUser[]; message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? "Não foi possível carregar usuários.");
      }

      setUsers(data.users ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar usuários.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  function startEdit(user: SecurityUser) {
    setEditingId(user.id);
    setForm({
      usuarioAd: user.usuario_ad,
      nome: user.nome ?? "",
      email: user.email ?? "",
      perfil: user.perfil,
      ativo: user.ativo,
    });
    setMessage("");
    setError("");
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
    setMessage("");
    setError("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/seguranca/usuarios", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId ?? undefined,
          ...form,
        }),
      });
      const data = (await response.json()) as { user?: SecurityUser; message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? "Não foi possível salvar usuário.");
      }

      setMessage(editingId ? "Usuário atualizado com sucesso." : "Usuário cadastrado com sucesso.");
      setForm(emptyForm);
      setEditingId(null);
      await loadUsers();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar usuário.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-brand-600 dark:text-brand-300">
              <ShieldCheck className="h-4 w-4" />
              Área de segurança
            </div>
            <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
              Usuários e perfis
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Cadastre quem pode acessar o Varadouro Digital após autenticação no AD.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-3">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Usuário AD
            </label>
            <input
              value={form.usuarioAd}
              onChange={(event) => setForm((current) => ({ ...current, usuarioAd: event.target.value }))}
              disabled={Boolean(editingId)}
              placeholder="nome.sobrenome"
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-800"
            />
          </div>
          <div className="lg:col-span-3">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Nome
            </label>
            <input
              value={form.nome}
              onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))}
              placeholder="Nome completo"
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </div>
          <div className="lg:col-span-3">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              E-mail
            </label>
            <input
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              placeholder="usuario@tceac.tc.br"
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </div>
          <div className="lg:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Perfil
            </label>
            <select
              value={form.perfil}
              onChange={(event) => setForm((current) => ({ ...current, perfil: event.target.value }))}
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            >
              {profileOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-3 lg:col-span-1">
            <label className="flex h-11 items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(event) => setForm((current) => ({ ...current, ativo: event.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-brand-500"
              />
              Ativo
            </label>
          </div>
          <div className="flex flex-col gap-3 lg:col-span-12 lg:flex-row lg:items-center">
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <UserPlus className="h-4 w-4" />
              {isSaving ? "Salvando..." : editingId ? "Salvar alterações" : "Adicionar usuário"}
            </button>
            {editingUser && (
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex h-11 items-center justify-center rounded-lg border border-gray-300 bg-white px-5 text-sm font-medium text-gray-700 shadow-theme-xs transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              >
                Cancelar edição
              </button>
            )}
            {message && <p className="text-sm font-medium text-success-600 dark:text-success-400">{message}</p>}
            {error && <p className="text-sm font-medium text-error-600 dark:text-error-400">{error}</p>}
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Usuários autorizados
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-white/[0.02]">
              <tr>
                {["Usuário AD", "Nome", "E-mail", "Perfil", "Status", ""].map((header) => (
                  <th key={header} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {isLoading ? (
                <tr>
                  <td className="px-5 py-6 text-sm text-gray-500 dark:text-gray-400" colSpan={6}>
                    Carregando usuários...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td className="px-5 py-6 text-sm text-gray-500 dark:text-gray-400" colSpan={6}>
                    Nenhum usuário autorizado cadastrado.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-5 py-4 text-sm font-semibold text-gray-800 dark:text-white/90">
                      {user.usuario_ad}
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                      {user.nome ?? "-"}
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                      {user.email ?? "-"}
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
                      {formatProfile(user.perfil)}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${user.ativo ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-300" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}`}>
                        {user.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => startEdit(user)}
                        className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-300"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
