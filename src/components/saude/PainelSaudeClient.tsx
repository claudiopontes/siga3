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

interface SaudeResumoHome {
  area:                      string;
  total_alertas:             number;
  total_criticos:            number;
  total_altos:               number;
  total_medios:              number;
  total_municipios_afetados: number;
  municipios_risco_critico:  number;
  municipios_risco_alto:     number;
  municipios_risco_medio:    number;
  siops_ano:                 number | null;
  siops_periodo:             string | null;
  atualizado_em:             string;
}

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
// Helpers
// ---------------------------------------------------------------------------

function labelPeriodo(siopsAno: number | null, siopsPerido: string | null): string {
  if (!siopsAno) return "—";
  if (!siopsPerido) return String(siopsAno);
  const bimMap: Record<string, string> = {
    "1": "1º Bim", "2": "2º Bim", "3": "3º Bim",
    "4": "4º Bim", "5": "5º Bim", "6": "6º Bim",
  };
  return `${bimMap[String(siopsPerido)] ?? `Per.${siopsPerido}`}/${siopsAno}`;
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

function NivelBadge({ nivel }: { nivel: string }) {
  const n = nivel?.toUpperCase();
  if (n === "CRITICO")
    return <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">Crítico</span>;
  if (n === "ALTO")
    return <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">Alto</span>;
  if (n === "MEDIO")
    return <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">Médio</span>;
  return <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/40 dark:text-green-300">Baixo</span>;
}

function FonteBadgePequena({ fonte }: { fonte: string }) {
  if (fonte === "SIOPS")
    return <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">SIOPS</span>;
  if (fonte === "CNES_UBS")
    return <span className="rounded bg-teal-50 px-1.5 py-0.5 text-xs font-medium text-teal-600 dark:bg-teal-900/30 dark:text-teal-300">CNES/UBS</span>;
  if (fonte === "SISAGUA")
    return <span className="rounded bg-cyan-50 px-1.5 py-0.5 text-xs font-medium text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-300">SISAGUA</span>;
  return <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">{fonte}</span>;
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="mt-3 h-8 w-16 rounded bg-gray-200 dark:bg-gray-700" />
    </div>
  );
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
  const [resumo,     setResumo]     = useState<SaudeResumoHome | null>(null);
  const [totalMuns,  setTotalMuns]  = useState<number>(0);
  const [alertas,    setAlertas]    = useState<SaudeAlerta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro,       setErro]       = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/saude/resumo").then((r) => r.json()),
      fetch("/api/saude/municipios?pageSize=50").then((r) => r.json()),
      fetch("/api/saude/alertas?home=1").then((r) => r.json()),
    ])
      .then(([res, muns, als]) => {
        setResumo(res ?? null);
        setTotalMuns(Array.isArray(muns) ? muns.length : 0);
        setAlertas(Array.isArray(als) ? als : []);
      })
      .catch((e: unknown) => {
        setErro(e instanceof Error ? e.message : "Erro ao carregar dados.");
      })
      .finally(() => setCarregando(false));
  }, []);

  // Top 5 alertas críticos/altos para o bloco "Principais riscos"
  const principaisRiscos = useMemo(
    () => alertas
      .filter((a) => a.nivel === "CRITICO" || a.nivel === "ALTO")
      .slice(0, 5),
    [alertas]
  );

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

  const sisaguaCount     = contagemPorFonte["SISAGUA"]    ?? { criticos: 0, altos: 0 };
  const siopsCount       = contagemPorFonte["SIOPS"]      ?? { criticos: 0, altos: 0 };
  const cnesUbsCount     = contagemPorFonte["CNES_UBS"]   ?? { criticos: 0, altos: 0 };
  const infodengueCount  = contagemPorFonte["INFODENGUE"] ?? { criticos: 0, altos: 0 };

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

      {/* ── Cabeçalho ── */}
      <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Saúde Pública</h1>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              Visão consolidada de orçamento, estrutura da rede e vigilância sanitária dos municípios.
            </p>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              Fontes:{" "}
              <span className="font-medium text-blue-600 dark:text-blue-400">SIOPS</span>
              {" · "}
              <span className="font-medium text-teal-600 dark:text-teal-400">CNES/UBS</span>
              {" · "}
              <span className="font-medium text-cyan-600 dark:text-cyan-400">SISAGUA</span>
            </p>
          </div>
          {resumo && (
            <span className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-300">
              Período SIOPS: {labelPeriodo(resumo.siops_ano, resumo.siops_periodo)}
            </span>
          )}
        </div>
      </div>

      {/* ── Cards KPI ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {carregando ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Municípios monitorados</p>
              <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">{totalMuns}</p>
            </div>
            <div className="rounded-xl border border-red-200 bg-white p-4 dark:border-red-800/40 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wide text-red-500">Alertas críticos</p>
              <p className="mt-1 text-3xl font-bold text-red-600 dark:text-red-400">{resumo?.total_criticos ?? 0}</p>
            </div>
            <div className="rounded-xl border border-orange-200 bg-white p-4 dark:border-orange-800/40 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wide text-orange-500">Alertas altos</p>
              <p className="mt-1 text-3xl font-bold text-orange-600 dark:text-orange-400">{resumo?.total_altos ?? 0}</p>
            </div>
            <div className="rounded-xl border border-red-200 bg-white p-4 dark:border-red-800/40 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wide text-red-400">Municípios — risco crítico</p>
              <p className="mt-1 text-3xl font-bold text-red-600 dark:text-red-400">{resumo?.municipios_risco_critico ?? 0}</p>
            </div>
            <div className="rounded-xl border border-orange-200 bg-white p-4 dark:border-orange-800/40 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wide text-orange-400">Municípios — risco alto</p>
              <p className="mt-1 text-3xl font-bold text-orange-600 dark:text-orange-400">{resumo?.municipios_risco_alto ?? 0}</p>
            </div>
            <div className="rounded-xl border border-blue-200 bg-white p-4 dark:border-blue-800/40 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wide text-blue-400">Período SIOPS</p>
              <p className="mt-1 text-lg font-bold text-blue-600 dark:text-blue-400">
                {labelPeriodo(resumo?.siops_ano ?? null, resumo?.siops_periodo ?? null)}
              </p>
            </div>
          </>
        )}
      </div>

      {/* ── Principais riscos atuais ── */}
      {!carregando && principaisRiscos.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-700">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Principais riscos atuais</h2>
            <p className="mt-0.5 text-xs text-slate-400">Alertas críticos e altos com maior prioridade</p>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {principaisRiscos.map((a, i) => (
              <div key={i} className="flex items-start gap-3 px-5 py-3">
                <div className="mt-0.5 shrink-0">
                  <NivelBadge nivel={a.nivel} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-700 dark:text-slate-200">{a.descricao}</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <FonteBadgePequena fonte={a.fonte} />
                    {a.nome_municipio && (
                      <span className="text-xs text-slate-400">{a.nome_municipio}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Módulos de análise ── */}
      <div>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-slate-700 dark:text-slate-200">Módulos de análise</h2>
          <p className="mt-0.5 text-sm text-slate-400">
            Acesse análises específicas por dimensão da saúde pública.
          </p>
        </div>
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
            status="preparacao"
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
