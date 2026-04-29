"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import MapaReceitaPerCapita, { type ReceitaPerCapitaItem } from "@/components/receita-publica/MapaReceitaPerCapita";
import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

// ─── Tipos ───────────────────────────────────────────────────────────────────

type ReceitaRow = {
  id_entidade: number;
  ano: number;
  mes: number;
  codigo: string;
  tipo_receita: string;
  previsao_inicial: number | string | null;
  previsao_atualizada: number | string | null;
  receita_realizada: number | string | null;
};
type DimEnteRow = {
  id_ente: number;
  cod_ibgce: number | null;
  cod_municipio?: string | null;
  populacao: number | null;
  nome: string;
};
type DimEntidadeRow = { id_entidade: number; id_entidade_cjur: number | null; id_ente: number };
type AuxMunicipioRow = { codigo: string; nome: string; uf_codigo?: string | null };
type NaturezaRow = { codigo: string; nivel: number; nome: string };


// ─── Constantes ──────────────────────────────────────────────────────────────


// ─── Helpers ─────────────────────────────────────────────────────────────────

function toNum(v: number | string | null | undefined): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const p = parseFloat(v.replace(",", "."));
    return Number.isFinite(p) ? p : 0;
  }
  return 0;
}

function fmtMoeda(v: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL",
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(v);
}

function fmtCompacto(v: number): string {
  const s = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (a >= 1e9) return `${s}R$ ${(a / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} bi`;
  if (a >= 1e6) return `${s}R$ ${(a / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi`;
  if (a >= 1e3) return `${s}R$ ${(a / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return fmtMoeda(v);
}

function fmtPct(v: number): string {
  return `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function fmtNum(v: number): string {
  return v.toLocaleString("pt-BR");
}

function orcadaRow(row: ReceitaRow): number {
  return toNum(row.previsao_inicial) + toNum(row.previsao_atualizada);
}

function arrecadadaRow(row: ReceitaRow): number {
  return toNum(row.receita_realizada);
}

function normalizeIbgeCode(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const digits = String(value).replace(/\D/g, "");
  return digits ? digits.padStart(7, "0") : "";
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\b(prefeitura|municipal|municipio|de|do|da|estado|governo)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveMunicipioCode(ente: DimEnteRow, nomeToCodigo: Map<string, string>): string {
  const byIbge = normalizeIbgeCode(ente.cod_ibgce);
  if (byIbge.startsWith("12")) return byIbge;

  const byMunicipio = normalizeIbgeCode(ente.cod_municipio ?? "");
  if (byMunicipio.startsWith("12")) return byMunicipio;

  const byName = nomeToCodigo.get(normalizeName(ente.nome));
  return byName ?? "";
}

function composicaoCategoria(row: ReceitaRow): string {
  const codigo = String(row.codigo ?? "").replace(/\D/g, "");
  const tipo = String(row.tipo_receita ?? "").toLocaleUpperCase("pt-BR");

  if (tipo.includes("DEDU")) return "Deduções da receita";
  if (codigo.startsWith("171")) return "Transferências da União";
  if (codigo.startsWith("172")) return "Transferências dos Estados";
  if (codigo.startsWith("211") || codigo.startsWith("212")) return "Operações de Crédito do Município";
  if (codigo.startsWith("221") || codigo.startsWith("222")) return "Alienação de Bens do Município";
  if (codigo.startsWith("121") || codigo.startsWith("141")) return "Receita do RPPS";
  if (codigo.startsWith("17")) return "Demais Transferências do Município";
  if (codigo.startsWith("1")) return "Receita do Município";
  return "Demais Receitas do Município";
}

function normalizeReceitaCode(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}



// ─── Componente principal ─────────────────────────────────────────────────────

export default function PainelReceitaPublicaClient() {
  "use no memo";

  const searchParams    = useSearchParams();
  const paramAnoInicio  = searchParams.get("anoInicio");
  const paramAnoFim     = searchParams.get("anoFim");
  const paramMunicipio  = searchParams.get("municipio");
  const paramEntidade   = searchParams.get("entidade");

  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [rows, setRows]       = useState<ReceitaRow[]>([]);
  const [mapaPerCapita, setMapaPerCapita] = useState<Record<string, ReceitaPerCapitaItem>>({});
  const [naturezaRows, setNaturezaRows] = useState<NaturezaRow[]>([]);
  const [naturezaNivelView, setNaturezaNivelView] = useState<2 | 3>(2);
  const composicaoRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
      const client = supabase!;

      let anoInicio: number;
      let anoFim: number;
      const [entesRes, entidadesRes, municipiosRes, naturezaRes] = await Promise.all([
        client.from("dim_ente").select("id_ente,cod_ibgce,cod_municipio,populacao,nome").range(0, 9999),
        client.from("dim_entidade").select("id_entidade,id_entidade_cjur,id_ente").range(0, 9999),
        client.from("aux_dim_municipio").select("codigo,nome,uf_codigo").eq("uf_codigo", "12").range(0, 9999),
        client.from("aux_dim_natureza_receita_orcamentaria").select("codigo,nivel,nome").in("nivel", [2, 3]).range(0, 9999),
      ]);
      if (entesRes.error) throw entesRes.error;
      if (entidadesRes.error) throw entidadesRes.error;
      if (municipiosRes.error) throw municipiosRes.error;
      if (naturezaRes.error) throw naturezaRes.error;
      const entes = (entesRes.data ?? []) as DimEnteRow[];
      const entidades = (entidadesRes.data ?? []) as DimEntidadeRow[];
      const municipios = (municipiosRes.data ?? []) as AuxMunicipioRow[];
      const natureza = (naturezaRes.data ?? []) as NaturezaRow[];
      const nomeToCodigo = new Map<string, string>();
      municipios.forEach((m) => {
        const code = normalizeIbgeCode(m.codigo);
        if (!code.startsWith("12")) return;
        const key = normalizeName(m.nome);
        if (key && !nomeToCodigo.has(key)) nomeToCodigo.set(key, code);
      });

      if (paramAnoInicio && paramAnoFim) {
        anoInicio = Number(paramAnoInicio);
        anoFim    = Number(paramAnoFim);
      } else {
        // Fallback: descobre os 2 anos mais recentes
        const { data: anosData } = await client
          .from("receita_publica_categoria_mensal")
          .select("ano")
          .order("ano", { ascending: false })
          .limit(5000);

        const anos = [...new Set((anosData ?? []).map((r: { ano: number }) => Number(r.ano)))]
          .filter(Boolean)
          .sort((a, b) => b - a);

        if (anos.length === 0) {
          if (active) setLoading(false);
          return;
        }

        anoFim    = anos[0]!;
        anoInicio = anos.length >= 2 ? anos[1]! : anoFim;
      }

      // Resolve IDs de entidade para o município selecionado
      let municipioEntidadeIds: number[] | null = null;
      if (paramMunicipio && paramMunicipio !== "all") {
        const { data: dimData } = await client
          .from("dim_entidade")
          .select("id_entidade")
          .eq("id_ente", Number(paramMunicipio))
          .range(0, 9999);
        municipioEntidadeIds = (dimData ?? []).map((r: { id_entidade: number }) => r.id_entidade);
        if (municipioEntidadeIds.length === 0) {
          if (active) { setRows([]); setLoading(false); }
          return;
        }
      }

      const pageSize = 1000;
      let offset = 0;
      const allRows: ReceitaRow[] = [];

      while (true) {
        let query = client
          .from("receita_publica_categoria_mensal")
          .select("id_entidade,ano,mes,codigo,tipo_receita,previsao_inicial,previsao_atualizada,receita_realizada")
          .gte("ano", anoInicio)
          .lte("ano", anoFim)
          .order("ano", { ascending: true })
          .order("mes", { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (municipioEntidadeIds) {
          query = query.in("id_entidade", municipioEntidadeIds);
        }
        if (paramEntidade && paramEntidade !== "all") {
          query = query.eq("id_entidade", Number(paramEntidade));
        }

        const { data, error: qErr } = await query;
        if (qErr) throw qErr;
        const batch = (data ?? []) as ReceitaRow[];
        allRows.push(...batch);
        if (batch.length < pageSize) break;
        offset += pageSize;
      }

      if (!active) return;
      setRows(allRows);
      setNaturezaRows(natureza);
      const entidadeToEnte = new Map<number, number>();
      entidades.forEach((e) => {
        entidadeToEnte.set(e.id_entidade, e.id_ente);
        if (e.id_entidade_cjur != null) entidadeToEnte.set(e.id_entidade_cjur, e.id_ente);
      });
      const enteById = new Map<number, DimEnteRow>();
      entes.forEach((e) => enteById.set(e.id_ente, e));
      const receitaPorCod = new Map<string, number>();
      allRows.forEach((row) => {
        const enteId = entidadeToEnte.get(row.id_entidade);
        if (!enteId) return;
        const ente = enteById.get(enteId);
        if (!ente?.populacao || ente.populacao <= 0) return;
        if (ente.nome?.toLocaleLowerCase("pt-BR").includes("teste")) return;
        const key = resolveMunicipioCode(ente, nomeToCodigo);
        if (!key) return;
        receitaPorCod.set(key, (receitaPorCod.get(key) ?? 0) + toNum(row.receita_realizada));
      });
      const out: Record<string, ReceitaPerCapitaItem> = {};
      entes.forEach((ente) => {
        if (!ente.populacao || ente.populacao <= 0) return;
        if (ente.nome?.toLocaleLowerCase("pt-BR").includes("teste")) return;
        const codIbge = resolveMunicipioCode(ente, nomeToCodigo);
        if (!codIbge) return;
        const receitaTotal = receitaPorCod.get(codIbge) ?? 0;
        out[codIbge] = { codIbge, nome: ente.nome, populacao: ente.populacao, receitaTotal, perCapita: receitaTotal / ente.populacao };
      });
      setMapaPerCapita(out);
      setLoading(false);
    }

    load().catch((err) => {
      if (!active) return;
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    });

    return () => { active = false; };
  }, [paramAnoInicio, paramAnoFim, paramMunicipio, paramEntidade]);

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    let orcada = 0, arrecadada = 0;
    const entidades = new Set<number>();

    rows.forEach((row) => {
      orcada     += orcadaRow(row);
      arrecadada += arrecadadaRow(row);
      entidades.add(row.id_entidade);
    });

    const saldo      = orcada - arrecadada;
    const realizacao = orcada !== 0 ? (arrecadada / orcada) * 100 : 0;
    return { orcada, arrecadada, saldo, realizacao, qtdEntidades: entidades.size };
  }, [rows]);

  const composicaoArrecadada = useMemo(() => {
    const groupLevel = naturezaNivelView;
    const naturezaNivel = naturezaRows
      .filter((n) => n.nivel === groupLevel)
      .map((n) => ({ code: normalizeReceitaCode(n.codigo), nome: n.nome }))
      .filter((n) => n.code.length > 0)
      .sort((a, b) => b.code.length - a.code.length);
    const naturezaByPrefix = new Map<string, string>();
    naturezaNivel.forEach((n) => {
      const p = n.code.slice(0, groupLevel);
      if (p && !naturezaByPrefix.has(p)) naturezaByPrefix.set(p, n.nome);
    });

    const acc = new Map<string, number>();
    rows.forEach((row) => {
      const codigo = normalizeReceitaCode(row.codigo);
      const matched = naturezaNivel.find((n) => codigo.startsWith(n.code));
      const fallbackPrefix = groupLevel === 2 ? codigo.slice(0, 2) : codigo.slice(0, 3);
      const categoria =
        matched?.nome ??
        naturezaByPrefix.get(fallbackPrefix) ??
        (fallbackPrefix ? `Natureza ${groupLevel}.${fallbackPrefix}` : composicaoCategoria(row));
      acc.set(categoria, (acc.get(categoria) ?? 0) + arrecadadaRow(row));
    });
    return [...acc.entries()]
      .filter(([, valor]) => valor > 0)
      .sort((a, b) => b[1] - a[1]);
  }, [rows, naturezaRows, naturezaNivelView]);

  const composicaoTop = useMemo(() => composicaoArrecadada.slice(0, 12), [composicaoArrecadada]);
  const composicaoTotal = useMemo(
    () => composicaoArrecadada.reduce((acc, [, valor]) => acc + valor, 0),
    [composicaoArrecadada],
  );

  const composicaoBarOptions = useMemo<ApexOptions>(() => ({
    chart: { type: "bar", toolbar: { show: false }, fontFamily: "inherit" },
    plotOptions: { bar: { horizontal: true, borderRadius: 4 } },
    colors: ["#0f766e"],
    dataLabels: {
      enabled: true,
      formatter: (value: number) => fmtCompacto(value),
      style: { fontSize: "10px" },
    },
    xaxis: {
      labels: {
        formatter: (value: string) => fmtCompacto(Number(value)),
      },
    },
    yaxis: {
      labels: { style: { fontSize: "11px" }, maxWidth: 280 },
    },
    tooltip: {
      y: { formatter: (value: number) => fmtMoeda(Number(value)) },
    },
    grid: { borderColor: "#e2e8f0", strokeDashArray: 3 },
  }), []);

  const composicaoBarSeries = useMemo(
    () => [{ name: "Arrecadação", data: composicaoTop.map(([name, value]) => ({ x: name, y: Number(value.toFixed(2)) })) }],
    [composicaoTop],
  );

  const chartSeries = useMemo(
    () => composicaoArrecadada.map(([, valor]) => Number(valor.toFixed(2))),
    [composicaoArrecadada],
  );

  const chartLabels = useMemo(
    () => composicaoArrecadada.map(([label]) => label),
    [composicaoArrecadada],
  );

  const chartOptions = useMemo<ApexOptions>(() => ({
    chart: { type: "donut", toolbar: { show: true }, fontFamily: "inherit" },
    labels: chartLabels,
    colors: ["#15803d", "#7cc2eb", "#45ad9f", "#cc667d", "#a09a2e", "#b548aa", "#8a2260", "#d4c56a"],
    legend: { position: "bottom", fontSize: "13px" },
    dataLabels: {
      enabled: true,
      formatter: (value: number) => `${value.toFixed(1)}%`,
    },
    tooltip: {
      y: { formatter: (v: number) => fmtMoeda(v) },
    },
    plotOptions: {
      pie: {
        donut: {
          size: "58%",
          labels: {
            show: true,
            value: {
              show: true,
              formatter: (v: string) => `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`,
            },
            total: {
              show: true,
              label: "Arrecadada",
              formatter: () => fmtCompacto(kpi.arrecadada),
            },
          },
        },
      },
    },
  }), [chartLabels, kpi.arrecadada]);

  const onPrintComposicao = () => window.print();
  const onFullscreenComposicao = async () => {
    const el = composicaoRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await el.requestFullscreen();
  };
  const closeActionsMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    const details = event.currentTarget.closest("details");
    details?.removeAttribute("open");
  };
  const naturezaRef = useRef<HTMLDivElement | null>(null);
  const onPrintNatureza = () => window.print();
  const onFullscreenNatureza = async () => {
    const el = naturezaRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await el.requestFullscreen();
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          <span className="text-sm">Carregando receitas públicas…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
        Falha ao carregar dados: {error}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="m-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
        Nenhum dado encontrado. Execute o ETL de receita pública.
      </div>
    );
  }

  return (
    <div className="min-h-screen space-y-5 bg-slate-50 p-4 pb-10 dark:bg-slate-900 sm:p-6">

      {/* ── Cards KPI ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <KpiCard
          titulo="Receita Prevista Atualizada"
          valor={fmtCompacto(kpi.orcada)}
          valorCompleto={fmtMoeda(kpi.orcada)}
          cor="slate"
        />
        <KpiCard
          titulo="Receita Arrecadada"
          valor={fmtCompacto(kpi.arrecadada)}
          valorCompleto={fmtMoeda(kpi.arrecadada)}
          cor="green"
        />
        <KpiCardDestaque
          titulo="% Realização"
          valor={fmtPct(kpi.realizacao)}
          descricao="Arrecadada / Orçada"
          realizacao={kpi.realizacao}
        />
        <KpiCard
          titulo="Saldo a Arrecadar"
          valor={fmtCompacto(kpi.saldo)}
          valorCompleto={fmtMoeda(kpi.saldo)}
          cor={kpi.saldo < 0 ? "red" : "amber"}
        />
        <KpiCard
          titulo="Entidades"
          valor={fmtNum(kpi.qtdEntidades)}
          valorCompleto={`${fmtNum(kpi.qtdEntidades)} entidades no período`}
          cor="blue"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <MapaReceitaPerCapita dados={mapaPerCapita} />
        <div ref={composicaoRef} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Composição da Receita Arrecadada {paramAnoFim || ""}
              </h3>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Distribuição da arrecadação no período selecionado
              </p>
            </div>
            <details className="relative">
              <summary className="inline-flex list-none cursor-pointer select-none items-center rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700">Ações</summary>
              <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                <button
                  type="button"
                  className="w-full rounded-md px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                  onClick={(event) => {
                    closeActionsMenu(event);
                    onFullscreenComposicao();
                  }}
                >
                  Visualizar
                </button>
                <button
                  type="button"
                  className="w-full rounded-md px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                  onClick={(event) => {
                    closeActionsMenu(event);
                    onPrintComposicao();
                  }}
                >
                  Imprimir
                </button>
              </div>
            </details>
          </div>
          {chartSeries.length > 0 ? (
            <Chart options={chartOptions} series={chartSeries} type="donut" height={360} />
          ) : (
            <div className="flex h-[360px] items-center justify-center text-sm text-slate-500">
              Sem dados para composição no período selecionado.
            </div>
          )}
        </div>
      </div>

      <div ref={naturezaRef} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Composição por Natureza da Receita</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500">Agrupamento oficial por nível 2 ou 3</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-gray-200 p-0.5 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setNaturezaNivelView(2)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${naturezaNivelView === 2 ? "bg-teal-600 text-white" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"}`}
              >
                Nível 2
              </button>
              <button
                type="button"
                onClick={() => setNaturezaNivelView(3)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${naturezaNivelView === 3 ? "bg-teal-600 text-white" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"}`}
              >
                Nível 3
              </button>
            </div>
            <details className="relative">
              <summary className="inline-flex list-none cursor-pointer select-none items-center rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700">Ações</summary>
              <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                <button
                  type="button"
                  className="w-full rounded-md px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                  onClick={(event) => {
                    closeActionsMenu(event);
                    onFullscreenNatureza();
                  }}
                >
                  Visualizar
                </button>
                <button
                  type="button"
                  className="w-full rounded-md px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                  onClick={(event) => {
                    closeActionsMenu(event);
                    onPrintNatureza();
                  }}
                >
                  Imprimir
                </button>
              </div>
            </details>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-2 dark:border-slate-700">
            {composicaoBarSeries[0].data.length > 0 ? (
              <Chart options={composicaoBarOptions} series={composicaoBarSeries} type="bar" height={360} />
            ) : (
              <div className="flex h-[360px] items-center justify-center text-sm text-slate-500">Sem dados para o nível selecionado.</div>
            )}
          </div>

          <div className="max-h-[380px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                <tr>
                  <th className="px-3 py-2 text-left">Natureza</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2 text-right">Participação</th>
                </tr>
              </thead>
              <tbody>
                {composicaoArrecadada.map(([nome, valor]) => {
                  const pct = composicaoTotal > 0 ? (valor / composicaoTotal) * 100 : 0;
                  return (
                    <tr key={`${naturezaNivelView}-${nome}`} className="border-t border-slate-200 dark:border-slate-700">
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{nome}</td>
                      <td className="px-3 py-2 text-right font-medium text-slate-700 dark:text-slate-200">{fmtMoeda(valor)}</td>
                      <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">{pct.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

type CorKpi = "slate" | "green" | "blue" | "amber" | "red";

const corBorda: Record<CorKpi, string> = {
  slate: "border-l-slate-400",
  green: "border-l-green-500",
  blue:  "border-l-blue-500",
  amber: "border-l-amber-500",
  red:   "border-l-red-500",
};

const corValor: Record<CorKpi, string> = {
  slate: "text-slate-800 dark:text-slate-100",
  green: "text-green-700 dark:text-green-400",
  blue:  "text-blue-700 dark:text-blue-400",
  amber: "text-amber-700 dark:text-amber-400",
  red:   "text-red-600 dark:text-red-400",
};

function KpiCard({
  titulo, valor, valorCompleto, cor,
}: {
  titulo: string; valor: string; valorCompleto: string; cor: CorKpi;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 border-l-4 ${corBorda[cor]}`}
      title={valorCompleto}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {titulo}
      </p>
      <p className={`mt-2 text-xl font-bold leading-tight sm:text-2xl ${corValor[cor]}`}>
        {valor}
      </p>
    </div>
  );
}

function KpiCardDestaque({
  titulo, valor, descricao, realizacao,
}: {
  titulo: string; valor: string; descricao: string; realizacao: number;
}) {
  const bg =
    realizacao >= 90 ? "bg-green-600" :
    realizacao >= 70 ? "bg-blue-600"  :
    realizacao >= 50 ? "bg-amber-500" :
    "bg-red-500";

  return (
    <div className={`col-span-2 rounded-2xl p-5 shadow-sm xl:col-span-1 ${bg} text-white`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-white/80">{titulo}</p>
      <p className="mt-2 text-3xl font-bold leading-tight sm:text-4xl">{valor}</p>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/30">
        <div
          className="h-full rounded-full bg-white transition-all duration-700"
          style={{ width: `${Math.min(100, Math.max(0, realizacao))}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-white/70">{descricao}</p>
    </div>
  );
}

