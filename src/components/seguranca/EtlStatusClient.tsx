"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

interface EtlCarga {
  modulo: string;
  status: string;
  registros_lidos: number;
  registros_gravados: number;
  iniciado_em: string;
  finalizado_em: string | null;
  mensagem: string | null;
}

interface EtlStatus {
  modulo: string;
  status: string;
  registros: number;
  duracao_ms: number | null;
  mensagem: string | null;
  executado_em: string;
  carga: EtlCarga | null;
}

const MODULO_LABEL: Record<string, string> = {
  mart_mortalidade:          "Mortalidade (SIM/SINASC)",
  mart_saude_consolidado:    "Saúde — Consolidado",
  mart_siops:                "Orçamento Saúde (SIOPS)",
  mart_pni:                  "Vacinação PNI",
  mart_pni_cobertura:        "Cobertura Vacinal (PNI)",
  mart_infodengue:           "Vigilância Epidemiológica (InfoDengue)",
  mart_sisagua:              "Qualidade da Água (SISAGUA)",
  mart_saude_estrutura:      "Estrutura da Rede (CNES/UBS)",
  mart_remessas:             "Remessas Contábeis",
  mart_siconfi_rreo:         "RREO (SICONFI)",
  despesa_full_postgres:     "Despesa (Empenhos)",
  mart_despesa:              "Mart Despesa",
  remessas_full_postgres:    "Carga Remessas",
  processos_gabinete:        "Processos Gabinete",
};

function labelModulo(modulo: string) {
  return MODULO_LABEL[modulo] ?? modulo;
}

function formatDuracao(ms: number | null) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms / 60000)} min`;
}

function formatDataHora(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function tempoRelativo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  const h = Math.floor(min / 60);
  const dias = Math.floor(h / 24);
  if (dias > 0) return `há ${dias} dia${dias !== 1 ? "s" : ""}`;
  if (h > 0) return `há ${h}h`;
  if (min > 0) return `há ${min} min`;
  return "agora";
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === "ok" || s === "sucesso")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 dark:bg-green-900/20 dark:text-green-400">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        OK
      </span>
    );
  if (s === "erro" || s === "error")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 dark:bg-red-900/20 dark:text-red-400">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        Erro
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-50 px-2.5 py-1 text-xs font-semibold text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400">
      <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
      {status}
    </span>
  );
}

function SemaforoIndicador({ status, executado_em }: { status: string; executado_em: string }) {
  const s = status.toLowerCase();
  const diasDesde = Math.floor((Date.now() - new Date(executado_em).getTime()) / 86400000);

  if (s === "erro" || s === "error")
    return <span className="h-3 w-3 rounded-full bg-red-500" title="Erro na última execução" />;
  if (diasDesde > 7)
    return <span className="h-3 w-3 rounded-full bg-yellow-400" title="Mais de 7 dias sem atualização" />;
  if (diasDesde > 1)
    return <span className="h-3 w-3 rounded-full bg-yellow-300" title="Mais de 1 dia sem atualização" />;
  return <span className="h-3 w-3 rounded-full bg-green-500" title="Atualizado recentemente" />;
}

export default function EtlStatusClient() {
  const [dados, setDados] = useState<EtlStatus[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch("/api/admin/etl/status");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      setDados((await res.json()) as EtlStatus[]);
      setAtualizadoEm(new Date());
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar status ETL.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { void carregar(); }, []);

  const totalOk = dados.filter((d) => d.status.toLowerCase() === "ok" || d.status.toLowerCase() === "sucesso").length;
  const totalErro = dados.filter((d) => d.status.toLowerCase() === "erro" || d.status.toLowerCase() === "error").length;
  const totalDesatualizado = dados.filter((d) => {
    if (d.status.toLowerCase() === "erro") return false;
    return Math.floor((Date.now() - new Date(d.executado_em).getTime()) / 86400000) > 1;
  }).length;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Status das Bases ETL</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Última execução de cada job de atualização de dados.
            {atualizadoEm && (
              <span className="ml-1 text-gray-400 dark:text-gray-500">
                · Consultado às {atualizadoEm.toLocaleTimeString("pt-BR", { timeStyle: "short" })}
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void carregar()}
          disabled={carregando}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {/* KPIs */}
      {!carregando && dados.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-green-200 bg-white p-4 dark:border-green-800/40 dark:bg-gray-800">
            <p className="text-xs font-medium uppercase tracking-wide text-green-500">OK</p>
            <p className="mt-1 text-3xl font-bold text-green-600 dark:text-green-400">{totalOk}</p>
          </div>
          <div className="rounded-xl border border-yellow-200 bg-white p-4 dark:border-yellow-700/40 dark:bg-gray-800">
            <p className="text-xs font-medium uppercase tracking-wide text-yellow-500">Desatualizados</p>
            <p className="mt-1 text-3xl font-bold text-yellow-600 dark:text-yellow-400">{totalDesatualizado}</p>
          </div>
          <div className="rounded-xl border border-red-200 bg-white p-4 dark:border-red-800/40 dark:bg-gray-800">
            <p className="text-xs font-medium uppercase tracking-wide text-red-400">Com erro</p>
            <p className="mt-1 text-3xl font-bold text-red-600 dark:text-red-400">{totalErro}</p>
          </div>
        </div>
      )}

      {/* Conteúdo */}
      {erro ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-300">
          <p className="font-semibold">Erro ao carregar status</p>
          <p className="mt-1 font-mono text-xs">{erro}</p>
        </div>
      ) : carregando ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-gray-200 dark:bg-gray-700" />
                <div className="h-3 w-48 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="ml-auto h-5 w-12 rounded-full bg-gray-200 dark:bg-gray-700" />
              </div>
            </div>
          ))}
        </div>
      ) : dados.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
          Nenhum registro de execução ETL encontrado.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Base / Módulo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Registros</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Duração</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Última execução</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Mensagem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {dados.map((item) => (
                <tr key={item.modulo} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <SemaforoIndicador status={item.status} executado_em={item.executado_em} />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{labelModulo(item.modulo)}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 font-mono">{item.modulo}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-gray-700 dark:text-gray-300">
                    {item.registros > 0 ? item.registros.toLocaleString("pt-BR") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-gray-700 dark:text-gray-300">
                    {formatDuracao(item.duracao_ms)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{formatDataHora(item.executado_em)}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{tempoRelativo(item.executado_em)}</p>
                  </td>
                  <td className="max-w-xs px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                    {item.mensagem ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
