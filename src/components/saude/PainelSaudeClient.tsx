"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Droplets, DollarSign, Building2, Activity,
  ShieldCheck, Heart, AlertTriangle,
  ChevronRight, CheckCircle2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface SiopsResumoHub {
  total_criticos: number;
  total_altos:    number;
}

// ---------------------------------------------------------------------------
// Sub-componentes
// ---------------------------------------------------------------------------

function AreaStatusPill({
  nome, carregando, semDados, criticos, altos,
}: {
  nome: string;
  carregando: boolean;
  semDados: boolean;
  criticos: number;
  altos: number;
}) {
  if (carregando)
    return <span className="inline-block h-6 w-16 animate-pulse rounded-full bg-gray-200 dark:bg-gray-700" />;

  const cls = semDados
    ? "bg-gray-100 text-gray-400 dark:bg-gray-700/50 dark:text-gray-500"
    : criticos > 0
      ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
      : altos > 0
        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
  const dot = semDados
    ? "bg-gray-300"
    : criticos > 0 ? "bg-red-500" : altos > 0 ? "bg-amber-400" : "bg-emerald-500";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {nome}
      {!semDados && (criticos > 0 || altos > 0) && (
        <span className="font-bold opacity-80">{criticos + altos}</span>
      )}
    </span>
  );
}

function ItemAlerta({
  icone, titulo, descricao, valor, nivel, href,
}: {
  icone: React.ReactNode;
  titulo: string;
  descricao: string;
  valor: number;
  nivel: "critico" | "alto";
  href: string;
}) {
  const nivelBg = nivel === "critico"
    ? "bg-red-50 text-red-500 dark:bg-red-900/20 dark:text-red-400"
    : "bg-amber-50 text-amber-500 dark:bg-amber-900/20 dark:text-amber-400";
  const badgeCls = nivel === "critico"
    ? "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400"
    : "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400";
  const dotCls = nivel === "critico" ? "bg-red-500" : "bg-amber-400";

  return (
    <Link href={href} className="block">
      <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 transition hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600">
        <span className={`shrink-0 rounded-lg p-2 ${nivelBg}`}>{icone}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-800 dark:text-white">{titulo}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{descricao}</p>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${badgeCls}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${dotCls}`} />
          {new Intl.NumberFormat("pt-BR").format(valor)}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600" />
      </div>
    </Link>
  );
}

function AcessoRapido({
  titulo, fonte, icone, href, criticos = 0, altos = 0,
  corIcone = "text-gray-400 dark:text-gray-500",
}: {
  titulo: string;
  fonte: string;
  icone: React.ReactNode;
  href: string;
  criticos?: number;
  altos?: number;
  corIcone?: string;
}) {
  const temAlerta = criticos > 0 || altos > 0;

  return (
    <Link href={href} className="block">
      <div className={`group flex items-center gap-3 rounded-xl border bg-white p-3.5 transition-all dark:bg-gray-800 ${
        temAlerta
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
          {!temAlerta && (
            <CheckCircle2 className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
          )}
          <ChevronRight className="h-4 w-4 text-gray-300 transition-transform group-hover:translate-x-0.5 dark:text-gray-600" />
        </div>
      </div>
    </Link>
  );
}

function CardEmBreve({ titulo, fonte, icone }: { titulo: string; fonte: string; icone: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-gray-200 bg-white px-4 py-3 opacity-60 dark:border-gray-700 dark:bg-gray-800">
      <span className="shrink-0 rounded-lg bg-gray-50 p-2 text-gray-400 dark:bg-gray-700/50">{icone}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-700 dark:text-gray-300">{titulo}</p>
        <p className="text-[11px] text-gray-400 dark:text-gray-500">{fonte}</p>
      </div>
      <span className="shrink-0 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
        Em breve
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function PainelSaudeClient() {
  const [contagem,    setContagem]    = useState<Record<string, { criticos: number; altos: number }>>({});
  const [siopsResumo, setSiopsResumo] = useState<SiopsResumoHub | null>(null);
  const [carregando,  setCarregando]  = useState(true);
  const [erro,        setErro]        = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/saude/alertas/contagem").then((r) => r.json()),
      fetch("/api/saude/orcamento/resumo").then((r) => r.json()),
    ])
      .then(([cnt, sr]) => {
        setContagem(cnt && typeof cnt === "object" ? cnt : {});
        setSiopsResumo(sr && !sr.error ? (sr as SiopsResumoHub) : null);
      })
      .catch((e: unknown) => {
        setErro(e instanceof Error ? e.message : "Erro ao carregar dados.");
      })
      .finally(() => setCarregando(false));
  }, []);

  // Contagens por fonte
  const sisaguaCount      = contagem["SISAGUA"]       ?? { criticos: 0, altos: 0 };
  const cnesUbsCount      = contagem["CNES_UBS"]      ?? { criticos: 0, altos: 0 };
  const infodengueCount   = contagem["INFODENGUE"]    ?? { criticos: 0, altos: 0 };
  const pniCoberturaCount = contagem["PNI_COBERTURA"] ?? { criticos: 0, altos: 0 };
  const mortalidadeCount  = contagem["SIM_SINASC"]    ?? { criticos: 0, altos: 0 };
  const siopsCount        = { criticos: siopsResumo?.total_criticos ?? 0, altos: siopsResumo?.total_altos ?? 0 };

  // Totais
  const totalCriticos = sisaguaCount.criticos + siopsCount.criticos + infodengueCount.criticos
    + pniCoberturaCount.criticos + mortalidadeCount.criticos;
  const totalAltos    = sisaguaCount.altos + siopsCount.altos + infodengueCount.altos
    + pniCoberturaCount.altos + mortalidadeCount.altos;

  const temAlerta   = !carregando && (totalCriticos > 0 || totalAltos > 0);
  const tudoRegular = !carregando && !temAlerta;

  // ---------------------------------------------------------------------------

  if (erro) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-300">
        <p className="font-semibold">Erro ao carregar dados</p>
        <p className="mt-1 font-mono text-xs">{erro}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── Barra de situação geral ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
          Situação geral
        </p>
        <div className="flex flex-wrap gap-2">
          <AreaStatusPill nome="Qualidade da Água" carregando={carregando} semDados={false}
            criticos={sisaguaCount.criticos} altos={sisaguaCount.altos} />
          <AreaStatusPill nome="Orçamento" carregando={carregando} semDados={!siopsResumo && !carregando}
            criticos={siopsCount.criticos} altos={siopsCount.altos} />
          <AreaStatusPill nome="Vacinação" carregando={carregando} semDados={false}
            criticos={pniCoberturaCount.criticos} altos={pniCoberturaCount.altos} />
          <AreaStatusPill nome="Mortalidade" carregando={carregando} semDados={false}
            criticos={mortalidadeCount.criticos} altos={mortalidadeCount.altos} />
          <AreaStatusPill nome="Vigilância" carregando={carregando} semDados={false}
            criticos={infodengueCount.criticos} altos={infodengueCount.altos} />
        </div>
      </div>

      {/* ── Verificar agora ── */}
      {!carregando && temAlerta && (
        <div className="space-y-2">
          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Verificar agora
          </p>

          {(sisaguaCount.criticos > 0 || sisaguaCount.altos > 0) && (
            <ItemAlerta
              icone={<Droplets className="h-5 w-5" />}
              titulo="Qualidade da Água"
              descricao="Amostras, E. coli, coliformes e parâmetros fora do padrão"
              valor={sisaguaCount.criticos + sisaguaCount.altos}
              nivel={sisaguaCount.criticos > 0 ? "critico" : "alto"}
              href="/painel-saude/qualidade-agua"
            />
          )}

          {(siopsCount.criticos > 0 || siopsCount.altos > 0) && (
            <ItemAlerta
              icone={<DollarSign className="h-5 w-5" />}
              titulo="Orçamento e Aplicação"
              descricao="Aplicação mínima em saúde, despesa total e variações atípicas"
              valor={siopsCount.criticos + siopsCount.altos}
              nivel={siopsCount.criticos > 0 ? "critico" : "alto"}
              href="/painel-saude/orcamento"
            />
          )}

          {(pniCoberturaCount.criticos > 0 || pniCoberturaCount.altos > 0) && (
            <ItemAlerta
              icone={<ShieldCheck className="h-5 w-5" />}
              titulo="Vacinação"
              descricao="Doses aplicadas, cobertura vacinal e municípios abaixo da referência"
              valor={pniCoberturaCount.criticos + pniCoberturaCount.altos}
              nivel={pniCoberturaCount.criticos > 0 ? "critico" : "alto"}
              href="/painel-saude/vacinacao"
            />
          )}

          {(mortalidadeCount.criticos > 0 || mortalidadeCount.altos > 0) && (
            <ItemAlerta
              icone={<Heart className="h-5 w-5" />}
              titulo="Mortalidade e Nascidos Vivos"
              descricao="Mortalidade infantil, óbitos maternos, nascimentos e pré-natal"
              valor={mortalidadeCount.criticos + mortalidadeCount.altos}
              nivel={mortalidadeCount.criticos > 0 ? "critico" : "alto"}
              href="/painel-saude/mortalidade"
            />
          )}

          {(infodengueCount.criticos > 0 || infodengueCount.altos > 0) && (
            <ItemAlerta
              icone={<AlertTriangle className="h-5 w-5" />}
              titulo="Vigilância Epidemiológica"
              descricao="Dengue, chikungunya e zika — alertas semanais por município"
              valor={infodengueCount.criticos + infodengueCount.altos}
              nivel={infodengueCount.criticos > 0 ? "critico" : "alto"}
              href="/painel-saude/vigilancia"
            />
          )}
        </div>
      )}

      {/* ── Tudo regular ── */}
      {tudoRegular && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-800/40 dark:bg-emerald-900/20">
          <div className="flex items-center gap-3">
            <div className="shrink-0 rounded-full bg-emerald-100 p-2.5 dark:bg-emerald-900/40">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4 12 14.01l-3-3" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-emerald-800 dark:text-emerald-300">Tudo regular</p>
              <p className="text-sm text-emerald-700/80 dark:text-emerald-400/80">
                Nenhuma área de saúde apresenta alertas críticos ou altos no momento.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Análises disponíveis ── */}
      <div>
        <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
          Análises disponíveis
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <AcessoRapido
            titulo="Qualidade da Água"
            fonte="SISAGUA"
            icone={<Droplets className="h-5 w-5" />}
            href="/painel-saude/qualidade-agua"
            criticos={sisaguaCount.criticos}
            altos={sisaguaCount.altos}
            corIcone="text-cyan-500 dark:text-cyan-400"
          />
          <AcessoRapido
            titulo="Orçamento e Aplicação"
            fonte="SIOPS"
            icone={<DollarSign className="h-5 w-5" />}
            href="/painel-saude/orcamento"
            criticos={siopsCount.criticos}
            altos={siopsCount.altos}
            corIcone="text-blue-500 dark:text-blue-400"
          />
          <AcessoRapido
            titulo="Vacinação"
            fonte="PNI/RNDS"
            icone={<ShieldCheck className="h-5 w-5" />}
            href="/painel-saude/vacinacao"
            criticos={pniCoberturaCount.criticos}
            altos={pniCoberturaCount.altos}
            corIcone="text-emerald-500 dark:text-emerald-400"
          />
          <AcessoRapido
            titulo="Mortalidade e Nascidos Vivos"
            fonte="SIM/SINASC"
            icone={<Heart className="h-5 w-5" />}
            href="/painel-saude/mortalidade"
            criticos={mortalidadeCount.criticos}
            altos={mortalidadeCount.altos}
            corIcone="text-rose-500 dark:text-rose-400"
          />
          <AcessoRapido
            titulo="Vigilância Epidemiológica"
            fonte="InfoDengue"
            icone={<AlertTriangle className="h-5 w-5" />}
            href="/painel-saude/vigilancia"
            criticos={infodengueCount.criticos}
            altos={infodengueCount.altos}
            corIcone="text-rose-500 dark:text-rose-400"
          />
        </div>
      </div>

      {/* ── Em desenvolvimento ── */}
      <div>
        <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
          Em desenvolvimento
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <CardEmBreve
            titulo="Estrutura da Rede"
            fonte="CNES/UBS"
            icone={<Building2 className="h-5 w-5" />}
          />
          <CardEmBreve
            titulo="Produção Assistencial"
            fonte="SIA/SIH"
            icone={<Activity className="h-5 w-5" />}
          />
        </div>
      </div>

    </div>
  );
}
