"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";
import { ArrowLeft, Building2, MapPin, Phone, Mail, Hash, Briefcase, AlertTriangle } from "lucide-react";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

// --- Tipos ---

interface Resumo {
  cpf_cnpj_credor: string;
  nome_credor: string | null;
  nome_exibicao: string | null;
  tipo_documento: string | null;
  fonte_enriquecimento: string | null;
  data_consulta: string | null;
  status_consulta: string | null;
  valor_empenhado_liquido: string;
  valor_liquidado: string;
  valor_pago: string;
  valor_a_liquidar: string;
  valor_a_pagar: string;
  qtd_empenhos: number;
  qtd_entidades: number;
  primeiro_empenho: string | null;
  ultimo_empenho: string | null;
}

interface Cadastro {
  tipo_documento: string | null;
  nome_original: string | null;
  nome_enriquecido: string | null;
  nome_exibicao: string | null;
  fonte_enriquecimento: string | null;
  situacao_cadastral: string | null;
  natureza_juridica: string | null;
  cnae_principal: string | null;
  municipio: string | null;
  uf: string | null;
  endereco: string | null;
  bairro: string | null;
  cep: string | null;
  telefone: string | null;
  email: string | null;
  data_consulta: string | null;
  status_consulta: string | null;
}

interface EvolucaoRow {
  ano_remessa: number;
  mes_empenho: string;
  valor_empenhado_liquido: string;
  valor_liquidado: string;
  valor_pago: string;
}

interface EntidadeRow {
  id_entidade: string;
  nome_entidade: string | null;
  valor_empenhado_liquido: string;
  valor_liquidado: string;
  valor_pago: string;
  valor_a_pagar: string;
  qtd_empenhos: number;
}

interface EmpenhoRow {
  id_despesa: string;
  id_entidade: string;
  nome_entidade: string | null;
  ano_remessa: number | null;
  numero_remessa: number | null;
  ano_empenho: number | null;
  numero_empenho: string | null;
  data_empenho: string | null;
  historico_empenho: string | null;
  valor_empenhado_liquido: string;
  valor_liquidado: string;
  valor_pago: string;
  valor_a_pagar: string;
}

interface CredorData {
  resumo: Resumo;
  cadastro: Cadastro | null;
  evolucao: EvolucaoRow[];
  entidades: EntidadeRow[];
  empenhos: EmpenhoRow[];
}

// --- Helpers ---

function toNum(v: string | number | null | undefined): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const p = parseFloat(v.replace(",", "."));
    return Number.isFinite(p) ? p : 0;
  }
  return 0;
}

function fmtMoeda(v: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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

function fmtNum(v: number): string {
  return v.toLocaleString("pt-BR");
}

function formatCpfCnpj(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  return digits;
}

function fmtData(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("pt-BR");
}

function tipoBadge(tipo: string | null) {
  if (!tipo) return null;
  const cores: Record<string, string> = {
    CPF: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
    CNPJ: "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300",
    DESCONHECIDO: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cores[tipo] ?? cores.DESCONHECIDO}`}>
      {tipo}
    </span>
  );
}

// --- Componente principal ---

export default function CredorDespesaDetalheClient({ cpfCnpj }: { cpfCnpj: string }) {
  const [data, setData] = useState<CredorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historicoExpandido, setHistoricoExpandido] = useState<Set<string>>(new Set());

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    fetch(`/api/despesa/credor/${cpfCnpj}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "Credor não encontrado." : "Erro ao carregar dados do credor.");
        return r.json() as Promise<CredorData>;
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [cpfCnpj]);

  const evolucaoMensal = useMemo(() => {
    if (!data) return { labels: [], empenhado: [], liquidado: [], pago: [] };
    const acc = new Map<string, { empenhado: number; liquidado: number; pago: number }>();
    data.evolucao.forEach((row) => {
      const mes = row.mes_empenho?.slice(0, 7) ?? "";
      if (!mes) return;
      if (!acc.has(mes)) acc.set(mes, { empenhado: 0, liquidado: 0, pago: 0 });
      const e = acc.get(mes)!;
      e.empenhado += toNum(row.valor_empenhado_liquido);
      e.liquidado += toNum(row.valor_liquidado);
      e.pago      += toNum(row.valor_pago);
    });
    const sorted = [...acc.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    return {
      labels:    sorted.map(([mes]) => { const [a, m] = mes.split("-"); return `${m}/${a}`; }),
      empenhado: sorted.map(([, v]) => Number(v.empenhado.toFixed(2))),
      liquidado: sorted.map(([, v]) => Number(v.liquidado.toFixed(2))),
      pago:      sorted.map(([, v]) => Number(v.pago.toFixed(2))),
    };
  }, [data]);

  const evolucaoOptions = useMemo<ApexOptions>(
    () => ({
      chart: { type: "line", toolbar: { show: false }, fontFamily: "inherit" },
      stroke: { curve: "smooth", width: [2, 2, 2] },
      colors: ["#0f766e", "#3b82f6", "#10b981"],
      dataLabels: { enabled: false },
      xaxis: { categories: evolucaoMensal.labels, labels: { rotate: -30 } },
      yaxis: { labels: { formatter: (v: number) => fmtCompacto(Number(v)) } },
      tooltip: { y: { formatter: (v: number) => fmtMoeda(Number(v)) } },
      legend: { position: "bottom", fontSize: "12px" },
      grid: { borderColor: "#e2e8f0", strokeDashArray: 3 },
    }),
    [evolucaoMensal.labels],
  );

  const evolucaoSeries = useMemo(
    () => [
      { name: "Empenhado Líquido", data: evolucaoMensal.empenhado },
      { name: "Liquidado",         data: evolucaoMensal.liquidado },
      { name: "Pago",              data: evolucaoMensal.pago },
    ],
    [evolucaoMensal],
  );

  function toggleHistorico(id: string) {
    setHistoricoExpandido((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // --- Guards ---

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          <span className="text-sm">Carregando dados do credor...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="m-6 space-y-4">
        <Link href="/painel-despesa" className="inline-flex items-center gap-1.5 text-sm text-teal-600 hover:underline dark:text-teal-400">
          <ArrowLeft className="h-4 w-4" /> Voltar para Despesa Pública
        </Link>
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { resumo, cadastro, entidades, empenhos } = data;
  const docFormatado = formatCpfCnpj(resumo.cpf_cnpj_credor);
  const nomeExibido = resumo.nome_exibicao || docFormatado;
  const temCadastro = !!cadastro && (
    cadastro.situacao_cadastral || cadastro.natureza_juridica || cadastro.cnae_principal ||
    cadastro.municipio || cadastro.endereco || cadastro.telefone || cadastro.email
  );

  return (
    <div className="min-h-screen space-y-5 bg-slate-50 p-4 pb-10 dark:bg-slate-900 sm:p-6">

      {/* Volta */}
      <div>
        <Link href="/painel-despesa" className="inline-flex items-center gap-1.5 text-sm text-teal-600 hover:underline dark:text-teal-400">
          <ArrowLeft className="h-4 w-4" /> Voltar para Despesa Pública
        </Link>
      </div>

      {/* Cabeçalho do credor */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 sm:text-2xl">
              {nomeExibido}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
              <span className="font-mono">{docFormatado}</span>
              {tipoBadge(resumo.tipo_documento)}
              {resumo.fonte_enriquecimento && (
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  Fonte: {resumo.fonte_enriquecimento}
                </span>
              )}
              {resumo.data_consulta && (
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  Consultado em {fmtData(resumo.data_consulta)}
                </span>
              )}
            </div>
            {resumo.primeiro_empenho && resumo.ultimo_empenho && (
              <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
                Empenhos de {fmtData(resumo.primeiro_empenho)} a {fmtData(resumo.ultimo_empenho)}
              </p>
            )}
          </div>
          {resumo.status_consulta && (
            <span className="shrink-0 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-400">
              {resumo.status_consulta}
            </span>
          )}
        </div>
      </div>

      {/* Dados cadastrais */}
      {temCadastro && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Dados Cadastrais</h2>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {cadastro?.situacao_cadastral && (
              <CadastroItem icon={<Hash className="h-3.5 w-3.5" />} label="Situação Cadastral" value={cadastro.situacao_cadastral} />
            )}
            {cadastro?.natureza_juridica && (
              <CadastroItem icon={<Briefcase className="h-3.5 w-3.5" />} label="Natureza Jurídica" value={cadastro.natureza_juridica} />
            )}
            {cadastro?.cnae_principal && (
              <CadastroItem icon={<Building2 className="h-3.5 w-3.5" />} label="CNAE Principal" value={cadastro.cnae_principal} />
            )}
            {(cadastro?.municipio || cadastro?.uf) && (
              <CadastroItem
                icon={<MapPin className="h-3.5 w-3.5" />}
                label="Município/UF"
                value={[cadastro.municipio, cadastro.uf].filter(Boolean).join(" / ")}
              />
            )}
            {cadastro?.endereco && (
              <CadastroItem icon={<MapPin className="h-3.5 w-3.5" />} label="Endereço" value={[cadastro.endereco, cadastro.bairro, cadastro.cep].filter(Boolean).join(", ")} />
            )}
            {cadastro?.telefone && (
              <CadastroItem icon={<Phone className="h-3.5 w-3.5" />} label="Telefone" value={cadastro.telefone} />
            )}
            {cadastro?.email && (
              <CadastroItem icon={<Mail className="h-3.5 w-3.5" />} label="E-mail" value={cadastro.email} />
            )}
          </dl>
        </div>
      )}

      {/* Cards financeiros */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <KpiCard titulo="Empenhado Líquido" valor={fmtCompacto(toNum(resumo.valor_empenhado_liquido))} valorCompleto={fmtMoeda(toNum(resumo.valor_empenhado_liquido))} cor="slate" />
        <KpiCard titulo="Liquidado"         valor={fmtCompacto(toNum(resumo.valor_liquidado))}         valorCompleto={fmtMoeda(toNum(resumo.valor_liquidado))}         cor="blue" />
        <KpiCard titulo="Pago"              valor={fmtCompacto(toNum(resumo.valor_pago))}              valorCompleto={fmtMoeda(toNum(resumo.valor_pago))}              cor="green" />
        <KpiCard titulo="A Liquidar"        valor={fmtCompacto(toNum(resumo.valor_a_liquidar))}        valorCompleto={fmtMoeda(toNum(resumo.valor_a_liquidar))}        cor="amber" />
        <KpiCard titulo="A Pagar"           valor={fmtCompacto(toNum(resumo.valor_a_pagar))}           valorCompleto={fmtMoeda(toNum(resumo.valor_a_pagar))}           cor="red" />
        <KpiCard titulo="Qtd. Empenhos"     valor={fmtNum(resumo.qtd_empenhos)}                       valorCompleto={`${resumo.qtd_empenhos} empenhos`}               cor="slate" />
        <KpiCard titulo="Qtd. Entidades"    valor={fmtNum(resumo.qtd_entidades)}                      valorCompleto={`${resumo.qtd_entidades} entidades`}              cor="slate" />
      </div>

      {/* Gráfico de evolução */}
      {evolucaoMensal.labels.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <h2 className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">Evolução Mensal</h2>
          <p className="mb-3 text-xs text-slate-400 dark:text-slate-500">Empenhado Líquido, Liquidado e Pago por mês de empenho</p>
          <Chart options={evolucaoOptions} series={evolucaoSeries} type="line" height={280} />
        </div>
      )}

      {/* Entidades relacionadas */}
      {entidades.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <h2 className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">Entidades Relacionadas</h2>
          <p className="mb-3 text-xs text-slate-400 dark:text-slate-500">Ordenado por Empenhado Líquido</p>
          <div className="max-h-72 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                <tr>
                  <th className="px-3 py-2 text-left">Entidade</th>
                  <th className="px-3 py-2 text-right">Empenhado</th>
                  <th className="px-3 py-2 text-right">Pago</th>
                  <th className="px-3 py-2 text-right">A Pagar</th>
                  <th className="px-3 py-2 text-right">Qtd.</th>
                </tr>
              </thead>
              <tbody>
                {entidades.map((e, i) => (
                  <tr key={e.id_entidade} className={`border-t border-slate-100 dark:border-slate-700/50 ${i % 2 !== 0 ? "bg-slate-50 dark:bg-slate-800/40" : ""}`}>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{e.nome_entidade || `Entidade ${e.id_entidade}`}</td>
                    <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">{fmtCompacto(toNum(e.valor_empenhado_liquido))}</td>
                    <td className="px-3 py-2 text-right text-green-600 dark:text-green-400">{fmtCompacto(toNum(e.valor_pago))}</td>
                    <td className="px-3 py-2 text-right text-red-500 dark:text-red-400">{fmtCompacto(toNum(e.valor_a_pagar))}</td>
                    <td className="px-3 py-2 text-right text-slate-500 dark:text-slate-400">{fmtNum(e.qtd_empenhos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empenhos relevantes */}
      {empenhos.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <h2 className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">Empenhos Relevantes</h2>
          <p className="mb-3 text-xs text-slate-400 dark:text-slate-500">
            {empenhos.length === 100 ? "Exibindo até 100 empenhos de maior valor" : `${empenhos.length} empenhos`}
          </p>
          <div className="max-h-[480px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                <tr>
                  <th className="px-3 py-2 text-left">Data</th>
                  <th className="px-3 py-2 text-left">Empenho</th>
                  <th className="px-3 py-2 text-left">Entidade</th>
                  <th className="px-3 py-2 text-left">Histórico</th>
                  <th className="px-3 py-2 text-right">Empenhado</th>
                  <th className="px-3 py-2 text-right">Pago</th>
                  <th className="px-3 py-2 text-right">A Pagar</th>
                </tr>
              </thead>
              <tbody>
                {empenhos.map((emp, i) => {
                  const hist = emp.historico_empenho ?? "";
                  const expandido = historicoExpandido.has(emp.id_despesa);
                  const histExibido = expandido || hist.length <= 80 ? hist : hist.slice(0, 80) + "…";
                  return (
                    <tr key={emp.id_despesa} className={`border-t border-slate-100 dark:border-slate-700/50 ${i % 2 !== 0 ? "bg-slate-50 dark:bg-slate-800/40" : ""}`}>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500 dark:text-slate-400">{fmtData(emp.data_empenho)}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-600 dark:text-slate-300">
                        {emp.ano_empenho && emp.numero_empenho ? `${emp.ano_empenho}/${emp.numero_empenho}` : emp.id_despesa}
                      </td>
                      <td className="max-w-[140px] truncate px-3 py-2 text-xs text-slate-600 dark:text-slate-300" title={emp.nome_entidade ?? ""}>
                        {emp.nome_entidade || `Entidade ${emp.id_entidade}`}
                      </td>
                      <td className="max-w-[240px] px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                        {histExibido}
                        {hist.length > 80 && (
                          <button
                            type="button"
                            onClick={() => toggleHistorico(emp.id_despesa)}
                            className="ml-1 text-teal-600 hover:underline dark:text-teal-400"
                          >
                            {expandido ? "menos" : "mais"}
                          </button>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-slate-600 dark:text-slate-300">{fmtCompacto(toNum(emp.valor_empenhado_liquido))}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-green-600 dark:text-green-400">{fmtCompacto(toNum(emp.valor_pago))}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-red-500 dark:text-red-400">{fmtCompacto(toNum(emp.valor_a_pagar))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Sub-componentes ---

function CadastroItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0 text-slate-400">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">{label}</dt>
        <dd className="truncate text-slate-700 dark:text-slate-200" title={value}>{value}</dd>
      </div>
    </div>
  );
}

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

function KpiCard({ titulo, valor, valorCompleto, cor }: { titulo: string; valor: string; valorCompleto: string; cor: CorKpi }) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800 border-l-4 ${corBorda[cor]}`}
      title={valorCompleto}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{titulo}</p>
      <p className={`mt-1.5 text-lg font-bold leading-tight sm:text-xl ${corValor[cor]}`}>{valor}</p>
    </div>
  );
}
