"use client";

import React, { useEffect, useState } from "react";
import { Settings2, AlertTriangle, X, Terminal, Ban } from "lucide-react";
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

  const inativos = configs.filter((c) => !c.ativoPainel).length;

  return (
    <div className="min-h-screen space-y-4 bg-slate-50 p-4 pb-10 dark:bg-slate-900 sm:p-6">
      {showToast && <AlertToast onDismiss={() => setShowToast(false)} />}

      {/* Barra de ferramentas */}
      {!isLoading && !error && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            <strong className="text-slate-700 dark:text-slate-200">{visiveis.length}</strong> módulos
            {!mostrarInativos && inativos > 0 && (
              <span className="ml-1 text-slate-400 dark:text-slate-500">
                ({inativos} inativo{inativos !== 1 ? "s" : ""} oculto{inativos !== 1 ? "s" : ""})
              </span>
            )}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 dark:text-slate-400">Ordenar:</span>
            <select
              value={`${sortKey}-${sortDir}`}
              onChange={(e) => {
                const [k, d] = e.target.value.split("-");
                setSortKey(k as SortKey);
                setSortDir(d as SortDir);
              }}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
            >
              <option value="nomeExibicao-asc">Nome (A→Z)</option>
              <option value="nomeExibicao-desc">Nome (Z→A)</option>
              <option value="periodicidade-asc">Periodicidade</option>
              <option value="tipoCarga-asc">Tipo de carga</option>
              <option value="implementada-desc">Implementados primeiro</option>
            </select>
          </div>
          {inativos > 0 && (
            <button
              type="button"
              onClick={() => setMostrarInativos((v) => !v)}
              className="ml-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
            >
              {mostrarInativos ? "Ocultar inativos" : "Mostrar inativos"}
            </button>
          )}
        </div>
      )}

      {/* Conteúdo */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-3.5 w-56 rounded bg-slate-200 dark:bg-slate-700" />
                  <div className="h-2.5 w-36 rounded bg-slate-100 dark:bg-slate-700/50" />
                </div>
                <div className="h-7 w-16 rounded-lg bg-slate-100 dark:bg-slate-700" />
              </div>
              <div className="mt-3 flex gap-2">
                {Array.from({ length: 4 }).map((_, j) => <div key={j} className="h-5 w-20 rounded-full bg-slate-100 dark:bg-slate-700/50" />)}
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-800">
          Nenhum módulo encontrado.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {sorted.map((cfg) => {
            const isEditing = editingConfig?.modulo === cfg.modulo;
            return (
              <div
                key={cfg.modulo}
                className={`rounded-xl border bg-white dark:bg-slate-800 ${
                  isEditing
                    ? "border-teal-300 ring-2 ring-teal-200 dark:border-teal-700 dark:ring-teal-800/60"
                    : cfg.ativoPainel
                    ? "border-slate-200 dark:border-slate-700"
                    : "border-slate-200 opacity-60 dark:border-slate-700"
                }`}
              >
                {/* Cabeçalho do card */}
                <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800 dark:text-white">
                      {cfg.nomeExibicao}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] text-slate-400 dark:text-slate-500">
                      {cfg.modulo}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => startEdit(cfg)}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 transition hover:bg-teal-100 dark:border-teal-700/60 dark:bg-teal-900/20 dark:text-teal-300 dark:hover:bg-teal-900/40"
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                    Editar
                  </button>
                </div>

                {/* Tags de atributos */}
                <div className="flex flex-wrap gap-1.5 border-t border-slate-100 px-4 py-2.5 dark:border-slate-700/60">
                  {/* Ativo/Inativo */}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cfg.ativoPainel ? "bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300" : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"}`}>
                    {cfg.ativoPainel ? "Ativo" : "Inativo"}
                  </span>
                  {/* Periodicidade + tolerância */}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    {cfg.periodicidade} · tol. {cfg.toleranciaDias}d
                  </span>
                  {/* Tipo de carga */}
                  {cfg.execucao.tipoCargaPadrao && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                      {cfg.execucao.tipoCargaPadrao}
                    </span>
                  )}
                  {/* Escopo */}
                  {cfg.execucao.escopoCarga && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                      {cfg.execucao.escopoCarga}
                    </span>
                  )}
                  {/* Execução manual */}
                  {cfg.execucao.permiteExecucaoManual ? (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                      Exec. manual
                    </span>
                  ) : cfg.execucao.tipoCargaPadrao === "nao_aplicavel" ? (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                      Vinculado
                    </span>
                  ) : null}
                  {/* Backend */}
                  {cfg.execucaoManualImplementada ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                      <Terminal className="h-2.5 w-2.5" />Backend
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-400 dark:bg-slate-700 dark:text-slate-500">
                      <Ban className="h-2.5 w-2.5" />Sem comando
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

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
