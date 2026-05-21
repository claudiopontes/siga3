"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { fmtMoeda, fmtNum, queryStringFiltros, toNum } from "./folhaUtils";
import AcumuloCargosTable from "./AcumuloCargosTable";

type Contagem = {
  materializados: Record<string, string>;
  acumulo_de_cargos: number;
  acima_do_teto: number;
  variacao_anormal_mes_a_mes: number;
  teto_constitucional_aplicado: number;
  competencia_anterior_comparada: string;
  qtd_servidores_com_referencia_anterior: number;
};

type AlertaRow = {
  id_contracheque_sicap: string;
  competencia: string;
  id_entidade_cjur: number;
  entidade_nome: string;
  ente_nome: string | null;
  entidade_poder: string | null;
  id_cadastro_unico_sicap: number;
  nome_servidor: string | null;
  cpf_mascarado: string | null;
  matricula: string | null;
  cargo_nome: string | null;
  total_vencimentos: string;
  total_descontos: string;
  total_liquido: string;
};

type Severidade = "alta" | "media" | "baixa" | "info";

const TIPOS: { value: string; label: string; severidade: Severidade }[] = [
  { value: "acima_do_teto",              label: "Acima do teto constitucional",     severidade: "alta" },
  { value: "acumulo_de_cargos",          label: "Acúmulo de cargos",                severidade: "alta" },
  { value: "variacao_anormal_mes_a_mes", label: "Variação anormal mês a mês (>30%)", severidade: "alta" },
  { value: "desconto_maior_vencimento",  label: "Desconto > vencimento",            severidade: "media" },
  { value: "vencimento_negativo",        label: "Vencimento negativo",              severidade: "media" },
  { value: "desconto_negativo",          label: "Desconto negativo",                severidade: "media" },
  { value: "sem_desconto",               label: "Sem desconto",                     severidade: "baixa" },
  { value: "cpf_invalido",               label: "CPF inválido",                     severidade: "baixa" },
  { value: "cargo_ausente",              label: "Cargo ausente",                    severidade: "info" },
  { value: "lotacao_ausente",            label: "Lotação ausente",                  severidade: "info" },
];

const CORES_SEVERIDADE: Record<Severidade, { ativo: string; inativo: string; pill: string; text: string }> = {
  alta:  { ativo: "border-red-500 bg-red-50 dark:border-red-400 dark:bg-red-900/30",
           inativo: "border-gray-200 hover:border-red-300 dark:border-gray-700",
           pill: "bg-red-500", text: "text-red-700 dark:text-red-300" },
  media: { ativo: "border-amber-500 bg-amber-50 dark:border-amber-400 dark:bg-amber-900/30",
           inativo: "border-gray-200 hover:border-amber-300 dark:border-gray-700",
           pill: "bg-amber-500", text: "text-amber-700 dark:text-amber-300" },
  baixa: { ativo: "border-yellow-500 bg-yellow-50 dark:border-yellow-400 dark:bg-yellow-900/30",
           inativo: "border-gray-200 hover:border-yellow-300 dark:border-gray-700",
           pill: "bg-yellow-500", text: "text-yellow-700 dark:text-yellow-300" },
  info:  { ativo: "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/30",
           inativo: "border-gray-200 hover:border-blue-300 dark:border-gray-700",
           pill: "bg-blue-500", text: "text-blue-700 dark:text-blue-300" },
};

export default function AlertasTab() {
  const sp = useSearchParams();
  const competencia = sp.get("competencia");
  const entidade = sp.get("entidade") ?? "all";
  const poder = sp.get("poder") ?? "all";

  const [contagem, setContagem] = useState<Contagem | null>(null);
  const [tipo, setTipo] = useState<string>("vencimento_negativo");
  const [rows, setRows] = useState<AlertaRow[]>([]);
  const [offset, setOffset] = useState(0);
  const [carregando, setCarregando] = useState(false);

  const qs = useMemo(
    () => queryStringFiltros({ competencia, entidade, poder }),
    [competencia, entidade, poder],
  );

  useEffect(() => {
    if (!competencia) return;
    fetch(`/api/folha/alertas/contagem?${qs}`)
      .then((r) => r.json())
      .then((d) => setContagem(d))
      .catch(() => void 0);
  }, [qs, competencia]);

  useEffect(() => {
    if (!competencia) return;
    // Acúmulo é renderizado por componente especializado — não usa a rota genérica.
    if (tipo === "acumulo_de_cargos") return;
    setCarregando(true);
    fetch(`/api/folha/alertas/listar?${qs}&tipo=${tipo}&limit=50&offset=${offset}`)
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d?.rows) ? d.rows : []))
      .catch(() => void 0)
      .finally(() => setCarregando(false));
  }, [qs, tipo, offset, competencia]);

  function valorContagem(t: string): number {
    if (!contagem) return 0;
    if (t === "acumulo_de_cargos") return contagem.acumulo_de_cargos;
    if (t === "acima_do_teto") return contagem.acima_do_teto;
    if (t === "variacao_anormal_mes_a_mes") return contagem.variacao_anormal_mes_a_mes;
    return Number(contagem.materializados?.[t] ?? 0);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {TIPOS.map((t) => {
          const v = valorContagem(t.value);
          const ativo = tipo === t.value;
          const c = CORES_SEVERIDADE[t.severidade];
          const zerado = v === 0;
          return (
            <button
              key={t.value}
              onClick={() => { setTipo(t.value); setOffset(0); }}
              className={[
                "group relative overflow-hidden rounded-xl border-l-4 border bg-white p-3 text-left transition-all dark:bg-gray-800",
                ativo ? c.ativo : c.inativo,
                zerado && !ativo ? "opacity-60" : "",
              ].join(" ")}
            >
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-600 dark:text-gray-400">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${c.pill}`} />
                {t.label}
              </div>
              <div className={[
                "mt-1.5 text-xl font-bold tabular-nums",
                v > 0 ? c.text : "text-gray-400 dark:text-gray-500",
              ].join(" ")}>{fmtNum(v)}</div>
            </button>
          );
        })}
      </div>

      {tipo === "acima_do_teto" && contagem && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-2 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
          Teto constitucional aplicado: {fmtMoeda(contagem.teto_constitucional_aplicado)} (subsídio mensal STF). Atualize em <code>src/lib/folha/teto-constitucional.ts</code> quando publicado.
        </div>
      )}
      {tipo === "variacao_anormal_mes_a_mes" && contagem && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-2 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
          Comparado com {contagem.competencia_anterior_comparada}. Servidores com referência anterior: {fmtNum(contagem.qtd_servidores_com_referencia_anterior)}.
          {contagem.qtd_servidores_com_referencia_anterior === 0 && " (Sem dado anterior carregado para comparação.)"}
        </div>
      )}

      {tipo === "acumulo_de_cargos" ? (
        <AcumuloCargosTable />
      ) : (
      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 overflow-x-auto">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            {TIPOS.find((t) => t.value === tipo)?.label}
            {carregando && <span className="ml-2 text-xs text-gray-500">(carregando…)</span>}
          </div>
          <div className="flex gap-2 text-xs">
            <button
              className="rounded border border-gray-300 px-2 py-1 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 50))}
            >Anterior</button>
            <button
              className="rounded border border-gray-300 px-2 py-1 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200"
              disabled={rows.length < 50}
              onClick={() => setOffset(offset + 50)}
            >Próximo</button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="pb-2 pr-3">Servidor</th>
              <th className="pb-2 pr-3">Entidade</th>
              <th className="pb-2 pr-3">Cargo</th>
              <th className="pb-2 pr-3 text-right">Vencimentos</th>
              <th className="pb-2 pr-3 text-right">Descontos</th>
              <th className="pb-2 text-right">Líquido</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id_contracheque_sicap}
                className="border-t border-gray-100 transition-colors hover:bg-amber-50/40 dark:border-gray-800 dark:hover:bg-amber-950/30"
              >
                <td className="py-2 pr-3">
                  <Link
                    href={`/painel-folha/servidor/${r.id_cadastro_unico_sicap}?competencia=${r.competencia}`}
                    className="font-medium text-blue-600 hover:underline dark:text-blue-300"
                  >
                    {r.nome_servidor ?? "(sem nome)"}
                  </Link>
                  <div className="text-xs text-gray-500">{r.cpf_mascarado ?? "—"} · matr. {r.matricula ?? "—"}</div>
                </td>
                <td className="py-2 pr-3 text-gray-700 dark:text-gray-300">
                  {r.entidade_nome}
                  <div className="text-[10px] text-gray-500">{r.entidade_poder}</div>
                </td>
                <td className="py-2 pr-3 text-gray-700 dark:text-gray-300">{r.cargo_nome ?? "—"}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-emerald-700 dark:text-emerald-300 whitespace-nowrap">{fmtMoeda(toNum(r.total_vencimentos))}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-red-600 dark:text-red-300 whitespace-nowrap">{fmtMoeda(toNum(r.total_descontos))}</td>
                <td className="py-2 text-right tabular-nums font-semibold text-blue-700 dark:text-blue-300 whitespace-nowrap">{fmtMoeda(toNum(r.total_liquido))}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="py-4 text-center text-xs text-gray-500">Nenhum registro com este alerta.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
