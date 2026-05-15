"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { FileText, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import type { ProcessoPautaJulgamentoView } from "./tipos";

type ColOrdenavel = "sequencia" | "numero_processo_fmt" | "objeto" | "nome_1_parte" | "relator" | "nome_orgao" | "situacao";
type Direcao = "asc" | "desc";

function cmp(a: string | number | null | undefined, b: string | number | null | undefined): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "pt-BR", { sensitivity: "base" });
}

function IconeOrdem({ col, atual, dir }: { col: ColOrdenavel; atual: ColOrdenavel | null; dir: Direcao }) {
  if (atual !== col) return <ChevronsUpDown className="h-3 w-3 opacity-40" />;
  return dir === "asc"
    ? <ChevronUp className="h-3 w-3 text-blue-600 dark:text-blue-400" />
    : <ChevronDown className="h-3 w-3 text-blue-600 dark:text-blue-400" />;
}

const TH_BASE = "select-none cursor-pointer px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors";

export default function TabelaProcessosPauta({ processos }: { processos: ProcessoPautaJulgamentoView[] }) {
  const router = useRouter();
  const [colOrdem, setColOrdem] = useState<ColOrdenavel | null>("sequencia");
  const [direcao, setDirecao] = useState<Direcao>("asc");

  function alternarOrdem(col: ColOrdenavel) {
    if (colOrdem === col) {
      setDirecao(d => d === "asc" ? "desc" : "asc");
    } else {
      setColOrdem(col);
      setDirecao("asc");
    }
  }

  const lista = useMemo(() => {
    if (!colOrdem) return processos;
    return [...processos].sort((a, b) => {
      let resultado = 0;
      switch (colOrdem) {
        case "sequencia":          resultado = cmp(a.sequencia, b.sequencia); break;
        case "numero_processo_fmt": resultado = cmp(a.numero_processo_fmt, b.numero_processo_fmt); break;
        case "objeto":             resultado = cmp(a.objeto, b.objeto); break;
        case "nome_1_parte":       resultado = cmp(a.nome_1_parte, b.nome_1_parte); break;
        case "relator":            resultado = cmp(a.relator_tratamento ?? a.nome_relator, b.relator_tratamento ?? b.nome_relator); break;
        case "nome_orgao":         resultado = cmp(a.nome_orgao, b.nome_orgao); break;
        case "situacao":           resultado = cmp(a.situacao, b.situacao); break;
      }
      return direcao === "asc" ? resultado : -resultado;
    });
  }, [processos, colOrdem, direcao]);

  if (processos.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
        Nenhum processo encontrado para esta sessão.
      </p>
    );
  }

  function thProps(col: ColOrdenavel, align: "left" | "center" = "left") {
    const ativo = colOrdem === col;
    return {
      onClick: () => alternarOrdem(col),
      className: `${TH_BASE} text-${align} ${ativo ? "text-blue-600 dark:text-blue-400" : ""}`,
    };
  }

  return (
    <div className="max-h-[60vh] overflow-auto rounded-xl border border-gray-200 dark:border-gray-700">
      <table className="w-full min-w-[1050px] text-sm">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/60">
            <th {...thProps("sequencia", "center")}>
              <span className="inline-flex items-center justify-center gap-1">
                Seq.
                <IconeOrdem col="sequencia" atual={colOrdem} dir={direcao} />
              </span>
            </th>
            <th {...thProps("numero_processo_fmt")}>
              <span className="inline-flex items-center gap-1">
                Processo
                <IconeOrdem col="numero_processo_fmt" atual={colOrdem} dir={direcao} />
              </span>
            </th>
            <th {...thProps("objeto")}>
              <span className="inline-flex items-center gap-1">
                Objeto / Classe
                <IconeOrdem col="objeto" atual={colOrdem} dir={direcao} />
              </span>
            </th>
            <th {...thProps("nome_1_parte")}>
              <span className="inline-flex items-center gap-1">
                Parte
                <IconeOrdem col="nome_1_parte" atual={colOrdem} dir={direcao} />
              </span>
            </th>
            <th {...thProps("relator")}>
              <span className="inline-flex items-center gap-1">
                Relator
                <IconeOrdem col="relator" atual={colOrdem} dir={direcao} />
              </span>
            </th>
            <th {...thProps("nome_orgao")}>
              <span className="inline-flex items-center gap-1">
                Entidade/Órgão
                <IconeOrdem col="nome_orgao" atual={colOrdem} dir={direcao} />
              </span>
            </th>
            <th {...thProps("situacao")}>
              <span className="inline-flex items-center gap-1">
                Situação Pauta
                <IconeOrdem col="situacao" atual={colOrdem} dir={direcao} />
              </span>
            </th>
            <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Ações
            </th>
          </tr>
        </thead>
        <tbody>
          {lista.map((p, i) => (
            <tr
              key={p.id}
              className={`border-t border-gray-100 dark:border-gray-700/50 hover:bg-blue-50/40 dark:hover:bg-blue-900/10 ${
                i % 2 !== 0 ? "bg-slate-50 dark:bg-slate-800/30" : "bg-white dark:bg-gray-800"
              }`}
            >
              <td className="px-3 py-2.5 text-center text-xs text-gray-400 dark:text-gray-500">
                {p.sequencia ?? "—"}
              </td>
              <td className="px-3 py-2.5">
                <span className="block font-semibold text-blue-700 dark:text-blue-400">
                  {p.numero_processo_fmt ?? `ID ${p.processo_id ?? "—"}`}
                </span>
                {p.situacao_funcional && (
                  <span className="mt-0.5 block text-[10px] text-gray-400 dark:text-gray-500">
                    {p.situacao_funcional}
                  </span>
                )}
              </td>
              <td className="max-w-60 px-3 py-2.5">
                {p.objeto && (
                  <p className="truncate text-xs text-gray-700 dark:text-gray-300" title={p.objeto}>
                    {p.objeto}
                  </p>
                )}
                {p.nome_classe && (
                  <p className="mt-0.5 truncate text-[10px] text-gray-400 dark:text-gray-500" title={p.nome_classe}>
                    {p.nome_classe}
                  </p>
                )}
                {!p.objeto && !p.nome_classe && <span className="text-xs text-gray-400">—</span>}
              </td>
              <td className="max-w-40 px-3 py-2.5">
                <p className="truncate text-xs text-gray-600 dark:text-gray-300" title={p.nome_1_parte ?? ""}>
                  {p.nome_1_parte ?? "—"}
                </p>
              </td>
              <td className="max-w-36 px-3 py-2.5">
                <p className="truncate text-xs text-gray-700 dark:text-gray-300" title={p.relator_tratamento ?? p.nome_relator ?? ""}>
                  {p.relator_tratamento ?? p.nome_relator ?? "—"}
                </p>
                {p.nome_revisor && (
                  <p className="mt-0.5 truncate text-[10px] text-gray-400 dark:text-gray-500" title={`Rev.: ${p.nome_revisor}`}>
                    Rev.: {p.nome_revisor}
                  </p>
                )}
              </td>
              <td className="max-w-48 px-3 py-2.5 text-xs text-gray-600 dark:text-gray-300">
                {p.nome_orgao ? <p className="truncate" title={p.nome_orgao}>{p.nome_orgao}</p> : "—"}
              </td>
              <td className="px-3 py-2.5 text-xs text-gray-500 dark:text-gray-400">
                {p.situacao ?? "—"}
              </td>
              <td className="px-3 py-2.5 text-center">
                {p.processo_id ? (
                  <button
                    type="button"
                    onClick={() => router.push(`/eprocessos-ce/processos/${p.processo_id}`)}
                    className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-blue-400 dark:hover:bg-blue-900/40"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Detalhar
                  </button>
                ) : (
                  <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
