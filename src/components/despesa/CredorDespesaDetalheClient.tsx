"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";
import { ArrowLeft, Building2, MapPin, Phone, Mail, Hash, Briefcase, AlertTriangle, Users, Calendar, DollarSign, RefreshCw, Search, ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";

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

interface QsaItem {
  nome: string | null;
  qualificacao: string | null;
  cpf_socio?: string | null;
  cpf_representante?: string | null;
}

interface CnaeItem {
  codigo: string | null;
  descricao: string | null;
}

interface Cadastro {
  tipo_documento: string | null;
  nome_original: string | null;
  nome_enriquecido: string | null;
  nome_fantasia: string | null;
  nome_exibicao: string | null;
  fonte_enriquecimento: string | null;
  situacao_cadastral: string | null;
  natureza_juridica: string | null;
  cnae_principal: string | null;
  municipio: string | null;
  uf: string | null;
  endereco: string | null;
  complemento: string | null;
  bairro: string | null;
  cep: string | null;
  telefone: string | null;
  telefone_2: string | null;
  email: string | null;
  capital_social: string | null;
  porte: string | null;
  data_abertura: string | null;
  opcao_simples: boolean | null;
  opcao_mei: boolean | null;
  data_opcao_simples: string | null;
  data_exclusao_simples: string | null;
  motivo_situacao: string | null;
  situacao_especial: string | null;
  data_situacao_especial: string | null;
  cnaes_secundarios: CnaeItem[] | null;
  qsa: QsaItem[] | null;
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

// Variável de módulo: definida de forma síncrona antes da navegação,
// lida no useEffect após remount. Evita race conditions do sessionStorage/router cache.
let _pendingFrom: string | null = null;

export default function CredorDespesaDetalheClient({ cpfCnpj }: { cpfCnpj: string }) {
  const router = useRouter();
  const [voltarPara, setVoltarPara] = useState("/painel-despesa");

  useEffect(() => {
    if (_pendingFrom !== null) {
      setVoltarPara(_pendingFrom);
      _pendingFrom = null;
    } else {
      const fromUrl = new URLSearchParams(window.location.search).get("from");
      setVoltarPara(fromUrl ?? "/painel-despesa");
    }
  }, [cpfCnpj]);
  const [data, setData] = useState<CredorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historicoExpandido, setHistoricoExpandido] = useState<Set<string>>(new Set());
  const [abaCadastral, setAbaCadastral] = useState<"geral" | "endereco" | "atividades" | "socios">("geral");
  const [revalidando, setRevalidando] = useState(false);
  const [revalidacaoMsg, setRevalidacaoMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  async function handleRevalidar() {
    setRevalidando(true);
    setRevalidacaoMsg(null);
    try {
      const resp = await fetch(`/api/despesa/credor/${cpfCnpj}/revalidar`, { method: "POST" });
      const json = await resp.json() as { ok?: boolean; fonte?: string; error?: string };
      if (!resp.ok) throw new Error(json.error ?? "Erro desconhecido");
      setRevalidacaoMsg({ tipo: "ok", texto: `Dados atualizados via ${json.fonte}.` });
      // Recarrega os dados do credor
      const r2 = await fetch(`/api/despesa/credor/${cpfCnpj}`);
      if (r2.ok) setData(await r2.json());
    } catch (e) {
      setRevalidacaoMsg({ tipo: "erro", texto: e instanceof Error ? e.message : "Falha na revalidação." });
    } finally {
      setRevalidando(false);
    }
  }

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
        <button type="button" onClick={() => router.push(voltarPara)} className="inline-flex items-center gap-1.5 text-sm text-teal-600 hover:underline dark:text-teal-400">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
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
    cadastro.municipio || cadastro.endereco || cadastro.telefone || cadastro.email ||
    cadastro.capital_social || cadastro.porte || cadastro.data_abertura
  );

  return (
    <div className="min-h-screen space-y-5 bg-slate-50 p-4 pb-10 dark:bg-slate-900 sm:p-6">

      {/* Volta */}
      <div>
        <button
          type="button"
          onClick={() => router.push(voltarPara)}
          className="inline-flex items-center gap-1.5 text-sm text-teal-600 hover:underline dark:text-teal-400"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
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

          {/* Botão de revalidação — apenas CNPJ */}
          {resumo.tipo_documento === "CNPJ" && (
            <div className="flex shrink-0 flex-col items-end gap-2">
              <button
                type="button"
                onClick={handleRevalidar}
                disabled={revalidando}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-teal-400 hover:text-teal-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:border-teal-500 dark:hover:text-teal-400"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${revalidando ? "animate-spin" : ""}`} />
                {revalidando ? "Consultando..." : "Revalidar dados"}
              </button>
              {revalidacaoMsg && (
                <span className={`text-xs ${revalidacaoMsg.tipo === "ok" ? "text-teal-600 dark:text-teal-400" : "text-red-500 dark:text-red-400"}`}>
                  {revalidacaoMsg.texto}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Dados cadastrais em abas */}
      {temCadastro && cadastro && (() => {
        const temAtividades = !!(cadastro.cnae_principal || (cadastro.cnaes_secundarios && cadastro.cnaes_secundarios.length > 0));
        const temSocios     = !!(cadastro.qsa && cadastro.qsa.length > 0);
        const temEndereco   = !!(cadastro.municipio || cadastro.uf || cadastro.endereco || cadastro.telefone || cadastro.email);

        type Aba = "geral" | "endereco" | "atividades" | "socios";
        const todasAbas: { id: Aba; label: string; icone: React.ReactNode; visivel: boolean }[] = [
          { id: "geral",       label: "Cadastral",          icone: <Hash className="h-3.5 w-3.5" />,      visivel: true },
          { id: "endereco",    label: "Endereço & Contato", icone: <MapPin className="h-3.5 w-3.5" />,    visivel: temEndereco },
          { id: "atividades",  label: "Atividades",         icone: <Building2 className="h-3.5 w-3.5" />, visivel: temAtividades },
          { id: "socios",      label: `Sócios${temSocios ? ` (${cadastro.qsa!.length})` : ""}`, icone: <Users className="h-3.5 w-3.5" />, visivel: temSocios },
        ];
        const abas = todasAbas.filter((a) => a.visivel);

        const abaAtiva = abas.some((a) => a.id === abaCadastral) ? abaCadastral : abas[0]?.id ?? "geral";

        return (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="border-b border-slate-100 px-5 pt-4 dark:border-slate-700">
              <nav className="flex gap-0.5">
                {abas.map((aba) => (
                  <button
                    key={aba.id}
                    type="button"
                    onClick={() => setAbaCadastral(aba.id)}
                    className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-semibold transition-colors ${
                      abaAtiva === aba.id
                        ? "border-teal-500 text-teal-600 dark:border-teal-400 dark:text-teal-400"
                        : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                    }`}
                  >
                    {aba.icone}
                    {aba.label}
                  </button>
                ))}
              </nav>
            </div>

            <div className="p-5">
              {/* Aba: Cadastral */}
              {abaAtiva === "geral" && (
                <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  {cadastro.nome_fantasia && (
                    <CadastroItem icon={<Building2 className="h-3.5 w-3.5" />} label="Nome Fantasia" value={cadastro.nome_fantasia} />
                  )}
                  {cadastro.situacao_cadastral && (
                    <CadastroItem icon={<Hash className="h-3.5 w-3.5" />} label="Situação Cadastral" value={cadastro.situacao_cadastral} />
                  )}
                  {cadastro.motivo_situacao && (
                    <CadastroItem icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Motivo da Situação" value={cadastro.motivo_situacao} />
                  )}
                  {cadastro.situacao_especial && (
                    <CadastroItem icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Situação Especial" value={
                      cadastro.data_situacao_especial
                        ? `${cadastro.situacao_especial} (${fmtData(cadastro.data_situacao_especial)})`
                        : cadastro.situacao_especial
                    } />
                  )}
                  {cadastro.natureza_juridica && (
                    <CadastroItem icon={<Briefcase className="h-3.5 w-3.5" />} label="Natureza Jurídica" value={cadastro.natureza_juridica} />
                  )}
                  {cadastro.porte && (
                    <CadastroItem icon={<Building2 className="h-3.5 w-3.5" />} label="Porte" value={
                      cadastro.porte === "ME"  ? "Microempresa (ME)"
                      : cadastro.porte === "EPP" ? "Empresa de Pequeno Porte (EPP)"
                      : cadastro.porte
                    } />
                  )}
                  {cadastro.capital_social && (
                    <CadastroItem icon={<DollarSign className="h-3.5 w-3.5" />} label="Capital Social" value={
                      Number(cadastro.capital_social).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                    } />
                  )}
                  {cadastro.data_abertura && (
                    <CadastroItem icon={<Calendar className="h-3.5 w-3.5" />} label="Data de Abertura" value={fmtData(cadastro.data_abertura)} />
                  )}
                  {cadastro.opcao_simples !== null && (
                    <CadastroItem icon={<Hash className="h-3.5 w-3.5" />} label="Simples Nacional" value={
                      cadastro.opcao_simples
                        ? `Optante${cadastro.data_opcao_simples ? ` desde ${fmtData(cadastro.data_opcao_simples)}` : ""}`
                        : `Não optante${cadastro.data_exclusao_simples ? ` (excluído em ${fmtData(cadastro.data_exclusao_simples)})` : ""}`
                    } />
                  )}
                  {cadastro.opcao_mei !== null && (
                    <CadastroItem icon={<Hash className="h-3.5 w-3.5" />} label="MEI" value={cadastro.opcao_mei ? "Sim" : "Não"} />
                  )}
                  {!cadastro.nome_fantasia && !cadastro.situacao_cadastral && !cadastro.natureza_juridica && !cadastro.porte && !cadastro.capital_social && !cadastro.data_abertura && (
                    <p className="col-span-full text-xs text-slate-400 dark:text-slate-500">Nenhum dado cadastral disponível.</p>
                  )}
                </dl>
              )}

              {/* Aba: Endereço & Contato */}
              {abaAtiva === "endereco" && (
                <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  {(cadastro.municipio || cadastro.uf) && (
                    <CadastroItem
                      icon={<MapPin className="h-3.5 w-3.5" />}
                      label="Município/UF"
                      value={[cadastro.municipio, cadastro.uf].filter(Boolean).join(" / ")}
                    />
                  )}
                  {cadastro.endereco && (() => {
                    const nomeBusca = cadastro.nome_fantasia || cadastro.nome_enriquecido || cadastro.nome_exibicao || cadastro.nome_original;
                    const partes = [nomeBusca, cadastro.endereco, cadastro.complemento, cadastro.bairro, cadastro.municipio, cadastro.uf, cadastro.cep].filter(Boolean);
                    const textoExibido = [cadastro.endereco, cadastro.complemento, cadastro.bairro, cadastro.cep].filter(Boolean).join(", ");
                    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(partes.join(", "))}`;
                    return (
                      <div className="flex flex-col gap-0.5">
                        <dt className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          <MapPin className="h-3.5 w-3.5" /> Endereço
                        </dt>
                        <dd className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                          <span>{textoExibido}</span>
                          <a
                            href={mapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Ver no Google Maps"
                            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 active:bg-blue-800 dark:bg-blue-500 dark:hover:bg-blue-600"
                          >
                            <MapPin className="h-3.5 w-3.5" />
                            Ver no mapa
                          </a>
                        </dd>
                      </div>
                    );
                  })()}
                  {cadastro.telefone && (
                    <CadastroItem icon={<Phone className="h-3.5 w-3.5" />} label="Telefone" value={cadastro.telefone} />
                  )}
                  {cadastro.telefone_2 && (
                    <CadastroItem icon={<Phone className="h-3.5 w-3.5" />} label="Telefone 2" value={cadastro.telefone_2} />
                  )}
                  {cadastro.email && (
                    <CadastroItem icon={<Mail className="h-3.5 w-3.5" />} label="E-mail" value={cadastro.email} />
                  )}
                </dl>
              )}

              {/* Aba: Atividades */}
              {abaAtiva === "atividades" && (
                <AbaAtividades
                  cnae_principal={cadastro.cnae_principal}
                  cnaes_secundarios={cadastro.cnaes_secundarios ?? []}
                />
              )}

              {/* Aba: Sócios (QSA) */}
              {abaAtiva === "socios" && cadastro.qsa && (
                <div className="overflow-hidden rounded-xl border border-slate-100 dark:border-slate-700">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                      <tr>
                        <th className="px-3 py-2.5 text-left font-semibold">Nome</th>
                        <th className="px-3 py-2.5 text-left font-semibold">CPF/CNPJ</th>
                        <th className="px-3 py-2.5 text-left font-semibold">Qualificação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cadastro.qsa.map((s, i) => (
                        <tr key={i} className={`border-t border-slate-100 dark:border-slate-700/50 ${i % 2 !== 0 ? "bg-slate-50/50 dark:bg-slate-800/30" : ""}`}>
                          <td className="px-3 py-2.5 font-medium text-slate-700 dark:text-slate-200">{s.nome ?? "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400">{s.cpf_socio ?? "—"}</td>
                          <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">{s.qualificacao ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
      })()}

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
                      <td className="max-w-60 px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
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

type CnaeSortKey = "codigo" | "descricao";

function AbaAtividades({ cnae_principal, cnaes_secundarios }: {
  cnae_principal: string | null;
  cnaes_secundarios: { codigo: string | null; descricao: string | null }[];
}) {
  const [busca,    setBusca]    = useState("");
  const [sortKey,  setSortKey]  = useState<CnaeSortKey>("codigo");
  const [sortDir,  setSortDir]  = useState<"asc" | "desc">("asc");

  function handleSort(key: CnaeSortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  const filtrados = cnaes_secundarios
    .filter((c) => {
      if (!busca) return true;
      const q = busca.toLowerCase();
      return (c.codigo ?? "").toLowerCase().includes(q) || (c.descricao ?? "").toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const va = (sortKey === "codigo" ? a.codigo : a.descricao) ?? "";
      const vb = (sortKey === "codigo" ? b.codigo : b.descricao) ?? "";
      return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    });

  function SortIcon({ col }: { col: CnaeSortKey }) {
    if (col !== sortKey) return <ChevronsUpDown className="ml-1 inline h-3 w-3 text-slate-300 dark:text-slate-600" />;
    return sortDir === "asc"
      ? <ChevronUp   className="ml-1 inline h-3 w-3 text-teal-500" />
      : <ChevronDown className="ml-1 inline h-3 w-3 text-teal-500" />;
  }

  return (
    <div className="space-y-3">
      {/* CNAE principal */}
      {cnae_principal && (
        <div className="rounded-lg border border-teal-100 bg-teal-50 px-3 py-2.5 dark:border-teal-900/40 dark:bg-teal-900/20">
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400">CNAE Principal</p>
          <p className="text-sm text-slate-700 dark:text-slate-200">{cnae_principal}</p>
        </div>
      )}

      {/* Tabela de secundários */}
      {cnaes_secundarios.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              CNAEs Secundários
              {busca && filtrados.length !== cnaes_secundarios.length
                ? ` — ${filtrados.length} de ${cnaes_secundarios.length}`
                : ` (${cnaes_secundarios.length})`}
            </p>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar código ou atividade..."
                className="w-56 rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:placeholder-slate-500"
              />
            </div>
          </div>

          <div className="max-h-56 overflow-auto rounded-xl border border-slate-100 dark:border-slate-700">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 text-slate-500 dark:bg-slate-900/80 dark:text-slate-400">
                <tr>
                  <th className="w-28 px-3 py-2 text-left">
                    <button type="button" onClick={() => handleSort("codigo")} className="inline-flex items-center font-semibold hover:text-teal-600 dark:hover:text-teal-400">
                      Código <SortIcon col="codigo" />
                    </button>
                  </th>
                  <th className="px-3 py-2 text-left">
                    <button type="button" onClick={() => handleSort("descricao")} className="inline-flex items-center font-semibold hover:text-teal-600 dark:hover:text-teal-400">
                      Atividade <SortIcon col="descricao" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 ? (
                  <tr><td colSpan={2} className="px-3 py-4 text-center text-slate-400">Nenhuma atividade encontrada.</td></tr>
                ) : filtrados.map((c, i) => (
                  <tr key={i} className={`border-t border-slate-100 dark:border-slate-700/50 ${i % 2 !== 0 ? "bg-slate-50/50 dark:bg-slate-800/30" : ""}`}>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] dark:bg-slate-700">{c.codigo ?? "—"}</span>
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{c.descricao ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

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
