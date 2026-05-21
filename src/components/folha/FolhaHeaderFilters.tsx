"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fmtCompetencia } from "./folhaUtils";

type Competencia = { competencia: string; ano: number; mes: number };
type Entidade = {
  id_entidade_cjur: number;
  entidade_nome: string;
  ente_nome: string | null;
  entidade_poder: string | null;
};

const PODERES = [
  { value: "all", label: "Todos os poderes" },
  { value: "EXECUTIVO", label: "Executivo" },
  { value: "LEGISLATIVO", label: "Legislativo" },
  { value: "JUDICIARIO", label: "Judiciário" },
  { value: "MINISTERIO_PUBLICO", label: "Ministério Público" },
  { value: "TRIBUNAL_DE_CONTAS", label: "Tribunal de Contas" },
];

export default function FolhaHeaderFilters() {
  const router = useRouter();
  const sp = useSearchParams();
  const competencia = sp.get("competencia");
  const entidade = sp.get("entidade") ?? "all";
  const poder = sp.get("poder") ?? "all";

  const [competencias, setCompetencias] = useState<Competencia[]>([]);
  const [entidades, setEntidades] = useState<Entidade[]>([]);

  useEffect(() => {
    fetch("/api/folha/competencias")
      .then((r) => r.json())
      .then((data: Competencia[]) => {
        if (!Array.isArray(data)) return;
        setCompetencias(data);
        if (!competencia && data.length > 0) {
          atualizar({ competencia: data[0].competencia });
        }
      })
      .catch(() => void 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!competencia) return;
    fetch(`/api/folha/entidades?competencia=${encodeURIComponent(competencia)}`)
      .then((r) => r.json())
      .then((data: Entidade[]) => Array.isArray(data) && setEntidades(data))
      .catch(() => void 0);
  }, [competencia]);

  function atualizar(patch: Record<string, string | null>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "all" || v === "") params.delete(k);
      else params.set(k, v);
    }
    router.replace(`?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex flex-col">
        <label className="text-xs text-gray-500 dark:text-gray-400">Competência</label>
        <select
          className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          value={competencia ?? ""}
          onChange={(e) => atualizar({ competencia: e.target.value })}
        >
          {competencias.length === 0 && <option value="">— sem dados —</option>}
          {competencias.map((c) => (
            <option key={c.competencia} value={c.competencia}>
              {fmtCompetencia(c.competencia)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col">
        <label className="text-xs text-gray-500 dark:text-gray-400">Poder</label>
        <select
          className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          value={poder}
          onChange={(e) => atualizar({ poder: e.target.value, entidade: "all" })}
        >
          {PODERES.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col flex-1 min-w-[240px]">
        <label className="text-xs text-gray-500 dark:text-gray-400">Entidade</label>
        <select
          className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          value={entidade}
          onChange={(e) => atualizar({ entidade: e.target.value })}
        >
          <option value="all">Todas as entidades</option>
          {entidades
            .filter((e) => poder === "all" || e.entidade_poder === poder)
            .map((e) => (
              <option key={e.id_entidade_cjur} value={String(e.id_entidade_cjur)}>
                {e.entidade_nome}{e.ente_nome ? ` — ${e.ente_nome}` : ""}
              </option>
            ))}
        </select>
      </div>
    </div>
  );
}
