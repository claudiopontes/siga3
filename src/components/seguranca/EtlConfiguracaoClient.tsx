"use client";

import React, { useEffect, useState } from "react";
import { Settings2, AlertTriangle, X, ArrowUpDown, ChevronUp, ChevronDown, Terminal, Ban } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useModal } from "@/hooks/useModal";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";

// ─── Tipos ───────────────────────────────────────────────────────────────────

type ExecucaoConfig = {
  tipoCargaPadrao: string | null;
  modoCargaPadrao: string | null;
  escopoCarga: string | null;
  campoReferencia: string | null;
  janelaReprocessamentoDias: number | null;
  preservaHistorico: boolean | null;
  requerConfirmacaoManual: boolean | null;
  permiteExecucaoManual: boolean | null;
  permiteFullManual: boolean | null;
  permiteIncrementalManual: boolean | null;
  labelBotao: string | null;
  mensagemConfirmacao: string | null;
  parametrosObrigatorios: string[] | null;
  observacaoRegraNegocio: string | null;
};

type EtlConfig = {
  execucaoManualImplementada: boolean;
  modulo: string;
  nomeExibicao: string;
  periodicidade: string;
  toleranciaDias: number;
  ativoPainel: boolean;
  descricao: string | null;
  ordemExibicao: number | null;
  execucao: ExecucaoConfig;
};

type EditForm = {
  nomeExibicao: string;
  periodicidade: string;
  toleranciaDias: string;
  ativoPainel: boolean;
  descricao: string;
  ordemExibicao: string;
  tipoCargaPadrao: string;
  modoCargaPadrao: string;
  escopoCarga: string;
  campoReferencia: string;
  janelaReprocessamentoDias: string;
  preservaHistorico: boolean;
  requerConfirmacaoManual: boolean;
  permiteExecucaoManual: boolean;
  permiteFullManual: boolean;
  permiteIncrementalManual: boolean;
  labelBotao: string;
  mensagemConfirmacao: string;
  observacaoRegraNegocio: string;
};

type SortKey = "modulo" | "nomeExibicao" | "periodicidade" | "toleranciaDias" | "ativoPainel" | "tipoCarga" | "execucaoManual" | "implementada";
type SortDir = "asc" | "desc";

// ─── Constantes ──────────────────────────────────────────────────────────────

const PERIODICIDADES = ["diaria", "semanal", "mensal", "bimestral", "anual", "variavel"];
const TIPOS_CARGA = ["full", "incremental", "incremental_com_janela", "manual", "nao_aplicavel"];
const ESCOPOS = ["exercicio_corrente", "competencia", "periodo", "janela", "tudo", "variavel"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toForm(cfg: EtlConfig): EditForm {
  const e = cfg.execucao;
  return {
    nomeExibicao: cfg.nomeExibicao,
    periodicidade: cfg.periodicidade,
    toleranciaDias: String(cfg.toleranciaDias),
    ativoPainel: cfg.ativoPainel,
    descricao: cfg.descricao ?? "",
    ordemExibicao: cfg.ordemExibicao != null ? String(cfg.ordemExibicao) : "",
    tipoCargaPadrao: e.tipoCargaPadrao ?? "",
    modoCargaPadrao: e.modoCargaPadrao ?? "",
    escopoCarga: e.escopoCarga ?? "",
    campoReferencia: e.campoReferencia ?? "",
    janelaReprocessamentoDias: e.janelaReprocessamentoDias != null ? String(e.janelaReprocessamentoDias) : "",
    preservaHistorico: e.preservaHistorico ?? false,
    requerConfirmacaoManual: e.requerConfirmacaoManual ?? false,
    permiteExecucaoManual: e.permiteExecucaoManual ?? false,
    permiteFullManual: e.permiteFullManual ?? false,
    permiteIncrementalManual: e.permiteIncrementalManual ?? false,
    labelBotao: e.labelBotao ?? "",
    mensagemConfirmacao: e.mensagemConfirmacao ?? "",
    observacaoRegraNegocio: e.observacaoRegraNegocio ?? "",
  };
}

function sortConfigs(list: EtlConfig[], key: SortKey, dir: SortDir): EtlConfig[] {
  return [...list].sort((a, b) => {
    let va: string | number;
    let vb: string | number;
    switch (key) {
      case "modulo":         va = a.modulo;                                         vb = b.modulo;                                         break;
      case "nomeExibicao":   va = a.nomeExibicao.toLowerCase();                     vb = b.nomeExibicao.toLowerCase();                     break;
      case "periodicidade":  va = a.periodicidade;                                  vb = b.periodicidade;                                  break;
      case "toleranciaDias": va = a.toleranciaDias;                                 vb = b.toleranciaDias;                                 break;
      case "ativoPainel":    va = a.ativoPainel ? 1 : 0;                            vb = b.ativoPainel ? 1 : 0;                            break;
      case "tipoCarga":      va = (a.execucao.tipoCargaPadrao ?? "").toLowerCase(); vb = (b.execucao.tipoCargaPadrao ?? "").toLowerCase(); break;
      case "execucaoManual": va = a.execucao.permiteExecucaoManual ? 1 : 0;         vb = b.execucao.permiteExecucaoManual ? 1 : 0;         break;
      case "implementada":   va = a.execucaoManualImplementada ? 1 : 0;             vb = b.execucaoManualImplementada ? 1 : 0;             break;
      default:               va = ""; vb = "";
    }
    if (va < vb) return dir === "asc" ? -1 : 1;
    if (va > vb) return dir === "asc" ? 1 : -1;
    return 0;
  });
}

// ─── Estilos de input alinhados ao design system do projeto ──────────────────

const inputClass =
  "h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800";

const selectClass =
  "h-11 w-full rounded-lg border px-4 py-2.5 text-sm shadow-theme-xs focus:outline-hidden focus:ring-3 bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800";

// ─── Sub-componentes ─────────────────────────────────────────────────────────

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="ml-1 inline h-3 w-3 text-slate-400" />;
  return dir === "asc"
    ? <ChevronUp   className="ml-1 inline h-3 w-3 text-teal-500" />
    : <ChevronDown className="ml-1 inline h-3 w-3 text-teal-500" />;
}

function BoolField({
  label, checked, onChange, hint,
}: {
  label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500/20"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="text-sm text-gray-700 dark:text-gray-300">
        {label}
        {hint && <span className="block text-xs text-gray-400 dark:text-gray-500">{hint}</span>}
      </span>
    </label>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h5 className="mb-4 text-base font-semibold text-gray-800 dark:text-white/90">
      {children}
    </h5>
  );
}

// Toast de aviso centralizado
function AlertToast({ onDismiss }: { onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const show = setTimeout(() => setVisible(true), 80);
    const hide = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300);
    }, 5000);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, [onDismiss]);

  return (
    <div
      className={`fixed left-1/2 top-1/2 z-99999 flex max-w-sm -translate-x-1/2 -translate-y-1/2 items-start gap-3 rounded-2xl border border-amber-200 bg-white px-5 py-4 shadow-xl transition-all duration-300 dark:border-amber-700/40 dark:bg-gray-900 ${
        visible ? "scale-100 opacity-100" : "scale-95 opacity-0"
      }`}
    >
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-800 dark:text-white/90">Atenção</p>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          Alterações aqui afetam imediatamente o painel de cargas e a execução manual dos jobs.
        </p>
      </div>
      <button
        onClick={() => { setVisible(false); setTimeout(onDismiss, 300); }}
        className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function EtlConfiguracaoClient() {
  const { isOpen, openModal, closeModal } = useModal();

  const [configs, setConfigs]           = useState<EtlConfig[]>([]);
  const [isLoading, setIsLoading]       = useState(true);
  const [error, setError]               = useState("");
  const [sortKey, setSortKey]           = useState<SortKey>("nomeExibicao");
  const [sortDir, setSortDir]           = useState<SortDir>("asc");
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [editingConfig, setEditingConfig] = useState<EtlConfig | null>(null);
  const [form, setForm]                 = useState<EditForm | null>(null);
  const [isSaving, setIsSaving]         = useState(false);
  const [saveMessage, setSaveMessage]   = useState("");
  const [saveError, setSaveError]       = useState("");
  const [showToast, setShowToast]       = useState(true);

  async function loadConfigs() {
    setIsLoading(true);
    setError("");
    try {
      const res  = await fetch("/api/admin/etl/configuracao");
      const data = (await res.json()) as EtlConfig[] | { message?: string };
      if (!res.ok) throw new Error((data as { message?: string }).message ?? "Erro ao carregar.");
      setConfigs(data as EtlConfig[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar configurações.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { loadConfigs(); }, []);

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  function startEdit(cfg: EtlConfig) {
    setEditingConfig(cfg);
    setForm(toForm(cfg));
    setSaveMessage("");
    setSaveError("");
    openModal();
  }

  function handleClose() {
    closeModal();
    setSaveMessage("");
    setSaveError("");
  }

  function set(key: keyof EditForm, value: string | boolean) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  async function handleSave() {
    if (!form || !editingConfig) return;
    setIsSaving(true);
    setSaveMessage("");
    setSaveError("");

    const payload = {
      modulo: editingConfig.modulo,
      monitoramento: {
        nomeExibicao:   form.nomeExibicao,
        periodicidade:  form.periodicidade,
        toleranciaDias: parseInt(form.toleranciaDias, 10),
        ativoPainel:    form.ativoPainel,
        descricao:      form.descricao || null,
        ordemExibicao:  form.ordemExibicao !== "" ? parseInt(form.ordemExibicao, 10) : null,
      },
      execucao: {
        tipoCargaPadrao:           form.tipoCargaPadrao || undefined,
        modoCargaPadrao:           form.modoCargaPadrao || undefined,
        escopoCarga:               form.escopoCarga || undefined,
        campoReferencia:           form.campoReferencia || null,
        janelaReprocessamentoDias: form.janelaReprocessamentoDias !== "" ? parseInt(form.janelaReprocessamentoDias, 10) : null,
        preservaHistorico:         form.preservaHistorico,
        requerConfirmacaoManual:   form.requerConfirmacaoManual,
        permiteExecucaoManual:     form.permiteExecucaoManual,
        permiteFullManual:         form.permiteFullManual,
        permiteIncrementalManual:  form.permiteIncrementalManual,
        labelBotao:                form.labelBotao || null,
        mensagemConfirmacao:       form.mensagemConfirmacao || null,
        observacaoRegraNegocio:    form.observacaoRegraNegocio || null,
      },
    };

    try {
      const res  = await fetch("/api/admin/etl/configuracao", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as EtlConfig | { message?: string };
      if (!res.ok) throw new Error((data as { message?: string }).message ?? "Erro ao salvar.");
      const updated = data as EtlConfig;
      setSaveMessage("Configuração salva com sucesso.");
      setConfigs((prev) => prev.map((c) => (c.modulo === editingConfig.modulo ? updated : c)));
      setEditingConfig(updated);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setIsSaving(false);
    }
  }

  const visiveis = mostrarInativos ? configs : configs.filter((c) => c.ativoPainel);
  const sorted = sortConfigs(visiveis, sortKey, sortDir);

  function ThCol({ label, sortK }: { label: string; sortK: SortKey }) {
    return (
      <th
        className="cursor-pointer select-none whitespace-nowrap px-4 py-3 text-left font-semibold hover:text-teal-600 dark:hover:text-teal-400"
        onClick={() => handleSort(sortK)}
      >
        {label}
        <SortIcon active={sortKey === sortK} dir={sortDir} />
      </th>
    );
  }

  return (
    <div className="min-h-screen space-y-5 bg-slate-50 p-4 pb-10 dark:bg-slate-900 sm:p-6">
      {showToast && <AlertToast onDismiss={() => setShowToast(false)} />}

      {/* Tabela */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">

        {isLoading && (
          <div className="flex items-center justify-center py-16 text-sm text-slate-500">
            <div className="mr-3 h-5 w-5 animate-spin rounded-full border-2 border-teal-200 border-t-teal-600" />
            Carregando configurações...
          </div>
        )}

        {!isLoading && error && (
          <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        {!isLoading && !error && (
          <>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <span>
                <strong className="text-slate-700 dark:text-slate-200">{visiveis.length}</strong> módulos ETL
                {!mostrarInativos && configs.some((c) => !c.ativoPainel) && (
                  <span className="ml-1 text-slate-400 dark:text-slate-500">
                    ({configs.filter((c) => !c.ativoPainel).length} inativo{configs.filter((c) => !c.ativoPainel).length !== 1 ? "s" : ""} oculto{configs.filter((c) => !c.ativoPainel).length !== 1 ? "s" : ""})
                  </span>
                )}
              </span>
              {configs.some((c) => !c.ativoPainel) && (
                <button
                  type="button"
                  onClick={() => setMostrarInativos((v) => !v)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                >
                  {mostrarInativos ? "Ocultar inativos" : "Mostrar inativos"}
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                  <tr>
                    <ThCol label="Módulo"           sortK="modulo" />
                    <ThCol label="Nome de exibição" sortK="nomeExibicao" />
                    <ThCol label="Periodicidade"    sortK="periodicidade" />
                    <ThCol label="Tolerância"       sortK="toleranciaDias" />
                    <ThCol label="Painel"           sortK="ativoPainel" />
                    <ThCol label="Tipo de carga"    sortK="tipoCarga" />
                    <ThCol label="Exec. manual"     sortK="execucaoManual" />
                    <ThCol label="Backend"          sortK="implementada" />
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-400">
                        Nenhum módulo encontrado.
                      </td>
                    </tr>
                  ) : (
                    sorted.map((cfg, i) => (
                      <tr
                        key={cfg.modulo}
                        className={`border-t border-slate-100 dark:border-slate-700/50 ${
                          editingConfig?.modulo === cfg.modulo
                            ? "bg-teal-50/60 dark:bg-teal-900/20"
                            : i % 2 !== 0
                            ? "bg-slate-50/50 dark:bg-slate-800/30"
                            : ""
                        }`}
                      >
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">{cfg.modulo}</td>
                        <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">{cfg.nomeExibicao}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400">{cfg.periodicidade}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400">{cfg.toleranciaDias}d</td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cfg.ativoPainel ? "bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300" : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"}`}>
                            {cfg.ativoPainel ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400">{cfg.execucao.tipoCargaPadrao ?? "—"}</td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {cfg.execucao.permiteExecucaoManual ? (
                            <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                              Habilitado
                            </span>
                          ) : cfg.execucao.tipoCargaPadrao === "nao_aplicavel" ? (
                            <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                              Vinculado
                            </span>
                          ) : (
                            <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                              Desabilitado
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {cfg.execucaoManualImplementada ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                              <Terminal className="h-3 w-3" />
                              Implementado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-400 dark:bg-slate-700 dark:text-slate-500">
                              <Ban className="h-3 w-3" />
                              Sem comando
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => startEdit(cfg)}
                            className="inline-flex items-center gap-1 text-sm font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300"
                          >
                            <Settings2 className="h-3.5 w-3.5" />
                            Editar
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Modal de edição — padrão do projeto (UserInfoCard) */}
      <Modal isOpen={isOpen} onClose={handleClose} className="max-w-[700px] m-4">
        {editingConfig && form && (
          <div className="no-scrollbar relative w-full max-w-[700px] overflow-y-auto rounded-3xl bg-white p-4 dark:bg-gray-900 lg:p-11">

            <div className="px-2 pr-14">
              <div className="mb-2 flex items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-500">
                  Editar configuração ETL
                </p>
                {editingConfig.execucaoManualImplementada ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                    <Terminal className="h-3 w-3" />
                    Comando implementado
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                    <Ban className="h-3 w-3" />
                    Sem comando no backend
                  </span>
                )}
              </div>
              <h4 className="mb-1 text-2xl font-semibold text-gray-800 dark:text-white/90">
                {editingConfig.nomeExibicao}
              </h4>
              <p className="mb-6 font-mono text-xs text-gray-400">
                {editingConfig.modulo} · O módulo é a chave técnica e não pode ser alterado.
              </p>
            </div>

            <div className="custom-scrollbar h-[480px] overflow-y-auto px-2 pb-3">

              {/* Monitoramento */}
              <div className="mb-7">
                <SectionTitle>Monitoramento</SectionTitle>
                <div className="grid grid-cols-1 gap-x-6 gap-y-5 lg:grid-cols-2">
                  <div className="lg:col-span-2">
                    <Label>Nome de exibição</Label>
                    <input className={inputClass} value={form.nomeExibicao} onChange={(e) => set("nomeExibicao", e.target.value)} />
                    <p className="mt-1 text-xs text-gray-400">Texto exibido no painel de controle de cargas.</p>
                  </div>
                  <div>
                    <Label>Periodicidade</Label>
                    <select className={selectClass} value={form.periodicidade} onChange={(e) => set("periodicidade", e.target.value)}>
                      {PERIODICIDADES.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>Tolerância (dias)</Label>
                    <input type="number" min={0} className={inputClass} value={form.toleranciaDias} onChange={(e) => set("toleranciaDias", e.target.value)} />
                  </div>
                  <div>
                    <Label>Ordem de exibição</Label>
                    <input type="number" min={0} className={inputClass} value={form.ordemExibicao} onChange={(e) => set("ordemExibicao", e.target.value)} placeholder="Padrão se vazio" />
                  </div>
                  <div>
                    <Label>Descrição</Label>
                    <input className={inputClass} value={form.descricao} onChange={(e) => set("descricao", e.target.value)} placeholder="Opcional" />
                  </div>
                  <div className="lg:col-span-2">
                    <BoolField label="Ativo no painel" checked={form.ativoPainel} onChange={(v) => set("ativoPainel", v)} />
                  </div>
                </div>
              </div>

              {/* Execução */}
              <div>
                <SectionTitle>Execução</SectionTitle>
                {!editingConfig.execucaoManualImplementada && (
                  <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-700/40 dark:bg-amber-900/10">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <p className="text-sm text-amber-800 dark:text-amber-300">
                      Este módulo ainda <strong>não possui comando mapeado no backend</strong>. Mesmo que a execução manual seja habilitada, o endpoint retornará erro 501 ao ser acionado. Solicite ao desenvolvedor que implemente o comando em <code className="rounded bg-amber-100 px-1 text-xs dark:bg-amber-900/30">ETL_JOB_COMMANDS</code>.
                    </p>
                  </div>
                )}
                {editingConfig.execucaoManualImplementada && form.permiteExecucaoManual && (
                  <div className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-700/40 dark:bg-emerald-900/10">
                    <Terminal className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <p className="text-sm text-emerald-800 dark:text-emerald-300">
                      Comando implementado e execução manual habilitada. O botão aparecerá no painel de controle de cargas.
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-x-6 gap-y-5 lg:grid-cols-2">
                  <div className="lg:col-span-2">
                    <Label>Tipo de carga padrão</Label>
                    <select className={selectClass} value={form.tipoCargaPadrao} onChange={(e) => set("tipoCargaPadrao", e.target.value)}>
                      <option value="">— não definido —</option>
                      {TIPOS_CARGA.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <p className="mt-1 text-xs text-gray-400">Deve refletir a estratégia real do job.</p>
                  </div>
                  <div>
                    <Label>Modo de carga</Label>
                    <input className={inputClass} value={form.modoCargaPadrao} onChange={(e) => set("modoCargaPadrao", e.target.value)} placeholder="ex: postgres" />
                  </div>
                  <div>
                    <Label>Escopo</Label>
                    <select className={selectClass} value={form.escopoCarga} onChange={(e) => set("escopoCarga", e.target.value)}>
                      <option value="">— não definido —</option>
                      {ESCOPOS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>Campo de referência</Label>
                    <input className={inputClass} value={form.campoReferencia} onChange={(e) => set("campoReferencia", e.target.value)} placeholder="ex: data_competencia" />
                  </div>
                  <div>
                    <Label>Janela de reprocessamento (dias)</Label>
                    <input type="number" min={0} className={inputClass} value={form.janelaReprocessamentoDias} onChange={(e) => set("janelaReprocessamentoDias", e.target.value)} placeholder="Vazio = não aplicável" />
                  </div>
                  <div>
                    <Label>Label do botão</Label>
                    <input className={inputClass} value={form.labelBotao} onChange={(e) => set("labelBotao", e.target.value)} placeholder='Padrão: "Executar"' />
                  </div>
                  <div className="lg:col-span-2">
                    <Label>Mensagem de confirmação</Label>
                    <input className={inputClass} value={form.mensagemConfirmacao} onChange={(e) => set("mensagemConfirmacao", e.target.value)} placeholder="Obrigatória quando requer confirmação manual" />
                  </div>
                  <div className="lg:col-span-2">
                    <Label>Observação de regra de negócio</Label>
                    <input className={inputClass} value={form.observacaoRegraNegocio} onChange={(e) => set("observacaoRegraNegocio", e.target.value)} />
                  </div>
                  <div className="lg:col-span-2">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <BoolField label="Preserva histórico anterior"  checked={form.preservaHistorico}        onChange={(v) => set("preservaHistorico", v)} />
                      <BoolField label="Requer confirmação manual"    checked={form.requerConfirmacaoManual}  onChange={(v) => set("requerConfirmacaoManual", v)} />
                      <BoolField
                        label="Permite execução manual"
                        checked={form.permiteExecucaoManual}
                        onChange={(v) => set("permiteExecucaoManual", v)}
                        hint="Habilita o botão na tabela de controle de cargas."
                      />
                      <BoolField label="Permite full manual"          checked={form.permiteFullManual}        onChange={(v) => set("permiteFullManual", v)} />
                      <BoolField
                        label="Permite incremental manual"
                        checked={form.permiteIncrementalManual}
                        onChange={(v) => set("permiteIncrementalManual", v)}
                        hint="Ative somente se a ETL suportar incremental."
                      />
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Feedback + ações */}
            <div className="px-2 mt-6">
              {saveMessage && (
                <p className="mb-3 text-sm font-medium text-success-600 dark:text-success-400">{saveMessage}</p>
              )}
              {saveError && (
                <p className="mb-3 text-sm font-medium text-error-600 dark:text-error-400">{saveError}</p>
              )}
              <div className="flex items-center justify-end gap-3">
                <Button size="sm" variant="outline" onClick={handleClose} disabled={isSaving}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? "Salvando..." : "Salvar alterações"}
                </Button>
              </div>
            </div>

          </div>
        )}
      </Modal>
    </div>
  );
}
