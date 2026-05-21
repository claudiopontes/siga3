"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ShieldCheck, Clock } from "lucide-react";
import { fmtMoeda, fmtNum, queryStringFiltros } from "./folhaUtils";

type Vinculo = {
  id_beneficiario_sicap: number;
  matricula: string | null;
  id_entidade_cjur: number;
  entidade_nome: string | null;
  entidade_poder: string | null;
  id_cargo_sicap: number | null;
  cargo_nome: string | null;
  categoria_cargo: "PROFESSOR" | "SAUDE" | "OUTRO";
  carga_horaria_mensal: number | null;
  total_liquido: number;
};

type ServidorAcumulo = {
  cpf_hash: string;
  id_cadastro_unico_sicap: number;
  nome_servidor: string | null;
  cpf_mascarado: string | null;
  qtd_vinculos: number;
  qtd_entidades: number;
  carga_horaria_total: number;
  carga_horaria_excessiva: boolean;
  total_liquido_somado: number;
  classificacao: "POTENCIALMENTE_LICITO" | "INVESTIGAR";
  vinculos: Vinculo[];
};

type Resposta = {
  total: number;
  limit: number;
  offset: number;
  carga_horaria_limite: number;
  rows: ServidorAcumulo[];
};

const FILTROS = [
  { value: "todos",          label: "Todos" },
  { value: "investigar",     label: "Investigar (acumulação não amparada)" },
  { value: "licito",         label: "Potencialmente lícitos (CF 37 XVI)" },
  { value: "excesso_horas",  label: "Carga horária excessiva (>limite)" },
];

export default function AcumuloCargosTable() {
  const sp = useSearchParams();
  const competencia = sp.get("competencia");
  const entidade = sp.get("entidade") ?? "all";
  const poder = sp.get("poder") ?? "all";

  const [filtro, setFiltro] = useState("todos");
  const [offset, setOffset] = useState(0);
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(false);

  const qs = useMemo(
    () => queryStringFiltros({ competencia, entidade, poder }),
    [competencia, entidade, poder],
  );

  useEffect(() => {
    if (!competencia) return;
    setCarregando(true);
    fetch(`/api/folha/alertas/acumulo?${qs}&filtro=${filtro}&limit=30&offset=${offset}`)
      .then((r) => r.json())
      .then((d: Resposta) => setDados(d))
      .catch(() => void 0)
      .finally(() => setCarregando(false));
  }, [qs, filtro, offset, competencia]);

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-blue-200 bg-blue-50 p-2 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
        <strong>Critério:</strong> mesmo CPF com mais de um vínculo (<code>id_beneficiario_sicap</code> distinto) em entidades distintas na competência. Tipos de folha (mensal/férias/13º) são ignorados — só vínculos contam. Classificação por palavras-chave no nome do cargo, segundo CF/88 art. 37, XVI. <em>Não substitui análise jurídica caso a caso.</em>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 dark:text-gray-400">Filtro</label>
          <select
            className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            value={filtro}
            onChange={(e) => { setFiltro(e.target.value); setOffset(0); }}
          >
            {FILTROS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {dados && <>Total: <strong>{fmtNum(dados.total)}</strong> · Limite carga horária: {dados.carga_horaria_limite}h/mês</>}
        </div>
        <div className="ml-auto flex gap-2 text-xs">
          <button
            className="rounded border border-gray-300 px-2 py-1 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - 30))}
          >Anterior</button>
          <button
            className="rounded border border-gray-300 px-2 py-1 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200"
            disabled={!dados || dados.rows.length < 30 || (dados.offset + dados.rows.length) >= dados.total}
            onClick={() => setOffset(offset + 30)}
          >Próximo</button>
        </div>
      </div>

      <div className="space-y-2">
        {carregando && <div className="text-xs text-gray-500">Carregando…</div>}
        {!carregando && (!dados || dados.rows.length === 0) && (
          <div className="rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-800">
            Nenhum servidor encontrado com este filtro.
          </div>
        )}
        {dados?.rows.map((s) => (
          <div
            key={s.cpf_hash}
            className={[
              "rounded-2xl border border-l-4 bg-white p-4 shadow-sm transition-colors dark:bg-gray-800",
              s.classificacao === "POTENCIALMENTE_LICITO"
                ? "border-l-emerald-500 border-gray-200 dark:border-gray-700"
                : s.carga_horaria_excessiva
                  ? "border-l-red-500 border-gray-200 dark:border-gray-700"
                  : "border-l-amber-500 border-gray-200 dark:border-gray-700",
            ].join(" ")}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/painel-folha/servidor/${s.id_cadastro_unico_sicap}?competencia=${competencia}`}
                    className="font-medium text-blue-600 hover:underline dark:text-blue-300"
                  >
                    {s.nome_servidor ?? "(sem nome)"}
                  </Link>
                  {s.classificacao === "POTENCIALMENTE_LICITO" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                      <ShieldCheck className="h-3 w-3" /> potencialmente lícito
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      <AlertTriangle className="h-3 w-3" /> investigar
                    </span>
                  )}
                  {s.carga_horaria_excessiva && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">
                      <Clock className="h-3 w-3" /> carga horária excessiva
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-gray-500">
                  {s.cpf_mascarado ?? "—"} · {s.qtd_vinculos} vínculos em {s.qtd_entidades} entidades
                </div>
              </div>
              <div className="text-right text-sm">
                <div className="text-gray-700 dark:text-gray-200">
                  <strong>{s.carga_horaria_total.toLocaleString("pt-BR")}h/mês</strong>
                  {dados && (
                    <span className={s.carga_horaria_total > dados.carga_horaria_limite ? "text-red-600 dark:text-red-300" : "text-gray-400"}>
                      {" "}/ {dados.carga_horaria_limite}h
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500">{fmtMoeda(s.total_liquido_somado)} somado</div>
              </div>
            </div>

            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-[10px] uppercase tracking-wide text-gray-400">
                  <tr>
                    <th className="py-1 pr-2">Entidade</th>
                    <th className="py-1 pr-2">Cargo</th>
                    <th className="py-1 pr-2">Categoria</th>
                    <th className="py-1 pr-2">Matrícula</th>
                    <th className="py-1 pr-2 text-right">CH (h/mês)</th>
                    <th className="py-1 pr-2 text-right">Líquido vínculo</th>
                  </tr>
                </thead>
                <tbody>
                  {s.vinculos.map((v) => (
                    <tr key={v.id_beneficiario_sicap} className="border-t border-gray-100 dark:border-gray-700">
                      <td className="py-1 pr-2 text-gray-700 dark:text-gray-300">
                        {v.entidade_nome ?? "—"}
                        <span className="ml-1 text-[10px] text-gray-400">{v.entidade_poder ?? ""}</span>
                      </td>
                      <td className="py-1 pr-2 text-gray-700 dark:text-gray-300">{v.cargo_nome ?? "—"}</td>
                      <td className="py-1 pr-2">
                        {v.categoria_cargo === "PROFESSOR" && (
                          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">professor</span>
                        )}
                        {v.categoria_cargo === "SAUDE" && (
                          <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] text-teal-700 dark:bg-teal-900/30 dark:text-teal-300">saúde regul.</span>
                        )}
                        {v.categoria_cargo === "OUTRO" && (
                          <span className="text-[10px] text-gray-400">outro</span>
                        )}
                      </td>
                      <td className="py-1 pr-2 text-gray-500">{v.matricula ?? "—"}</td>
                      <td className="py-1 pr-2 text-right">{v.carga_horaria_mensal != null ? v.carga_horaria_mensal.toLocaleString("pt-BR") : "—"}</td>
                      <td className="py-1 pr-2 text-right whitespace-nowrap">{fmtMoeda(v.total_liquido)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
