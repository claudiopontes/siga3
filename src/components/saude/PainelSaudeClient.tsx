"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";

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

interface SaudeMunicipioResumo {
  codigo_municipio_ibge:         string;
  nome_municipio:                string | null;
  uf:                            string | null;
  siops_ano:                     number | null;
  siops_periodo:                 string | null;
  percentual_aplicado_saude:     number | null;
  despesa_total_saude:           number | null;
  receita_base_calculo:          number | null;
  siops_total_indicadores:       number;
  siops_situacao_envio:          string | null;
  total_estabelecimentos:        number;
  total_estabelecimentos_sus:    number;
  total_ubs:                     number;
  total_ubs_ativas:              number;
  total_inativos:                number;
  total_sem_atualizacao_recente: number;
  data_mais_recente_atualizacao: string | null;
  sisagua_total_amostras:        number | null;
  sisagua_total_fora_padrao:     number | null;
  sisagua_total_ecoli:           number | null;
  sisagua_total_coliformes:      number | null;
  sisagua_percentual_fora_padrao: number | null;
  sisagua_data_ultima_coleta:    string | null;
  total_alertas:                 number;
  total_criticos:                number;
  total_altos:                   number;
  total_medios:                  number;
  score_risco:                   number;
  nivel_risco:                   string | null;
  atualizado_em:                 string;
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

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function fmtNum(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return Number(v).toLocaleString("pt-BR");
}

function labelPeriodo(siopsAno: number | null, siopsPerido: string | null): string {
  if (!siopsAno) return "—";
  if (!siopsPerido) return String(siopsAno);
  const bimMap: Record<string, string> = {
    "1": "1º Bim", "2": "2º Bim", "3": "3º Bim",
    "4": "4º Bim", "5": "5º Bim", "6": "6º Bim",
  };
  const per = bimMap[String(siopsPerido)] ?? `Per.${siopsPerido}`;
  return `${per}/${siopsAno}`;
}

function labelFonte(fonte: string): string {
  if (fonte === "SIOPS")    return "SIOPS";
  if (fonte === "CNES_UBS") return "CNES/UBS";
  if (fonte === "SISAGUA")  return "SISAGUA";
  return fonte;
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

function FonteBadge({ fonte }: { fonte: string }) {
  if (fonte === "SIOPS")
    return <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">SIOPS</span>;
  if (fonte === "CNES_UBS")
    return <span className="inline-flex items-center rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-700 dark:bg-teal-900/30 dark:text-teal-300">CNES/UBS</span>;
  if (fonte === "SISAGUA")
    return <span className="inline-flex items-center rounded-full bg-cyan-100 px-2 py-0.5 text-xs font-medium text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300">SISAGUA</span>;
  return <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">{fonte}</span>;
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
// Card de análise complementar
// ---------------------------------------------------------------------------

interface AnaliseCardProps {
  titulo: string;
  subtitulo: string;
  fonte: string;
  href?: string;
  emPreparacao?: boolean;
  corBorda?: string;
  corFonte?: string;
}

function AnaliseCard({ titulo, subtitulo, fonte, href, emPreparacao, corBorda = "border-gray-200", corFonte = "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300" }: AnaliseCardProps) {
  const conteudo = (
    <div className={`rounded-xl border ${corBorda} bg-white p-5 transition-shadow dark:bg-gray-800 ${emPreparacao ? "opacity-60" : "hover:shadow-md"}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-white">{titulo}</h3>
        {emPreparacao && (
          <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
            Em preparação
          </span>
        )}
      </div>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{subtitulo}</p>
      <div className="flex items-center justify-between">
        <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${corFonte}`}>{fonte}</span>
        {!emPreparacao && href && (
          <span className="text-xs font-medium text-blue-600 dark:text-blue-400">Ver análise →</span>
        )}
      </div>
    </div>
  );

  if (!emPreparacao && href) {
    return <Link href={href}>{conteudo}</Link>;
  }
  return conteudo;
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function PainelSaudeClient() {
  const [resumo, setResumo] = useState<SaudeResumoHome | null>(null);
  const [municipios, setMunicipios] = useState<SaudeMunicipioResumo[]>([]);
  const [alertas, setAlertas] = useState<SaudeAlerta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Filtros do ranking
  const [buscaMunicipio, setBuscaMunicipio] = useState("");
  const [filtroRisco, setFiltroRisco] = useState<string>("todos");

  // Filtro de fonte dos alertas
  const [filtroFonte, setFiltroFonte] = useState<string>("todas");

  useEffect(() => {
    Promise.all([
      fetch("/api/saude/resumo").then((r) => r.json()),
      fetch("/api/saude/municipios?orderBy=score_risco&orderDir=desc&pageSize=50").then((r) => r.json()),
      fetch("/api/saude/alertas?home=1").then((r) => r.json()),
    ])
      .then(([res, muns, als]) => {
        setResumo(res ?? null);
        setMunicipios(Array.isArray(muns) ? muns : []);
        setAlertas(Array.isArray(als) ? als : []);
      })
      .catch((e: unknown) => {
        setErro(e instanceof Error ? e.message : "Erro ao carregar dados.");
      })
      .finally(() => setCarregando(false));
  }, []);

  const municipiosFiltrados = useMemo(() => {
    return municipios.filter((m) => {
      const nome = (m.nome_municipio ?? "").toLowerCase();
      if (buscaMunicipio && !nome.includes(buscaMunicipio.toLowerCase())) return false;
      if (filtroRisco !== "todos" && (m.nivel_risco ?? "BAIXO") !== filtroRisco) return false;
      return true;
    });
  }, [municipios, buscaMunicipio, filtroRisco]);

  const alertasFiltrados = useMemo(() => {
    return alertas
      .filter((a) => filtroFonte === "todas" || a.fonte === filtroFonte)
      .slice(0, 30);
  }, [alertas, filtroFonte]);

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
    <div className="space-y-5">

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
              <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">{municipios.length}</p>
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

      {/* ── Onde olhar primeiro? ── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <div>
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Onde olhar primeiro?</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Municípios ordenados por risco consolidado — SIOPS · CNES/UBS · SISAGUA
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              placeholder="Buscar município..."
              value={buscaMunicipio}
              onChange={(e) => setBuscaMunicipio(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
            />
            <select
              value={filtroRisco}
              onChange={(e) => setFiltroRisco(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
            >
              <option value="todos">Todos os riscos</option>
              <option value="CRITICO">Crítico</option>
              <option value="ALTO">Alto</option>
              <option value="MEDIO">Médio</option>
              <option value="BAIXO">Baixo</option>
            </select>
          </div>
        </div>

        {carregando ? (
          <div className="p-6 text-center text-sm text-gray-400">Carregando...</div>
        ) : municipiosFiltrados.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400">Nenhum município encontrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
                  <th className="px-4 py-3">Município</th>
                  <th className="px-4 py-3">Nível de risco</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Alertas</th>
                  <th className="px-4 py-3">% Saúde</th>
                  <th className="px-4 py-3">UBS ativas</th>
                  <th className="px-4 py-3">Água</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {municipiosFiltrados.map((m) => {
                  const pctSaude    = m.percentual_aplicado_saude !== null ? Number(m.percentual_aplicado_saude) : null;
                  const abaixoMin   = pctSaude !== null && pctSaude < 15;
                  const sAmostras   = m.sisagua_total_amostras ?? 0;
                  const sFora       = m.sisagua_total_fora_padrao ?? 0;
                  const sEcoli      = m.sisagua_total_ecoli ?? 0;
                  const temSisagua  = sAmostras > 0;

                  return (
                    <tr key={m.codigo_municipio_ibge} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800 dark:text-slate-100">
                        {m.nome_municipio ?? m.codigo_municipio_ibge}
                      </td>
                      <td className="px-4 py-3">
                        <NivelBadge nivel={m.nivel_risco ?? "BAIXO"} />
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {fmtNum(m.score_risco)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-700 dark:text-slate-200">{m.total_alertas}</span>
                        {(m.total_criticos > 0 || m.total_altos > 0) && (
                          <div className="mt-0.5 flex gap-2 text-xs">
                            {m.total_criticos > 0 && <span className="text-red-600 dark:text-red-400">{m.total_criticos}C</span>}
                            {m.total_altos > 0 && <span className="text-orange-600 dark:text-orange-400">{m.total_altos}A</span>}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {pctSaude !== null ? (
                          <span className={abaixoMin ? "font-semibold text-red-600 dark:text-red-400" : "font-medium text-green-700 dark:text-green-400"}>
                            {fmtPct(pctSaude)}
                          </span>
                        ) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={m.total_ubs_ativas === 0 ? "font-bold text-red-600 dark:text-red-400" : "font-medium text-slate-700 dark:text-slate-200"}>
                          {m.total_ubs_ativas === 0 ? "Nenhuma" : m.total_ubs_ativas}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {!temSisagua ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <div className="flex flex-col gap-0.5 text-slate-500 dark:text-slate-400">
                            <span>{fmtNum(sAmostras)} amostras{sFora > 0 && <span className="ml-1 font-semibold text-orange-600 dark:text-orange-400">· {sFora} fora</span>}</span>
                            {sEcoli > 0 && <span className="font-semibold text-red-600 dark:text-red-400">E. coli: {sEcoli}</span>}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Alertas prioritários ── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <div>
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Alertas prioritários</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Até 30 alertas de nível Crítico ou Alto
              {filtroFonte !== "todas" && <span className="ml-1 font-medium text-slate-500">· filtrado: {labelFonte(filtroFonte)}</span>}
            </p>
          </div>
          <select
            value={filtroFonte}
            onChange={(e) => setFiltroFonte(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          >
            <option value="todas">Todas as fontes</option>
            <option value="SIOPS">SIOPS</option>
            <option value="CNES_UBS">CNES/UBS</option>
            <option value="SISAGUA">SISAGUA</option>
          </select>
        </div>

        {carregando ? (
          <div className="p-6 text-center text-sm text-gray-400">Carregando...</div>
        ) : alertasFiltrados.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400">Nenhum alerta encontrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
                  <th className="px-4 py-3">Nível</th>
                  <th className="px-4 py-3">Fonte</th>
                  <th className="px-4 py-3">Município</th>
                  <th className="px-4 py-3">Situação identificada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {alertasFiltrados.map((a, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                    <td className="px-4 py-3"><NivelBadge nivel={a.nivel} /></td>
                    <td className="px-4 py-3"><FonteBadge fonte={a.fonte} /></td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700 dark:text-slate-200">
                      {a.nome_municipio ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-700 dark:text-slate-200">{a.descricao}</p>
                      {(a.valor_observado !== null || a.valor_referencia !== null) && (
                        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-400">
                          {a.valor_observado !== null && (
                            <span>Apurado: <span className="font-medium text-slate-600 dark:text-slate-300">{fmtPct(Number(a.valor_observado))}</span></span>
                          )}
                          {a.valor_referencia !== null && (
                            <span>Referência: <span className="font-medium text-slate-600 dark:text-slate-300">{fmtPct(Number(a.valor_referencia))}</span></span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Análises complementares ── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Análises complementares</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Módulos temáticos com aprofundamento por fonte de dados.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
          <AnaliseCard
            titulo="Qualidade da Água"
            subtitulo="Amostras, E. coli, coliformes e parâmetros fora do padrão por município."
            fonte="SISAGUA"
            href="/painel-saude/qualidade-agua"
            corBorda="border-cyan-200 dark:border-cyan-800/40"
            corFonte="bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300"
          />
          <AnaliseCard
            titulo="Produção Assistencial"
            subtitulo="Atendimentos, internações e valores aprovados."
            fonte="SIA/SIH"
            emPreparacao
          />
          <AnaliseCard
            titulo="Vacinação"
            subtitulo="Doses aplicadas, cobertura vacinal e queda de imunização."
            fonte="SI-PNI"
            emPreparacao
          />
          <AnaliseCard
            titulo="Mortalidade e Nascidos Vivos"
            subtitulo="Mortalidade infantil, óbitos maternos e nascimentos."
            fonte="SIM/SINASC"
            emPreparacao
          />
          <AnaliseCard
            titulo="Vigilância Epidemiológica"
            subtitulo="Agravos de notificação e crescimento atípico de casos."
            fonte="SINAN"
            emPreparacao
          />
        </div>
      </div>

    </div>
  );
}
