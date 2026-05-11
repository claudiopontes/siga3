"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Droplets,
  DollarSign,
  Building2,
  Activity,
  ShieldCheck,
  Heart,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface SaudeAlerta {
  id_alerta:             number | null;
  area:                  string;
  fonte:                 string;
  codigo_municipio_ibge: string | null;
  nome_municipio:        string | null;
  tipo_alerta:           string;
  nivel:                 string;
  descricao:             string;
  valor_observado:       number | null;
  valor_referencia:      number | null;
  prioridade:            number | null;
  detalhe_json:          unknown;
  atualizado_em:         string;
}

// ---------------------------------------------------------------------------
// Card de módulo de análise
// ---------------------------------------------------------------------------

interface ModuloCardProps {
  titulo:          string;
  descricao:       string;
  fonte:           string;
  icone:           React.ReactNode;
  href?:           string;
  status:          "disponivel" | "preparacao";
  criticos?:       number;
  altos?:          number;
  corIcone?:       string;
  corBorda?:       string;
  corFonteBadge?:  string;
}

function ModuloCard({
  titulo, descricao, fonte, icone, href, status,
  criticos = 0, altos = 0,
  corIcone    = "text-gray-400 dark:text-gray-500",
  corBorda    = "border-gray-200 dark:border-gray-700",
  corFonteBadge = "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
}: ModuloCardProps) {
  const disponivel = status === "disponivel";

  const card = (
    <div
      className={`group flex h-full flex-col rounded-xl border ${corBorda} bg-white p-5 transition-all dark:bg-gray-800 ${
        disponivel ? "cursor-pointer hover:shadow-md hover:shadow-gray-100 dark:hover:shadow-none" : "opacity-60"
      }`}
    >
      {/* Topo: ícone */}
      <div className="mb-4">
        <div className="inline-flex rounded-lg bg-gray-50 p-2 dark:bg-gray-700/50">
          <div className={`h-5 w-5 ${corIcone}`}>{icone}</div>
        </div>
      </div>

      {/* Título e descrição */}
      <h3 className="mb-1 text-sm font-semibold text-gray-800 dark:text-white">{titulo}</h3>
      <p className="mb-4 flex-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{descricao}</p>

      {/* Rodapé: fonte + contadores + ação */}
      <div className="space-y-3">
        {/* Fonte + contadores de alerta */}
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${corFonteBadge}`}>{fonte}</span>
          {disponivel && criticos > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600 dark:bg-red-900/30 dark:text-red-400">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              {criticos} crítico{criticos !== 1 ? "s" : ""}
            </span>
          )}
          {disponivel && altos > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
              <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
              {altos} alto{altos !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Botão de ação */}
        <div className="flex items-center justify-end border-t border-gray-100 pt-2 dark:border-gray-700/60">
          {disponivel && href ? (
            <span className="flex items-center gap-1 text-xs font-medium text-blue-600 group-hover:gap-2 dark:text-blue-400 transition-all">
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

export default function PainelSaudeClient() {
  const [alertas, setAlertas] = useState<SaudeAlerta[]>([]);
  const [erro,    setErro]    = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/saude/alertas?home=1")
      .then((r) => r.json())
      .then((als) => setAlertas(Array.isArray(als) ? als : []))
      .catch((e: unknown) => {
        setErro(e instanceof Error ? e.message : "Erro ao carregar dados.");
      });
  }, []);

  // Contadores por fonte (para badges nos cards de módulo)
  const contagemPorFonte = useMemo(() => {
    const acc: Record<string, { criticos: number; altos: number }> = {};
    for (const a of alertas) {
      if (!acc[a.fonte]) acc[a.fonte] = { criticos: 0, altos: 0 };
      if (a.nivel === "CRITICO") acc[a.fonte].criticos++;
      if (a.nivel === "ALTO")    acc[a.fonte].altos++;
    }
    return acc;
  }, [alertas]);

  const sisaguaCount    = contagemPorFonte["SISAGUA"]    ?? { criticos: 0, altos: 0 };
  const siopsCount      = contagemPorFonte["SIOPS"]      ?? { criticos: 0, altos: 0 };
  const cnesUbsCount    = contagemPorFonte["CNES_UBS"]   ?? { criticos: 0, altos: 0 };
  const infodengueCount = contagemPorFonte["INFODENGUE"] ?? { criticos: 0, altos: 0 };

  // ---------------------------------------------------------------------------
  // Render
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
    <div className="space-y-6">

      {/* ── Módulos de análise ── */}
      <div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">

          <ModuloCard
            titulo="Qualidade da Água"
            descricao="Amostras, E. coli, coliformes e parâmetros fora do padrão."
            fonte="SISAGUA"
            icone={<Droplets className="h-5 w-5" />}
            href="/painel-saude/qualidade-agua"
            status="disponivel"
            criticos={sisaguaCount.criticos}
            altos={sisaguaCount.altos}
            corIcone="text-cyan-500 dark:text-cyan-400"
            corBorda="border-cyan-200 dark:border-cyan-800/40"
            corFonteBadge="bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300"
          />

          <ModuloCard
            titulo="Orçamento e Aplicação"
            descricao="Aplicação mínima em saúde, despesa total, dados incompletos e variações atípicas."
            fonte="SIOPS"
            icone={<DollarSign className="h-5 w-5" />}
            href="/painel-saude/orcamento"
            status="disponivel"
            criticos={siopsCount.criticos}
            altos={siopsCount.altos}
            corIcone="text-blue-500 dark:text-blue-400"
            corBorda="border-blue-200 dark:border-blue-800/40"
            corFonteBadge="bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
          />

          <ModuloCard
            titulo="Estrutura da Rede"
            descricao="Estabelecimentos, UBS ativas, unidades inativas e atualização cadastral."
            fonte="CNES/UBS"
            icone={<Building2 className="h-5 w-5" />}
            status="preparacao"
            criticos={cnesUbsCount.criticos}
            altos={cnesUbsCount.altos}
            corIcone="text-teal-500 dark:text-teal-400"
            corBorda="border-teal-200 dark:border-teal-800/40"
            corFonteBadge="bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300"
          />

          <ModuloCard
            titulo="Produção Assistencial"
            descricao="Atendimentos, internações, produção ambulatorial e valores aprovados."
            fonte="SIA/SIH"
            icone={<Activity className="h-5 w-5" />}
            status="preparacao"
          />

          <ModuloCard
            titulo="Vacinação"
            descricao="Doses aplicadas, cobertura vacinal e queda de imunização."
            fonte="SI-PNI"
            icone={<ShieldCheck className="h-5 w-5" />}
            status="preparacao"
          />

          <ModuloCard
            titulo="Mortalidade e Nascidos Vivos"
            descricao="Mortalidade infantil, óbitos maternos, nascimentos e pré-natal."
            fonte="SIM/SINASC"
            icone={<Heart className="h-5 w-5" />}
            status="preparacao"
          />

          <ModuloCard
            titulo="Vigilância Epidemiológica"
            descricao="Dengue, chikungunya e zika — alertas semanais por município do Acre."
            fonte="InfoDengue"
            icone={<AlertTriangle className="h-5 w-5" />}
            href="/painel-saude/vigilancia"
            status="disponivel"
            criticos={infodengueCount.criticos}
            altos={infodengueCount.altos}
            corIcone="text-rose-500 dark:text-rose-400"
            corBorda="border-rose-200 dark:border-rose-800/40"
            corFonteBadge="bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
          />

        </div>
      </div>

    </div>
  );
}
