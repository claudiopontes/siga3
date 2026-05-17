"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Info } from "lucide-react";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface PeriodoDisponivel {
  an_exercicio: number;
  nr_periodo:   number;
}

interface MunicipioRgf {
  an_exercicio:         number;
  nr_periodo:           number;
  id_municipio:         number;
  no_municipio:         string | null;
  situacao_envio:       string | null;
  total_contas:         number | null;
  status_relatorio:     string | null;
  data_entrega:         string | null;
  alertas_criticos:     number;
  alertas_altos:        number;
  alertas_medios:       number;
  alertas_baixos:       number;
  principal_ocorrencia: string | null;
  atualizado_em:        string | null;
}

interface ResumoRgf {
  total_municipios: number;
  com_dado:         number;
  sem_dado:         number;
  com_critico:      number;
  com_alto:         number;
  com_medio:        number;
  sem_alerta:       number;
}

interface PainelRgfResponse {
  an_exercicio: number | null;
  nr_periodo:   number | null;
  periodos:     PeriodoDisponivel[];
  resumo:       ResumoRgf;
  municipios:   MunicipioRgf[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NIVEL_ORDEM: Record<string, number> = {
  CRITICO: 0, ALTO: 1, MEDIO: 2, BAIXO: 3,
};

function nivelPrincipal(m: MunicipioRgf): string {
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

// RGF é quadrimestral — 3 períodos por ano
const QUADRIMESTRES: Record<number, string> = {
  1: "1º Quadrimestre", 2: "2º Quadrimestre", 3: "3º Quadrimestre",
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

function KpiCard({
  label, valor, sub, destaque,
}: {
  label: string;
  valor: number | string;
  sub?: string;
  destaque?: "critico" | "alto" | "ok";
}) {
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
  try { return new Date(iso).toLocaleDateString("pt-BR"); } catch { return "—"; }
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function RgfClient() {
  const [dados,      setDados]      = useState<PainelRgfResponse | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro,       setErro]       = useState<string | null>(null);

  const [filtroAno,       setFiltroAno]       = useState<string>("");
  const [filtroPeriodo,   setFiltroPeriodo]   = useState<string>("");
  const [filtroMunicipio, setFiltroMunicipio] = useState<string>("");
  const [filtroNivel,     setFiltroNivel]     = useState<string>("");

  const buscar = useCallback((ano: string, periodo: string, municipio: string, nivel: string) => {
    setCarregando(true);
    setErro(null);

    const params = new URLSearchParams();
    if (ano)       params.set("an_exercicio", ano);
    if (periodo)   params.set("nr_periodo",   periodo);
    if (municipio) params.set("municipio",    municipio);
    if (nivel)     params.set("nivel",        nivel);

    fetch(`/api/siconfi/rgf/painel?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<PainelRgfResponse>;
      })
      .then((data) => {
        setDados(data);
        if (!filtroAno && data.an_exercicio) {
          setFiltroAno(String(data.an_exercicio));
          setFiltroPeriodo(String(data.nr_periodo ?? ""));
        }
      })
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : "Erro ao carregar dados."))
      .finally(() => setCarregando(false));
  }, [filtroAno]);

  useEffect(() => {
    buscar("", "", "", "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const anosDisponiveis = [...new Set(periodos.map((p) => p.an_exercicio))].sort((a, b) => b - a);
  const quadrimestresAno = periodos.filter((p) => p.an_exercicio === Number(filtroAno));

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-5">

      {/* ── Cabeçalho ── */}
      <div>
        <nav className="mb-1 flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
          <Link href="/painel-siconfi" className="hover:text-gray-600 dark:hover:text-gray-300">
            Execução Orçamentária
          </Link>
          <span>/</span>
          <span className="font-medium text-gray-600 dark:text-gray-300">RGF</span>
        </nav>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          RGF — Relatório de Gestão Fiscal
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Acompanhamento da presença de dados e pontos de atenção do Relatório de Gestão Fiscal
          dos municípios do Acre com base no SICONFI / Tesouro Nacional.
        </p>
      </div>

      {/* ── Aviso institucional ── */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm dark:border-blue-900/30 dark:bg-blue-900/10">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500 dark:text-blue-400" />
        <p className="text-xs leading-relaxed text-blue-700 dark:text-blue-300">
            O painel exibe o <strong>status de entrega do RGF ao SICONFI</strong> — confirmado via Extrato de Entregas do Tesouro Nacional.
          Indicadores fiscais (despesa com pessoal em relação à RCL) serão adicionados quando disponíveis na API do DataLake.
        </p>
      </div>

      {/* ── KPI Cards ── */}
      {resumo && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard label="Municípios monitorados"   valor={resumo.total_municipios} />
          <KpiCard label="Com dado RGF entregue"    valor={resumo.com_dado}    destaque="ok" />
          <KpiCard label="Sem dado carregado"        valor={resumo.sem_dado}    destaque={resumo.sem_dado    > 0 ? "critico" : undefined} />
          <KpiCard
            label="Verificar com prioridade"
            valor={resumo.com_critico}
            destaque={resumo.com_critico > 0 ? "critico" : undefined}
            sub="alertas críticos"
          />
          <KpiCard
            label="Ponto de atenção"
            valor={resumo.com_alto}
            destaque={resumo.com_alto > 0 ? "alto" : undefined}
            sub="alertas altos"
          />
          <KpiCard label="Situação regular"         valor={resumo.sem_alerta}  destaque="ok" sub="sem ocorrências" />
        </div>
      )}

      {/* ── Período selecionado ── */}
      {dados?.an_exercicio && dados?.nr_periodo && (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <span>Período analisado:</span>
          <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-bold text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
            {QUADRIMESTRES[dados.nr_periodo] ?? `Período ${dados.nr_periodo}`} / {dados.an_exercicio}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">· Quadrimestral</span>
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

          {/* Quadrimestre */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Período
            </label>
            <select
              value={filtroPeriodo}
              onChange={(e) => setFiltroPeriodo(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
            >
              {quadrimestresAno.map((p) => (
                <option key={p.nr_periodo} value={p.nr_periodo}>
                  {QUADRIMESTRES[p.nr_periodo] ?? `Período ${p.nr_periodo}`}
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
              className="rounded-lg bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-600"
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

      {/* ── Carregando ── */}
      {carregando && (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
          <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Carregando dados RGF...</p>
        </div>
      )}

      {/* ── Erro ── */}
      {!carregando && erro && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300">
          <p className="font-semibold">Não foi possível carregar os dados</p>
          <p className="mt-1 font-mono text-xs">{erro}</p>
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            Verifique se o ETL SICONFI/RGF foi executado (<code>npm run carga-siconfi-rgf:postgres</code> na pasta <code>etl/</code>) e se os marts estão atualizados.
          </p>
        </div>
      )}

      {/* ── Sem dados ── */}
      {!carregando && !erro && municipios.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center dark:border-gray-700 dark:bg-gray-800">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Sem dados carregados para o período selecionado.
          </p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            Execute o ETL SICONFI/RGF para carregar os dados do exercício desejado.
          </p>
        </div>
      )}

      {/* ── Tabela principal ── */}
      {!carregando && !erro && municipios.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">

          <div className="border-b border-gray-100 px-5 py-3 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {dados?.an_exercicio && dados?.nr_periodo && (
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {QUADRIMESTRES[dados.nr_periodo] ?? `Período ${dados.nr_periodo}`}/{dados.an_exercicio}
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
                    Entregas
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Data entrega
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {municipios
                  .slice()
                  .sort((a, b) => {
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
                          {m.no_municipio ?? `Cód. ${m.id_municipio}`}
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
                          {m.total_contas !== null && m.total_contas > 0 ? (
                            <span className="inline-flex items-center gap-1">
                              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                {m.total_contas}
                              </span>
                              {m.status_relatorio && (
                                <span className={`rounded px-1 text-[10px] font-bold ${
                                  m.status_relatorio === "HO"
                                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                    : "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                }`}>
                                  {m.status_relatorio}
                                </span>
                              )}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500">
                          {m.data_entrega
                            ? new Date(m.data_entrega + "T12:00:00").toLocaleDateString("pt-BR")
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          <div className="border-t border-gray-100 px-5 py-3 dark:border-gray-700">
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              Fonte: SICONFI / Extrato de Entregas · Tesouro Nacional · STN ·{" "}
              Periodicidade quadrimestral (3 períodos/ano) · Entregas = nº de instituições que entregaram (prefeitura + câmara) ·{" "}
              HO = Homologado · RE = Retificado
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
