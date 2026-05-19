"use client";

import { useEffect, useMemo, useState } from "react";
import type React from "react";
import Link from "next/link";
import { ChevronRight, CheckCircle2 } from "lucide-react";
import { useContextoAquiry } from "@/components/aquiry/useContextoAquiry";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type AlertaRow = {
  codigo_ibge: string;
  nome_ente: string;
  total_pendencias: number;
  nivel_alerta: "alto" | "medio" | "baixo";
};

type ProcessoResumoRow = {
  id_grupo: number;
  grupo_atual: string;
  total_processos: number;
  processos_mais_15_dias: number;
  processos_sensiveis: number;
  processos_prazo_regulamentar_vencido: number;
  maior_duracao_setor: number | null;
  media_dias_setor: number | null;
  atualizado_em: string | null;
};

type ProcessoAlertaRow = {
  tipo_alerta: string | null;
  titulo_alerta: string | null;
  nivel_alerta: "alto" | "medio" | "baixo" | string | null;
  processo: number | null;
  grupo_atual: string | null;
  id_grupo: number | null;
  relator: string | null;
  classe: string | null;
  assunto: string | null;
  orgao: string | null;
  atividade_atual: string | null;
  duracao_setor_dias: number | null;
  dias_em_atraso: number | null;
  data_chegada_setor_atual: string | null;
  atualizado_em: string | null;
};

type TipoModalProcessual = "hub_processos" | "processo_sensivel" | "mais_15_dias" | "prazo_regulamentar_vencido";

// Subcategorias do hub de processos (servem de filtro dentro do modal único).
type SubtipoHubProcessos = "todos" | "prazo_regulamentar_vencido" | "processo_sensivel" | "mais_15_dias";

const ROTULO_TIPO_PROCESSUAL: Record<string, { rotulo: string; cor: string }> = {
  prazo_regulamentar_vencido: { rotulo: "Prazo vencido", cor: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  processo_sensivel:          { rotulo: "Sensível",      cor: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" },
  mais_15_dias:               { rotulo: "+15 dias",      cor: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
};

type RemessaResumoRow = {
  ano: number;
  total_remessas: number;
  total_entidades: number;
  total_nao_enviadas_prazo: number;
  total_enviadas_atraso: number;
  total_sem_confirmacao: number;
  total_sem_processamento: number;
  total_criticas: number;
  total_altas: number;
  total_medias: number;
};

type SaudeResumoRow = {
  area: string;
  total_alertas: number;
  total_criticos: number;
  total_altos: number;
  total_medios: number;
  total_municipios_afetados: number;
  municipios_risco_critico: number;
  municipios_risco_alto: number;
  municipios_risco_medio: number;
  siops_ano: number | null;
  siops_periodo: string | null;
  atualizado_em: string | null;
};

type SocialAlertaRow = {
  ano_mes: string;
  codigo_ibge_municipio: string;
  nome_municipio: string;
  tipo_alerta: string;
  nivel_alerta: string;
  descricao: string;
};

type SiconfiRreoResumoRow = {
  an_exercicio: number | null;
  nr_periodo: number | null;
  municipios_com_dado: number;
  municipios_sem_dado: number;
  total_municipios: number;
  alertas_criticos: number;
  alertas_altos: number;
  alertas_medios: number;
  alertas_baixos: number;
};

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const NIVEL_ORDER: Record<AlertaRow["nivel_alerta"], number> = {
  alto: 0,
  medio: 1,
  baixo: 2,
};

const NIVEL_PROCESSO_ORDER: Record<string, number> = { alto: 0, medio: 1, baixo: 2 };

const GABINETE_ATUAL_ID = 20;
const LIMITE_REGISTROS_MODAL = 20;

const MODAIS_PROCESSUAIS: Record<TipoModalProcessual, { titulo: string; subtitulo: string }> = {
  hub_processos: {
    titulo: "Processos do Gabinete",
    subtitulo: "Prazo regulamentar vencido, processos sensíveis e processos parados há mais de 15 dias no Gabinete do Cons. Ronald Polanco Ribeiro.",
  },
  processo_sensivel: {
    titulo: "Processos sensíveis",
    subtitulo: "Cautelares, denúncias, representações, petições e pedidos de vista no Gabinete do Cons. Ronald Polanco Ribeiro.",
  },
  mais_15_dias: {
    titulo: "Processos há mais de 15 dias",
    subtitulo: "Processos aguardando movimentação há mais de 15 dias no gabinete atual.",
  },
  prazo_regulamentar_vencido: {
    titulo: "Prazo regulamentar vencido",
    subtitulo: "Processos cujo tempo de registro ultrapassou o prazo regulamentar da classe.",
  },
};

const ALERTAS_SUGERIDOS = [
  {
    titulo: "Dados atrasados",
    prioridade: "Operacional",
    icone: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
      </svg>
    ),
  },
  {
    titulo: "Pagamentos atípicos",
    prioridade: "Financeiro",
    icone: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /><path d="M7 15h4" />
      </svg>
    ),
  },
  {
    titulo: "Fornecedores sensíveis",
    prioridade: "Contratações",
    icone: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    titulo: "Contratos e prazos",
    prioridade: "Prazo",
    icone: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
        <path d="M12 18v-6" /><path d="M9 15h6" />
      </svg>
    ),
  },
  {
    titulo: "Convênios e transferências",
    prioridade: "Transferências",
    icone: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M7 7h10v10H7z" /><path d="M3 12h4" /><path d="M17 12h4" /><path d="M12 3v4" /><path d="M12 17v4" />
      </svg>
    ),
  },
  {
    titulo: "Obras e medições",
    prioridade: "Obras",
    icone: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 21h18" /><path d="M6 21V9l6-4 6 4v12" /><path d="M9 21v-8h6v8" />
      </svg>
    ),
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NIVEL_BADGE_COR: Record<string, string> = {
  alto:  "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  medio: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  baixo: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};
const NIVEL_BADGE_DOT: Record<string, string> = {
  alto: "bg-red-500", medio: "bg-orange-400", baixo: "bg-green-500",
};
const NIVEL_BADGE_LABEL: Record<string, string> = {
  alto: "Crítico", medio: "Alto", baixo: "Baixo",
};

function NivelBadge({ nivel }: { nivel: string | null | undefined }) {
  const n = (nivel ?? "").toLowerCase();
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${NIVEL_BADGE_COR[n] ?? NIVEL_BADGE_COR.baixo}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${NIVEL_BADGE_DOT[n] ?? NIVEL_BADGE_DOT.baixo}`} />
      {NIVEL_BADGE_LABEL[n] ?? nivel}
    </span>
  );
}

function formatarNumero(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("pt-BR").format(value);
}

// ---------------------------------------------------------------------------
// Sub-componentes de layout
// ---------------------------------------------------------------------------


function AcessoRapido({
  titulo, descricao, fonte, icone, href, onClick, criticos = 0, altos = 0,
  corIcone = "text-gray-400 dark:text-gray-500",
  chipsExtras = [],
}: {
  titulo: string;
  descricao: string;
  fonte: string;
  icone: React.ReactNode;
  href?: string;
  onClick?: () => void;
  criticos?: number;
  altos?: number;
  corIcone?: string;
  chipsExtras?: Array<{ label: string; valor: number; cor: "rose" | "amber" | "blue" }>;
}) {
  const totalChipsExtras = chipsExtras.reduce((acc, c) => acc + c.valor, 0);
  const temAlerta = criticos > 0 || altos > 0 || totalChipsExtras > 0;

  const corChipExtra: Record<"rose" | "amber" | "blue", string> = {
    rose:  "bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
    blue:  "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  };

  const inner = (
    <div className={`group flex items-center gap-2.5 rounded-xl border bg-white p-3 transition-all dark:bg-gray-800 ${
      criticos > 0
        ? "border-red-200 hover:shadow-sm dark:border-red-800/40"
        : altos > 0
          ? "border-amber-200 hover:shadow-sm dark:border-amber-800/40"
          : "border-gray-200 hover:shadow-sm dark:border-gray-700"
    }`}>
      <div className={`shrink-0 rounded-lg bg-gray-50 p-1.5 dark:bg-gray-700/50 ${corIcone}`}>
        {icone}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-800 dark:text-white">{titulo}</p>
        <p className="truncate text-xs text-gray-400 dark:text-gray-500">{descricao || fonte}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {criticos > 0 && (
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-600 dark:bg-red-900/30 dark:text-red-400">
            {criticos} crítico{criticos !== 1 ? "s" : ""}
          </span>
        )}
        {altos > 0 && (
          <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-bold text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
            {altos} alto{altos !== 1 ? "s" : ""}
          </span>
        )}
        {chipsExtras.map((chip) =>
          chip.valor > 0 ? (
            <span
              key={chip.label}
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${corChipExtra[chip.cor]}`}
            >
              {chip.valor} {chip.label}
            </span>
          ) : null,
        )}
        {!temAlerta && (
          <CheckCircle2 className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
        )}
        <ChevronRight className="h-4 w-4 text-gray-300 transition-transform group-hover:translate-x-0.5 dark:text-gray-600" />
      </div>
    </div>
  );

  if (href) return <Link href={href} className="block">{inner}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className="block w-full text-left">{inner}</button>;
  return <div>{inner}</div>;
}

// ---------------------------------------------------------------------------
// Ícones dos processos
// ---------------------------------------------------------------------------

function DocumentoAlertaIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" /><path d="M12 17h.01" /><path d="M12 11v3" />
    </svg>
  );
}

function RelogioProcessualIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" /><path d="M12 6v6l3 2" />
      <path d="M7 3.5 5 2" /><path d="m17 3.5 2-1.5" />
    </svg>
  );
}

function PrazoVencidoIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4" /><path d="M12 17h.01" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Modal processual
// ---------------------------------------------------------------------------

function ordenarAlertasProcessuais(rows: ProcessoAlertaRow[]) {
  return [...rows].sort((a, b) => {
    const nivelA = NIVEL_PROCESSO_ORDER[a.nivel_alerta ?? ""] ?? 9;
    const nivelB = NIVEL_PROCESSO_ORDER[b.nivel_alerta ?? ""] ?? 9;
    if (nivelA !== nivelB) return nivelA - nivelB;
    const duracao = (b.duracao_setor_dias ?? -1) - (a.duracao_setor_dias ?? -1);
    if (duracao !== 0) return duracao;
    const atraso = (b.dias_em_atraso ?? -1) - (a.dias_em_atraso ?? -1);
    if (atraso !== 0) return atraso;
    return (a.processo ?? 0) - (b.processo ?? 0);
  });
}

function ModalProcessual({
  tipo, registros, onClose,
}: {
  tipo: TipoModalProcessual;
  registros: ProcessoAlertaRow[];
  onClose: () => void;
}) {
  const config = MODAIS_PROCESSUAIS[tipo];
  const ehHub = tipo === "hub_processos";

  const [filtroSubtipo, setFiltroSubtipo] = useState<SubtipoHubProcessos>("todos");

  // Contagens por subtipo (só usadas no modo hub para alimentar os chips)
  const contagens = useMemo(() => {
    const c: Record<SubtipoHubProcessos, number> = {
      todos: registros.length,
      prazo_regulamentar_vencido: 0,
      processo_sensivel: 0,
      mais_15_dias: 0,
    };
    for (const r of registros) {
      const t = r.tipo_alerta;
      if (t === "prazo_regulamentar_vencido" || t === "processo_sensivel" || t === "mais_15_dias") c[t]++;
    }
    return c;
  }, [registros]);

  const registrosFiltrados = useMemo(() => {
    if (!ehHub || filtroSubtipo === "todos") return registros;
    return registros.filter((r) => r.tipo_alerta === filtroSubtipo);
  }, [registros, ehHub, filtroSubtipo]);

  const registrosOrdenados = ordenarAlertasProcessuais(registrosFiltrados);
  const registrosVisiveis = registrosOrdenados.slice(0, LIMITE_REGISTROS_MODAL);
  const temMaisRegistros = registrosOrdenados.length > LIMITE_REGISTROS_MODAL;

  const CHIPS_HUB: Array<{ id: SubtipoHubProcessos; label: string; corAtiva: string; corInativa: string }> = [
    { id: "todos",                      label: "Todos",         corAtiva: "bg-gray-800 text-white dark:bg-white dark:text-gray-900",      corInativa: "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700" },
    { id: "prazo_regulamentar_vencido", label: "Prazo vencido", corAtiva: "bg-red-600 text-white",                                         corInativa: "bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400" },
    { id: "processo_sensivel",          label: "Sensíveis",     corAtiva: "bg-rose-600 text-white",                                        corInativa: "bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-900/30 dark:text-rose-400" },
    { id: "mais_15_dias",               label: "+15 dias",      corAtiva: "bg-amber-500 text-white",                                       corInativa: "bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400" },
  ];

  return (
    <div className="fixed inset-0 z-120000 flex items-center justify-center p-3 sm:p-5">
      <button
        type="button"
        aria-label="Fechar detalhes processuais"
        className="absolute inset-0 bg-gray-900/70 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-700">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-gray-900 dark:text-white">{config.titulo}</h2>
            <p className="mt-0.5 max-w-3xl text-xs text-gray-500 dark:text-gray-400">{config.subtitulo}</p>
            {ehHub && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {CHIPS_HUB.map((chip) => {
                  const ativo = filtroSubtipo === chip.id;
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => setFiltroSubtipo(chip.id)}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${ativo ? chip.corAtiva : chip.corInativa}`}
                    >
                      {chip.label} <span className="opacity-75">({contagens[chip.id]})</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Fechar
          </button>
        </div>

        {registrosOrdenados.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            Nenhum processo encontrado para este alerta.
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Nível</th>
                  {ehHub && (
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Tipo</th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Processo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Classe</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Órgão</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Atividade atual</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Dias no setor</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Atraso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {registrosVisiveis.map((alerta) => {
                  const rotuloTipo = alerta.tipo_alerta ? ROTULO_TIPO_PROCESSUAL[alerta.tipo_alerta] : null;
                  return (
                    <tr key={`${alerta.tipo_alerta}-${alerta.processo}-${alerta.duracao_setor_dias}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                      <td className="px-4 py-3"><NivelBadge nivel={alerta.nivel_alerta} /></td>
                      {ehHub && (
                        <td className="px-4 py-3">
                          {rotuloTipo ? (
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${rotuloTipo.cor}`}>
                              {rotuloTipo.rotulo}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{alerta.processo ?? "—"}</td>
                      <td className="max-w-xs px-4 py-3 text-xs text-gray-700 dark:text-gray-300">{alerta.classe ?? "—"}</td>
                      <td className="max-w-sm px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{alerta.orgao ?? "Órgão não informado"}</td>
                      <td className="max-w-xs px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{alerta.atividade_atual ?? "—"}</td>
                      <td className="px-4 py-3 text-center text-xs font-bold text-gray-700 dark:text-gray-300">{formatarNumero(alerta.duracao_setor_dias)}</td>
                      <td className="px-4 py-3 text-center text-xs font-bold text-red-600 dark:text-red-400">{formatarNumero(alerta.dias_em_atraso)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {temMaisRegistros && (
          <div className="border-t border-gray-100 px-4 py-3 text-xs text-gray-400 dark:border-gray-700 dark:text-gray-500">
            Exibindo os 20 principais registros. A página analítica completa será implementada em etapa futura.
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function AlertasGabineteClient() {
  const [alertas, setAlertas] = useState<AlertaRow[]>([]);
  const [resumoProcessos, setResumoProcessos] = useState<ProcessoResumoRow | null>(null);
  const [alertasProcessos, setAlertasProcessos] = useState<ProcessoAlertaRow[]>([]);
  const [modalProcessual, setModalProcessual] = useState<TipoModalProcessual | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [resumoRemessas, setResumoRemessas] = useState<RemessaResumoRow[]>([]);
  const [carregandoRemessas, setCarregandoRemessas] = useState(true);
  const [resumoSaude, setResumoSaude] = useState<SaudeResumoRow | null>(null);
  const [carregandoSaude, setCarregandoSaude] = useState(true);
  const [alertasSocial, setAlertasSocial] = useState<SocialAlertaRow[]>([]);
  const [carregandoSocial, setCarregandoSocial] = useState(true);
  const [resumoSiconfi, setResumoSiconfi] = useState<SiconfiRreoResumoRow | null>(null);
  const [carregandoSiconfi, setCarregandoSiconfi] = useState(true);
  const [mostrarEmBreve, setMostrarEmBreve] = useState(false);

  useEffect(() => {
    let cancelado = false;
    async function carregarSocial() {
      try {
        const res = await fetch("/api/social/mis/alertas").then((r) => r.json());
        if (cancelado) return;
        if (Array.isArray(res)) setAlertasSocial(res as SocialAlertaRow[]);
      } catch { /* silencioso */ } finally {
        if (!cancelado) setCarregandoSocial(false);
      }
    }
    void carregarSocial();
    return () => { cancelado = true; };
  }, []);

  useEffect(() => {
    let cancelado = false;
    async function carregarSiconfi() {
      try {
        const res = await fetch("/api/alertas/siconfi-rreo/resumo").then((r) => r.json());
        if (cancelado) return;
        if (res && typeof res === "object" && !("error" in res))
          setResumoSiconfi(res as SiconfiRreoResumoRow);
      } catch { /* silencioso */ } finally {
        if (!cancelado) setCarregandoSiconfi(false);
      }
    }
    void carregarSiconfi();
    return () => { cancelado = true; };
  }, []);

  useEffect(() => {
    let cancelado = false;
    async function carregarSaude() {
      try {
        const [res, contagem] = await Promise.all([
          fetch("/api/saude/resumo").then((r) => r.json()),
          fetch("/api/saude/alertas/contagem").then((r) => r.json()),
        ]);
        if (cancelado) return;
        if (res && typeof res === "object" && !res.error) {
          const cnt = (contagem && typeof contagem === "object" && !Array.isArray(contagem))
            ? contagem as Record<string, { criticos: number; altos: number }>
            : {};
          const totalCriticos = Object.values(cnt).reduce((s, f) => s + (f?.criticos ?? 0), 0);
          const totalAltos    = Object.values(cnt).reduce((s, f) => s + (f?.altos    ?? 0), 0);
          setResumoSaude({ ...(res as SaudeResumoRow), total_criticos: totalCriticos, total_altos: totalAltos });
        }
      } catch (e) {
        console.error("[saude] erro ao carregar resumo:", e);
      } finally {
        if (!cancelado) setCarregandoSaude(false);
      }
    }
    void carregarSaude();
    return () => { cancelado = true; };
  }, []);

  useEffect(() => {
    let cancelado = false;
    async function carregarRemessas() {
      try {
        const anoAtual = new Date().getFullYear();
        const resResumo = await fetch(`/api/remessas/resumo?ano=${anoAtual}`).then((r) => r.json());
        if (cancelado) return;
        if (Array.isArray(resResumo)) setResumoRemessas(resResumo as RemessaResumoRow[]);
      } catch { /* silencioso */ } finally {
        if (!cancelado) setCarregandoRemessas(false);
      }
    }
    void carregarRemessas();
    return () => { cancelado = true; };
  }, []);

  useEffect(() => {
    let cancelado = false;
    async function carregarAlertas() {
      try {
        const res = await fetch("/api/alertas-gabinete");
        if (cancelado) return;
        if (!res.ok) { setErro("Erro ao carregar dados."); return; }
        const d = await res.json() as {
          alertas: AlertaRow[];
          resumoProcessos: ProcessoResumoRow | null;
          alertasProcessos: ProcessoAlertaRow[];
        };
        setAlertas(d.alertas ?? []);
        setResumoProcessos(d.resumoProcessos ?? null);
        setAlertasProcessos(d.alertasProcessos ?? []);
      } catch (e) {
        if (!cancelado) setErro(String(e));
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }
    void carregarAlertas();
    return () => { cancelado = true; };
  }, []);

  // Derivados CAUC
  const comPendencia = useMemo(
    () => alertas.filter((row) => row.total_pendencias > 0).sort((a, b) => {
      const ordemNivel = NIVEL_ORDER[a.nivel_alerta] - NIVEL_ORDER[b.nivel_alerta];
      if (ordemNivel !== 0) return ordemNivel;
      return b.total_pendencias - a.total_pendencias;
    }),
    [alertas],
  );
  const totalPendencias = useMemo(
    () => comPendencia.reduce((soma, row) => soma + Number(row.total_pendencias), 0),
    [comPendencia],
  );
  const maiorNivel = comPendencia[0]?.nivel_alerta;
  const caucCriticos = comPendencia.filter((a) => a.nivel_alerta === "alto").length;
  const caucAltos    = comPendencia.filter((a) => a.nivel_alerta === "medio").length;

  // Derivados processos
  const semDadosProcessuais = !resumoProcessos;
  const procSensiveis = resumoProcessos?.processos_sensiveis                     ?? 0;
  const procMais15    = resumoProcessos?.processos_mais_15_dias                  ?? 0;
  const procVencido   = resumoProcessos?.processos_prazo_regulamentar_vencido    ?? 0;

  const registrosModalProcessual = useMemo(() => {
    if (!modalProcessual) return [];
    if (modalProcessual === "hub_processos") return alertasProcessos;
    return alertasProcessos.filter((a) => a.tipo_alerta === modalProcessual);
  }, [alertasProcessos, modalProcessual]);

  // Derivados remessas
  const remessaResumo  = resumoRemessas[0];
  const remessaCriticos = remessaResumo?.total_criticas ?? 0;
  const remessaAltos    = remessaResumo?.total_altas    ?? 0;

  // Derivados saúde
  const saudeCriticos = resumoSaude?.total_criticos ?? 0;
  const saudeAltos    = resumoSaude?.total_altos    ?? 0;

  // Derivados social
  const socialCriticos = useMemo(
    () => alertasSocial.filter((a) => a.nivel_alerta === "ALTO").length,
    [alertasSocial],
  );
  const socialAltos = useMemo(
    () => alertasSocial.filter((a) => a.nivel_alerta === "MEDIO").length,
    [alertasSocial],
  );

  // Derivados SICONFI
  const siconfiCriticos = resumoSiconfi?.alertas_criticos ?? 0;
  const siconfiAltos    = resumoSiconfi?.alertas_altos    ?? 0;

  // Estado geral
  const alertasCarregando = carregando || carregandoRemessas || carregandoSaude || carregandoSocial || carregandoSiconfi;

  useContextoAquiry({
    titulo: "Alertas do Gabinete — Varadouro Digital",
    descricao: "Central de alertas e prioridades para os gabinetes dos conselheiros do TCE-AC.",
    dados: carregando
      ? { carregando: true }
      : {
          regularidade_municipiosComPendencia: comPendencia.length,
          regularidade_totalPendencias: totalPendencias,
          regularidade_maiorNivelAlerta: maiorNivel ?? "sem_alerta",
          processos_total: resumoProcessos?.total_processos ?? null,
          processos_sensiveis: resumoProcessos?.processos_sensiveis ?? null,
          processos_prazoRegulamentarVencido: resumoProcessos?.processos_prazo_regulamentar_vencido ?? null,
          processos_mais15Dias: resumoProcessos?.processos_mais_15_dias ?? null,
          saude_totalAlertas: resumoSaude?.total_alertas ?? null,
          saude_totalCriticos: resumoSaude?.total_criticos ?? null,
          saude_municipiosRiscoCritico: resumoSaude?.municipios_risco_critico ?? null,
          siconfi_municipiosComDado: resumoSiconfi?.municipios_com_dado ?? null,
          siconfi_municipiosSemDado: resumoSiconfi?.municipios_sem_dado ?? null,
          siconfi_alertasCriticos: resumoSiconfi?.alertas_criticos ?? null,
          siconfi_alertasAltos: resumoSiconfi?.alertas_altos ?? null,
        },
    observacoes: [
      "Dados carregados diretamente dos cards visíveis na tela de alertas do gabinete.",
      "Valores representam contagens agregadas. Detalhes por jurisdicionado nos painéis específicos.",
    ],
    fontes: ["CAUC/SICONFI", "eProcessos TCE-AC", "SIOPS/Saúde", "SICONFI/RREO"],
  });

  if (erro) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
        Erro ao carregar dados: {erro}
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── Grade unificada de painéis ── */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {alertasCarregando
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-700/50" />
              ))
            : (() => {
                const paineis = [
                  {
                    key: "cauc",
                    titulo: "Regularidade CAUC",
                    descricao: `${comPendencia.length} município${comPendencia.length !== 1 ? "s" : ""} com pendência · ${totalPendencias} total`,
                    fonte: "CAUC · SICONFI/STN",
                    icone: (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                    ),
                    href: "/painel-cauc" as string | undefined,
                    onClick: undefined as (() => void) | undefined,
                    criticos: caucCriticos,
                    altos: caucAltos,
                    corIcone: "text-violet-500 dark:text-violet-400",
                  },
                  {
                    key: "proc-hub",
                    titulo: "Processos do Gabinete",
                    descricao: procVencido > 0
                      ? `Crítico: ${procVencido} processo${procVencido !== 1 ? "s" : ""} com prazo regulamentar vencido`
                      : "Prazo vencido, sensíveis e parados há +15 dias",
                    fonte: "eProcessos · TCE-AC",
                    icone: <PrazoVencidoIcon />,
                    href: undefined,
                    onClick: !semDadosProcessuais ? () => setModalProcessual("hub_processos") : undefined,
                    // Crítico = prazo regulamentar vencido (mais urgente).
                    criticos: semDadosProcessuais ? 0 : procVencido,
                    altos: 0,
                    chipsExtras: semDadosProcessuais
                      ? []
                      : [
                          { label: "sensíveis", valor: procSensiveis, cor: "rose"  as const },
                          { label: "+15d",      valor: procMais15,    cor: "amber" as const },
                        ],
                    corIcone: "text-red-500 dark:text-red-400",
                  },
                  {
                    key: "remessas",
                    titulo: "Envio SIPAC/TCE",
                    descricao: "Remessas contábeis fora do prazo, sem confirmação ou com críticas",
                    fonte: "Prestação de Contas · TCE-AC",
                    icone: (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <path d="M14 2v6h6" /><path d="M12 17h.01" /><path d="M12 11v3" />
                      </svg>
                    ),
                    href: "/remessas/calendario",
                    onClick: undefined,
                    criticos: remessaCriticos,
                    altos: remessaAltos,
                    corIcone: "text-orange-500 dark:text-orange-400",
                  },
                  {
                    key: "saude",
                    titulo: "Saúde Pública",
                    descricao: "Aplicação em saúde, qualidade da água, vacinação e vigilância",
                    fonte: "SIOPS · SISAGUA · InfoDengue",
                    icone: (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2a5 5 0 1 0 0 10A5 5 0 0 0 12 2z" />
                        <path d="M12 12c-5.33 0-8 2.67-8 4v2h16v-2c0-1.33-2.67-4-8-4z" />
                        <path d="M12 7v5" /><path d="M9.5 9.5h5" />
                      </svg>
                    ),
                    href: "/painel-saude",
                    onClick: undefined,
                    criticos: saudeCriticos,
                    altos: saudeAltos,
                    corIcone: "text-teal-500 dark:text-teal-400",
                  },
                  {
                    key: "social",
                    titulo: "Vulnerabilidade Social",
                    descricao: "Alertas de vulnerabilidade social por município do Acre",
                    fonte: "MIS · MDS",
                    icone: (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    ),
                    href: "/painel-social",
                    onClick: undefined,
                    criticos: socialCriticos,
                    altos: socialAltos,
                    corIcone: "text-purple-500 dark:text-purple-400",
                  },
                  {
                    key: "siconfi",
                    titulo: "Execução Orçamentária",
                    descricao: resumoSiconfi?.municipios_sem_dado
                      ? `${resumoSiconfi.municipios_sem_dado} município${resumoSiconfi.municipios_sem_dado !== 1 ? "s" : ""} sem entrega RREO no período`
                      : "Entrega e análise do RREO por município",
                    fonte: "SICONFI · Tesouro Nacional",
                    icone: (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
                        <line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" />
                      </svg>
                    ),
                    href: "/painel-siconfi",
                    onClick: undefined,
                    criticos: siconfiCriticos,
                    altos: siconfiAltos,
                    corIcone: "text-indigo-500 dark:text-indigo-400",
                  },
                ].sort((a, b) => {
                  if (b.criticos !== a.criticos) return b.criticos - a.criticos;
                  return b.altos - a.altos;
                });

                return paineis.map((p) => (
                  <AcessoRapido
                    key={p.key}
                    titulo={p.titulo}
                    descricao={p.descricao}
                    fonte={p.fonte}
                    icone={p.icone}
                    href={p.href}
                    onClick={p.onClick}
                    criticos={p.criticos}
                    altos={p.altos}
                    corIcone={p.corIcone}
                    chipsExtras={"chipsExtras" in p ? p.chipsExtras : undefined}
                  />
                ));
              })()
          }
        </div>

      {/* ── Funcionalidades em desenvolvimento (colapsadas por padrão) ── */}
      {!alertasCarregando && (
        <div>
          <button
            type="button"
            onClick={() => setMostrarEmBreve((v) => !v)}
            aria-expanded={mostrarEmBreve}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <ChevronRight
              className={`h-3.5 w-3.5 transition-transform ${mostrarEmBreve ? "rotate-90" : ""}`}
            />
            Funcionalidades em desenvolvimento ({ALERTAS_SUGERIDOS.length})
          </button>
          {mostrarEmBreve && (
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ALERTAS_SUGERIDOS.map((alerta) => (
                <div
                  key={alerta.titulo}
                  className="flex items-center gap-2.5 rounded-xl border border-dashed border-gray-200 bg-white p-3 opacity-60 dark:border-gray-700 dark:bg-gray-800"
                >
                  <span className="shrink-0 rounded-lg bg-gray-50 p-1.5 text-gray-400 dark:bg-gray-700/50">
                    {alerta.icone}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-700 dark:text-gray-300">{alerta.titulo}</p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500">{alerta.prioridade}</p>
                  </div>
                  <span className="shrink-0 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                    Em breve
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal processual */}
      {modalProcessual && (
        <ModalProcessual
          tipo={modalProcessual}
          registros={registrosModalProcessual}
          onClose={() => setModalProcessual(null)}
        />
      )}

    </div>
  );
}
