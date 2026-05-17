"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface OcorrenciaAgrupada {
  tipo_alerta:         string;
  municipios_afetados: number;
  alertas_criticos:    number;
  alertas_altos:       number;
  alertas_medios:      number;
  alertas_baixos:      number;
  descricao_exemplo:   string;
}

interface OcorrenciasResponse {
  an_exercicio: number;
  nr_periodo:   number;
  ocorrencias:  OcorrenciaAgrupada[];
}

interface PeriodoDisponivel {
  an_exercicio: number;
  nr_periodo: number;
}

interface MunicipioRreo {
  id_municipio: number;
  no_municipio: string | null;
  situacao_envio: string | null;
  total_contas: number | null;
  alertas_criticos: number;
  alertas_altos: number;
  alertas_medios: number;
  alertas_baixos: number;
  principal_ocorrencia: string | null;
  atualizado_em: string | null;
}

interface ResumoRreo {
  total_municipios: number;
  com_dado: number;
  sem_dado: number;
  com_critico: number;
  com_alto: number;
  com_medio: number;
  sem_alerta: number;
}

interface PainelRreoResponse {
  an_exercicio: number | null;
  nr_periodo: number | null;
  periodos: PeriodoDisponivel[];
  resumo: ResumoRreo;
  municipios: MunicipioRreo[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NIVEL_ORDEM: Record<string, number> = {
  CRITICO: 0, ALTO: 1, MEDIO: 2, BAIXO: 3,
};

function nivelPrincipal(m: MunicipioRreo): string {
  if (m.situacao_envio === "SEM_DADO") return "SEM_DADO";
  if (m.alertas_criticos > 0) return "CRITICO";
  if (m.alertas_altos    > 0) return "ALTO";
  if (m.alertas_medios   > 0) return "MEDIO";
  if (m.alertas_baixos   > 0) return "BAIXO";
  return "OK";
}

const NIVEL_BADGE: Record<string, string> = {
  CRITICO:  "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  ALTO:     "bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  MEDIO:    "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  BAIXO:    "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  SEM_DADO: "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400",
  OK:       "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
};

const NIVEL_DOT: Record<string, string> = {
  CRITICO: "bg-red-500", ALTO: "bg-orange-400", MEDIO: "bg-yellow-400",
  BAIXO: "bg-green-500", SEM_DADO: "bg-gray-400", OK: "bg-emerald-500",
};

const NIVEL_LABEL: Record<string, string> = {
  CRITICO: "Crítico", ALTO: "Alto", MEDIO: "Médio",
  BAIXO: "Baixo", SEM_DADO: "Sem entrega", OK: "Regular",
};

function NivelBadge({ nivel }: { nivel: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${NIVEL_BADGE[nivel] ?? NIVEL_BADGE.OK}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${NIVEL_DOT[nivel] ?? NIVEL_DOT.OK}`} />
      {NIVEL_LABEL[nivel] ?? nivel}
    </span>
  );
}

function ContadorBadge({ valor, cor }: { valor: number; cor: string }) {
  if (valor === 0) return <span className="text-xs text-gray-300 dark:text-gray-600">—</span>;
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-bold ${cor}`}>
      {valor}
    </span>
  );
}

function KpiCard({ label, valor, sub, destaque }: { label: string; valor: number | string; sub?: string; destaque?: "critico" | "alto" | "ok" }) {
  const cor = destaque === "critico" ? "text-red-600 dark:text-red-400"
    : destaque === "alto"   ? "text-orange-500 dark:text-orange-400"
    : destaque === "ok"     ? "text-emerald-600 dark:text-emerald-400"
    : "text-gray-900 dark:text-white";
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${cor}`}>{valor}</p>
      {sub && <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">{sub}</p>}
    </div>
  );
}

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return "—";
  }
}

const BIMESTRES: Record<number, string> = {
  1: "1º Bimestre", 2: "2º Bimestre", 3: "3º Bimestre",
  4: "4º Bimestre", 5: "5º Bimestre", 6: "6º Bimestre",
};

// ---------------------------------------------------------------------------
// Metadados de tipo_alerta para exibição
// ---------------------------------------------------------------------------

interface TipoAlertaMeta {
  label:     string;
  categoria: string;
  cor:       string;
}

const TIPO_ALERTA_META: Record<string, TipoAlertaMeta> = {
  rreo_sem_dado_recente: {
    label:     "Ausência de entrega",
    categoria: "Entrega",
    cor:       "border-orange-200 bg-orange-50 dark:border-orange-800/40 dark:bg-orange-900/10",
  },
  rreo_dado_incompleto: {
    label:     "Dado incompleto",
    categoria: "Qualidade",
    cor:       "border-yellow-200 bg-yellow-50 dark:border-yellow-800/40 dark:bg-yellow-900/10",
  },
  rreo_variacao_atipica: {
    label:     "Variação atípica de despesas",
    categoria: "Variação",
    cor:       "border-indigo-200 bg-indigo-50 dark:border-indigo-800/40 dark:bg-indigo-900/10",
  },
};

function tipoMeta(tipo: string): TipoAlertaMeta {
  return TIPO_ALERTA_META[tipo] ?? {
    label:     tipo.replace(/_/g, " "),
    categoria: "Outra",
    cor:       "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/40",
  };
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function RreoClient() {
  const [dados, setDados]               = useState<PainelRreoResponse | null>(null);
  const [ocorrencias, setOcorrencias]   = useState<OcorrenciaAgrupada[]>([]);
  const [carregando, setCarregando]     = useState(true);
  const [erro, setErro]                 = useState<string | null>(null);

  // Filtros locais
  const [filtroAno,       setFiltroAno]       = useState<string>("");
  const [filtroPeriodo,   setFiltroPeriodo]   = useState<string>("");
  const [filtroMunicipio, setFiltroMunicipio] = useState<string>("");
  const [filtroNivel,     setFiltroNivel]     = useState<string>("");

  const buscar = useCallback((ano: string, periodo: string, municipio: string, nivel: string) => {
    setCarregando(true);
    setErro(null);
    setOcorrencias([]);

    const params = new URLSearchParams();
    if (ano)       params.set("an_exercicio", ano);
    if (periodo)   params.set("nr_periodo",   periodo);
    if (municipio) params.set("municipio",    municipio);
    if (nivel)     params.set("nivel",        nivel);

    fetch(`/api/siconfi/rreo/painel?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<PainelRreoResponse>;
      })
      .then((data) => {
        setDados(data);
        // Inicializa selects na primeira carga
        if (!filtroAno && data.an_exercicio) {
          setFiltroAno(String(data.an_exercicio));
          setFiltroPeriodo(String(data.nr_periodo ?? ""));
        }
        // Busca agrupamento de ocorrências para o período resolvido
        const resolvedAno     = data.an_exercicio;
        const resolvedPeriodo = data.nr_periodo;
        if (resolvedAno && resolvedPeriodo) {
          fetch(`/api/siconfi/rreo/ocorrencias?an_exercicio=${resolvedAno}&nr_periodo=${resolvedPeriodo}`)
            .then((r2) => (r2.ok ? r2.json() as Promise<OcorrenciasResponse> : Promise.resolve({ ocorrencias: [] })))
            .then((oData) => setOcorrencias(oData.ocorrencias ?? []))
            .catch(() => setOcorrencias([]));
        }
      })
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : "Erro ao carregar dados."))
      .finally(() => setCarregando(false));
  }, [filtroAno]);

  // Carga inicial
  useEffect(() => {
    buscar("", "", "", "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dispara nova busca quando filtros de período mudam (ano ou bimestre)
  useEffect(() => {
    if (!filtroAno && !filtroPeriodo) return;
    buscar(filtroAno, filtroPeriodo, filtroMunicipio, filtroNivel);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroAno, filtroPeriodo]);

  function aplicarFiltros() {
    buscar(filtroAno, filtroPeriodo, filtroMunicipio, filtroNivel);
  }

  function limparFiltros() {
    setFiltroMunicipio("");
    setFiltroNivel("");
    buscar(filtroAno, filtroPeriodo, "", "");
  }

  const municipios = dados?.municipios ?? [];
  const resumo     = dados?.resumo;
  const periodos   = dados?.periodos ?? [];

  // Anos únicos disponíveis
  const anosDisponiveis = [...new Set(periodos.map((p) => p.an_exercicio))].sort((a, b) => b - a);
  const bimestresAno = filtroPeriodo
    ? periodos.filter((p) => p.an_exercicio === Number(filtroAno))
    : periodos.filter((p) => p.an_exercicio === Number(filtroAno));

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-5">

      {/* ── Cabeçalho ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-1 flex items-center gap-2">
          <Link
            href="/painel-siconfi"
            className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Execução Orçamentária
          </Link>
        </div>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">
          RREO — Relatório Resumido da Execução Orçamentária
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Acompanhamento bimestral da execução orçamentária dos municípios do Acre com base nos
          dados do SICONFI/Tesouro Nacional. Identificação de pendências de entrega e variações
          para verificação prioritária pelo gabinete.
        </p>
      </div>

      {/* ── KPI Cards ── */}
      {resumo && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard label="Municípios analisados"  valor={resumo.total_municipios} />
          <KpiCard label="Com dado entregue"       valor={resumo.com_dado}   destaque="ok" />
          <KpiCard label="Sem entrega"             valor={resumo.sem_dado}   destaque={resumo.sem_dado   > 0 ? "critico" : undefined} />
          <KpiCard label="Verificar com prioridade" valor={resumo.com_critico} destaque={resumo.com_critico > 0 ? "critico" : undefined} sub="alertas críticos" />
          <KpiCard label="Atenção"                 valor={resumo.com_alto}   destaque={resumo.com_alto   > 0 ? "alto" : undefined} sub="alertas altos" />
          <KpiCard label="Situação regular"        valor={resumo.sem_alerta} destaque="ok" sub="sem ocorrências" />
        </div>
      )}

      {/* ── Principais ocorrências no período ── */}
      {ocorrencias.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-white">
              Principais ocorrências no período
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Agrupamento por tipo de ocorrência — indica onde o gabinete deve concentrar a verificação
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ocorrencias.map((oc) => {
              const meta          = tipoMeta(oc.tipo_alerta);
              const nivelMaximo   =
                oc.alertas_criticos > 0 ? "CRITICO"
                : oc.alertas_altos  > 0 ? "ALTO"
                : oc.alertas_medios > 0 ? "MEDIO"
                : "BAIXO";
              return (
                <div
                  key={oc.tipo_alerta}
                  className={`rounded-lg border p-4 ${meta.cor}`}
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-800 dark:text-white leading-tight">
                      {meta.label}
                    </p>
                    <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium bg-white/60 text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
                      {meta.categoria}
                    </span>
                  </div>

                  <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                    {oc.municipios_afetados} município{oc.municipios_afetados !== 1 ? "s" : ""} com ponto de atenção
                  </p>

                  <div className="flex flex-wrap gap-1.5">
                    {oc.alertas_criticos > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                        {oc.alertas_criticos} crítico{oc.alertas_criticos !== 1 ? "s" : ""}
                      </span>
                    )}
                    {oc.alertas_altos > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                        {oc.alertas_altos} alto{oc.alertas_altos !== 1 ? "s" : ""}
                      </span>
                    )}
                    {oc.alertas_medios > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-50 px-2 py-0.5 text-xs font-semibold text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
                        {oc.alertas_medios} médio{oc.alertas_medios !== 1 ? "s" : ""}
                      </span>
                    )}
                    {oc.alertas_baixos > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                        {oc.alertas_baixos} baixo{oc.alertas_baixos !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>

                  {nivelMaximo === "ALTO" && oc.tipo_alerta === "rreo_sem_dado_recente" && (
                    <p className="mt-2 text-[11px] text-orange-600 dark:text-orange-400">
                      Verificar com prioridade — entrega pendente no SICONFI
                    </p>
                  )}
                  {nivelMaximo === "ALTO" && oc.tipo_alerta === "rreo_variacao_atipica" && (
                    <p className="mt-2 text-[11px] text-indigo-600 dark:text-indigo-400">
                      Variação superior a 100% nas despesas em relação ao período anterior
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Filtros ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-wrap items-end gap-3">

          {/* Exercício */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Exercício
            </label>
            <select
              value={filtroAno}
              onChange={(e) => { setFiltroAno(e.target.value); setFiltroPeriodo(""); }}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
            >
              {anosDisponiveis.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {/* Bimestre */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Período
            </label>
            <select
              value={filtroPeriodo}
              onChange={(e) => setFiltroPeriodo(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
            >
              {bimestresAno.map((p) => (
                <option key={p.nr_periodo} value={p.nr_periodo}>
                  {BIMESTRES[p.nr_periodo] ?? `Período ${p.nr_periodo}`}
                </option>
              ))}
            </select>
          </div>

          {/* Município */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Município
            </label>
            <input
              type="text"
              placeholder="Buscar município..."
              value={filtroMunicipio}
              onChange={(e) => setFiltroMunicipio(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && aplicarFiltros()}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 placeholder-gray-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-500"
            />
          </div>

          {/* Nível */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Nível de alerta
            </label>
            <select
              value={filtroNivel}
              onChange={(e) => setFiltroNivel(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
            >
              <option value="">Todos os níveis</option>
              <option value="CRITICO">Crítico</option>
              <option value="ALTO">Alto</option>
              <option value="MEDIO">Médio</option>
              <option value="BAIXO">Baixo</option>
            </select>
          </div>

          {/* Ações */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={aplicarFiltros}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              Filtrar
            </button>
            {(filtroMunicipio || filtroNivel) && (
              <button
                type="button"
                onClick={limparFiltros}
                className="rounded-lg border border-gray-200 px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Limpar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Estado de carregamento ── */}
      {carregando && (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
          <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Carregando dados RREO...</p>
        </div>
      )}

      {/* ── Erro ── */}
      {!carregando && erro && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300">
          <p className="font-semibold">Não foi possível carregar os dados</p>
          <p className="mt-1 font-mono text-xs">{erro}</p>
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            Verifique se o ETL SICONFI/RREO foi executado e se os marts estão atualizados.
          </p>
        </div>
      )}

      {/* ── Sem dados ── */}
      {!carregando && !erro && municipios.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center dark:border-gray-700 dark:bg-gray-800">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Nenhum município encontrado para o período selecionado.
          </p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            Execute o ETL SICONFI/RREO para carregar os dados do exercício desejado.
          </p>
        </div>
      )}

      {/* ── Tabela principal ── */}
      {!carregando && !erro && municipios.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">

          {/* Cabeçalho da tabela */}
          <div className="border-b border-gray-100 px-5 py-3 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {dados?.an_exercicio && dados?.nr_periodo && (
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {BIMESTRES[dados.nr_periodo] ?? `Período ${dados.nr_periodo}`}/{dados.an_exercicio}
                </span>
              )}
              {" · "}
              {municipios.length} município{municipios.length !== 1 ? "s" : ""}{" "}
              {filtroMunicipio || filtroNivel ? "filtrados" : "analisados"} ·{" "}
              ordenados por prioridade de verificação
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Situação
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Município
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Críticos
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Altos
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Médios
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Principal ocorrência
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Registros
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Atualizado em
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {municipios
                  .slice()
                  .sort((a, b) => {
                    // SEM_DADO atrás de todos os alertas
                    const na = nivelPrincipal(a);
                    const nb = nivelPrincipal(b);
                    const oa = na === "SEM_DADO" ? 98 : na === "OK" ? 99 : (NIVEL_ORDEM[na] ?? 50);
                    const ob = nb === "SEM_DADO" ? 98 : nb === "OK" ? 99 : (NIVEL_ORDEM[nb] ?? 50);
                    if (oa !== ob) return oa - ob;
                    return (a.no_municipio ?? "").localeCompare(b.no_municipio ?? "");
                  })
                  .map((m) => {
                    const nivel = nivelPrincipal(m);
                    const rowBg = nivel === "CRITICO"
                      ? "bg-red-50/40 dark:bg-red-900/10"
                      : nivel === "ALTO"
                        ? "bg-orange-50/40 dark:bg-orange-900/10"
                        : "";
                    return (
                      <tr key={m.id_municipio} className={`hover:bg-gray-50 dark:hover:bg-gray-800/60 ${rowBg}`}>
                        <td className="px-4 py-3">
                          <NivelBadge nivel={nivel} />
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                          <Link
                            href={`/painel-siconfi/rreo/${m.id_municipio}`}
                            className="hover:text-blue-600 hover:underline dark:hover:text-blue-400"
                          >
                            {m.no_municipio ?? `Cód. ${m.id_municipio}`}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <ContadorBadge
                            valor={m.alertas_criticos}
                            cor="bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <ContadorBadge
                            valor={m.alertas_altos}
                            cor="bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <ContadorBadge
                            valor={m.alertas_medios}
                            cor="bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                          />
                        </td>
                        <td className="max-w-xs px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
                          {m.principal_ocorrencia ?? (nivel === "OK" ? "Sem ocorrências" : "—")}
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-gray-500 dark:text-gray-400">
                          {m.total_contas !== null ? m.total_contas : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500">
                          {formatarData(m.atualizado_em)}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {/* Rodapé informativo */}
          <div className="border-t border-gray-100 px-5 py-3 dark:border-gray-700">
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              Fonte: SICONFI / Tesouro Nacional · STN · Dados carregados via ETL do Varadouro Digital ·{" "}
              Ordenação: verificar com prioridade primeiro
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
