"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search } from "lucide-react";

type Servidor = {
  id_cadastro_unico_sicap: number;
  nome_servidor: string | null;
  cpf_mascarado: string | null;
  data_nascimento: string | null;
  sexo: string | null;
  entidades: string | null;
  matricula_amostra: string | null;
};

export default function PesquisaServidoresTab() {
  const sp = useSearchParams();
  const competencia = sp.get("competencia");

  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Servidor[]>([]);
  const [carregando, setCarregando] = useState(false);

  // Debounce simples
  const [qDebounced, setQDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const url = useMemo(() => {
    if (qDebounced.length < 2) return null;
    const params = new URLSearchParams({ q: qDebounced, limit: "50" });
    if (competencia) params.set("competencia", competencia);
    return `/api/folha/servidor/search?${params.toString()}`;
  }, [qDebounced, competencia]);

  useEffect(() => {
    if (!url) { setRows([]); return; }
    setCarregando(true);
    fetch(url)
      .then((r) => r.json())
      .then((d: Servidor[]) => setRows(Array.isArray(d) ? d : []))
      .catch(() => setRows([]))
      .finally(() => setCarregando(false));
  }, [url]);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-gray-500" />
          <input
            type="text"
            placeholder="Pesquisar por nome ou matrícula (mínimo 2 caracteres)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            autoFocus
          />
        </div>
        <div className="mt-1 text-xs text-gray-500">
          {competencia ? `Restrito à competência selecionada no cabeçalho.` : `Buscando em todas as competências carregadas.`}
          {" "}CPF aberto não é pesquisável — apenas hash criptográfico é mantido no banco.
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 overflow-x-auto">
        {carregando && <div className="text-xs text-gray-500">Buscando…</div>}
        {!carregando && qDebounced.length >= 2 && rows.length === 0 && (
          <div className="text-xs text-gray-500">Nenhum servidor encontrado.</div>
        )}
        {rows.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-500 dark:text-gray-400">
              <tr>
                <th className="py-1">Servidor</th>
                <th className="py-1">CPF</th>
                <th className="py-1">Matrícula</th>
                <th className="py-1">Entidades</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id_cadastro_unico_sicap} className="border-t border-gray-100 dark:border-gray-700">
                  <td className="py-1 pr-2">
                    <Link
                      href={`/painel-folha/servidor/${r.id_cadastro_unico_sicap}${competencia ? `?competencia=${competencia}` : ""}`}
                      className="text-blue-600 hover:underline dark:text-blue-300"
                    >
                      {r.nome_servidor ?? "(sem nome)"}
                    </Link>
                  </td>
                  <td className="py-1 pr-2 text-gray-700 dark:text-gray-300">{r.cpf_mascarado ?? "—"}</td>
                  <td className="py-1 pr-2 text-gray-700 dark:text-gray-300">{r.matricula_amostra ?? "—"}</td>
                  <td className="py-1 pr-2 text-gray-700 dark:text-gray-300">{r.entidades ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
