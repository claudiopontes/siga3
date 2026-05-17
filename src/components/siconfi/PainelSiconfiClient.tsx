"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, FileText, FileSpreadsheet, Archive, ChevronRight } from "lucide-react";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface SiconfiRreoResumoHub {
  an_exercicio: number | null;
  nr_periodo: number | null;
  municipios_com_dado: number;
  municipios_sem_dado: number;
  total_municipios: number;
  alertas_criticos: number;
  alertas_altos: number;
  alertas_medios: number;
  alertas_baixos: number;
}

// ---------------------------------------------------------------------------
// Card de módulo de análise
// ---------------------------------------------------------------------------

interface ModuloCardProps {
  titulo:         string;
  descricao:      string;
  fonte:          string;
  icone:          React.ReactNode;
  href?:          string;
  status:         "disponivel" | "preparacao";
  criticos?:      number;
  altos?:         number;
  corIcone?:      string;
  corBorda?:      string;
  corFonteBadge?: string;
}

function ModuloCard({
  titulo, descricao, fonte, icone, href, status,
  criticos = 0, altos = 0,
  corIcone      = "text-gray-400 dark:text-gray-500",
  corBorda      = "border-gray-200 dark:border-gray-700",
  corFonteBadge = "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
}: ModuloCardProps) {
  const disponivel = status === "disponivel";

  const card = (
    <div
      className={`group flex h-full flex-col rounded-xl border ${corBorda} bg-white p-5 transition-all dark:bg-gray-800 ${
        disponivel ? "cursor-pointer hover:shadow-md hover:shadow-gray-100 dark:hover:shadow-none" : "opacity-60"
      }`}
    >
      <div className="mb-4">
        <div className="inline-flex rounded-lg bg-gray-50 p-2 dark:bg-gray-700/50">
          <div className={`h-5 w-5 ${corIcone}`}>{icone}</div>
        </div>
      </div>

      <h3 className="mb-1 text-sm font-semibold text-gray-800 dark:text-white">{titulo}</h3>
      <p className="mb-4 flex-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{descricao}</p>

      <div className="space-y-3">
        {disponivel && (criticos > 0 || altos > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            {criticos > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600 dark:bg-red-900/30 dark:text-red-400">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                {criticos} Crítico{criticos !== 1 ? "s" : ""}
              </span>
            )}
            {altos > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                {altos} Alto{altos !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}

        <div>
          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${corFonteBadge}`}>{fonte}</span>
        </div>

        <div className="flex items-center justify-end border-t border-gray-100 pt-2 dark:border-gray-700/60">
          {disponivel && href ? (
            <span className="flex items-center gap-1 text-xs font-medium text-blue-600 transition-all group-hover:gap-2 dark:text-blue-400">
              Abrir análise <ChevronRight className="h-3.5 w-3.5" />
            </span>
          ) : (
            <span className="text-xs text-gray-400 dark:text-gray-500">Em breve</span>
          )}
        </div>
      </div>
    </div>
  );

  if (disponivel && href) {
    return <Link href={href} className="block h-full">{card}</Link>;
  }
  return card;
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function PainelSiconfiClient() {
  const [resumo, setResumo] = useState<SiconfiRreoResumoHub | null>(null);
  const [erro, setErro]     = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/alertas/siconfi-rreo/resumo")
      .then((r) => r.json())
      .then((data: unknown) => {
        if (data && typeof data === "object" && !("error" in (data as object))) {
          setResumo(data as SiconfiRreoResumoHub);
        }
      })
      .catch((e: unknown) => {
        setErro(e instanceof Error ? e.message : "Erro ao carregar dados.");
      });
  }, []);

  const rreoCriticos = resumo?.alertas_criticos ?? 0;
  const rreoAltos    = resumo?.alertas_altos    ?? 0;

  return (
    <div className="space-y-6">

      {/* ── Cabeçalho ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">
              Execução Orçamentária
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
              Acompanhamento fiscal e orçamentário dos municípios do Acre com dados do{" "}
              <span className="font-medium text-gray-700 dark:text-gray-300">SICONFI</span>{" "}
              (Tesouro Nacional). Consolida RREO, entregas de demonstrativos, alertas fiscais e,
              futuramente, RGF e DCA.
            </p>
          </div>
          {resumo && (
            <div className="flex flex-wrap gap-3 text-center">
              <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-2 dark:border-gray-700 dark:bg-gray-700/50">
                <p className="text-xs text-gray-500 dark:text-gray-400">Com RREO</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{resumo.municipios_com_dado}</p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-2 dark:border-gray-700 dark:bg-gray-700/50">
                <p className="text-xs text-gray-500 dark:text-gray-400">Sem entrega</p>
                <p className={`text-xl font-bold ${resumo.municipios_sem_dado > 0 ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white"}`}>
                  {resumo.municipios_sem_dado}
                </p>
              </div>
              {resumo.nr_periodo && resumo.an_exercicio && (
                <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-2 dark:border-indigo-800/40 dark:bg-indigo-900/20">
                  <p className="text-xs text-indigo-500 dark:text-indigo-400">Período</p>
                  <p className="text-sm font-bold text-indigo-700 dark:text-indigo-300">
                    {resumo.nr_periodo}º bim./{resumo.an_exercicio}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {erro && (
          <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
            Não foi possível carregar o resumo: {erro}
          </p>
        )}
      </div>

      {/* ── Módulos de análise ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">

        <ModuloCard
          titulo="RREO"
          descricao="Relatório Resumido da Execução Orçamentária dos municípios do Acre — receitas, despesas e resultado por período bimestral."
          fonte="SICONFI/RREO"
          icone={<BarChart3 className="h-5 w-5" />}
          href="/painel-siconfi/rreo"
          status="disponivel"
          criticos={rreoCriticos}
          altos={rreoAltos}
          corIcone="text-indigo-500 dark:text-indigo-400"
          corBorda="border-indigo-200 dark:border-indigo-800/40"
          corFonteBadge="bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
        />

        <ModuloCard
          titulo="Entregas e Pendências"
          descricao="Acompanhamento de municípios com dados RREO presentes ou ausentes por exercício e período."
          fonte="SICONFI/RREO"
          icone={<FileText className="h-5 w-5" />}
          href="/painel-siconfi/entregas"
          status="disponivel"
          corIcone="text-violet-500 dark:text-violet-400"
          corBorda="border-violet-200 dark:border-violet-800/40"
          corFonteBadge="bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
        />

        <ModuloCard
          titulo="RGF"
          descricao="Relatório de Gestão Fiscal — limites de pessoal, dívida consolidada, garantias e restos a pagar por ente."
          fonte="SICONFI/RGF"
          icone={<FileSpreadsheet className="h-5 w-5" />}
          status="preparacao"
          corIcone="text-sky-500 dark:text-sky-400"
          corBorda="border-sky-200 dark:border-sky-800/40"
          corFonteBadge="bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
        />

        <ModuloCard
          titulo="DCA"
          descricao="Declaração das Contas Anuais — análise consolidada anual do balanço orçamentário, financeiro e patrimonial."
          fonte="SICONFI/DCA"
          icone={<Archive className="h-5 w-5" />}
          status="preparacao"
          corIcone="text-teal-500 dark:text-teal-400"
          corBorda="border-teal-200 dark:border-teal-800/40"
          corFonteBadge="bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300"
        />

      </div>
    </div>
  );
}
