"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface PeriodoDisponivel {
  an_exercicio: number;
  nr_periodo:   number;
}

type OrigemSituacao = "EXTRATO_OFICIAL" | "PRESENCA_DADOS_LOCAL";

interface ItemEntrega {
  id_municipio:     number;
  no_municipio:     string | null;
  an_exercicio:     number;
  nr_periodo:       number;
  situacao_envio:   string;
  total_contas:     number | null;
  alertas_criticos: number;
  alertas_altos:    number;
  alertas_medios:   number;
  alertas_baixos:   number;
  atualizado_em:    string | null;
  // Extrato oficial (preenchidos quando origem_situacao = "EXTRATO_OFICIAL")
  situacao_entrega_oficial:   string | null;
  no_situacao_oficial:        string | null;
  data_entrega:               string | null;
  protocolo:                  string | null;
  possui_dado_rreo_carregado: boolean | null;
  situacao_consolidada:       string | null;
}

interface ResumoEntregas {
  total_municipios:    number;
  com_dado:            number;
  sem_dado:            number;
  percentual_com_dado: number;
}

interface EntregasResponse {
  an_exercicio:    number | null;
  nr_periodo:      number | null;
  periodos:        PeriodoDisponivel[];
  origem_situacao: OrigemSituacao;
  resumo:          ResumoEntregas;
  items:           ItemEntrega[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BIMESTRES: Record<number, string> = {
  1: "1º Bimestre", 2: "2º Bimestre", 3: "3º Bimestre",
  4: "4º Bimestre", 5: "5º Bimestre", 6: "6º Bimestre",
};

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("pt-BR"); } catch { return "—"; }
}

// ---------------------------------------------------------------------------
// Sub-componentes de exibição
// ---------------------------------------------------------------------------

function SituacaoBadge({ situacao }: { situacao: string }) {
  if (situacao === "SEM_DADO") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
        <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
        Sem dado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Com dado
    </span>
  );
}

function SituacaoOficialBadge({ situacao }: { situacao: string | null }) {
  if (!situacao)
    return <span className="text-xs text-gray-300 dark:text-gray-600">Não entregue</span>;
  if (situacao === "HO")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Homologado
      </span>
    );
  if (situacao === "RE")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-50 px-2 py-0.5 text-xs font-semibold text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
        <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />Retificado
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
      {situacao}
    </span>
  );
}

function ConsolidadaBadge({ situacao }: { situacao: string | null }) {
  if (!situacao) return <span className="text-xs text-gray-300 dark:text-gray-600">—</span>;
  const MAP: Record<string, { label: string; cor: string }> = {
    ENTREGUE_COM_DADO:          { label: "Entregue c/ dado",      cor: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
    ENTREGUE_SEM_DADO_LOCAL:    { label: "Entregue s/ dado local", cor: "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
    SEM_ENTREGA_COM_DADO_LOCAL: { label: "S/ entrega c/ dado",    cor: "bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
    SEM_ENTREGA_SEM_DADO:       { label: "Sem entrega",           cor: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
    NAO_EXIGIVEL:               { label: "Não exigível",          cor: "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400" },
  };
  const meta = MAP[situacao];
  if (!meta) return <span className="text-xs text-gray-400">{situacao}</span>;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${meta.cor}`}>
      {meta.label}
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
  valor: string | number;
  sub?: string;
  destaque?: "critico" | "alto" | "ok" | "info";
}) {
  const cor = destaque === "critico" ? "text-red-600 dark:text-red-400"
    : destaque === "alto"   ? "text-orange-500 dark:text-orange-400"
    : destaque === "ok"     ? "text-emerald-600 dark:text-emerald-400"
    : destaque === "info"   ? "text-indigo-600 dark:text-indigo-400"
    : "text-gray-900 dark:text-white";
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${cor}`}>{valor}</p>
      {sub && <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function EntregasSiconfiClient() {
  const [dados, setDados]           = useState<EntregasResponse | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro]             = useState<string | null>(null);

  const [filtroAno,       setFiltroAno]       = useState<string>("");
  const [filtroPeriodo,   setFiltroPeriodo]   = useState<string>("");
  const [filtroSituacao,  setFiltroSituacao]  = useState<string>("");
  const [filtroMunicipio, setFiltroMunicipio] = useState<string>("");

  const buscar = useCallback((
    ano: string, periodo: string, situacao: string, municipio: string,
  ) => {
    setCarregando(true);
    setErro(null);

    const params = new URLSearchParams();
    if (ano)       params.set("an_exercicio", ano);
    if (periodo)   params.set("nr_periodo",   periodo);
    if (situacao)  params.set("situacao",     situacao);
    if (municipio) params.set("municipio",    municipio);

    fetch(`/api/siconfi/rreo/entregas?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<EntregasResponse>;
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

  // Carga inicial
  useEffect(() => {
    buscar("", "", "", "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-busca quando período muda
  useEffect(() => {
    if (!filtroAno && !filtroPeriodo) return;
    buscar(filtroAno, filtroPeriodo, filtroSituacao, filtroMunicipio);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroAno, filtroPeriodo]);

  function aplicarFiltros() {
    buscar(filtroAno, filtroPeriodo, filtroSituacao, filtroMunicipio);
  }

  function limparFiltros() {
    setFiltroSituacao("");
    setFiltroMunicipio("");
    buscar(filtroAno, filtroPeriodo, "", "");
  }

  const items          = dados?.items          ?? [];
  const resumo         = dados?.resumo;
  const periodos       = dados?.periodos       ?? [];
  const origemSituacao = dados?.origem_situacao ?? "PRESENCA_DADOS_LOCAL";
  const temExtrato     = origemSituacao === "EXTRATO_OFICIAL";

  const anosDisponiveis  = [...new Set(periodos.map((p) => p.an_exercicio))].sort((a, b) => b - a);
  const bimestresDoAno   = periodos.filter((p) => p.an_exercicio === Number(filtroAno));

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-5">

      {/* ── Cabeçalho ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <nav className="mb-2 flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
          <Link
            href="/painel-siconfi"
            className="flex items-center gap-0.5 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Execução Orçamentária
          </Link>
          <span>/</span>
          <span className="text-gray-600 dark:text-gray-300">Entregas e Pendências</span>
        </nav>

        <h1 className="text-lg font-bold text-gray-900 dark:text-white">
          Entregas e Pendências — RREO
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
          Acompanhamento da presença de dados RREO dos municípios do Acre a partir das
          informações carregadas do SICONFI/Tesouro Nacional. Identifica quais municípios
          possuem dados disponíveis para análise e quais estão sem informação no período.
        </p>
      </div>

      {/* ── Aviso institucional ── */}
      {temExtrato ? (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4 dark:border-emerald-900/40 dark:bg-emerald-900/10">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <p className="text-xs leading-relaxed text-emerald-700 dark:text-emerald-300">
            Esta visão cruza o <strong>extrato oficial de entregas do SICONFI</strong> com os dados
            RREO carregados no Varadouro. A situação oficial reflete o extrato do Tesouro Nacional;
            a coluna &ldquo;Situação consolidada&rdquo; combina entrega oficial e presença de dado local.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 dark:border-blue-900/40 dark:bg-blue-900/10">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500 dark:text-blue-400" />
          <p className="text-xs leading-relaxed text-blue-700 dark:text-blue-300">
            Esta visão indica a <strong>presença de dados RREO carregados</strong> no Varadouro a
            partir do SICONFI. Não representa confirmação formal de protocolo de entrega ao Tesouro
            Nacional — execute o ETL de extrato de entregas para ativar a visão oficial.
          </p>
        </div>
      )}

      {/* ── KPI Cards ── */}
      {resumo && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <KpiCard label="Municípios monitorados" valor={resumo.total_municipios} />
          <KpiCard
            label="Com dados RREO"
            valor={resumo.com_dado}
            destaque="ok"
            sub="presentes no período"
          />
          <KpiCard
            label="Sem dados RREO"
            valor={resumo.sem_dado}
            destaque={resumo.sem_dado > 0 ? "alto" : undefined}
            sub="sem informação no período"
          />
          <KpiCard
            label="Cobertura"
            valor={`${resumo.percentual_com_dado}%`}
            destaque={
              resumo.percentual_com_dado >= 90 ? "ok"
              : resumo.percentual_com_dado >= 70 ? "info"
              : "alto"
            }
            sub="municípios com dado"
          />
          {dados?.an_exercicio && dados?.nr_periodo && (
            <KpiCard
              label="Período analisado"
              valor={`${BIMESTRES[dados.nr_periodo] ?? `${dados.nr_periodo}º Bim.`}`}
              sub={String(dados.an_exercicio)}
              destaque="info"
            />
          )}
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
              {bimestresDoAno.map((p) => (
                <option key={p.nr_periodo} value={p.nr_periodo}>
                  {BIMESTRES[p.nr_periodo] ?? `Período ${p.nr_periodo}`}
                </option>
              ))}
            </select>
          </div>

          {/* Situação */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Situação
            </label>
            <select
              value={filtroSituacao}
              onChange={(e) => setFiltroSituacao(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
            >
              <option value="">Todas as situações</option>
              <option value="COM_DADO">Com dados RREO</option>
              <option value="SEM_DADO">Sem dados RREO</option>
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

          {/* Ações */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={aplicarFiltros}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              Filtrar
            </button>
            {(filtroSituacao || filtroMunicipio) && (
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
          <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            Carregando dados de entregas RREO...
          </p>
        </div>
      )}

      {/* ── Erro ── */}
      {!carregando && erro && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/40 dark:bg-amber-900/20">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
            Não foi possível carregar os dados
          </p>
          <p className="mt-1 font-mono text-xs text-amber-600 dark:text-amber-400">{erro}</p>
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            Verifique se o ETL SICONFI/RREO foi executado e se os marts estão atualizados.
          </p>
        </div>
      )}

      {/* ── Sem dados ── */}
      {!carregando && !erro && items.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center dark:border-gray-700 dark:bg-gray-800">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Nenhum município encontrado para o período ou filtro selecionado.
          </p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            Execute o ETL SICONFI/RREO para carregar os dados do exercício desejado.
          </p>
        </div>
      )}

      {/* ── Tabela principal ── */}
      {!carregando && !erro && items.length > 0 && (
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
              {items.length} município{items.length !== 1 ? "s" : ""}{" "}
              {filtroSituacao || filtroMunicipio ? "filtrados" : "monitorados"} ·{" "}
              sem dado aparece primeiro
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Município
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Exercício
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Período
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Situação
                  </th>
                  {temExtrato && (
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Situação oficial
                    </th>
                  )}
                  {temExtrato && (
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Data entrega
                    </th>
                  )}
                  {temExtrato && (
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Protocolo
                    </th>
                  )}
                  {temExtrato && (
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Situação consolidada
                    </th>
                  )}
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Registros RREO
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
                    Atualizado em
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Detalhe
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {items.map((item) => {
                  const rowBg = item.situacao_envio === "SEM_DADO"
                    ? "bg-orange-50/30 dark:bg-orange-900/5"
                    : item.alertas_criticos > 0
                      ? "bg-red-50/30 dark:bg-red-900/5"
                      : "";
                  return (
                    <tr
                      key={item.id_municipio}
                      className={`hover:bg-gray-50 dark:hover:bg-gray-800/60 ${rowBg}`}
                    >
                      {/* Município */}
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                        {item.situacao_envio === "COM_DADO" ? (
                          <Link
                            href={`/painel-siconfi/rreo/${item.id_municipio}`}
                            className="hover:text-blue-600 hover:underline dark:hover:text-blue-400"
                          >
                            {item.no_municipio ?? `Cód. ${item.id_municipio}`}
                          </Link>
                        ) : (
                          <span className="text-gray-500 dark:text-gray-400">
                            {item.no_municipio ?? `Cód. ${item.id_municipio}`}
                          </span>
                        )}
                      </td>

                      {/* Exercício */}
                      <td className="px-4 py-3 text-center text-xs text-gray-600 dark:text-gray-400">
                        {item.an_exercicio}
                      </td>

                      {/* Período */}
                      <td className="px-4 py-3 text-center text-xs text-gray-600 dark:text-gray-400">
                        {BIMESTRES[item.nr_periodo] ?? `${item.nr_periodo}º Bim.`}
                      </td>

                      {/* Situação (presença local) */}
                      <td className="px-4 py-3">
                        <SituacaoBadge situacao={item.situacao_envio} />
                      </td>

                      {/* Situação oficial (extrato SICONFI) */}
                      {temExtrato && (
                        <td className="px-4 py-3">
                          <SituacaoOficialBadge situacao={item.situacao_entrega_oficial} />
                        </td>
                      )}

                      {/* Data de entrega */}
                      {temExtrato && (
                        <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
                          {item.data_entrega ? formatarData(item.data_entrega) : "—"}
                        </td>
                      )}

                      {/* Protocolo */}
                      {temExtrato && (
                        <td className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500">
                          {item.protocolo ?? "—"}
                        </td>
                      )}

                      {/* Situação consolidada */}
                      {temExtrato && (
                        <td className="px-4 py-3">
                          <ConsolidadaBadge situacao={item.situacao_consolidada} />
                        </td>
                      )}

                      {/* Registros RREO */}
                      <td className="px-4 py-3 text-center text-xs text-gray-600 dark:text-gray-400">
                        {item.total_contas !== null ? item.total_contas : "—"}
                      </td>

                      {/* Críticos */}
                      <td className="px-4 py-3 text-center">
                        <ContadorBadge
                          valor={item.alertas_criticos}
                          cor="bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        />
                      </td>

                      {/* Altos */}
                      <td className="px-4 py-3 text-center">
                        <ContadorBadge
                          valor={item.alertas_altos}
                          cor="bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                        />
                      </td>

                      {/* Médios */}
                      <td className="px-4 py-3 text-center">
                        <ContadorBadge
                          valor={item.alertas_medios}
                          cor="bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                        />
                      </td>

                      {/* Atualizado em */}
                      <td className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500">
                        {formatarData(item.atualizado_em)}
                      </td>

                      {/* Ação */}
                      <td className="px-4 py-3">
                        {item.situacao_envio === "COM_DADO" ? (
                          <Link
                            href={`/painel-siconfi/rreo/${item.id_municipio}`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                          >
                            Ver análise <ChevronRight className="h-3.5 w-3.5" />
                          </Link>
                        ) : (
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            Sem dado
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Rodapé */}
          <div className="border-t border-gray-100 px-5 py-3 dark:border-gray-700">
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              Fonte: SICONFI / Tesouro Nacional · STN ·{" "}
              {temExtrato
                ? "Situação oficial: extrato de entregas SICONFI · Situação consolidada: extrato × dado local"
                : "Situação: presença de dados RREO carregados no Varadouro"}{" "}
              · Universo: municípios que já registraram dado RREO em algum período
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
