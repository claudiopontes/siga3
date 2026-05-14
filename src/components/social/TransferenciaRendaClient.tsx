"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import type { ApexOptions } from "apexcharts";
import {
  Users, DollarSign, Heart, Activity, BarChart2, AlertTriangle,
  TrendingUp, TrendingDown, Minus, ChevronRight, X, Database, ChevronLeft,
} from "lucide-react";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });
const MapaSocialContent = dynamic(
  () => import("@/components/social/MapaSocialContent"),
  { ssr: false }
);

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface MunicipioRow {
  codigo_ibge_municipio: string;
  nome_municipio: string;
  ano_mes: string;
  bf_quantidade_familias: number | null;
  bf_valor_repassado: number | null;
  bf_valor_medio_familia: number | null;
  bpc_quantidade_total: number | null;
  bpc_quantidade_deficiencia: number | null;
  bpc_quantidade_idoso: number | null;
  bpc_valor_total: number | null;
  bpc_valor_deficiencia: number | null;
  bpc_valor_idoso: number | null;
  bpc_valor_medio_beneficiario: number | null;
  pct_bpc_deficiencia: number | null;
  pct_bpc_idoso: number | null;
  bf_por_1000_hab: number | null;
  bpc_por_1000_hab: number | null;
  populacao_estimada: number | null;
  var_mensal_bf_qty: number | null;
  var_mensal_bf_qty_pct: number | null;
  var_mensal_bf_valor: number | null;
  var_anual_bf_qty: number | null;
  var_anual_bf_qty_pct: number | null;
  var_anual_bf_valor_pct: number | null;
  var_anual_bpc_qty: number | null;
  var_anual_bpc_qty_pct: number | null;
  var_mensal_bpc_qty_pct: number | null;
  data_carga: string | null;
}

interface Totais {
  bf_quantidade_familias: number;
  bf_valor_repassado: number;
  bf_valor_medio_familia: number | null;
  bpc_quantidade_total: number;
  bpc_quantidade_deficiencia: number;
  bpc_quantidade_idoso: number;
  bpc_valor_total: number;
  bpc_valor_deficiencia: number;
  bpc_valor_idoso: number;
  bpc_valor_medio_beneficiario: number | null;
  pct_bpc_deficiencia: number | null;
  pct_bpc_idoso: number | null;
  bf_por_1000_hab: number | null;
  bpc_por_1000_hab: number | null;
  populacao_estimada: number;
  var_mensal_bf_qty: number | null;
  var_mensal_bf_qty_pct: number | null;
  var_mensal_bpc_qty: number | null;
  var_mensal_bpc_qty_pct: number | null;
  media_var_anual_bf_qty_pct: number | null;
  media_var_anual_bpc_qty_pct: number | null;
}

interface Qualidade {
  municipios_com_dados: number;
  municipios_zerados: number;
  municipios_sem_populacao: number;
  data_carga: string | null;
}

interface RespostaResumo {
  competencia: string | null;
  municipios: MunicipioRow[];
  totais: Totais;
  qualidade: Qualidade;
}

interface SerieRow {
  ano_mes: string;
  bf_quantidade_familias: number | null;
  bf_valor_repassado: number | null;
  bf_valor_medio_familia: number | null;
  bpc_quantidade_total: number | null;
  bpc_quantidade_deficiencia: number | null;
  bpc_quantidade_idoso: number | null;
  bpc_valor_total: number | null;
  populacao_estimada: number | null;
  bf_por_1000_hab: number | null;
  bpc_por_1000_hab: number | null;
}

interface AlertaRow {
  ano_mes: string;
  codigo_ibge_municipio: string;
  nome_municipio: string;
  tipo_alerta: string;
  nivel_alerta: string;
  indicador_base: string;
  valor_indicador: number | null;
  var_mensal_pct: number | null;
  var_anual_pct: number | null;
  descricao: string;
  justificativa: string;
}

interface MapaRow {
  codigo_ibge_municipio: string;
  nome_municipio:        string;
  cobertura_por_1000:    number;
  bf_por_1000:           number;
  bpc_por_1000:          number;
  bf_familias:           number;
  bpc_beneficiarios:     number;
  populacao_estimada:    number;
  meses_com_dados:       number;
  periodo:               { inicio: string; fim: string };
}

interface DetalheModal {
  competencia: string;
  detalhe: MunicipioRow | null;
  historico: SerieRow[];
}

// ---------------------------------------------------------------------------
// Formatadores
// ---------------------------------------------------------------------------

function fmtQtd(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return Number(v).toLocaleString("pt-BR");
}

function fmtMoeda(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(Number(v));
}

function fmtPct(v: number | null | undefined, decimais = 1): string {
  if (v === null || v === undefined) return "—";
  return `${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: decimais, maximumFractionDigits: decimais })}%`;
}

function fmtDelta(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const s = Number(v) > 0 ? "+" : "";
  return `${s}${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function fmtCompetencia(anomes: string): string {
  if (!anomes || anomes.length < 7) return anomes;
  const [ano, mes] = anomes.split("-");
  return `${mes}/${ano}`;
}

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

// ---------------------------------------------------------------------------
// Badges e helpers visuais
// ---------------------------------------------------------------------------

const NIVEL_COR: Record<string, string> = {
  ALTO:  "bg-red-100    text-red-700    dark:bg-red-950/40    dark:text-red-300",
  MEDIO: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  BAIXO: "bg-green-100  text-green-700  dark:bg-green-950/40  dark:text-green-300",
};

const NIVEL_DOT: Record<string, string> = {
  ALTO:  "bg-red-500",
  MEDIO: "bg-orange-500",
  BAIXO: "bg-green-500",
};

const NIVEL_LABEL: Record<string, string> = {
  ALTO:  "Crítico",
  MEDIO: "Alto",
  BAIXO: "Baixo",
};

function NivelBadge({ nivel }: { nivel: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${NIVEL_COR[nivel] ?? NIVEL_COR.BAIXO}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${NIVEL_DOT[nivel] ?? NIVEL_DOT.BAIXO}`} />
      {NIVEL_LABEL[nivel] ?? nivel}
    </span>
  );
}

function DeltaBadge({ valor }: { valor: number | null | undefined }) {
  if (valor === null || valor === undefined) return <span className="text-xs text-slate-400">—</span>;
  const n = Number(valor);
  if (n > 0) return (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
      <TrendingUp className="h-3 w-3" />{fmtDelta(n)}
    </span>
  );
  if (n < 0) return (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-red-600 dark:text-red-400">
      <TrendingDown className="h-3 w-3" />{fmtDelta(n)}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
      <Minus className="h-3 w-3" />0,0%
    </span>
  );
}

// ---------------------------------------------------------------------------
// Card KPI
// ---------------------------------------------------------------------------

interface CardKpiProps {
  titulo: string;
  valor: string;
  subvalor?: string;
  subRotulo?: string;
  deltaM?: number | null;
  deltaA?: number | null;
  icone: React.ReactNode;
  corIcone?: string;
  rodape?: React.ReactNode;
}

function CardKpi({ titulo, valor, subvalor, subRotulo, deltaM, deltaA, icone, corIcone = "text-slate-400", rodape }: CardKpiProps) {
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{titulo}</span>
        <div className={`inline-flex rounded-xl bg-slate-50 p-2 dark:bg-slate-700/50 ${corIcone}`}>
          {icone}
        </div>
      </div>
      <p className="text-2xl font-bold text-slate-800 dark:text-white">{valor}</p>
      {subvalor && (
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {subRotulo && <span className="font-medium text-slate-600 dark:text-slate-300">{subRotulo}: </span>}
          {subvalor}
        </p>
      )}
      {(deltaM !== undefined || deltaA !== undefined) && (
        <div className="mt-3 flex flex-wrap gap-3 border-t border-slate-100 pt-3 dark:border-slate-700/60">
          {deltaM !== undefined && (
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 dark:text-slate-500">vs mês anterior</span>
              <DeltaBadge valor={deltaM} />
            </div>
          )}
          {deltaA !== undefined && (
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 dark:text-slate-500">vs mesmo mês ano ant.</span>
              <DeltaBadge valor={deltaA} />
            </div>
          )}
        </div>
      )}
      {rodape && <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-700/60">{rodape}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rótulos curtos para tipo de alerta
// ---------------------------------------------------------------------------

const TIPO_LABEL: Record<string, string> = {
  maior_materialidade_bf:   "Materialidade BF",
  crescimento_anual_bf:     "Crescimento BF",
  concentracao_bf_1000_hab: "Concentração BF",
  crescimento_anual_bpc:    "Crescimento BPC",
  dados_zerados_ausentes:   "Dados ausentes",
};

const NIVEL_BORDA: Record<string, string> = {
  ALTO:  "border-l-red-500",
  MEDIO: "border-l-orange-400",
  BAIXO: "border-l-blue-400",
};

// ---------------------------------------------------------------------------
// Modal de detalhe do município
// ---------------------------------------------------------------------------

function ModalMunicipio({ detalhe, onClose }: { detalhe: DetalheModal; onClose: () => void }) {
  const d = detalhe.detalhe;

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", fn);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", fn); document.body.style.overflow = ""; };
  }, [onClose]);

  const serieLabels = detalhe.historico.map((r) => fmtCompetencia(r.ano_mes));
  const serieBF = detalhe.historico.map((r) => Number(r.bf_quantidade_familias ?? 0));
  const serieBPC = detalhe.historico.map((r) => Number(r.bpc_quantidade_total ?? 0));

  const chartOpts: ApexOptions = {
    chart: { type: "line", toolbar: { show: false }, zoom: { enabled: false }, background: "transparent", animations: { enabled: false } },
    stroke: { curve: "smooth", width: [2, 2] },
    colors: ["#0d9488", "#3b82f6"],
    xaxis: { categories: serieLabels, labels: { style: { fontSize: "10px" } }, tickAmount: 6 },
    yaxis: { labels: { formatter: (v) => fmtQtd(v) } },
    legend: { position: "top", fontSize: "11px" },
    tooltip: { y: { formatter: (v) => fmtQtd(v) } },
    theme: { mode: "light" },
    grid: { borderColor: "#f1f5f9" },
  };

  const chartSeries = [
    { name: "Famílias BF", data: serieBF },
    { name: "Beneficiários BPC", data: serieBPC },
  ];

  return (
    <div className="fixed inset-0 z-[99999] flex items-start justify-center overflow-y-auto pt-10 pb-10">
      <div className="fixed inset-0 bg-slate-400/50 backdrop-blur-[32px]" onClick={onClose} />
      <div className="relative w-full max-w-3xl rounded-2xl bg-white shadow-xl dark:bg-slate-900 mx-4">
        <div className="flex items-start justify-between border-b border-slate-100 p-6 dark:border-slate-700">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              {d?.nome_municipio ?? "Município"} — {fmtCompetencia(detalhe.competencia)}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Detalhe de Transferência de Renda para apoio à análise do gabinete
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-6 space-y-5">
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
            <strong>Nota:</strong> Este município apresenta variações que podem indicar aumento de vulnerabilidade social,
            mudança cadastral, atualização de base ou efeito de política pública. Recomenda-se cruzar com dados de
            educação, saúde, folha de pagamento, contratos assistenciais e execução orçamentária da assistência social.
          </div>

          {d && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                { r: "Famílias BF",    v: fmtQtd(d.bf_quantidade_familias) },
                { r: "Valor BF",       v: fmtMoeda(d.bf_valor_repassado) },
                { r: "Médio/família",  v: fmtMoeda(d.bf_valor_medio_familia) },
                { r: "BPC total",      v: fmtQtd(d.bpc_quantidade_total) },
                { r: "BPC defic.",     v: fmtQtd(d.bpc_quantidade_deficiencia) },
                { r: "BPC idoso",      v: fmtQtd(d.bpc_quantidade_idoso) },
                { r: "Valor BPC",      v: fmtMoeda(d.bpc_valor_total) },
                { r: "BF/1.000 hab",   v: d.bf_por_1000_hab !== null ? fmtQtd(d.bf_por_1000_hab) : "—" },
                { r: "BPC/1.000 hab",  v: d.bpc_por_1000_hab !== null ? fmtQtd(d.bpc_por_1000_hab) : "—" },
              ].map(({ r, v }) => (
                <div key={r} className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800">
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">{r}</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-white">{v}</p>
                </div>
              ))}
            </div>
          )}

          {d && (
            <div className="rounded-xl border border-slate-100 p-4 dark:border-slate-700">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Variações</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  { r: "BF mensal",      v: d.var_mensal_bf_qty_pct },
                  { r: "BF anual",       v: d.var_anual_bf_qty_pct },
                  { r: "BPC mensal",     v: d.var_mensal_bpc_qty_pct },
                  { r: "BPC anual",      v: d.var_anual_bpc_qty_pct },
                  { r: "Valor BF anual", v: d.var_anual_bf_valor_pct },
                ].map(({ r, v }) => (
                  <div key={r} className="flex flex-col">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">{r}</span>
                    <DeltaBadge valor={v} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {detalhe.historico.length > 1 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Histórico — BF e BPC</p>
              <Chart type="line" height={200} options={chartOpts} series={chartSeries} />
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 p-4 dark:border-slate-700">
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-slate-100 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabela analítica
// ---------------------------------------------------------------------------

type ColTabela = keyof MunicipioRow;

function TabelaAnalitica({ rows, onSelectMunicipio }: { rows: MunicipioRow[]; onSelectMunicipio: (m: MunicipioRow) => void }) {
  const [busca, setBusca]     = useState("");
  const [pagina, setPagina]   = useState(0);
  const [sortCol, setSortCol] = useState<ColTabela>("bf_quantidade_familias");
  const [sortAsc, setSortAsc] = useState(false);
  const POR_PAG = 10;

  const sorted = useMemo(() => {
    const filtrado = rows.filter((r) => (r.nome_municipio ?? "").toLowerCase().includes(busca.toLowerCase()));
    return [...filtrado].sort((a, b) => {
      const va = a[sortCol] ?? null;
      const vb = b[sortCol] ?? null;
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      const cmp = Number(va) < Number(vb) ? -1 : Number(va) > Number(vb) ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    });
  }, [rows, busca, sortCol, sortAsc]);

  const totalPag = Math.ceil(sorted.length / POR_PAG);
  const pag = Math.min(pagina, Math.max(0, totalPag - 1));
  const visivel = sorted.slice(pag * POR_PAG, (pag + 1) * POR_PAG);

  function toggleSort(col: ColTabela) {
    if (sortCol === col) setSortAsc((v) => !v);
    else { setSortCol(col); setSortAsc(false); }
    setPagina(0);
  }

  function Th({ col, label }: { col: ColTabela; label: string }) {
    const ativo = sortCol === col;
    return (
      <th
        className="cursor-pointer select-none whitespace-nowrap px-4 py-3 text-left text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        onClick={() => toggleSort(col)}
      >
        <span className="flex items-center gap-1">
          {label}
          {ativo ? (sortAsc ? "↑" : "↓") : <span className="opacity-30">↕</span>}
        </span>
      </th>
    );
  }

  function nivelRisco(row: MunicipioRow): "alto" | "medio" | "baixo" {
    const v = row.var_anual_bf_qty_pct;
    if (v !== null && Number(v) > 10) return "alto";
    if (v !== null && Number(v) > 5)  return "medio";
    return "baixo";
  }

  const RISCO_BADGE: Record<string, string> = {
    alto:  "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
    medio: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
    baixo: "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300",
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          <strong className="text-slate-700 dark:text-slate-200">{sorted.length}</strong> município{sorted.length !== 1 ? "s" : ""} na competência selecionada
        </span>
        <input
          value={busca}
          onChange={(e) => { setBusca(e.target.value); setPagina(0); }}
          placeholder="Buscar município..."
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:placeholder-slate-500"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm dark:border-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
            <tr>
              <Th col="nome_municipio"            label="Município" />
              <Th col="bf_quantidade_familias"    label="Famílias BF" />
              <Th col="bf_valor_repassado"        label="Valor BF" />
              <Th col="bf_valor_medio_familia"    label="Médio/fam." />
              <Th col="bpc_quantidade_total"      label="BPC total" />
              <Th col="bpc_quantidade_deficiencia" label="BPC def." />
              <Th col="bpc_quantidade_idoso"      label="BPC idoso" />
              <Th col="bpc_valor_total"           label="Valor BPC" />
              <Th col="bf_por_1000_hab"           label="BF/1.000 hab" />
              <Th col="bpc_por_1000_hab"          label="BPC/1.000 hab" />
              <Th col="var_anual_bf_qty_pct"      label="Var. anual BF" />
              <Th col="var_anual_bpc_qty_pct"     label="Var. anual BPC" />
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">Alerta</th>
            </tr>
          </thead>
          <tbody>
            {visivel.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
                  Nenhum município encontrado.
                </td>
              </tr>
            ) : (
              visivel.map((row, i) => {
                const risco = nivelRisco(row);
                return (
                  <tr
                    key={row.codigo_ibge_municipio}
                    onClick={() => onSelectMunicipio(row)}
                    className={`cursor-pointer border-t border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800/40 ${i % 2 !== 0 ? "bg-slate-50/50 dark:bg-slate-800/20" : ""}`}
                  >
                    <td className="px-4 py-3 font-medium text-teal-700 dark:text-teal-400 whitespace-nowrap">{row.nome_municipio}</td>
                    <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300 whitespace-nowrap">{fmtQtd(row.bf_quantidade_familias)}</td>
                    <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300 whitespace-nowrap">{fmtMoeda(row.bf_valor_repassado)}</td>
                    <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300 whitespace-nowrap">{fmtMoeda(row.bf_valor_medio_familia)}</td>
                    <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300 whitespace-nowrap">{fmtQtd(row.bpc_quantidade_total)}</td>
                    <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300 whitespace-nowrap">{fmtQtd(row.bpc_quantidade_deficiencia)}</td>
                    <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300 whitespace-nowrap">{fmtQtd(row.bpc_quantidade_idoso)}</td>
                    <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300 whitespace-nowrap">{fmtMoeda(row.bpc_valor_total)}</td>
                    <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-400 whitespace-nowrap">{fmtQtd(row.bf_por_1000_hab)}</td>
                    <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-400 whitespace-nowrap">{fmtQtd(row.bpc_por_1000_hab)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap"><DeltaBadge valor={row.var_anual_bf_qty_pct} /></td>
                    <td className="px-4 py-3 text-right whitespace-nowrap"><DeltaBadge valor={row.var_anual_bpc_qty_pct} /></td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${RISCO_BADGE[risco]}`}>
                        {risco}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPag > 1 && (
        <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-700">
          <button
            disabled={pag === 0}
            onClick={() => setPagina((p) => Math.max(0, p - 1))}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300"
          >
            <ChevronLeft className="h-4 w-4" /> Anterior
          </button>
          <span className="text-xs text-slate-500 dark:text-slate-400">{pag + 1} / {totalPag}</span>
          <button
            disabled={pag >= totalPag - 1}
            onClick={() => setPagina((p) => Math.min(totalPag - 1, p + 1))}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300"
          >
            Próxima <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

type TabGrafico = "bf" | "valor_bf" | "medio" | "bpc_comp" | "bpc_total" | "ranking";

const INDICADORES_RANKING = [
  { value: "bf_quantidade_familias",    label: "Famílias BF" },
  { value: "bf_valor_repassado",        label: "Valor BF" },
  { value: "bpc_quantidade_total",      label: "Beneficiários BPC" },
  { value: "bpc_valor_total",           label: "Valor BPC" },
  { value: "bf_por_1000_hab",           label: "BF / 1.000 hab" },
  { value: "bpc_por_1000_hab",          label: "BPC / 1.000 hab" },
];

const anoAtual = new Date().getFullYear();
const defaultCompInicio = `${anoAtual - 1}-01`;

export default function TransferenciaRendaClient() {
  const searchParams = useSearchParams();

  // Filtros vêm da URL (definidos pelo SocialHeaderFilters no cabeçalho)
  const filtroMunicipio  = searchParams.get("municipio")  ?? "all";
  const filtroCompInicio = searchParams.get("compInicio") ?? defaultCompInicio;
  const filtroCompFim    = searchParams.get("compFim")    ?? "";
  const isSingleMun      = filtroMunicipio !== "all" && filtroMunicipio !== "";

  const [resumo,      setResumo]      = useState<RespostaResumo | null>(null);
  const [serie,       setSerie]       = useState<SerieRow[]>([]);
  const [alertas,     setAlertas]     = useState<AlertaRow[]>([]);
  const [ranking,     setRanking]     = useState<MunicipioRow[]>([]);
  const [carregando,  setCarregando]  = useState(true);
  const [erroBD,      setErroBD]      = useState<string | null>(null);
  const [indicadorRanking, setIndicadorRanking] = useState("bf_quantidade_familias");

  const [tabGrafico,      setTabGrafico]      = useState<TabGrafico>("bf");
  const [modalMun,        setModalMun]        = useState<DetalheModal | null>(null);
  const [carregandoModal, setCarregandoModal] = useState(false);
  const [dadosMapa,       setDadosMapa]       = useState<Record<string, MapaRow>>({});
  const [carregandoMapa,  setCarregandoMapa]  = useState(false);

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    setErroBD(null);
    try {
      const params = new URLSearchParams();
      if (filtroMunicipio !== "all") params.set("municipio", filtroMunicipio);

      const [res, alertasRes] = await Promise.all([
        fetch(`/api/social/mis/resumo?${params}`).then((r) => r.json()),
        fetch("/api/social/mis/alertas").then((r) => r.json()),
      ]);

      if (res.error) { setErroBD(res.error); return; }
      setResumo(res as RespostaResumo);
      setAlertas(Array.isArray(alertasRes) ? alertasRes : []);

      const competenciaAtual = (res as RespostaResumo).competencia;
      if (competenciaAtual) {
        const compFimEfetivo = filtroCompFim || competenciaAtual;

        const serieParams = new URLSearchParams();
        if (filtroMunicipio !== "all") serieParams.set("municipio", filtroMunicipio);
        serieParams.set("competenciaInicio", filtroCompInicio);
        serieParams.set("competenciaFim",    compFimEfetivo);

        const serieRes = await fetch(`/api/social/mis/serie?${serieParams}`).then((r) => r.json());
        setSerie(Array.isArray(serieRes) ? serieRes : []);
      }
    } catch (err) {
      setErroBD(err instanceof Error ? err.message : String(err));
    } finally {
      setCarregando(false);
    }
  }, [filtroMunicipio, filtroCompInicio, filtroCompFim]);

  useEffect(() => { carregarDados(); }, [carregarDados]);

  // Se município selecionado e tab "ranking" (não faz sentido), volta para BF
  useEffect(() => {
    if (isSingleMun && tabGrafico === "ranking") setTabGrafico("bf");
  }, [isSingleMun, tabGrafico]);

  // Carrega dados do mapa conforme o período do filtro
  useEffect(() => {
    let cancelado = false;
    setCarregandoMapa(true);
    const params = new URLSearchParams();
    params.set("compInicio", filtroCompInicio);
    if (filtroCompFim) params.set("compFim", filtroCompFim);
    fetch(`/api/social/mis/mapa?${params}`)
      .then((r) => r.json())
      .then((d: MapaRow[]) => {
        if (cancelado) return;
        if (Array.isArray(d)) {
          const idx: Record<string, MapaRow> = {};
          d.forEach((row) => { idx[row.codigo_ibge_municipio] = row; });
          setDadosMapa(idx);
        }
      })
      .catch(() => { /* silencioso */ })
      .finally(() => { if (!cancelado) setCarregandoMapa(false); });
    return () => { cancelado = true; };
  }, [filtroCompInicio, filtroCompFim]);

  useEffect(() => {
    if (!resumo?.competencia) return;
    fetch(`/api/social/mis/ranking?competencia=${resumo.competencia}&indicador=${indicadorRanking}&limit=22`)
      .then((r) => r.json())
      .then((d) => setRanking(Array.isArray(d) ? d : []));
  }, [indicadorRanking, resumo?.competencia]);

  const abrirModalMunicipio = useCallback(async (codMun: string, competencia?: string) => {
    setCarregandoModal(true);
    try {
      const params = new URLSearchParams({ codMun });
      if (competencia) params.set("competencia", competencia);
      const res = await fetch(`/api/social/mis/municipio?${params}`).then((r) => r.json());
      if (!res.error) setModalMun(res as DetalheModal);
    } finally {
      setCarregandoModal(false);
    }
  }, []);

  const fecharModal = useCallback(() => setModalMun(null), []);

  // -----------------------------------------------------------------------
  // Gráficos
  // -----------------------------------------------------------------------

  const labels = serie.map((r) => fmtCompetencia(r.ano_mes));

  const baseOpts = (): ApexOptions => ({
    chart: { toolbar: { show: false }, zoom: { enabled: false }, background: "transparent", animations: { enabled: false } },
    xaxis: { categories: labels, labels: { style: { fontSize: "10px" }, rotate: -30 }, tickAmount: Math.min(12, labels.length) },
    grid: { borderColor: "#f1f5f9" },
    legend: { position: "top", fontSize: "11px" },
    tooltip: { shared: true, intersect: false },
    theme: { mode: "light" },
  });

  const graficoBF: ApexOptions      = { ...baseOpts(), chart: { ...baseOpts().chart, type: "line" }, colors: ["#0d9488"], stroke: { curve: "smooth", width: 2 }, yaxis: { labels: { formatter: (v) => fmtQtd(v) } }, tooltip: { y: { formatter: (v) => fmtQtd(v) } } };
  const graficoValor: ApexOptions   = { ...baseOpts(), chart: { ...baseOpts().chart, type: "area" }, colors: ["#6366f1"], stroke: { curve: "smooth", width: 2 }, fill: { type: "gradient", gradient: { opacityFrom: 0.3, opacityTo: 0.05 } }, yaxis: { labels: { formatter: (v) => `R$ ${(Number(v)/1e6).toFixed(1)}M` } }, tooltip: { y: { formatter: (v) => fmtMoeda(v) } } };
  const graficoMedio: ApexOptions   = { ...baseOpts(), chart: { ...baseOpts().chart, type: "line" }, colors: ["#f59e0b"], stroke: { curve: "smooth", width: 2 }, yaxis: { labels: { formatter: (v) => fmtMoeda(v) } }, tooltip: { y: { formatter: (v) => fmtMoeda(v) } } };
  const graficoBPCComp: ApexOptions = { ...baseOpts(), chart: { ...baseOpts().chart, type: "bar", stacked: true }, colors: ["#0d9488", "#3b82f6"], plotOptions: { bar: { horizontal: false } }, yaxis: { labels: { formatter: (v) => fmtQtd(v) } }, tooltip: { y: { formatter: (v) => fmtQtd(v) } } };
  const graficoBPCTotal: ApexOptions= { ...baseOpts(), chart: { ...baseOpts().chart, type: "line" }, colors: ["#10b981"], stroke: { curve: "smooth", width: 2 }, yaxis: { labels: { formatter: (v) => fmtQtd(v) } }, tooltip: { y: { formatter: (v) => fmtQtd(v) } } };
  const graficoRanking: ApexOptions = { chart: { type: "bar", toolbar: { show: false }, background: "transparent", animations: { enabled: false } }, plotOptions: { bar: { horizontal: true, borderRadius: 4 } }, colors: ["#0d9488"], xaxis: { categories: ranking.map((r) => r.nome_municipio ?? ""), labels: { formatter: (v) => fmtQtd(Number(v)) } }, dataLabels: { enabled: false }, grid: { borderColor: "#f1f5f9" }, theme: { mode: "light" }, tooltip: { y: { formatter: (v) => fmtQtd(v) } } };

  const serieBFQty    = [{ name: "Famílias BF",        data: serie.map((r) => Number(r.bf_quantidade_familias ?? 0)) }];
  const serieValorBF  = [{ name: "Valor BF (R$)",      data: serie.map((r) => Number(r.bf_valor_repassado    ?? 0)) }];
  const serieMedio    = [{ name: "Médio/família",       data: serie.map((r) => Number(r.bf_valor_medio_familia ?? 0)) }];
  const serieBPCComp  = [{ name: "BPC Deficiência", data: serie.map((r) => Number(r.bpc_quantidade_deficiencia ?? 0)) }, { name: "BPC Idoso", data: serie.map((r) => Number(r.bpc_quantidade_idoso ?? 0)) }];
  const serieBPCTotal = [{ name: "Beneficiários BPC",  data: serie.map((r) => Number(r.bpc_quantidade_total   ?? 0)) }];
  const serieRanking  = [{ name: INDICADORES_RANKING.find((i) => i.value === indicadorRanking)?.label ?? indicadorRanking, data: ranking.map((r) => Number(r[indicadorRanking as keyof MunicipioRow] ?? 0)) }];

  // -----------------------------------------------------------------------
  // Derivados para cards
  // -----------------------------------------------------------------------

  const t = resumo?.totais;
  const competencia = resumo?.competencia ?? null;
  const varMensalBF  = isSingleMun
    ? (resumo?.municipios?.[0]?.var_mensal_bf_qty_pct  ?? null)
    : (t?.var_mensal_bf_qty_pct ?? null);
  const varAnualBF   = isSingleMun
    ? (resumo?.municipios?.[0]?.var_anual_bf_qty_pct   ?? null)
    : (t?.media_var_anual_bf_qty_pct ?? null);
  const varMensalBPC = isSingleMun
    ? (resumo?.municipios?.[0]?.var_mensal_bpc_qty_pct ?? null)
    : (t?.var_mensal_bpc_qty_pct ?? null);
  const varAnualBPC  = isSingleMun
    ? (resumo?.municipios?.[0]?.var_anual_bpc_qty_pct  ?? null)
    : (t?.media_var_anual_bpc_qty_pct ?? null);

  const semDados = !carregando && !competencia;

  const TABS: [TabGrafico, string][] = [
    ["bf",        "Famílias BF"],
    ["valor_bf",  "Valor BF"],
    ["medio",     "Médio/fam."],
    ["bpc_comp",  "Composição BPC"],
    ["bpc_total", "BPC total"],
    ...(!isSingleMun ? [["ranking", "Ranking"] as [TabGrafico, string]] : []),
  ];

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <>
      {modalMun && <ModalMunicipio detalhe={modalMun} onClose={fecharModal} />}
      {carregandoModal && (
        <div className="fixed inset-0 z-[99998] flex items-center justify-center bg-slate-400/30 backdrop-blur-sm">
          <div className="rounded-2xl bg-white px-6 py-4 shadow-xl dark:bg-slate-800">
            <p className="text-sm text-slate-600 dark:text-slate-300">Carregando detalhes...</p>
          </div>
        </div>
      )}

      <div className="min-h-screen space-y-5 bg-slate-50 p-4 pb-10 dark:bg-slate-900 sm:p-6">

        {/* Erro */}
        {erroBD && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
            <strong>Erro ao carregar dados:</strong> {erroBD}
          </div>
        )}

        {/* Sem dados */}
        {semDados && !erroBD && (
          <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-6 shadow-sm dark:border-amber-700 dark:bg-amber-900/10">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Dados de Bolsa Família / BPC ainda não carregados
            </p>
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              Execute o ETL <code className="font-mono">npm run mis-bolsa-familia-bpc</code> na pasta{" "}
              <code className="font-mono">etl/</code> com os arquivos XLSX do MIS/MDS em{" "}
              <code className="font-mono">etl/data/mis/</code>.
            </p>
          </div>
        )}

        {/* Loading skeleton */}
        {carregando && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-36 animate-pulse rounded-2xl border border-slate-200 bg-slate-100 shadow-sm dark:border-slate-700 dark:bg-slate-800" />
            ))}
          </div>
        )}

        {/* Loading spinner central */}
        {carregando && (
          <div className="flex items-center justify-center py-4 text-sm text-slate-500 dark:text-slate-400">
            <div className="mr-3 h-5 w-5 animate-spin rounded-full border-2 border-teal-200 border-t-teal-600" />
            Carregando dados...
          </div>
        )}

        {/* Cards KPI */}
        {!carregando && t && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <CardKpi
              titulo={`Famílias BF — ${fmtCompetencia(competencia ?? "")}`}
              valor={fmtQtd(t.bf_quantidade_familias)}
              deltaM={varMensalBF}
              deltaA={varAnualBF}
              icone={<Users className="h-4 w-4" />}
              corIcone="text-teal-600 dark:text-teal-400"
            />

            <CardKpi
              titulo="Valor repassado — Bolsa Família"
              valor={fmtMoeda(t.bf_valor_repassado)}
              subvalor={fmtMoeda(t.bf_valor_medio_familia)}
              subRotulo="Média por família"
              deltaA={varAnualBF}
              icone={<DollarSign className="h-4 w-4" />}
              corIcone="text-indigo-500 dark:text-indigo-400"
            />

            <CardKpi
              titulo={`Beneficiários BPC — ${fmtCompetencia(competencia ?? "")}`}
              valor={fmtQtd(t.bpc_quantidade_total)}
              deltaM={varMensalBPC}
              deltaA={varAnualBPC}
              icone={<Heart className="h-4 w-4" />}
              corIcone="text-emerald-600 dark:text-emerald-400"
              rodape={
                <div className="flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
                  <span>Defic.: <strong className="text-slate-700 dark:text-slate-200">{fmtQtd(t.bpc_quantidade_deficiencia)}</strong> ({fmtPct(t.pct_bpc_deficiencia)})</span>
                  <span>Idoso: <strong className="text-slate-700 dark:text-slate-200">{fmtQtd(t.bpc_quantidade_idoso)}</strong> ({fmtPct(t.pct_bpc_idoso)})</span>
                </div>
              }
            />

            <CardKpi
              titulo="Valor BPC"
              valor={fmtMoeda(t.bpc_valor_total)}
              subvalor={fmtMoeda(t.bpc_valor_medio_beneficiario)}
              subRotulo="Médio por beneficiário"
              icone={<DollarSign className="h-4 w-4" />}
              corIcone="text-teal-500 dark:text-teal-400"
              rodape={
                <div className="flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
                  <span>Defic.: <strong>{fmtMoeda(t.bpc_valor_deficiencia)}</strong></span>
                  <span>Idoso: <strong>{fmtMoeda(t.bpc_valor_idoso)}</strong></span>
                </div>
              }
            />

            <CardKpi
              titulo="Famílias BF por 1.000 hab."
              valor={t.bf_por_1000_hab !== null ? fmtQtd(t.bf_por_1000_hab) : "—"}
              subvalor="famílias / mil habitantes"
              icone={<Activity className="h-4 w-4" />}
              corIcone="text-purple-500 dark:text-purple-400"
              rodape={
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Pop. estimada: <strong className="text-slate-700 dark:text-slate-200">{fmtQtd(t.populacao_estimada)}</strong>
                </span>
              }
            />

            <CardKpi
              titulo="Beneficiários BPC por 1.000 hab."
              valor={t.bpc_por_1000_hab !== null ? fmtQtd(t.bpc_por_1000_hab) : "—"}
              subvalor="beneficiários / mil habitantes"
              icone={<Activity className="h-4 w-4" />}
              corIcone="text-indigo-400 dark:text-indigo-300"
              rodape={
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Pop. estimada: <strong className="text-slate-700 dark:text-slate-200">{fmtQtd(t.populacao_estimada)}</strong>
                </span>
              }
            />

          </div>
        )}

        {/* Mapa de cobertura social */}
        {!isSingleMun && (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 dark:border-slate-700">
              <Activity className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-800 dark:text-white">
                  Bolsa Família por município
                </h2>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Famílias BF por 1.000 habitantes · último mês do período selecionado
                </p>
              </div>
            </div>
            <div className="relative h-[480px] w-full overflow-hidden rounded-b-2xl">
              {carregandoMapa ? (
                <div className="flex h-full items-center justify-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-teal-200 border-t-teal-600" />
                  Carregando mapa...
                </div>
              ) : Object.keys(dadosMapa).length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-400 dark:text-slate-500">
                  Sem dados de cobertura para o período selecionado.
                </div>
              ) : (
                <MapaSocialContent dados={dadosMapa} />
              )}
            </div>
          </div>
        )}

        {/* Alertas — somente no modo "todos os municípios" */}
        {!carregando && !isSingleMun && alertas.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 dark:border-slate-700">
              <AlertTriangle className="h-4 w-4 shrink-0 text-orange-500 dark:text-orange-400" />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-800 dark:text-white">
                  Pontos de atenção para o gabinete
                </h2>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Municípios com maior materialidade, crescimento atípico ou dados ausentes na competência mais recente.
                </p>
              </div>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {alertas.map((a, i) => (
                <div
                  key={`${a.codigo_ibge_municipio}-${a.tipo_alerta}-${i}`}
                  className={`flex items-center gap-3 border-l-4 py-3 pl-4 pr-5 ${NIVEL_BORDA[a.nivel_alerta] ?? "border-l-slate-300"}`}
                >
                  {/* Nível */}
                  <NivelBadge nivel={a.nivel_alerta} />

                  {/* Município */}
                  <span className="w-36 shrink-0 truncate text-xs font-semibold text-slate-800 dark:text-white">
                    {a.nome_municipio}
                  </span>

                  {/* Tipo */}
                  <span className="hidden w-36 shrink-0 truncate text-xs text-slate-400 dark:text-slate-500 sm:block">
                    {TIPO_LABEL[a.tipo_alerta] ?? a.tipo_alerta}
                  </span>

                  {/* Descrição */}
                  <span className="hidden min-w-0 flex-1 truncate text-xs text-slate-500 dark:text-slate-400 lg:block">
                    {a.descricao}
                  </span>

                  {/* Variações */}
                  <div className="hidden shrink-0 flex-col items-end gap-0.5 sm:flex">
                    {a.var_mensal_pct !== null && (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-slate-400">mês</span>
                        <DeltaBadge valor={a.var_mensal_pct} />
                      </div>
                    )}
                    {a.var_anual_pct !== null && (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-slate-400">ano</span>
                        <DeltaBadge valor={a.var_anual_pct} />
                      </div>
                    )}
                  </div>

                  {/* Ação */}
                  <button
                    onClick={() => abrirModalMunicipio(a.codigo_ibge_municipio, a.ano_mes)}
                    className="shrink-0 text-xs font-semibold text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300"
                  >
                    Ver →
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Gráficos */}
        {!carregando && serie.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-4 flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              <h2 className="text-sm font-semibold text-slate-800 dark:text-white">Série histórica</h2>
            </div>

            {/* Tabs */}
            <div className="mb-4 flex flex-wrap gap-1.5">
              {TABS.map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setTabGrafico(k)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    tabGrafico === k
                      ? "border-teal-500 bg-teal-600 text-white dark:border-teal-400 dark:bg-teal-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div>
              {tabGrafico === "bf"       && <Chart type="line"  height={300} options={graficoBF}       series={serieBFQty} />}
              {tabGrafico === "valor_bf" && <Chart type="area"  height={300} options={graficoValor}    series={serieValorBF} />}
              {tabGrafico === "medio"    && <Chart type="line"  height={300} options={graficoMedio}    series={serieMedio} />}
              {tabGrafico === "bpc_comp" && <Chart type="bar"   height={300} options={graficoBPCComp}  series={serieBPCComp} />}
              {tabGrafico === "bpc_total"&& <Chart type="line"  height={300} options={graficoBPCTotal} series={serieBPCTotal} />}
              {tabGrafico === "ranking" && ranking.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-500 dark:text-slate-400">Indicador:</span>
                    <select
                      value={indicadorRanking}
                      onChange={(e) => setIndicadorRanking(e.target.value)}
                      className="rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-3 pr-8 text-xs text-slate-700 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                    >
                      {INDICADORES_RANKING.map((i) => (
                        <option key={i.value} value={i.value}>{i.label}</option>
                      ))}
                    </select>
                  </div>
                  <Chart
                    type="bar"
                    height={Math.max(300, ranking.length * 24)}
                    options={graficoRanking}
                    series={serieRanking}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tabela analítica — apenas no modo "todos os municípios" */}
        {!carregando && !isSingleMun && resumo && resumo.municipios.length > 1 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <h2 className="mb-1 text-sm font-semibold text-slate-800 dark:text-white">
              Tabela analítica — {fmtCompetencia(competencia ?? "")}
            </h2>
            <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
              Clique em qualquer linha para abrir o detalhe completo do município.
            </p>
            <TabelaAnalitica
              rows={resumo.municipios}
              onSelectMunicipio={(m) => abrirModalMunicipio(m.codigo_ibge_municipio, m.ano_mes)}
            />
          </div>
        )}

        {/* Qualidade dos dados */}
        {!carregando && resumo?.qualidade && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-3 flex items-center gap-2">
              <Database className="h-4 w-4 text-slate-400 dark:text-slate-500" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Qualidade dos dados
              </h2>
            </div>
            <div className="flex flex-wrap gap-6 text-xs text-slate-500 dark:text-slate-400">
              <span>
                Competência válida mais recente:{" "}
                <strong className="text-slate-700 dark:text-slate-200">{competencia ? fmtCompetencia(competencia) : "—"}</strong>
              </span>
              <span>
                Municípios com dados:{" "}
                <strong className="text-slate-700 dark:text-slate-200">{resumo.qualidade.municipios_com_dados}</strong>
              </span>
              {resumo.qualidade.municipios_zerados > 0 && (
                <span className="text-amber-600 dark:text-amber-400">
                  Com valores zerados: <strong>{resumo.qualidade.municipios_zerados}</strong>
                </span>
              )}
              {resumo.qualidade.municipios_sem_populacao > 0 && (
                <span className="text-amber-600 dark:text-amber-400">
                  Sem população: <strong>{resumo.qualidade.municipios_sem_populacao}</strong>
                </span>
              )}
              {resumo.qualidade.data_carga && (
                <span>
                  Última carga: <strong className="text-slate-700 dark:text-slate-200">{fmtData(resumo.qualidade.data_carga)}</strong>
                </span>
              )}
            </div>
            {resumo.qualidade.municipios_zerados > 0 && (
              <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
                Foram identificadas competências futuras ou ainda não consolidadas com valores zerados. Elas foram desconsideradas dos indicadores principais.
              </p>
            )}
          </div>
        )}

        {/* Rodapé */}
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Dados agregados por município. Nenhuma informação pessoal, CPF, NIS ou dado individualizado é exibido.
          Fontes: MDS / MIS / dados abertos. Os indicadores são pontos de atenção para análise do gabinete — não afirmam irregularidade.
        </p>
      </div>
    </>
  );
}
