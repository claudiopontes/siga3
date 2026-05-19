"use client";

import type { EscolaPonto } from "./MapaEscolasContent";

/**
 * Seção "Censo Escolar" usada nos modais de detalhe de escola em
 * /painel-educacao/escolas e /painel-educacao/censo.
 *
 * Mostra matrículas por etapa, docentes e grade de chips de infraestrutura.
 * Quando a escola não tem dado Censo, exibe nota explicativa em vez de
 * sumir — assim o conselheiro entende o motivo da ausência.
 */

interface Props {
  detalhe: EscolaPonto;
}

function fmtInt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("pt-BR");
}

const INDICADORES: Array<{ chave: keyof NonNullable<EscolaPonto["infra"]>; label: string }> = [
  { chave: "agua_potavel",     label: "Água potável" },
  { chave: "energia_eletrica", label: "Energia elétrica" },
  { chave: "esgoto",           label: "Esgoto" },
  { chave: "lixo_coletado",    label: "Coleta de lixo" },
  { chave: "internet",         label: "Internet" },
  { chave: "internet_alunos",  label: "Internet p/ alunos" },
  { chave: "biblioteca",       label: "Biblioteca" },
  { chave: "lab_informatica",  label: "Lab. informática" },
  { chave: "lab_ciencias",     label: "Lab. ciências" },
  { chave: "quadra_esportes",  label: "Quadra esportes" },
  { chave: "alimentacao",      label: "Alimentação" },
  { chave: "acessibilidade",   label: "Acessibilidade" },
];

export default function BlocoCenso({ detalhe }: Props) {
  const temMatriculas = (detalhe.qt_mat_bas ?? 0) > 0 || (detalhe.qt_mat_inf ?? 0) > 0
                     || (detalhe.qt_mat_fund ?? 0) > 0 || (detalhe.qt_mat_med ?? 0) > 0;
  const temDocentes  = (detalhe.qt_doc_bas ?? 0) > 0;
  const temInfra     = !!detalhe.infra && Object.values(detalhe.infra).some((v) => v !== null);

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Censo Escolar {detalhe.ano_censo ? detalhe.ano_censo : ""}
      </h3>

      {!temMatriculas && !temDocentes && !temInfra ? (
        <p className="text-xs text-gray-400 italic">
          Sem dados do Censo Escolar para esta escola.
          {detalhe.situacao && detalhe.situacao !== "Em atividade"
            ? ` (situação: ${detalhe.situacao})`
            : " Pode ocorrer com cadastros recém-incluídos, escolas paralisadas/extintas ou unidades com modalidades sem IDEB."}
        </p>
      ) : (
        <>
          {(temMatriculas || temDocentes) && (
            <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-2 text-center dark:border-blue-800/30 dark:bg-blue-900/10">
                <p className="text-[10px] uppercase text-blue-600">Matrículas</p>
                <p className="text-base font-bold text-blue-700 dark:text-blue-400">{fmtInt(detalhe.qt_mat_bas)}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-center dark:border-gray-700 dark:bg-gray-900/30">
                <p className="text-[10px] uppercase text-gray-500">Ed. Infantil</p>
                <p className="text-base font-bold text-gray-700 dark:text-gray-300">{fmtInt(detalhe.qt_mat_inf)}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-center dark:border-gray-700 dark:bg-gray-900/30">
                <p className="text-[10px] uppercase text-gray-500">Fundamental</p>
                <p className="text-base font-bold text-gray-700 dark:text-gray-300">{fmtInt(detalhe.qt_mat_fund)}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-center dark:border-gray-700 dark:bg-gray-900/30">
                <p className="text-[10px] uppercase text-gray-500">Médio</p>
                <p className="text-base font-bold text-gray-700 dark:text-gray-300">{fmtInt(detalhe.qt_mat_med)}</p>
              </div>
              {temDocentes && (
                <div className="rounded-lg border border-purple-200 bg-purple-50/40 p-2 text-center dark:border-purple-800/30 dark:bg-purple-900/10">
                  <p className="text-[10px] uppercase text-purple-600">Docentes</p>
                  <p className="text-base font-bold text-purple-700 dark:text-purple-400">{fmtInt(detalhe.qt_doc_bas)}</p>
                </div>
              )}
            </div>
          )}

          {temInfra && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Infraestrutura</p>
              <div className="flex flex-wrap gap-1.5">
                {INDICADORES.map((ind) => {
                  const v = detalhe.infra?.[ind.chave] ?? null;
                  const cor = v === true
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    : v === false
                      ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      : "bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500";
                  const icon = v === true ? "✓" : v === false ? "✗" : "—";
                  return (
                    <span key={ind.chave} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cor}`}>
                      <span className="font-bold">{icon}</span>
                      {ind.label}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
