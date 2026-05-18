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

function AcessoRapido({
  titulo, descricao, fonte, icone, href, criticos = 0, altos = 0,
  corIcone = "text-gray-400 dark:text-gray-500",
}: {
  titulo: string;
  descricao: string;
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
        criticos > 0
          ? "border-red-200 hover:shadow-sm dark:border-red-800/40"
          : altos > 0
            ? "border-amber-200 hover:shadow-sm dark:border-amber-800/40"
            : "border-gray-200 hover:shadow-sm dark:border-gray-700"
      }`}>
        <div className={`shrink-0 rounded-lg bg-gray-50 p-2 dark:bg-gray-700/50 ${corIcone}`}>
          {icone}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-800 dark:text-white">{titulo}</p>
          <p className="truncate text-xs text-gray-400 dark:text-gray-500">{descricao || fonte}</p>
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

function CardEmBreve({ titulo, descricao, icone }: { titulo: string; descricao: string; icone: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-gray-200 bg-white px-4 py-3 opacity-60 dark:border-gray-700 dark:bg-gray-800">
      <span className="shrink-0 rounded-lg bg-gray-50 p-2 text-gray-400 dark:bg-gray-700/50">{icone}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-700 dark:text-gray-300">{titulo}</p>
        <p className="truncate text-xs text-gray-400 dark:text-gray-500">{descricao}</p>
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

  const sisaguaCount      = contagem["SISAGUA"]       ?? { criticos: 0, altos: 0 };
  const infodengueCount   = contagem["INFODENGUE"]    ?? { criticos: 0, altos: 0 };
  const pniCoberturaCount = contagem["PNI_COBERTURA"] ?? { criticos: 0, altos: 0 };
  const mortalidadeCount  = contagem["SIM_SINASC"]    ?? { criticos: 0, altos: 0 };
  const siopsCount        = { criticos: siopsResumo?.total_criticos ?? 0, altos: siopsResumo?.total_altos ?? 0 };

  if (erro) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-300">
        <p className="font-semibold">Erro ao carregar dados</p>
        <p className="mt-1 font-mono text-xs">{erro}</p>
      </div>
    );
  }

  const paineis = [
    {
      titulo: "Qualidade da Água",
      descricao: "Amostras, E. coli, coliformes e parâmetros fora do padrão",
      fonte: "SISAGUA",
      icone: <Droplets className="h-5 w-5" />,
      href: "/painel-saude/qualidade-agua",
      criticos: sisaguaCount.criticos,
      altos: sisaguaCount.altos,
      corIcone: "text-cyan-500 dark:text-cyan-400",
    },
    {
      titulo: "Orçamento e Aplicação",
      descricao: "Aplicação mínima em saúde, despesa total e variações atípicas",
      fonte: "SIOPS",
      icone: <DollarSign className="h-5 w-5" />,
      href: "/painel-saude/orcamento",
      criticos: siopsCount.criticos,
      altos: siopsCount.altos,
      corIcone: "text-blue-500 dark:text-blue-400",
    },
    {
      titulo: "Vacinação",
      descricao: "Doses aplicadas, cobertura vacinal e municípios abaixo da referência",
      fonte: "PNI/RNDS",
      icone: <ShieldCheck className="h-5 w-5" />,
      href: "/painel-saude/vacinacao",
      criticos: pniCoberturaCount.criticos,
      altos: pniCoberturaCount.altos,
      corIcone: "text-emerald-500 dark:text-emerald-400",
    },
    {
      titulo: "Mortalidade e Nascidos Vivos",
      descricao: "Mortalidade infantil, óbitos maternos, nascimentos e pré-natal",
      fonte: "SIM/SINASC",
      icone: <Heart className="h-5 w-5" />,
      href: "/painel-saude/mortalidade",
      criticos: mortalidadeCount.criticos,
      altos: mortalidadeCount.altos,
      corIcone: "text-rose-500 dark:text-rose-400",
    },
    {
      titulo: "Vigilância Epidemiológica",
      descricao: "Dengue, chikungunya e zika — alertas semanais por município",
      fonte: "InfoDengue",
      icone: <AlertTriangle className="h-5 w-5" />,
      href: "/painel-saude/vigilancia",
      criticos: infodengueCount.criticos,
      altos: infodengueCount.altos,
      corIcone: "text-amber-500 dark:text-amber-400",
    },
  ].sort((a, b) => {
    if (b.criticos !== a.criticos) return b.criticos - a.criticos;
    return b.altos - a.altos;
  });

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {carregando
        ? Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-700/50" />
          ))
        : paineis.map((p) => (
            <AcessoRapido
              key={p.href}
              titulo={p.titulo}
              descricao={p.descricao}
              fonte={p.fonte}
              icone={p.icone}
              href={p.href}
              criticos={p.criticos}
              altos={p.altos}
              corIcone={p.corIcone}
            />
          ))
      }
      {!carregando && (
        <>
          <CardEmBreve
            titulo="Estrutura da Rede"
            descricao="Cobertura de UBS, equipes e estabelecimentos"
            icone={<Building2 className="h-5 w-5" />}
          />
          <CardEmBreve
            titulo="Produção Assistencial"
            descricao="Consultas, internações e procedimentos ambulatoriais"
            icone={<Activity className="h-5 w-5" />}
          />
        </>
      )}
    </div>
  );
}
