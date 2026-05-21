"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";
import { fmtCompacto, fmtCompetencia, fmtMoeda, fmtNum, queryStringFiltros, toNum } from "./folhaUtils";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

type Resumo = {
  total_vencimentos: string;
  total_descontos: string;
  total_liquido: string;
  base_irpf: string;
  base_prev_segurado: string;
  base_prev_patronal: string;
  qtd_contracheques: string;
  qtd_servidores: string;
  qtd_entidades: string;
  qtd_contracheques_com_alerta: string;
};

type EvolucaoRow = {
  competencia: string;
  ano: number;
  mes: number;
  total_vencimentos: string;
  total_descontos: string;
  total_liquido: string;
  qtd_contracheques: string;
  qtd_servidores: string;
};

type EstatisticaEntidade = {
  id_entidade_cjur: number;
  entidade_nome: string;
  ente_nome: string | null;
  entidade_poder: string | null;
  qtd_servidores: string;
  total_liquido: string;
  minimo: string;
  mediana: string;
  media: string;
  maximo: string;
};

type RankingCargo = {
  id_cargo_sicap: number;
  cargo_nome: string | null;
  cargo_codigo: string | null;
  total_liquido: string;
  media_liquido: string;
  qtd_servidores: string;
  qtd_contracheques: string;
};

type TopRubrica = {
  verba_codigo: string | null;
  verba_descricao: string;
  verba_natureza: string | null;
  compoe_vencimento: boolean;
  base_irpf: boolean;
  base_previdencia: boolean;
  base_fgts: boolean;
  valor_liquido: string;
  valor_absoluto: string;
  qtd_ocorrencias: string;
  qtd_servidores: string;
};

type CorKpi = "blue" | "emerald" | "amber" | "violet" | "slate";

const CORES_KPI: Record<CorKpi, { borda: string; valor: string; subBg: string }> = {
  blue:    { borda: "border-l-blue-500",    valor: "text-blue-700 dark:text-blue-300",       subBg: "from-blue-50/50" },
  emerald: { borda: "border-l-emerald-500", valor: "text-emerald-700 dark:text-emerald-300", subBg: "from-emerald-50/50" },
  amber:   { borda: "border-l-amber-500",   valor: "text-amber-700 dark:text-amber-300",     subBg: "from-amber-50/50" },
  violet:  { borda: "border-l-violet-500",  valor: "text-violet-700 dark:text-violet-300",   subBg: "from-violet-50/50" },
  slate:   { borda: "border-l-slate-400",   valor: "text-slate-800 dark:text-slate-100",     subBg: "from-slate-50/50" },
};

function Kpi({
  titulo, valor, sub, cor = "slate", destaque,
}: { titulo: string; valor: string; sub?: string; cor?: CorKpi; destaque?: boolean }) {
  const c = CORES_KPI[cor];
  return (
    <div className={[
      "rounded-2xl border border-l-4 bg-linear-to-br to-white p-5 shadow-sm dark:to-gray-800",
      "border-gray-200 dark:border-gray-700", c.borda, c.subBg,
    ].join(" ")}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{titulo}</div>
      <div className={[
        "mt-1.5 font-bold tabular-nums leading-tight",
        destaque ? "text-2xl" : "text-xl",
        c.valor,
      ].join(" ")}>{valor}</div>
      {sub && <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{sub}</div>}
    </div>
  );
}

function SecaoTitulo({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mt-2 flex items-baseline gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{children}</h2>
      {hint && <span className="text-xs text-gray-400">{hint}</span>}
    </div>
  );
}

function corDoPoder(poder: string | null | undefined): string {
  const p = (poder ?? "").toUpperCase();
  if (p.includes("EXECUT"))    return "bg-blue-500";
  if (p.includes("LEGISL"))    return "bg-amber-500";
  if (p.includes("JUDIC"))     return "bg-purple-500";
  if (p.includes("MINIST"))    return "bg-rose-500";
  if (p.includes("CONTA"))     return "bg-teal-500";
  return "bg-slate-400";
}

function ChipBase({ label, ativa, cor }: { label: string; ativa: boolean; cor: string }) {
  if (!ativa) return null;
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${cor}`}>
      {label}
    </span>
  );
}

export default function PainelExecutivoTab() {
  const sp = useSearchParams();
  const competencia = sp.get("competencia");
  const entidade = sp.get("entidade") ?? "all";
  const poder = sp.get("poder") ?? "all";

  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [evolucao, setEvolucao] = useState<EvolucaoRow[]>([]);
  const [estatEnt, setEstatEnt] = useState<EstatisticaEntidade[]>([]);
  const [rankCargo, setRankCargo] = useState<RankingCargo[]>([]);
  const [topRubricas, setTopRubricas] = useState<TopRubrica[]>([]);
  const [incluirInformativas, setIncluirInformativas] = useState(false);
  const [carregando, setCarregando] = useState(false);

  const qs = useMemo(
    () => queryStringFiltros({ competencia, entidade, poder }),
    [competencia, entidade, poder],
  );

  // Resumo, evolução, entidades, cargos: não dependem de informativas.
  useEffect(() => {
    if (!competencia) return;
    setCarregando(true);
    Promise.all([
      fetch(`/api/folha/resumo?${qs}`).then((r) => r.json()),
      fetch(`/api/folha/evolucao?${qs.replace(/competencia=[^&]*/, "")}${entidade !== "all" ? `&entidade=${entidade}` : ""}${poder !== "all" ? `&poder=${poder}` : ""}`).then((r) => r.json()),
      fetch(`/api/folha/ranking-entidades?${qs}&limit=20`).then((r) => r.json()),
      fetch(`/api/folha/ranking-cargos?${qs}&limit=15`).then((r) => r.json()),
    ])
      .then(([r, e, re, rc]) => {
        setResumo(r);
        setEvolucao(Array.isArray(e) ? e : []);
        setEstatEnt(Array.isArray(re) ? re : []);
        setRankCargo(Array.isArray(rc) ? rc : []);
      })
      .catch(() => void 0)
      .finally(() => setCarregando(false));
  }, [qs, competencia, entidade, poder]);

  // Rubricas: refetch quando muda o toggle.
  useEffect(() => {
    if (!competencia) return;
    const inc = incluirInformativas ? "&incluir_informativas=1" : "";
    fetch(`/api/folha/top-rubricas?${qs}&limit=20${inc}`)
      .then((r) => r.json())
      .then((d: TopRubrica[]) => setTopRubricas(Array.isArray(d) ? d : []))
      .catch(() => void 0);
  }, [qs, competencia, incluirInformativas]);

  const evolucaoOpts: ApexOptions = useMemo(() => ({
    chart: { type: "area", toolbar: { show: false }, fontFamily: "inherit" },
    xaxis: {
      categories: evolucao.map((e) => fmtCompetencia(e.competencia)),
      labels: { style: { fontSize: "11px", colors: "#64748b" } },
      axisBorder: { color: "#e2e8f0" },
      axisTicks: { color: "#e2e8f0" },
    },
    yaxis: { labels: { formatter: (v) => fmtCompacto(Number(v)), style: { colors: "#64748b" } } },
    stroke: { curve: "smooth", width: 2.5 },
    dataLabels: { enabled: false },
    tooltip: { y: { formatter: (v) => fmtMoeda(Number(v)) }, theme: "light" },
    colors: ["#3b82f6", "#ef4444", "#10b981"],
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.4,
        opacityTo: 0.05,
        stops: [0, 100],
      },
    },
    grid: { borderColor: "#e2e8f0", strokeDashArray: 4 },
    legend: { position: "top", fontSize: "12px", markers: { size: 6 } },
    markers: { size: 4, strokeWidth: 2, hover: { size: 6 } },
  }), [evolucao]);

  const evolucaoSeries = useMemo(() => [
    { name: "Vencimentos", data: evolucao.map((e) => toNum(e.total_vencimentos)) },
    { name: "Descontos",   data: evolucao.map((e) => toNum(e.total_descontos)) },
    { name: "Líquido",     data: evolucao.map((e) => toNum(e.total_liquido)) },
  ], [evolucao]);

  const totalAbsRubricas = useMemo(
    () => topRubricas.reduce((acc, r) => acc + toNum(r.valor_absoluto), 0),
    [topRubricas],
  );

  return (
    <div className="space-y-6">
      {carregando && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
          Carregando dados…
        </div>
      )}

      {/* ─────────────── KPIs ─────────────── */}
      <section className="space-y-2">
        <SecaoTitulo hint={competencia ? `competência ${fmtCompetencia(competencia)}` : undefined}>
          Indicadores
        </SecaoTitulo>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Kpi
              titulo="Líquido pago"
              valor={fmtMoeda(toNum(resumo?.total_liquido))}
              sub={`${fmtMoeda(toNum(resumo?.total_vencimentos))} venc. − ${fmtMoeda(toNum(resumo?.total_descontos))} desc.`}
              cor="blue"
              destaque
            />
          </div>
          <Kpi cor="emerald" titulo="Servidores" valor={fmtNum(resumo?.qtd_servidores)} sub={`${fmtNum(resumo?.qtd_contracheques)} contracheques`} />
          <Kpi cor="violet"  titulo="Entidades"  valor={fmtNum(resumo?.qtd_entidades)} />
          <Kpi cor="amber"   titulo="Com alerta" valor={fmtNum(resumo?.qtd_contracheques_com_alerta)} sub="contracheques flagados" />
        </div>
      </section>

      {/* ─────────────── Tendência ─────────────── */}
      <section className="space-y-2">
        <SecaoTitulo hint="série mensal de vencimentos, descontos e líquido">Tendência</SecaoTitulo>
        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
          {evolucao.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">
              Sem dados suficientes — carregue mais competências para ver a tendência.
            </div>
          ) : (
            <Chart options={evolucaoOpts} series={evolucaoSeries} type="area" height={260} />
          )}
        </div>
      </section>

      {/* ─────────────── Decomposição ─────────────── */}
      <section className="space-y-2">
        <SecaoTitulo hint="rubricas que mais movimentam dinheiro na competência">Decomposição</SecaoTitulo>
        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 overflow-x-auto">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm text-gray-700 dark:text-gray-200">
              Top {topRubricas.length} rubricas
              <span className="ml-1 text-xs text-gray-500">(por |valor|)</span>
            </div>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
              <input
                type="checkbox"
                checked={incluirInformativas}
                onChange={(e) => setIncluirInformativas(e.target.checked)}
                className="h-3.5 w-3.5 accent-blue-600"
              />
              Incluir verbas informativas (bases)
            </label>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="pb-2 pr-3">Rubrica</th>
                <th className="pb-2 pr-3">Tipo</th>
                <th className="pb-2 pr-3">Bases</th>
                <th className="pb-2 pr-3 text-right">Valor (|sum|)</th>
                <th className="pb-2 pr-3 text-right">Ocorrências</th>
                <th className="pb-2 pl-3" colSpan={2}>% mov.</th>
              </tr>
            </thead>
            <tbody>
              {topRubricas.map((r) => {
                const v = toNum(r.valor_absoluto);
                const liq = toNum(r.valor_liquido);
                const pct = totalAbsRubricas > 0 ? (v / totalAbsRubricas) * 100 : 0;
                const ehInformativa = !r.compoe_vencimento && (r.base_irpf || r.base_previdencia || r.base_fgts);
                const tipoCor =
                  ehInformativa     ? "bg-slate-400"
                  : r.compoe_vencimento ? "bg-emerald-500"
                  : liq < 0             ? "bg-red-500"
                  : "bg-gray-400";
                return (
                  <tr
                    key={r.verba_codigo ?? r.verba_descricao}
                    className="border-t border-gray-100 transition-colors hover:bg-blue-50/40 dark:border-gray-800 dark:hover:bg-blue-950/30"
                  >
                    <td className="py-2 pr-3">
                      <div className="font-mono text-xs font-semibold text-gray-800 dark:text-gray-100">{r.verba_codigo ?? "—"}</div>
                      <div className="text-xs text-gray-500">{r.verba_descricao}</div>
                    </td>
                    <td className="py-2 pr-3">
                      {ehInformativa ? (
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">informativa</span>
                      ) : r.compoe_vencimento ? (
                        <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">provento</span>
                      ) : liq < 0 ? (
                        <span className="rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">desconto</span>
                      ) : (
                        <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">outro</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-1">
                        <ChipBase label="IRRF" ativa={r.base_irpf}        cor="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" />
                        <ChipBase label="INSS" ativa={r.base_previdencia} cor="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" />
                        <ChipBase label="FGTS" ativa={r.base_fgts}        cor="bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" />
                      </div>
                    </td>
                    <td className={[
                      "py-2 pr-3 text-right font-semibold tabular-nums",
                      r.compoe_vencimento ? "text-emerald-700 dark:text-emerald-300"
                      : liq < 0 ? "text-red-600 dark:text-red-300"
                      : "text-gray-700 dark:text-gray-200",
                    ].join(" ")}>{fmtCompacto(v)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-gray-500">{fmtNum(r.qtd_ocorrencias)}</td>
                    <td className="py-2 pl-3 pr-2 w-32">
                      <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-700">
                        <div className={`h-full rounded-full ${tipoCor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                    </td>
                    <td className="py-2 text-right tabular-nums text-xs text-gray-500 w-12">{pct.toFixed(1)}%</td>
                  </tr>
                );
              })}
              {topRubricas.length === 0 && (
                <tr><td colSpan={7} className="py-4 text-center text-xs text-gray-500">Sem dados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ─────────────── Comparações ─────────────── */}
      <section className="space-y-2">
        <SecaoTitulo hint="entidades e cargos como contexto">Comparações</SecaoTitulo>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 overflow-x-auto">
            <div className="mb-3 flex items-baseline justify-between">
              <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">Remuneração por entidade</div>
              <div className="text-xs text-gray-400">ordenado pela mediana</div>
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="pb-2 pr-3">Entidade</th>
                  <th className="pb-2 pr-3 text-right">Serv.</th>
                  <th className="pb-2 pr-3 text-right">Mediana</th>
                  <th className="pb-2 text-right">Máx</th>
                </tr>
              </thead>
              <tbody>
                {estatEnt.map((r) => {
                  const corPoder = corDoPoder(r.entidade_poder);
                  return (
                    <tr
                      key={r.id_entidade_cjur}
                      className="border-t border-gray-100 transition-colors hover:bg-blue-50/40 dark:border-gray-800 dark:hover:bg-blue-950/30"
                    >
                      <td className="py-2 pr-3">
                        <div className="font-medium text-gray-800 dark:text-gray-100">{r.entidade_nome}</div>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <span className={`inline-block h-1.5 w-1.5 rounded-full ${corPoder}`} />
                          <span className="text-[10px] text-gray-500">{r.entidade_poder}{r.ente_nome ? ` · ${r.ente_nome}` : ""}</span>
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-gray-700 dark:text-gray-200">{fmtNum(r.qtd_servidores)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums font-semibold text-blue-700 dark:text-blue-300">{fmtMoeda(toNum(r.mediana))}</td>
                      <td className="py-2 text-right tabular-nums text-red-600 dark:text-red-300">{fmtCompacto(toNum(r.maximo))}</td>
                    </tr>
                  );
                })}
                {estatEnt.length === 0 && <tr><td colSpan={4} className="py-3 text-center text-xs text-gray-500">Sem dados.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 overflow-x-auto">
            <div className="mb-3 flex items-baseline justify-between">
              <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">Top cargos</div>
              <div className="text-xs text-gray-400">por líquido somado</div>
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="pb-2 pr-3">Cargo</th>
                  <th className="pb-2 pr-3 text-right">Serv.</th>
                  <th className="pb-2 text-right">Líquido</th>
                </tr>
              </thead>
              <tbody>
                {rankCargo.map((r) => (
                  <tr
                    key={r.id_cargo_sicap}
                    className="border-t border-gray-100 transition-colors hover:bg-emerald-50/40 dark:border-gray-800 dark:hover:bg-emerald-950/30"
                  >
                    <td className="py-2 pr-3">
                      <div className="font-medium text-gray-800 dark:text-gray-100">{r.cargo_nome ?? "—"}</div>
                      <div className="text-[10px] text-gray-500">{r.cargo_codigo ?? ""}</div>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-gray-700 dark:text-gray-200">{fmtNum(r.qtd_servidores)}</td>
                    <td className="py-2 text-right tabular-nums font-semibold text-emerald-700 dark:text-emerald-300">{fmtCompacto(toNum(r.total_liquido))}</td>
                  </tr>
                ))}
                {rankCargo.length === 0 && <tr><td colSpan={3} className="py-3 text-center text-xs text-gray-500">Sem dados.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
