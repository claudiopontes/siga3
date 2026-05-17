"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart3, FileText, FileSpreadsheet, Archive,
  ChevronRight, CheckCircle2, AlertTriangle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface SiconfiRreoResumoHub {
  an_exercicio:        number | null;
  nr_periodo:          number | null;
  municipios_com_dado: number;
  municipios_sem_dado: number;
  total_municipios:    number;
  alertas_criticos:    number;
  alertas_altos:       number;
  alertas_medios:      number;
  alertas_baixos:      number;
}

interface PeriodoDisponivel {
  an_exercicio: number;
  nr_periodo:   number;
}

interface MunicipioRreo {
  id_municipio:        number;
  no_municipio:        string | null;
  situacao_envio:      string | null;
  alertas_criticos:    number;
  alertas_altos:       number;
  alertas_medios:      number;
  alertas_baixos:      number;
  principal_ocorrencia: string | null;
}

interface PainelRreoResponse {
  an_exercicio: number | null;
  nr_periodo:   number | null;
  periodos:     PeriodoDisponivel[];
  municipios:   MunicipioRreo[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BIMESTRES: Record<number, string> = {
  1: "1º Bim.", 2: "2º Bim.", 3: "3º Bim.",
  4: "4º Bim.", 5: "5º Bim.", 6: "6º Bim.",
};

// ---------------------------------------------------------------------------
// Acesso rápido — card compacto de módulo
// ---------------------------------------------------------------------------

interface AcessoRapidoProps {
  titulo:    string;
  fonte:     string;
  icone:     React.ReactNode;
  href?:     string;
  status:    "disponivel" | "preparacao";
  criticos?: number;
  altos?:    number;
  corIcone?: string;
}

function AcessoRapido({
  titulo, fonte, icone, href, status, criticos = 0, altos = 0,
  corIcone = "text-gray-400 dark:text-gray-500",
}: AcessoRapidoProps) {
  const disponivel = status === "disponivel";
  const temAlerta  = criticos > 0 || altos > 0;

  const inner = (
    <div className={`group flex items-center gap-3 rounded-xl border bg-white p-3.5 transition-all dark:bg-gray-800 ${
      !disponivel
        ? "border-gray-100 opacity-50 dark:border-gray-800"
        : temAlerta
          ? "border-red-200 hover:shadow-sm dark:border-red-800/40"
          : "border-gray-200 hover:shadow-sm dark:border-gray-700"
    }`}>
      <div className={`shrink-0 rounded-lg bg-gray-50 p-2 dark:bg-gray-700/50 ${corIcone}`}>
        {icone}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-800 dark:text-white">{titulo}</p>
        <p className="truncate text-xs text-gray-400 dark:text-gray-500">{fonte}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {criticos > 0 && (
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-600 dark:bg-red-900/30 dark:text-red-400">
            {criticos} crítico{criticos !== 1 ? "s" : ""}
          </span>
        )}
        {altos > 0 && (
          <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-bold text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
            {altos} alto{altos !== 1 ? "s" : ""}
          </span>
        )}
        {disponivel && !temAlerta && (
          <CheckCircle2 className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
        )}
        {!disponivel && (
          <span className="text-xs text-gray-400 dark:text-gray-500">Em breve</span>
        )}
        {disponivel && (
          <ChevronRight className="h-4 w-4 text-gray-300 transition-transform group-hover:translate-x-0.5 dark:text-gray-600" />
        )}
      </div>
    </div>
  );

  if (disponivel && href) return <Link href={href} className="block">{inner}</Link>;
  return inner;
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function PainelSiconfiClient() {
  const [resumo,     setResumo]     = useState<SiconfiRreoResumoHub | null>(null);
  const [painel,     setPainel]     = useState<PainelRreoResponse   | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/alertas/siconfi-rreo/resumo").then((r) => r.json()),
      fetch("/api/siconfi/rreo/painel").then((r) => r.json()),
    ])
      .then(([resumoData, painelData]: [unknown, unknown]) => {
        if (resumoData && typeof resumoData === "object" && !("error" in (resumoData as object)))
          setResumo(resumoData as SiconfiRreoResumoHub);
        if (painelData && typeof painelData === "object" && !("error" in (painelData as object)))
          setPainel(painelData as PainelRreoResponse);
      })
      .catch(() => { /* silent — dados indisponíveis */ })
      .finally(() => setCarregando(false));
  }, []);

  const criticos   = resumo?.alertas_criticos ?? 0;
  const altos      = resumo?.alertas_altos    ?? 0;
  const temAlerta  = criticos > 0 || altos > 0;
  const total      = resumo?.total_municipios ?? 22;
  const comDado    = resumo?.municipios_com_dado ?? 0;
  const progresso  = total > 0 ? Math.round((comDado / total) * 100) : 0;

  const anoAtual     = resumo?.an_exercicio ?? new Date().getFullYear();
  const periodoAtual = resumo?.nr_periodo ?? null;

  const periodosCarregados = new Set(
    (painel?.periodos ?? [])
      .filter((p) => p.an_exercicio === anoAtual)
      .map((p) => p.nr_periodo),
  );

  const municipiosAtencao = (painel?.municipios ?? [])
    .filter((m) => m.alertas_criticos > 0 || m.alertas_altos > 0)
    .sort((a, b) =>
      (b.alertas_criticos - a.alertas_criticos) || (b.alertas_altos - a.alertas_altos),
    );

  return (
    <div className="space-y-5">

      {/* ── Skeleton de carregamento ── */}
      {carregando && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
          <div className="animate-pulse space-y-3">
            <div className="h-3 w-28 rounded bg-gray-100 dark:bg-gray-700" />
            <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-700" />
            <div className="flex gap-1.5">
              {[1,2,3,4,5,6].map((i) => (
                <div key={i} className="h-6 w-8 rounded bg-gray-100 dark:bg-gray-700" />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Barra de status do período atual ── */}
      {!carregando && resumo && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
          <div className="flex flex-wrap items-start justify-between gap-4">

            {/* Progresso de entregas */}
            <div className="min-w-[220px] flex-1">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  Período atual
                </span>
                {periodoAtual && (
                  <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                    {BIMESTRES[periodoAtual]} / {anoAtual}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Entregas</span>
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      {comDado} / {total} municípios
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                    <div
                      className={`h-2 rounded-full transition-all duration-500 ${
                        comDado === total
                          ? "bg-emerald-500"
                          : comDado >= total * 0.8
                            ? "bg-indigo-500"
                            : "bg-orange-400"
                      }`}
                      style={{ width: `${progresso}%` }}
                    />
                  </div>
                </div>
                <span className={`text-2xl font-bold tabular-nums ${
                  comDado === total
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-indigo-600 dark:text-indigo-400"
                }`}>
                  {progresso}%
                </span>
              </div>
            </div>

            {/* Status de alertas */}
            <div className="shrink-0">
              {temAlerta ? (
                <div className="flex flex-col items-end gap-1.5">
                  {criticos > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-sm font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      <span className="h-2 w-2 rounded-full bg-red-500" />
                      {criticos} crítico{criticos !== 1 ? "s" : ""}
                    </span>
                  )}
                  {altos > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1 text-sm font-semibold text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                      <span className="h-2 w-2 rounded-full bg-orange-400" />
                      {altos} alto{altos !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 dark:bg-emerald-900/20">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
                  <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                    Situação regular
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Mini-mapa de bimestres */}
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
            <span className="text-xs text-gray-400 dark:text-gray-500">{anoAtual}</span>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5, 6].map((b) => {
                const carregado = periodosCarregados.has(b);
                const atual     = b === periodoAtual;
                return (
                  <div
                    key={b}
                    title={BIMESTRES[b]}
                    className={`flex h-6 items-center justify-center rounded px-2 text-[10px] font-semibold transition-all ${
                      atual
                        ? "bg-indigo-600 text-white dark:bg-indigo-500"
                        : carregado
                          ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400"
                          : "bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-600"
                    }`}
                  >
                    {b}º
                  </div>
                );
              })}
            </div>
            <span className="text-xs text-gray-400 dark:text-gray-500">bimestres com dados</span>
          </div>
        </div>
      )}

      {/* ── Verificar agora — municípios com alertas ── */}
      {!carregando && temAlerta && municipiosAtencao.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-red-100 bg-white dark:border-red-900/30 dark:bg-gray-800">
          <div className="flex items-center gap-2 border-b border-red-100 px-5 py-3 dark:border-red-900/30">
            <AlertTriangle className="h-4 w-4 text-red-500 dark:text-red-400" />
            <h2 className="text-sm font-semibold text-gray-800 dark:text-white">Verificar agora</h2>
            <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
              {municipiosAtencao.length} município{municipiosAtencao.length !== 1 ? "s" : ""} com atenção
            </span>
          </div>
          <ul className="divide-y divide-gray-50 dark:divide-gray-700/50">
            {municipiosAtencao.slice(0, 8).map((m) => (
              <li key={m.id_municipio}>
                <Link
                  href={`/painel-siconfi/rreo/${m.id_municipio}`}
                  className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 dark:text-white">
                      {m.no_municipio ?? `Cód. ${m.id_municipio}`}
                    </p>
                    {m.principal_ocorrencia && (
                      <p className="truncate text-xs text-gray-400 dark:text-gray-500">
                        {m.principal_ocorrencia}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {m.alertas_criticos > 0 && (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-600 dark:bg-red-900/30 dark:text-red-400">
                        {m.alertas_criticos} crítico{m.alertas_criticos !== 1 ? "s" : ""}
                      </span>
                    )}
                    {m.alertas_altos > 0 && (
                      <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-bold text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                        {m.alertas_altos} alto{m.alertas_altos !== 1 ? "s" : ""}
                      </span>
                    )}
                    <ChevronRight className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {municipiosAtencao.length > 8 && (
            <div className="border-t border-gray-100 px-5 py-3 dark:border-gray-700">
              <Link
                href="/painel-siconfi/rreo"
                className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                Ver todos os {municipiosAtencao.length} municípios com alertas →
              </Link>
            </div>
          )}
        </div>
      )}

      {/* ── Tudo regular ── */}
      {!carregando && !temAlerta && resumo && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-5 py-4 dark:border-emerald-900/30 dark:bg-emerald-900/10">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500 dark:text-emerald-400" />
          <div>
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
              Nenhum ponto de atenção no período atual
            </p>
            <p className="text-xs text-emerald-600 dark:text-emerald-500">
              Todos os municípios com entrega estão em situação regular
              {periodoAtual ? ` — ${BIMESTRES[periodoAtual]}/${anoAtual}` : ""}
            </p>
          </div>
        </div>
      )}

      {/* ── Análises disponíveis ── */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
          Análises disponíveis
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <AcessoRapido
            titulo="RREO"
            fonte="Relatório Resumido da Execução Orçamentária · SICONFI"
            icone={<BarChart3 className="h-4 w-4" />}
            href="/painel-siconfi/rreo"
            status="disponivel"
            criticos={criticos}
            altos={altos}
            corIcone="text-indigo-500 dark:text-indigo-400"
          />
          <AcessoRapido
            titulo="Entregas e Pendências"
            fonte="Extrato de entregas RREO · SICONFI"
            icone={<FileText className="h-4 w-4" />}
            href="/painel-siconfi/entregas"
            status="disponivel"
            corIcone="text-violet-500 dark:text-violet-400"
          />
          <AcessoRapido
            titulo="RGF"
            fonte="Relatório de Gestão Fiscal · SICONFI"
            icone={<FileSpreadsheet className="h-4 w-4" />}
            status="preparacao"
            corIcone="text-sky-500 dark:text-sky-400"
          />
          <AcessoRapido
            titulo="DCA"
            fonte="Declaração das Contas Anuais · SICONFI"
            icone={<Archive className="h-4 w-4" />}
            status="preparacao"
            corIcone="text-teal-500 dark:text-teal-400"
          />
        </div>
      </div>

    </div>
  );
}
