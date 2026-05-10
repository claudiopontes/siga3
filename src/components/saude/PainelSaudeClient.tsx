"use client";

import { useEffect, useState, useMemo } from "react";

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
  codigo_municipio_ibge:        string;
  nome_municipio:               string | null;
  uf:                           string | null;
  siops_ano:                    number | null;
  siops_periodo:                string | null;
  percentual_aplicado_saude:    number | null;
  despesa_total_saude:          number | null;
  receita_base_calculo:         number | null;
  siops_total_indicadores:      number;
  siops_situacao_envio:         string | null;
  total_estabelecimentos:       number;
  total_estabelecimentos_sus:   number;
  total_ubs:                    number;
  total_ubs_ativas:             number;
  total_inativos:               number;
  total_sem_atualizacao_recente: number;
  data_mais_recente_atualizacao: string | null;
  total_alertas:                number;
  total_criticos:               number;
  total_altos:                  number;
  total_medios:                 number;
  score_risco:                  number;
  nivel_risco:                  string | null;
  atualizado_em:                string;
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

function fmtData(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
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
  return <span className="inline-flex items-center rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-700 dark:bg-teal-900/30 dark:text-teal-300">CNES/UBS</span>;
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
// Componente principal
// ---------------------------------------------------------------------------

export default function PainelSaudeClient() {
  const [resumo, setResumo] = useState<SaudeResumoHome | null>(null);
  const [municipios, setMunicipios] = useState<SaudeMunicipioResumo[]>([]);
  const [alertas, setAlertas] = useState<SaudeAlerta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Linha expansível
  const [expandido, setExpandido] = useState<string | null>(null);
  const [alertasMun, setAlertasMun] = useState<Record<string, SaudeAlerta[]>>({});
  const [carregandoAlerta, setCarregandoAlerta] = useState<string | null>(null);

  // Filtros
  const [buscaMunicipio, setBuscaMunicipio] = useState("");
  const [filtroRisco, setFiltroRisco] = useState<string>("todos");
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

  // Municípios filtrados (client-side)
  const municipiosFiltrados = useMemo(() => {
    return municipios.filter((m) => {
      const nome = (m.nome_municipio ?? "").toLowerCase();
      if (buscaMunicipio && !nome.includes(buscaMunicipio.toLowerCase())) return false;
      if (filtroRisco !== "todos" && (m.nivel_risco ?? "BAIXO") !== filtroRisco) return false;
      return true;
    });
  }, [municipios, buscaMunicipio, filtroRisco]);

  // Alertas filtrados (client-side)
  const alertasFiltrados = useMemo(() => {
    return alertas.filter((a) => {
      if (filtroFonte !== "todas" && a.fonte !== filtroFonte) return false;
      return true;
    });
  }, [alertas, filtroFonte]);

  // Métricas CNES/UBS derivadas dos municípios
  const cnesMetrics = useMemo(() => {
    const totalEstab   = municipios.reduce((s, m) => s + (m.total_estabelecimentos ?? 0), 0);
    const totalUbs     = municipios.reduce((s, m) => s + (m.total_ubs ?? 0), 0);
    const totalUbsAt   = municipios.reduce((s, m) => s + (m.total_ubs_ativas ?? 0), 0);
    const semUbs       = municipios.filter((m) => m.total_ubs_ativas === 0).length;
    const baixaUbs     = municipios.filter((m) => m.total_ubs_ativas === 1).length;
    return { totalEstab, totalUbs, totalUbsAt, semUbs, baixaUbs };
  }, [municipios]);

  // SIOPS
  const siopsMetrics = useMemo(() => {
    const comDado  = municipios.filter((m) => m.siops_situacao_envio === "COM_DADO").length;
    const semDado  = municipios.filter((m) => m.siops_situacao_envio === "SEM_DADO" || !m.siops_situacao_envio).length;
    const valores  = municipios.map((m) => Number(m.percentual_aplicado_saude)).filter((v) => !isNaN(v) && v > 0);
    const media    = valores.length > 0 ? valores.reduce((a, b) => a + b, 0) / valores.length : null;
    const abaixo   = municipios.filter((m) => m.percentual_aplicado_saude !== null && Number(m.percentual_aplicado_saude) < 15).length;
    return { comDado, semDado, media, abaixo };
  }, [municipios]);

  // Toggle linha expansível
  function toggleExpandir(ibge: string) {
    if (expandido === ibge) {
      setExpandido(null);
      return;
    }
    setExpandido(ibge);
    if (!alertasMun[ibge]) {
      setCarregandoAlerta(ibge);
      fetch(`/api/saude/alertas?municipio=${ibge}&pageSize=100`)
        .then((r) => r.json())
        .then((data: unknown) => {
          setAlertasMun((prev) => ({ ...prev, [ibge]: Array.isArray(data) ? data : [] }));
        })
        .catch(() => {
          setAlertasMun((prev) => ({ ...prev, [ibge]: [] }));
        })
        .finally(() => setCarregandoAlerta(null));
    }
  }

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
              Monitoramento de aplicação em saúde, estrutura da rede e alertas dos municípios do Acre.
            </p>
            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">Base inicial: SIOPS + CNES/UBS.</p>
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
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Municípios</p>
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
              <p className="text-xs font-medium uppercase tracking-wide text-red-400">Risco crítico</p>
              <p className="mt-1 text-3xl font-bold text-red-600 dark:text-red-400">{resumo?.municipios_risco_critico ?? 0}</p>
              <p className="text-xs text-gray-400">municípios</p>
            </div>

            <div className="rounded-xl border border-orange-200 bg-white p-4 dark:border-orange-800/40 dark:bg-gray-800">
              <p className="text-xs font-medium uppercase tracking-wide text-orange-400">Risco alto</p>
              <p className="mt-1 text-3xl font-bold text-orange-600 dark:text-orange-400">{resumo?.municipios_risco_alto ?? 0}</p>
              <p className="text-xs text-gray-400">municípios</p>
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

      {/* ── Filtros ── */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Buscar município..."
          value={buscaMunicipio}
          onChange={(e) => setBuscaMunicipio(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
        />
        <select
          value={filtroRisco}
          onChange={(e) => setFiltroRisco(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
        >
          <option value="todos">Todos os riscos</option>
          <option value="CRITICO">Crítico</option>
          <option value="ALTO">Alto</option>
          <option value="MEDIO">Médio</option>
          <option value="BAIXO">Baixo</option>
        </select>
        <select
          value={filtroFonte}
          onChange={(e) => setFiltroFonte(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
        >
          <option value="todas">Todas as fontes</option>
          <option value="SIOPS">SIOPS</option>
          <option value="CNES_UBS">CNES/UBS</option>
        </select>
      </div>

      {/* ── Ranking de municípios ── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Municípios por nível de risco consolidado
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Ordenado por prioridade de atenção — combina alertas de orçamento (SIOPS) e estrutura da rede (CNES/UBS)
          </p>
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
                  <th className="w-6 px-2 py-3" />
                  <th className="px-4 py-3">Município</th>
                  <th className="px-4 py-3">Nível de risco</th>
                  <th className="px-4 py-3">Alertas</th>
                  <th className="px-4 py-3">
                    <span>% aplicado em saúde</span>
                    <span className="ml-1 font-normal normal-case text-slate-400">(mín. 15%)</span>
                  </th>
                  <th className="px-4 py-3">Rede SUS</th>
                  <th className="px-4 py-3">Atualiz. CNES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {municipiosFiltrados.map((m) => {
                  const pctSaude = m.percentual_aplicado_saude !== null ? Number(m.percentual_aplicado_saude) : null;
                  const abaixoMinimo = pctSaude !== null && pctSaude < 15;
                  const isOpen = expandido === m.codigo_municipio_ibge;
                  const munAlertas = alertasMun[m.codigo_municipio_ibge] ?? [];
                  const carregandoEste = carregandoAlerta === m.codigo_municipio_ibge;

                  return (
                    <>
                      {/* ── Linha principal (clicável) ── */}
                      <tr
                        key={m.codigo_municipio_ibge}
                        onClick={() => toggleExpandir(m.codigo_municipio_ibge)}
                        className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/40"
                      >
                        {/* Chevron */}
                        <td className="px-2 py-3 text-center text-slate-400">
                          <svg
                            className={`inline h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </td>

                        {/* Município */}
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800 dark:text-slate-100">
                          {m.nome_municipio ?? m.codigo_municipio_ibge}
                        </td>

                        {/* Nível de risco */}
                        <td className="px-4 py-3">
                          <NivelBadge nivel={m.nivel_risco ?? "BAIXO"} />
                        </td>

                        {/* Alertas: total + breakdown */}
                        <td className="px-4 py-3">
                          <span className="font-semibold text-slate-700 dark:text-slate-200">
                            {m.total_alertas}
                          </span>
                          <span className="ml-1 text-slate-400">total</span>
                          {(m.total_criticos > 0 || m.total_altos > 0) && (
                            <div className="mt-0.5 flex gap-2 text-xs">
                              {m.total_criticos > 0 && (
                                <span className="text-red-600 dark:text-red-400">
                                  {m.total_criticos} crítico{m.total_criticos !== 1 ? "s" : ""}
                                </span>
                              )}
                              {m.total_altos > 0 && (
                                <span className="text-orange-600 dark:text-orange-400">
                                  {m.total_altos} alto{m.total_altos !== 1 ? "s" : ""}
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* % saúde */}
                        <td className="px-4 py-3">
                          {pctSaude !== null ? (
                            <div>
                              <span className={abaixoMinimo ? "font-semibold text-red-600 dark:text-red-400" : "font-medium text-green-700 dark:text-green-400"}>
                                {fmtPct(pctSaude)}
                              </span>
                              {abaixoMinimo && (
                                <div className="mt-0.5 text-xs text-red-500">abaixo do mínimo legal</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">Sem dado</span>
                          )}
                        </td>

                        {/* Rede SUS */}
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5 text-xs">
                            <span>
                              <span className={m.total_ubs_ativas === 0 ? "font-bold text-red-600 dark:text-red-400" : "font-semibold text-slate-700 dark:text-slate-200"}>
                                {m.total_ubs_ativas === 0 ? "Nenhuma" : m.total_ubs_ativas}
                              </span>
                              <span className={`ml-1 ${m.total_ubs_ativas === 0 ? "text-red-500" : "text-slate-400"}`}>
                                UBS ativa{m.total_ubs_ativas !== 1 ? "s" : ""}
                              </span>
                            </span>
                            <span className="text-slate-400">
                              {fmtNum(m.total_estabelecimentos)} estabelecimento{m.total_estabelecimentos !== 1 ? "s" : ""} no total
                            </span>
                          </div>
                        </td>

                        {/* Data atualização CNES */}
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                          {m.data_mais_recente_atualizacao
                            ? fmtData(m.data_mais_recente_atualizacao)
                            : <span className="text-slate-400">Não informada</span>
                          }
                        </td>
                      </tr>

                      {/* ── Linha de detalhe expansível ── */}
                      {isOpen && (
                        <tr key={`${m.codigo_municipio_ibge}-detail`} className="bg-slate-50 dark:bg-slate-900/40">
                          <td colSpan={7} className="px-6 py-5">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">

                              {/* Bloco SIOPS */}
                              <div className="rounded-xl border border-blue-100 bg-white p-4 dark:border-blue-900/30 dark:bg-slate-800">
                                <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                                  <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                                  SIOPS — Orçamento em Saúde
                                </p>
                                <dl className="space-y-2 text-sm">
                                  <div className="flex justify-between">
                                    <dt className="text-slate-500 dark:text-slate-400">Período de referência</dt>
                                    <dd className="font-medium text-slate-700 dark:text-slate-200">
                                      {labelPeriodo(m.siops_ano, m.siops_periodo)}
                                    </dd>
                                  </div>
                                  <div className="flex justify-between">
                                    <dt className="text-slate-500 dark:text-slate-400">% aplicado em saúde</dt>
                                    <dd className={`font-semibold ${pctSaude !== null && pctSaude < 15 ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
                                      {fmtPct(pctSaude)}
                                      {pctSaude !== null && pctSaude < 15 && <span className="ml-1 text-xs font-normal text-red-400">(mín. 15%)</span>}
                                    </dd>
                                  </div>
                                  <div className="flex justify-between">
                                    <dt className="text-slate-500 dark:text-slate-400">Despesa total em saúde</dt>
                                    <dd className="font-medium text-slate-700 dark:text-slate-200">
                                      {m.despesa_total_saude !== null
                                        ? `R$ ${Number(m.despesa_total_saude).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                        : "—"}
                                    </dd>
                                  </div>
                                  <div className="flex justify-between">
                                    <dt className="text-slate-500 dark:text-slate-400">Receita base de cálculo</dt>
                                    <dd className="font-medium text-slate-700 dark:text-slate-200">
                                      {m.receita_base_calculo !== null
                                        ? `R$ ${Number(m.receita_base_calculo).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                        : "—"}
                                    </dd>
                                  </div>
                                  <div className="flex justify-between">
                                    <dt className="text-slate-500 dark:text-slate-400">Situação do envio</dt>
                                    <dd className="font-medium">
                                      {m.siops_situacao_envio === "COM_DADO"
                                        ? <span className="text-green-600 dark:text-green-400">Enviado</span>
                                        : <span className="text-orange-600 dark:text-orange-400">Sem dado</span>
                                      }
                                    </dd>
                                  </div>
                                </dl>
                              </div>

                              {/* Bloco CNES/UBS */}
                              <div className="rounded-xl border border-teal-100 bg-white p-4 dark:border-teal-900/30 dark:bg-slate-800">
                                <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400">
                                  <span className="inline-block h-2 w-2 rounded-full bg-teal-500" />
                                  CNES/UBS — Estrutura da Rede
                                </p>
                                <dl className="space-y-2 text-sm">
                                  <div className="flex justify-between">
                                    <dt className="text-slate-500 dark:text-slate-400">Total de estabelecimentos</dt>
                                    <dd className="font-medium text-slate-700 dark:text-slate-200">{fmtNum(m.total_estabelecimentos)}</dd>
                                  </div>
                                  <div className="flex justify-between">
                                    <dt className="text-slate-500 dark:text-slate-400">Estabelecimentos SUS</dt>
                                    <dd className="font-medium text-slate-700 dark:text-slate-200">{fmtNum(m.total_estabelecimentos_sus)}</dd>
                                  </div>
                                  <div className="flex justify-between">
                                    <dt className="text-slate-500 dark:text-slate-400">UBS (tipo 02) cadastradas</dt>
                                    <dd className="font-medium text-slate-700 dark:text-slate-200">{fmtNum(m.total_ubs)}</dd>
                                  </div>
                                  <div className="flex justify-between">
                                    <dt className="text-slate-500 dark:text-slate-400">UBS ativas</dt>
                                    <dd className={`font-semibold ${m.total_ubs_ativas === 0 ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
                                      {fmtNum(m.total_ubs_ativas)}
                                    </dd>
                                  </div>
                                  <div className="flex justify-between">
                                    <dt className="text-slate-500 dark:text-slate-400">Estabelecimentos inativos</dt>
                                    <dd className={`font-semibold ${m.total_inativos > 0 ? "text-orange-600 dark:text-orange-400" : "text-slate-700 dark:text-slate-200"}`}>
                                      {fmtNum(m.total_inativos)}
                                    </dd>
                                  </div>
                                  <div className="flex justify-between">
                                    <dt className="text-slate-500 dark:text-slate-400">Sem atualização recente</dt>
                                    <dd className={`font-semibold ${m.total_sem_atualizacao_recente > 0 ? "text-yellow-600 dark:text-yellow-400" : "text-slate-700 dark:text-slate-200"}`}>
                                      {fmtNum(m.total_sem_atualizacao_recente)}
                                    </dd>
                                  </div>
                                  <div className="flex justify-between">
                                    <dt className="text-slate-500 dark:text-slate-400">Data de atualização CNES</dt>
                                    <dd className="text-slate-600 dark:text-slate-300">{fmtData(m.data_mais_recente_atualizacao)}</dd>
                                  </div>
                                </dl>
                              </div>
                            </div>

                            {/* Alertas do município */}
                            <div className="mt-4 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                              <div className="border-b border-slate-200 px-4 py-2.5 dark:border-slate-700">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                  Todos os alertas deste município
                                </p>
                              </div>
                              {carregandoEste ? (
                                <div className="p-4 text-center text-xs text-slate-400">Carregando alertas...</div>
                              ) : munAlertas.length === 0 ? (
                                <div className="p-4 text-center text-xs text-slate-400">Nenhum alerta registrado.</div>
                              ) : (
                                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                                  {munAlertas.map((a, ai) => (
                                    <div key={ai} className="flex items-start gap-3 px-4 py-3">
                                      <div className="mt-0.5 shrink-0">
                                        <NivelBadge nivel={a.nivel} />
                                      </div>
                                      <div className="min-w-0">
                                        <p className="text-sm text-slate-700 dark:text-slate-200">{a.descricao}</p>
                                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400">
                                          <FonteBadge fonte={a.fonte} />
                                          {a.valor_observado !== null && (
                                            <span>Apurado: <span className="font-medium text-slate-600 dark:text-slate-300">{fmtPct(Number(a.valor_observado))}</span></span>
                                          )}
                                          {a.valor_referencia !== null && (
                                            <span>Referência: <span className="font-medium text-slate-600 dark:text-slate-300">{fmtPct(Number(a.valor_referencia))}</span></span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Alertas prioritários ── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Alertas prioritários
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Até 30 alertas de nível Crítico ou Alto — SIOPS + CNES/UBS
          </p>
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
                {alertasFiltrados.map((a, i) => {
                  const temValores = a.valor_observado !== null || a.valor_referencia !== null;
                  return (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                      <td className="px-4 py-3">
                        <NivelBadge nivel={a.nivel} />
                      </td>
                      <td className="px-4 py-3">
                        <FonteBadge fonte={a.fonte} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700 dark:text-slate-200">
                        {a.nome_municipio ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-slate-700 dark:text-slate-200">{a.descricao}</p>
                        {temValores && (
                          <p className="mt-0.5 text-xs text-slate-400">
                            {a.valor_observado !== null && (
                              <span>Valor apurado: <span className="font-medium text-slate-600 dark:text-slate-300">{fmtPct(Number(a.valor_observado))}</span></span>
                            )}
                            {a.valor_observado !== null && a.valor_referencia !== null && <span className="mx-1">·</span>}
                            {a.valor_referencia !== null && (
                              <span>Referência: <span className="font-medium text-slate-600 dark:text-slate-300">{fmtPct(Number(a.valor_referencia))}</span></span>
                            )}
                          </p>
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

      {/* ── Painéis lado a lado: SIOPS + CNES/UBS ── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

        {/* SIOPS */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-700">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Orçamento e aplicação — SIOPS
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Período: {labelPeriodo(resumo?.siops_ano ?? null, resumo?.siops_periodo ?? null)}
            </p>
          </div>
          {carregando ? (
            <div className="p-6 text-center text-sm text-gray-400">Carregando...</div>
          ) : (
            <div className="space-y-3 p-5">
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5 dark:bg-slate-900/40">
                <span className="text-sm text-slate-600 dark:text-slate-300">Municípios com dado</span>
                <span className="font-semibold text-slate-800 dark:text-slate-100">{siopsMetrics.comDado}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5 dark:bg-slate-900/40">
                <span className="text-sm text-slate-600 dark:text-slate-300">Municípios sem dado recente</span>
                <span className={`font-semibold ${siopsMetrics.semDado > 0 ? "text-orange-600 dark:text-orange-400" : "text-slate-800 dark:text-slate-100"}`}>
                  {siopsMetrics.semDado}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5 dark:bg-slate-900/40">
                <span className="text-sm text-slate-600 dark:text-slate-300">Média % aplicado em saúde</span>
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  {fmtPct(siopsMetrics.media)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-red-50 px-4 py-2.5 dark:bg-red-900/20">
                <span className="text-sm text-slate-600 dark:text-slate-300">
                  Abaixo do mínimo (15% — LC 141/2012)
                </span>
                <span className={`font-bold ${siopsMetrics.abaixo > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                  {siopsMetrics.abaixo}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* CNES/UBS */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-700">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Estrutura da rede — CNES/UBS
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">Fonte: Cadastro Nacional de Estabelecimentos de Saúde</p>
          </div>
          {carregando ? (
            <div className="p-6 text-center text-sm text-gray-400">Carregando...</div>
          ) : (
            <div className="space-y-3 p-5">
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5 dark:bg-slate-900/40">
                <span className="text-sm text-slate-600 dark:text-slate-300">Total estabelecimentos</span>
                <span className="font-semibold text-slate-800 dark:text-slate-100">{fmtNum(cnesMetrics.totalEstab)}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5 dark:bg-slate-900/40">
                <span className="text-sm text-slate-600 dark:text-slate-300">Total UBS (tipo 02)</span>
                <span className="font-semibold text-slate-800 dark:text-slate-100">{fmtNum(cnesMetrics.totalUbs)}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5 dark:bg-slate-900/40">
                <span className="text-sm text-slate-600 dark:text-slate-300">UBS ativas</span>
                <span className="font-semibold text-green-700 dark:text-green-400">{fmtNum(cnesMetrics.totalUbsAt)}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-red-50 px-4 py-2.5 dark:bg-red-900/20">
                <span className="text-sm text-slate-600 dark:text-slate-300">Municípios sem UBS ativa</span>
                <span className={`font-bold ${cnesMetrics.semUbs > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                  {cnesMetrics.semUbs}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-orange-50 px-4 py-2.5 dark:bg-orange-900/20">
                <span className="text-sm text-slate-600 dark:text-slate-300">Municípios com baixa cobertura UBS</span>
                <span className={`font-bold ${cnesMetrics.baixaUbs > 0 ? "text-orange-600 dark:text-orange-400" : "text-slate-800 dark:text-slate-100"}`}>
                  {cnesMetrics.baixaUbs}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
