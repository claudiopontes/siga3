"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";
import { useContextoAquiry } from "@/components/aquiry/useContextoAquiry";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface MortalidadeResumo {
  ano: number;
  nascidos_vivos: number;
  obitos_infantis: number;
  obitos_maternos: number;
  obitos_fetais: number;
  total_obitos: number;
  taxa_mortalidade_infantil: number | null;
  indicador_taxa_disponivel: boolean;
  fonte_dado: string | null;
  ano_mais_recente_sim: number | null;
  ano_mais_recente_sinasc: number | null;
}

interface MortalidadeMunicipio {
  codigo_municipio_ibge: string | null;
  nome_municipio: string;
  ano: number;
  nascidos_vivos: number;
  obitos_infantis: number;
  obitos_neonatais: number;
  obitos_maternos: number;
  obitos_fetais: number;
  total_obitos: number;
  taxa_mortalidade_infantil: number | null;
  percentual_baixo_peso: number | null;
  obitos_infantis_sem_denominador: boolean;
  indicador_taxa_disponivel: boolean;
}

interface MortalidadeAlerta {
  id_alerta: number | null;
  fonte: string;
  codigo_municipio_ibge: string | null;
  nome_municipio: string | null;
  tipo_alerta: string;
  nivel: string;
  descricao: string;
  valor_observado: number | null;
  valor_referencia: number | null;
  atualizado_em: string;
}

interface MortalidadeSerie {
  ano: number;
  obitos_infantis: number;
  obitos_maternos: number;
  taxa_mortalidade_infantil: number | null;
}

interface LoadState {
  resumo: MortalidadeResumo | null;
  municipios: MortalidadeMunicipio[];
  alertas: MortalidadeAlerta[];
  serie: MortalidadeSerie[];
  erro: string | null;
  loadedAno: number | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ANOS_DISPONIVEIS = [2022, 2023, 2024, 2025];

const NIVEL_COR: Record<string, string> = {
  CRITICO: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  ALTO:    "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  MEDIO:   "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  BAIXO:   "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
};
const NIVEL_DOT: Record<string, string> = {
  CRITICO: "bg-red-500",
  ALTO:    "bg-orange-400",
  MEDIO:   "bg-yellow-400",
  BAIXO:   "bg-green-500",
};
const NIVEL_LABEL: Record<string, string> = {
  CRITICO: "Crítico",
  ALTO:    "Alto",
  MEDIO:   "Médio",
  BAIXO:   "Baixo",
};

function NivelBadge({ nivel }: { nivel: string }) {
  const n = nivel?.toUpperCase();
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${NIVEL_COR[n] ?? NIVEL_COR.MEDIO}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${NIVEL_DOT[n] ?? NIVEL_DOT.MEDIO}`} />
      {NIVEL_LABEL[n] ?? nivel}
    </span>
  );
}

function KpiCard({
  titulo,
  valor,
  sub,
  corValor,
}: {
  titulo: string;
  valor: string | number | null;
  sub?: string;
  corValor?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {titulo}
      </p>
      <p className={`mt-1 text-2xl font-bold ${corValor ?? "text-gray-800 dark:text-gray-100"}`}>
        {valor ?? "—"}
      </p>
      {sub && (
        <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{sub}</p>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function MortalidadeClient() {
  const [anoSel, setAnoSel] = useState<number>(2025);
  const [munSel, setMunSel] = useState<string>("");

  const [state, setState] = useState<LoadState>({
    resumo: null,
    municipios: [],
    alertas: [],
    serie: [],
    erro: null,
    loadedAno: null,
  });

  const carregando = state.loadedAno !== anoSel;

  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      try {
        const [resResumo, resMun, resAlertas, resSerie] = await Promise.all([
          fetch(`/api/saude/mortalidade/resumo?ano=${anoSel}`).then(r => r.json()),
          fetch(`/api/saude/mortalidade/municipios?ano=${anoSel}`).then(r => r.json()),
          fetch(`/api/saude/mortalidade/alertas?ano=${anoSel}`).then(r => r.json()),
          fetch(`/api/saude/mortalidade/serie`).then(r => r.json()),
        ]);

        if (cancelado) return;

        setState({
          resumo: resResumo ?? null,
          municipios: Array.isArray(resMun) ? resMun : [],
          alertas: Array.isArray(resAlertas) ? resAlertas : [],
          serie: Array.isArray(resSerie) ? resSerie : [],
          erro: null,
          loadedAno: anoSel,
        });
      } catch {
        if (!cancelado) {
          setState(prev => ({ ...prev, erro: "Falha ao carregar dados.", loadedAno: anoSel }));
        }
      }
    }

    carregar();
    return () => { cancelado = true; };
  }, [anoSel]);

  const { resumo, municipios, alertas, serie } = state;

  const semDados = !carregando && !resumo && municipios.length === 0;

  const alertasFiltrados = munSel
    ? alertas.filter(a => a.nome_municipio === munSel)
    : alertas;

  const municipiosFiltrados = munSel
    ? municipios.filter(m => m.nome_municipio === munSel)
    : municipios;

  // Dados para gráfico TMI por município (top 15 com mais óbitos infantis)
  const dadosGrafico = [...municipios]
    .filter(m => m.obitos_infantis > 0)
    .sort((a, b) => (b.obitos_infantis ?? 0) - (a.obitos_infantis ?? 0))
    .slice(0, 15);

  const chartOptions: ApexOptions = {
    chart: { type: "bar", toolbar: { show: false } },
    plotOptions: { bar: { horizontal: true, borderRadius: 4 } },
    dataLabels: { enabled: false },
    xaxis: {
      categories: dadosGrafico.map(m => m.nome_municipio),
      title: { text: "Óbitos infantis" },
    },
    colors: ["#e11d48"],
    tooltip: {
      y: {
        formatter: (val: number, opts?: { dataPointIndex: number }) => {
          if (opts === undefined) return String(val);
          const m = dadosGrafico[opts.dataPointIndex];
          return `${val} óbitos${m?.obitos_infantis_sem_denominador ? " (sem SINASC)" : ""}`;
        },
      },
    },
  };

  const chartSeries = [{ name: "Óbitos infantis", data: dadosGrafico.map(m => m.obitos_infantis) }];

  useContextoAquiry({
    titulo: "Painel de Mortalidade e Nascidos Vivos",
    descricao: "Indicadores de mortalidade infantil, materna e nascidos vivos no estado do Acre.",
    dados: carregando
      ? { carregando: true }
      : {
          anoSelecionado: anoSel,
          municipioFiltrado: munSel || "Todos os municípios",
          totalNascidosVivos: resumo?.nascidos_vivos ?? null,
          totalObitosInfantis: resumo?.obitos_infantis ?? null,
          totalObitosMaternos: resumo?.obitos_maternos ?? null,
          totalObitosFetais: resumo?.obitos_fetais ?? null,
          taxaMortalidadeInfantil: resumo?.taxa_mortalidade_infantil ?? null,
          taxaDisponivel: resumo?.indicador_taxa_disponivel ?? null,
          totalAlertasVisiveis: alertasFiltrados.length,
          totalMunicipiosComDados: municipiosFiltrados.length,
        },
    observacoes: [
      "Dados carregados na tela para o ano e município selecionados.",
      "A taxa de mortalidade infantil pode não estar disponível para todos os anos.",
      "Alertas e municípios exibidos refletem o filtro atual aplicado na tela.",
    ],
    fontes: [
      resumo?.fonte_dado ?? "SIM/SINASC",
      ...(resumo?.ano_mais_recente_sim ? [`SIM (referência): ${resumo.ano_mais_recente_sim}`] : []),
      ...(resumo?.ano_mais_recente_sinasc ? [`SINASC (referência): ${resumo.ano_mais_recente_sinasc}`] : []),
    ],
  });

  return (
    <div className="space-y-6 p-4 sm:p-6">

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Exercício
          </label>
          <select
            value={anoSel}
            onChange={e => { setAnoSel(Number(e.target.value)); setMunSel(""); }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          >
            {ANOS_DISPONIVEIS.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        {municipios.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Município
            </label>
            <select
              value={munSel}
              onChange={e => setMunSel(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            >
              <option value="">Todos</option>
              {[...new Set(municipios.map(m => m.nome_municipio))].sort().map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Banner sem dados */}
      {semDados && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-5 dark:border-orange-800 dark:bg-orange-900/20">
          <p className="text-sm font-semibold text-orange-800 dark:text-orange-200">
            Dados do SIM ainda não foram carregados para o ano {anoSel}.
          </p>
          <p className="mt-1 text-xs text-orange-700 dark:text-orange-300">
            Execute os comandos ETL para carregar os dados:
          </p>
          <pre className="mt-2 rounded bg-orange-100 p-3 text-xs text-orange-900 dark:bg-orange-900/40 dark:text-orange-200">
            {`cd etl
npm run postgres:migrate
npm run sim:api:inspecionar
npm run carga-sim-api:postgres`}
          </pre>
        </div>
      )}

      {/* Aviso sem denominador SINASC */}
      {resumo && !resumo.indicador_taxa_disponivel && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-700 dark:bg-yellow-900/20">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            Taxa de mortalidade infantil indisponível — aguardando dados SINASC como denominador (nascidos vivos).
          </p>
        </div>
      )}

      {/* KPI cards */}
      {resumo && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiCard
            titulo="Óbitos Infantis"
            valor={resumo.obitos_infantis.toLocaleString("pt-BR")}
            sub={`< 1 ano de idade · ${anoSel}`}
            corValor="text-rose-600 dark:text-rose-400"
          />
          <KpiCard
            titulo="Óbitos Maternos"
            valor={resumo.obitos_maternos.toLocaleString("pt-BR")}
            sub={`TPMORTEOCO 1–4 · ${anoSel}`}
            corValor={resumo.obitos_maternos > 0 ? "text-red-600 dark:text-red-400" : undefined}
          />
          <KpiCard
            titulo="Óbitos Fetais"
            valor={resumo.obitos_fetais.toLocaleString("pt-BR")}
            sub={`TIPOBITO = 1 · ${anoSel}`}
          />
          <KpiCard
            titulo="Total de Óbitos"
            valor={resumo.total_obitos.toLocaleString("pt-BR")}
            sub={`SIM · ${anoSel}`}
          />
        </div>
      )}

      {carregando && (
        <div className="text-center py-10 text-sm text-gray-400">Carregando dados...</div>
      )}

      {/* Gráfico TMI por município */}
      {!carregando && dadosGrafico.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
          <h3 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-200">
            Óbitos infantis por município — {anoSel}
          </h3>
          <ReactApexChart
            options={chartOptions}
            series={chartSeries}
            type="bar"
            height={dadosGrafico.length * 32 + 60}
          />
        </div>
      )}

      {/* Tabela de municípios */}
      {!carregando && municipiosFiltrados.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                {[
                  "Município", "Óbitos Infantis", "Neonatais", "Maternos",
                  "Fetais", "Total Óbitos", "% Baixo Peso", "S/ Denominador",
                ].map(h => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {municipiosFiltrados.map(m => (
                <tr
                  key={`${m.nome_municipio}-${m.ano}`}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                  onClick={() => setMunSel(prev => prev === m.nome_municipio ? "" : m.nome_municipio)}
                >
                  <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-200">
                    {m.nome_municipio}
                  </td>
                  <td className="px-4 py-3 text-right text-rose-600 dark:text-rose-400 font-semibold">
                    {m.obitos_infantis}
                  </td>
                  <td className="px-4 py-3 text-right">{m.obitos_neonatais}</td>
                  <td className="px-4 py-3 text-right text-red-600 dark:text-red-400">
                    {m.obitos_maternos > 0 ? m.obitos_maternos : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">{m.obitos_fetais}</td>
                  <td className="px-4 py-3 text-right">{m.total_obitos}</td>
                  <td className="px-4 py-3 text-right">
                    {m.percentual_baixo_peso !== null ? `${m.percentual_baixo_peso}%` : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {m.obitos_infantis_sem_denominador ? (
                      <span className="text-orange-500 dark:text-orange-400">Sim</span>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tabela de alertas */}
      {!carregando && alertasFiltrados.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Alertas{munSel ? ` — ${munSel}` : ""}
            </h3>
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                {["Nível", "Município", "Descrição", "Valor Observado", "Referência"].map(h => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {alertasFiltrados.map((a, i) => (
                <tr key={a.id_alerta ?? i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3">
                    <NivelBadge nivel={a.nivel} />
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                    {a.nome_municipio ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-sm">
                    {a.descricao}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {a.valor_observado ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {a.valor_referencia ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Série histórica */}
      {!carregando && serie.length > 1 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
          <h3 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-200">
            Série histórica de óbitos infantis e maternos — Acre
          </h3>
          <ReactApexChart
            options={{
              chart: { type: "line", toolbar: { show: false } },
              stroke: { curve: "smooth", width: 2 },
              xaxis: { categories: serie.map(s => String(s.ano)) },
              yaxis: { title: { text: "Óbitos" } },
              colors: ["#e11d48", "#f97316"],
              legend: { position: "top" },
            }}
            series={[
              { name: "Óbitos infantis", data: serie.map(s => s.obitos_infantis) },
              { name: "Óbitos maternos", data: serie.map(s => s.obitos_maternos) },
            ]}
            type="line"
            height={260}
          />
        </div>
      )}

    </div>
  );
}
