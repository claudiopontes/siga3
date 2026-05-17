"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Users,
  AlertTriangle,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Activity,
  Heart,
  Database,
  ChevronRight,
  CheckCircle2,
  X,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface AlertaRow {
  ano_mes: string;
  codigo_ibge_municipio: string;
  nome_municipio: string;
  sigla_uf: string;
  tipo_alerta: string;
  nivel_alerta: "CRITICO" | "ALTO" | "MEDIO" | "BAIXO";
  indicador_base: string;
  valor_indicador: number | null;
  descricao_alerta: string;
  justificativa_controle_externo: string;
  fonte: string | null;
  data_carga: string | null;
}

interface StatusCarga {
  ultima_competencia: { ano_mes: string; data_carga: string; fonte: string } | null;
  execucoes_30d: { status: string; total: number }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NIVEL_COR: Record<string, string> = {
  CRITICO: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  ALTO:    "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  MEDIO:   "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  BAIXO:   "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
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
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${NIVEL_COR[n] ?? NIVEL_COR.BAIXO}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${NIVEL_DOT[n] ?? NIVEL_DOT.BAIXO}`} />
      {NIVEL_LABEL[n] ?? nivel}
    </span>
  );
}

function formatarValorIndicador(indicador: string, valor: number | null): string {
  if (valor === null || valor === undefined) return "—";
  if (indicador.includes("taxa") || indicador.includes("percentual") || indicador.includes("pct")) {
    return `${valor.toFixed(1)}%`;
  }
  if (indicador === "igdm") return valor.toFixed(3);
  return valor.toLocaleString("pt-BR");
}

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

// ---------------------------------------------------------------------------
// Modal de alertas — preservado integralmente
// ---------------------------------------------------------------------------

interface ModalAlertasProps {
  titulo: string;
  tipo: string;
  alertas: AlertaRow[];
  onClose: () => void;
}

function ModalAlertas({ titulo, tipo, alertas, onClose }: ModalAlertasProps) {
  const itens = alertas.filter((a) => a.tipo_alerta === tipo);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", fn);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", fn); document.body.style.overflow = ""; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-99999 flex items-start justify-center overflow-y-auto pb-10 pt-10">
      <div className="fixed inset-0 bg-gray-400/50 backdrop-blur-[32px]" onClick={onClose} />
      <div className="relative mx-4 w-full max-w-3xl rounded-2xl bg-white shadow-xl dark:bg-gray-900">
        <div className="flex items-start justify-between border-b border-gray-100 p-6 dark:border-gray-700">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">{titulo}</h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {itens.length} município{itens.length !== 1 ? "s" : ""} com ponto de atenção identificado
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mx-6 mt-4 rounded-lg bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          <strong>Nota de controle externo:</strong> Os alertas abaixo são indicadores de ponto de atenção,
          não afirmações de irregularidade. Destinam-se à priorização de análise pelo gabinete do conselheiro.
        </div>

        <div className="max-h-[60vh] divide-y divide-gray-100 overflow-y-auto dark:divide-gray-700/60">
          {itens.length === 0 ? (
            <p className="p-6 text-sm text-gray-400 dark:text-gray-500">
              Nenhum município com este tipo de alerta na competência mais recente.
            </p>
          ) : (
            itens.map((a) => (
              <div key={`${a.codigo_ibge_municipio}-${a.tipo_alerta}`} className="px-6 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-sm font-medium text-gray-800 dark:text-white">{a.nome_municipio}</span>
                    <span className="ml-2 text-xs text-gray-400">{a.sigla_uf} · {a.ano_mes}</span>
                  </div>
                  <NivelBadge nivel={a.nivel_alerta} />
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
                  <span>
                    <span className="font-medium text-gray-700 dark:text-gray-300">Indicador: </span>
                    {a.indicador_base.replaceAll("_", " ")}
                  </span>
                  <span>
                    <span className="font-medium text-gray-700 dark:text-gray-300">Valor: </span>
                    {formatarValorIndicador(a.indicador_base, a.valor_indicador)}
                  </span>
                  {a.fonte && (
                    <span>
                      <span className="font-medium text-gray-700 dark:text-gray-300">Fonte: </span>
                      {a.fonte}
                    </span>
                  )}
                  {a.data_carga && (
                    <span>
                      <span className="font-medium text-gray-700 dark:text-gray-300">Carga: </span>
                      {formatarData(a.data_carga)}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  {a.justificativa_controle_externo}
                </p>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-gray-100 p-4 dark:border-gray-700">
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-gray-100 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-componentes de layout
// ---------------------------------------------------------------------------

function AreaStatusPill({
  nome, carregando, semDados, criticos, altos,
}: {
  nome: string;
  carregando: boolean;
  semDados: boolean;
  criticos: number;
  altos: number;
}) {
  if (carregando)
    return <span className="inline-block h-6 w-20 animate-pulse rounded-full bg-gray-200 dark:bg-gray-700" />;

  const cls = semDados
    ? "bg-gray-100 text-gray-400 dark:bg-gray-700/50 dark:text-gray-500"
    : criticos > 0
      ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
      : altos > 0
        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
  const dot = semDados
    ? "bg-gray-300"
    : criticos > 0 ? "bg-red-500" : altos > 0 ? "bg-amber-400" : "bg-emerald-500";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {nome}
      {!semDados && (criticos > 0 || altos > 0) && (
        <span className="font-bold opacity-80">{criticos + altos}</span>
      )}
    </span>
  );
}

function ItemAlerta({
  icone, titulo, descricao, valor, nivel, onClick,
}: {
  icone: React.ReactNode;
  titulo: string;
  descricao: string;
  valor: number;
  nivel: "critico" | "alto";
  onClick: () => void;
}) {
  const nivelBg = nivel === "critico"
    ? "bg-red-50 text-red-500 dark:bg-red-900/20 dark:text-red-400"
    : "bg-amber-50 text-amber-500 dark:bg-amber-900/20 dark:text-amber-400";
  const badgeCls = nivel === "critico"
    ? "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400"
    : "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400";
  const dotCls = nivel === "critico" ? "bg-red-500" : "bg-amber-400";

  return (
    <button type="button" onClick={onClick} className="block w-full text-left">
      <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 transition hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600">
        <span className={`shrink-0 rounded-lg p-2 ${nivelBg}`}>{icone}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-800 dark:text-white">{titulo}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{descricao}</p>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${badgeCls}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${dotCls}`} />
          {valor}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600" />
      </div>
    </button>
  );
}

function CardEmBreve({ titulo, descricao, icone }: { titulo: string; descricao: string; icone: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-gray-200 bg-white px-4 py-3 opacity-60 dark:border-gray-700 dark:bg-gray-800">
      <span className="shrink-0 rounded-lg bg-gray-50 p-2 text-gray-400 dark:bg-gray-700/50">{icone}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-700 dark:text-gray-300">{titulo}</p>
        <p className="truncate text-[11px] text-gray-400 dark:text-gray-500">{descricao}</p>
      </div>
      <span className="shrink-0 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
        Em breve
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Configuração dos 5 tipos de alerta
// ---------------------------------------------------------------------------

const TIPOS_ALERTA = [
  {
    tipo:     "alta_vulnerabilidade_social",
    titulo:   "Alta vulnerabilidade social",
    descricao: "Municípios com maior concentração de famílias em situação de pobreza",
    icone:    <AlertTriangle className="h-5 w-5" />,
    nomeStatus: "Vulnerabilidade",
  },
  {
    tipo:     "baixa_atualizacao_cadastral",
    titulo:   "Atualização cadastral deficiente",
    descricao: "Municípios com menor taxa de atualização do Cadastro Único",
    icone:    <RefreshCw className="h-5 w-5" />,
    nomeStatus: "Atualização",
  },
  {
    tipo:     "crescimento_familias_unipessoais",
    titulo:   "Crescimento de famílias unipessoais",
    descricao: "Crescimento expressivo de famílias unipessoais nos últimos 12 meses",
    icone:    <TrendingUp className="h-5 w-5" />,
    nomeStatus: "Unipessoais",
  },
  {
    tipo:     "queda_brusca_familias_cadastradas",
    titulo:   "Queda brusca de cadastros",
    descricao: "Queda expressiva no total de famílias cadastradas vs. mesmo período anterior",
    icone:    <TrendingDown className="h-5 w-5" />,
    nomeStatus: "Queda CadÚnico",
  },
  {
    tipo:     "baixo_igdm",
    titulo:   "Baixo IGD-M",
    descricao: "Municípios com Índice de Gestão Descentralizada Municipal abaixo do referencial",
    icone:    <Activity className="h-5 w-5" />,
    nomeStatus: "IGD-M",
  },
] as const;

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function PainelSocialClient() {
  const [alertas,    setAlertas]    = useState<AlertaRow[]>([]);
  const [status,     setStatus]     = useState<StatusCarga | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [modal,      setModal]      = useState<{ tipo: string; titulo: string } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/social/cadunico/alertas").then((r) => r.ok ? r.json() : []),
      fetch("/api/social/cadunico/status-carga").then((r) => r.ok ? r.json() : null),
    ])
      .then(([a, s]) => {
        setAlertas(Array.isArray(a) ? a : []);
        setStatus(s ?? null);
      })
      .catch(console.error)
      .finally(() => setCarregando(false));
  }, []);

  const abrirModal  = useCallback((tipo: string, titulo: string) => setModal({ tipo, titulo }), []);
  const fecharModal = useCallback(() => setModal(null), []);

  const ultimaCompetencia = status?.ultima_competencia?.ano_mes ?? null;
  const dataCarga         = status?.ultima_competencia?.data_carga ?? null;
  const sucesso30d        = status?.execucoes_30d?.find((e) => e.status === "SUCESSO")?.total ?? 0;
  const erro30d           = status?.execucoes_30d?.find((e) => e.status === "ERRO")?.total    ?? 0;

  const semDadosGlobal = !carregando && !ultimaCompetencia;

  // Contagens por tipo
  const contagemPorTipo = TIPOS_ALERTA.map((t) => {
    const itens    = alertas.filter((a) => a.tipo_alerta === t.tipo);
    const criticos = itens.filter((a) => a.nivel_alerta === "CRITICO").length;
    const altos    = itens.filter((a) => a.nivel_alerta === "ALTO").length;
    return { ...t, criticos, altos, total: itens.length };
  });

  const totalCriticos = contagemPorTipo.reduce((s, t) => s + t.criticos, 0);
  const totalAltos    = contagemPorTipo.reduce((s, t) => s + t.altos,    0);

  const temAlerta   = !carregando && !semDadosGlobal && (totalCriticos > 0 || totalAltos > 0);
  const tudoRegular = !carregando && !semDadosGlobal && totalCriticos === 0 && totalAltos === 0;

  return (
    <>
      {modal && (
        <ModalAlertas
          titulo={modal.titulo}
          tipo={modal.tipo}
          alertas={alertas}
          onClose={fecharModal}
        />
      )}

      <div className="space-y-5">

        {/* ── Barra de situação geral ── */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Situação geral
            </p>
            {!carregando && ultimaCompetencia && (
              <span className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                <Database className="h-3.5 w-3.5" />
                Competência {ultimaCompetencia}
                {dataCarga && <span>· Carga {formatarData(dataCarga)}</span>}
                {erro30d > 0 && (
                  <span className="text-red-500 dark:text-red-400">· {erro30d} erro{erro30d !== 1 ? "s" : ""} (30 dias)</span>
                )}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {contagemPorTipo.map((t) => (
              <AreaStatusPill
                key={t.tipo}
                nome={t.nomeStatus}
                carregando={carregando}
                semDados={semDadosGlobal}
                criticos={t.criticos}
                altos={t.altos}
              />
            ))}
          </div>

          {semDadosGlobal && (
            <div className="mt-3 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900/10 dark:text-amber-300">
              <p className="font-medium">Dados do Cadastro Único ainda não carregados</p>
              <p className="mt-1 text-amber-700 dark:text-amber-400">
                Exporte o CSV do VIS DATA / CECAD / dados abertos MDS, defina{" "}
                <code className="font-mono">CADUNICO_CSV_PATH</code> e execute{" "}
                <code className="font-mono">npm run cadunico:incremental</code> na pasta <code className="font-mono">etl/</code>.
              </p>
            </div>
          )}
        </div>

        {/* ── Verificar agora ── */}
        {temAlerta && (
          <div className="space-y-2">
            <p className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Verificar agora
            </p>
            {contagemPorTipo
              .filter((t) => t.criticos > 0 || t.altos > 0)
              .sort((a, b) => (b.criticos - a.criticos) || (b.altos - a.altos))
              .map((t) => (
                <ItemAlerta
                  key={t.tipo}
                  icone={t.icone}
                  titulo={t.titulo}
                  descricao={t.descricao}
                  valor={t.criticos + t.altos}
                  nivel={t.criticos > 0 ? "critico" : "alto"}
                  onClick={() => abrirModal(t.tipo, t.titulo)}
                />
              ))}
          </div>
        )}

        {/* ── Tudo regular ── */}
        {tudoRegular && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-800/40 dark:bg-emerald-900/20">
            <div className="flex items-center gap-3">
              <div className="shrink-0 rounded-full bg-emerald-100 p-2.5 dark:bg-emerald-900/40">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4 12 14.01l-3-3" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-emerald-800 dark:text-emerald-300">Tudo regular</p>
                <p className="text-sm text-emerald-700/80 dark:text-emerald-400/80">
                  Nenhum indicador social apresenta alertas críticos ou altos na competência atual.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Análises disponíveis ── */}
        <div>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Análises disponíveis
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {contagemPorTipo.map((t) => {
              const temAlertaItem = t.criticos > 0 || t.altos > 0;
              return (
                <button
                  key={t.tipo}
                  type="button"
                  onClick={() => abrirModal(t.tipo, t.titulo)}
                  className={`group flex items-center gap-3 rounded-xl border bg-white p-3.5 text-left transition-all dark:bg-gray-800 ${
                    temAlertaItem
                      ? "border-red-200 hover:shadow-sm dark:border-red-800/40"
                      : "border-gray-200 hover:shadow-sm dark:border-gray-700"
                  }`}
                >
                  <div className="shrink-0 rounded-lg bg-gray-50 p-2 text-gray-400 dark:bg-gray-700/50 dark:text-gray-500">
                    {t.icone}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-800 dark:text-white">{t.titulo}</p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500">CadÚnico · MDS</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {t.criticos > 0 && (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-600 dark:bg-red-900/30 dark:text-red-400">
                        {t.criticos} crítico{t.criticos !== 1 ? "s" : ""}
                      </span>
                    )}
                    {t.altos > 0 && (
                      <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-bold text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                        {t.altos} alto{t.altos !== 1 ? "s" : ""}
                      </span>
                    )}
                    {!temAlertaItem && !semDadosGlobal && (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
                    )}
                    <ChevronRight className="h-4 w-4 text-gray-300 transition-transform group-hover:translate-x-0.5 dark:text-gray-600" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Em desenvolvimento ── */}
        <div>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Em desenvolvimento
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <CardEmBreve
              titulo="Dependência do Bolsa Família"
              descricao="Proporção de famílias beneficiárias por município"
              icone={<Heart className="h-5 w-5" />}
            />
            <CardEmBreve
              titulo="Famílias por município"
              descricao="Visão consolidada: cadastradas, em pobreza e beneficiárias"
              icone={<Users className="h-5 w-5" />}
            />
          </div>
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500">
          Dados agregados por município. Nenhuma informação pessoal, CPF, NIS ou dado individualizado é exibido.
          Fontes: MDS / CadÚnico / VIS DATA / dados abertos. Os alertas indicam pontos de atenção para análise
          do gabinete — não afirmam irregularidade.
        </p>

      </div>
    </>
  );
}
