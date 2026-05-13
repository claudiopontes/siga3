"use client";

import { useEffect, useMemo, useState } from "react";
import type React from "react";
import Link from "next/link";

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

type TipoModalProcessual = "processo_sensivel" | "mais_15_dias" | "prazo_regulamentar_vencido";

type AnaliseIA = {
  resumo_executivo: string;
  nivel_risco: "alto" | "medio" | "baixo";
  justificativa_risco: string;
  pontos_de_atencao: string[];
  perguntas_para_o_gabinete: string[];
  sugestao_encaminhamento: string;
  minuta_despacho: string;
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



const NIVEL_ORDER: Record<AlertaRow["nivel_alerta"], number> = {
  alto: 0,
  medio: 1,
  baixo: 2,
};

const NIVEL_PROCESSO_ORDER: Record<string, number> = { alto: 0, medio: 1, baixo: 2 };

// TODO: substituir filtro fixo por gabinete vinculado ao usuário autenticado.
const GABINETE_ATUAL_ID = 20;
const LIMITE_REGISTROS_MODAL = 20;

const MODAIS_PROCESSUAIS: Record<TipoModalProcessual, { titulo: string; subtitulo: string }> = {
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
    descricao: "Bases sem atualização dentro do prazo esperado ou cargas com falha.",
    prioridade: "Operacional",
    tom: "slate",
    icone: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
    ),
  },
  {
    titulo: "Pagamentos atípicos",
    descricao: "Valores relevantes, pagamentos fracionados ou concentração em curto período.",
    prioridade: "Financeiro",
    tom: "emerald",
    icone: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
        <path d="M7 15h4" />
      </svg>
    ),
  },
  {
    titulo: "Fornecedores sensíveis",
    descricao: "Alta recorrência, concentração por ente ou atuação simultânea em muitos contratos.",
    prioridade: "Contratações",
    tom: "amber",
    icone: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    titulo: "Contratos e prazos",
    descricao: "Contratos vencidos, aditivos sucessivos ou vigências próximas do fim.",
    prioridade: "Prazo",
    tom: "rose",
    icone: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M12 18v-6" />
        <path d="M9 15h6" />
      </svg>
    ),
  },
  {
    titulo: "Convênios e transferências",
    descricao: "Prestação de contas pendente, saldo parado ou baixa execução financeira.",
    prioridade: "Transferências",
    tom: "sky",
    icone: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M7 7h10v10H7z" />
        <path d="M3 12h4" />
        <path d="M17 12h4" />
        <path d="M12 3v4" />
        <path d="M12 17v4" />
      </svg>
    ),
  },
  {
    titulo: "Obras e medições",
    descricao: "Medições acima do ritmo físico, obras paradas ou execução sem evidência recente.",
    prioridade: "Obras",
    tom: "orange",
    icone: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 21h18" />
        <path d="M6 21V9l6-4 6 4v12" />
        <path d="M9 21v-8h6v8" />
      </svg>
    ),
  },
];

const NIVEL_BADGE_COR: Record<string, string> = {
  alto:  "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  medio: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  baixo: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};
const NIVEL_BADGE_DOT: Record<string, string> = {
  alto:  "bg-red-500",
  medio: "bg-orange-400",
  baixo: "bg-green-500",
};
const NIVEL_BADGE_LABEL: Record<string, string> = {
  alto:  "Crítico",
  medio: "Alto",
  baixo: "Baixo",
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

function ImplantacaoBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
      Em implantação
    </span>
  );
}

function CardSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-2 h-3 w-28 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="h-7 w-14 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="mt-2 h-3 w-36 rounded bg-gray-200 dark:bg-gray-700" />
    </div>
  );
}

function formatarNumero(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("pt-BR").format(value);
}

function DocumentoAlertaIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M12 17h.01" />
      <path d="M12 11v3" />
    </svg>
  );
}

function RelogioProcessualIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l3 2" />
      <path d="M7 3.5 5 2" />
      <path d="m17 3.5 2-1.5" />
    </svg>
  );
}

function PrazoVencidoIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function ProcessoCard({
  titulo,
  descricao,
  prioridade,
  valor,
  icone,
  destaque = false,
  semDados,
  onDetalhes,
}: {
  titulo: string;
  descricao: string;
  prioridade: string;
  valor: number | null;
  icone: React.ReactNode;
  destaque?: boolean;
  semDados: boolean;
  onDetalhes: () => void;
}) {
  return (
    <div className={`rounded-xl border bg-white p-4 transition hover:border-gray-300 dark:bg-gray-800 dark:hover:border-gray-600 ${
      !semDados && (valor ?? 0) > 0 ? "border-red-200 dark:border-red-800/50" : "border-gray-200 dark:border-gray-700"
    }`}>
      <div className="flex items-start justify-between gap-3">
        <span className={`rounded-full p-1.5 ${
          !semDados && (valor ?? 0) > 0
            ? "bg-red-50 text-red-500 dark:bg-red-900/20 dark:text-red-400"
            : "bg-gray-50 text-gray-500 dark:bg-gray-900/40 dark:text-gray-300"
        }`}>
          {icone}
        </span>
        {semDados ? (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
            Sem dados
          </span>
        ) : destaque ? (
          <NivelBadge nivel="alto" />
        ) : null}
      </div>
      <p className="mt-3 text-sm font-bold text-gray-900 dark:text-white">
        {titulo}
      </p>
      {semDados ? (
        <p className="mt-1 text-xs font-medium text-gray-400 dark:text-gray-500">
          Aguardando carga processual
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {(valor ?? 0) > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600 dark:bg-red-900/30 dark:text-red-400">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              {formatarNumero(valor)} processo{(valor ?? 0) !== 1 ? "s" : ""}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-600 dark:bg-green-900/30 dark:text-green-400">
              Tudo em dia
            </span>
          )}
        </div>
      )}
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        {descricao}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
          {prioridade}
        </p>
      </div>
      <button
        type="button"
        onClick={onDetalhes}
        disabled={semDados}
        className="mt-3 inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
      >
        Ver detalhes
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

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

function SparklesIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3l1.88 5.63L19.5 9l-5.63 1.88L12 16.5l-1.88-5.63L4.5 9l5.63-1.88z" />
      <path d="M5 3l.94 2.81L8.75 6l-2.81.94L5 9.75 4.06 6.94 1.25 6l2.81-.94z" />
      <path d="M19 15l.94 2.81L22.75 18l-2.81.94L19 21.75l-.94-2.81L15.25 18l2.81-.94z" />
    </svg>
  );
}

function ModalAnaliseIA({
  processo,
  analise,
  carregando,
  erro,
  onClose,
}: {
  processo: ProcessoAlertaRow;
  analise: AnaliseIA | null;
  carregando: boolean;
  erro: string | null;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[200000] flex items-center justify-center p-3 sm:p-5">
      <button
        type="button"
        aria-label="Fechar análise de IA"
        className="absolute inset-0 bg-gray-900/80 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-2xl dark:border-violet-800/50 dark:bg-gray-900">
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 bg-gradient-to-r from-violet-50 to-white px-4 py-3 dark:border-gray-700 dark:from-violet-900/20 dark:to-gray-900">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-violet-100 p-1 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400">
                <SparklesIcon />
              </span>
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">
                Análise de IA — Processo {processo.processo ?? "—"}
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {processo.classe ?? "Classe não informada"} · {processo.orgao ?? "Órgão não informado"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Fechar
          </button>
        </div>

        <div className="overflow-auto p-4">
          {carregando && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-500 dark:text-gray-400">
              <svg className="h-6 w-6 animate-spin text-violet-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
              </svg>
              <p className="text-sm">Analisando processo com IA...</p>
            </div>
          )}

          {erro && !carregando && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
              {erro}
            </div>
          )}

          {analise && !carregando && (
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/60">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Resumo executivo</p>
                <p className="text-sm text-gray-800 dark:text-gray-200">{analise.resumo_executivo}</p>
              </div>

              <div className="flex items-start gap-3 rounded-xl border p-4 dark:border-gray-700 dark:bg-gray-800/40" style={{ borderColor: analise.nivel_risco === "alto" ? "#fca5a5" : analise.nivel_risco === "medio" ? "#fcd34d" : "#86efac" }}>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Nível de risco</p>
                    <NivelBadge nivel={analise.nivel_risco} />
                  </div>
                  <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{analise.justificativa_risco}</p>
                </div>
              </div>

              {analise.pontos_de_atencao.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Pontos de atenção</p>
                  <ul className="space-y-1.5">
                    {analise.pontos_de_atencao.map((ponto, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-400" />
                        {ponto}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {analise.perguntas_para_o_gabinete.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Perguntas para o gabinete</p>
                  <ul className="space-y-1.5">
                    {analise.perguntas_para_o_gabinete.map((pergunta, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <span className="mt-0.5 text-violet-400 dark:text-violet-500">?</span>
                        {pergunta}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 dark:border-blue-900/50 dark:bg-blue-900/20">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-blue-400 dark:text-blue-500">Sugestão de encaminhamento</p>
                <p className="text-sm text-blue-800 dark:text-blue-200">{analise.sugestao_encaminhamento}</p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Minuta de despacho</p>
                <pre className="whitespace-pre-wrap text-xs leading-relaxed text-gray-700 dark:text-gray-300 font-sans">{analise.minuta_despacho}</pre>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-amber-100 bg-amber-50 px-4 py-2.5 dark:border-amber-900/40 dark:bg-amber-900/20">
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            ⚠ Análise gerada por IA. Revise antes de utilizar em manifestação oficial.
          </p>
        </div>
      </div>
    </div>
  );
}

function ModalProcessual({
  tipo,
  registros,
  onClose,
}: {
  tipo: TipoModalProcessual;
  registros: ProcessoAlertaRow[];
  onClose: () => void;
}) {
  const config = MODAIS_PROCESSUAIS[tipo];
  const registrosOrdenados = ordenarAlertasProcessuais(registros);
  const registrosVisiveis = registrosOrdenados.slice(0, LIMITE_REGISTROS_MODAL);
  const temMaisRegistros = registrosOrdenados.length > LIMITE_REGISTROS_MODAL;

  const [processoSelecionado, setProcessoSelecionado] = useState<ProcessoAlertaRow | null>(null);
  const [analiseIA, setAnaliseIA] = useState<AnaliseIA | null>(null);
  const [carregandoIA, setCarregandoIA] = useState(false);
  const [erroIA, setErroIA] = useState<string | null>(null);

  async function analisarComIA(alerta: ProcessoAlertaRow) {
    setProcessoSelecionado(alerta);
    setAnaliseIA(null);
    setErroIA(null);
    setCarregandoIA(true);

    try {
      const resposta = await fetch("/api/ia/analisar-processo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(alerta),
      });

      const dados = await resposta.json();

      if (!resposta.ok) {
        setErroIA(dados?.error ?? "Erro ao analisar processo.");
        return;
      }

      setAnaliseIA(dados as AnaliseIA);
    } catch {
      setErroIA("Falha na comunicação com o servidor.");
    } finally {
      setCarregandoIA(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[120000] flex items-center justify-center p-3 sm:p-5">
        <button
          type="button"
          aria-label="Fechar detalhes processuais"
          className="absolute inset-0 bg-gray-900/70 backdrop-blur-[1px]"
          onClick={onClose}
        />
        <div className="relative z-10 flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-700">
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white">{config.titulo}</h2>
              <p className="mt-0.5 max-w-3xl text-xs text-gray-500 dark:text-gray-400">{config.subtitulo}</p>
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
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Processo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Classe</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Órgão</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Atividade atual</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Dias no setor</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Atraso</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">IA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                  {registrosVisiveis.map((alerta) => (
                    <tr key={`${alerta.tipo_alerta}-${alerta.processo}-${alerta.duracao_setor_dias}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                      <td className="px-4 py-3"><NivelBadge nivel={alerta.nivel_alerta} /></td>
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{alerta.processo ?? "—"}</td>
                      <td className="max-w-xs px-4 py-3 text-xs text-gray-700 dark:text-gray-300">{alerta.classe ?? "—"}</td>
                      <td className="max-w-sm px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{alerta.orgao ?? "Órgão não informado"}</td>
                      <td className="max-w-xs px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{alerta.atividade_atual ?? "—"}</td>
                      <td className="px-4 py-3 text-center text-xs font-bold text-gray-700 dark:text-gray-300">
                        {formatarNumero(alerta.duracao_setor_dias)}
                      </td>
                      <td className="px-4 py-3 text-center text-xs font-bold text-red-600 dark:text-red-400">
                        {formatarNumero(alerta.dias_em_atraso)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => analisarComIA(alerta)}
                          className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600"
                        >
                          <SparklesIcon />
                          Analisar com IA
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {temMaisRegistros ? (
            <div className="border-t border-gray-100 px-4 py-3 text-xs text-gray-400 dark:border-gray-700 dark:text-gray-500">
              Exibindo os 20 principais registros. A página analítica completa será implementada em etapa futura.
            </div>
          ) : null}
        </div>
      </div>

      {processoSelecionado && (
        <ModalAnaliseIA
          processo={processoSelecionado}
          analise={analiseIA}
          carregando={carregandoIA}
          erro={erroIA}
          onClose={() => {
            setProcessoSelecionado(null);
            setAnaliseIA(null);
            setErroIA(null);
          }}
        />
      )}
    </>
  );
}

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

  // Busca alertas de vulnerabilidade social (MIS/MDS)
  useEffect(() => {
    let cancelado = false;
    async function carregarSocial() {
      try {
        const res = await fetch("/api/social/mis/alertas").then((r) => r.json());
        if (cancelado) return;
        if (Array.isArray(res)) setAlertasSocial(res as SocialAlertaRow[]);
      } catch {
        // silencioso
      } finally {
        if (!cancelado) setCarregandoSocial(false);
      }
    }
    void carregarSocial();
    return () => { cancelado = true; };
  }, []);

  // Busca resumo consolidado de Saúde Pública
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

  // Busca remessas contábeis via API local (PostgreSQL)
  useEffect(() => {
    let cancelado = false;
    async function carregarRemessas() {
      try {
        const anoAtual = new Date().getFullYear();
        const resResumo = await fetch(`/api/remessas/resumo?ano=${anoAtual}`).then((r) => r.json());
        if (cancelado) return;
        if (Array.isArray(resResumo)) setResumoRemessas(resResumo as RemessaResumoRow[]);
      } catch {
        // silencioso — card mostrará sem dados
      } finally {
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
        if (!res.ok) {
          setErro("Erro ao carregar dados.");
          return;
        }
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

    return () => {
      cancelado = true;
    };
  }, []);

  const comPendencia = useMemo(
    () =>
      alertas
        .filter((row) => row.total_pendencias > 0)
        .sort((a, b) => {
          const ordemNivel = NIVEL_ORDER[a.nivel_alerta] - NIVEL_ORDER[b.nivel_alerta];
          if (ordemNivel !== 0) return ordemNivel;
          return b.total_pendencias - a.total_pendencias;
        }),
    [alertas]
  );

  const totalPendencias = useMemo(
    () => comPendencia.reduce((soma, row) => soma + Number(row.total_pendencias), 0),
    [comPendencia]
  );

  const maiorNivel = comPendencia[0]?.nivel_alerta;
  const semDadosProcessuais = !resumoProcessos;
  const registrosModalProcessual = useMemo(
    () => (modalProcessual ? alertasProcessos.filter((alerta) => alerta.tipo_alerta === modalProcessual) : []),
    [alertasProcessos, modalProcessual]
  );

  if (erro) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
        Erro ao carregar dados: {erro}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {carregando ? (
          <CardSkeleton />
        ) : (
          <div className={`rounded-xl border bg-white p-4 transition hover:border-gray-300 dark:bg-gray-800 dark:hover:border-gray-600 ${
            maiorNivel === "alto" ? "border-red-200 dark:border-red-800/50" : "border-gray-200 dark:border-gray-700"
          }`}>
            <div className="flex items-start justify-between gap-3">
              <span className={`rounded-full p-1.5 ${
                maiorNivel === "alto"
                  ? "bg-red-50 text-red-500 dark:bg-red-900/20 dark:text-red-400"
                  : "bg-blue-50 text-blue-500 dark:bg-blue-900/20 dark:text-blue-400"
              }`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </span>
              {maiorNivel ? <NivelBadge nivel={maiorNivel} /> : null}
            </div>
            <p className="mt-3 text-sm font-bold text-gray-900 dark:text-white">Regularidade CAUC</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {comPendencia.length > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600 dark:bg-red-900/30 dark:text-red-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  {comPendencia.length} município{comPendencia.length !== 1 ? "s" : ""} com pendência
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-600 dark:bg-green-900/30 dark:text-green-400">
                  Tudo em dia
                </span>
              )}
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {totalPendencias} pendências totais. Detalhamento por município e item no painel CAUC.
            </p>
            <div className="mt-2">
              <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700">
                <span className="font-medium text-violet-600 dark:text-violet-400">CAUC</span>
                <span className="text-gray-400 dark:text-gray-500">{" · "}SICONFI/STN</span>
              </span>
            </div>
            <Link
              href="/painel-cauc"
              className="mt-3 inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              Ver Painel
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </Link>
          </div>
        )}

        {carregando ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : (
          <>
            <ProcessoCard
              titulo="Processos sensíveis"
              descricao="Cautelares, denúncias, representações, petições e pedidos de vista no gabinete."
              prioridade="eProcess TCE/AC"
              valor={resumoProcessos?.processos_sensiveis ?? null}
              icone={<DocumentoAlertaIcon />}
              semDados={semDadosProcessuais}
              onDetalhes={() => setModalProcessual("processo_sensivel")}
            />
            <ProcessoCard
              titulo="Processos há mais de 15 dias"
              descricao="Processos aguardando movimentação há mais de 15 dias no gabinete atual."
              prioridade="eProcess TCE/AC"
              valor={resumoProcessos?.processos_mais_15_dias ?? null}
              icone={<RelogioProcessualIcon />}
              semDados={semDadosProcessuais}
              onDetalhes={() => setModalProcessual("mais_15_dias")}
            />
            <ProcessoCard
              titulo="Prazo regulamentar vencido"
              descricao="Processos cujo tempo de registro ultrapassou o prazo regulamentar da classe."
              prioridade="eProcess TCE/AC"
              valor={resumoProcessos?.processos_prazo_regulamentar_vencido ?? null}
              icone={<PrazoVencidoIcon />}
              destaque
              semDados={semDadosProcessuais}
              onDetalhes={() => setModalProcessual("prazo_regulamentar_vencido")}
            />
          </>
        )}

        {/* Card remessas contábeis — dados reais */}
        {carregandoRemessas ? (
          <CardSkeleton />
        ) : (() => {
          const resumo = resumoRemessas[0];
          const totalCriticos = resumo?.total_criticas ?? 0;
          const totalAltos = resumo?.total_altas ?? 0;
          const totalAlertas = totalCriticos + totalAltos;
          const semDados = !resumo;
          return (
            <div className={`rounded-xl border bg-white p-4 dark:bg-gray-800 ${
              totalCriticos > 0
                ? "border-red-200 dark:border-red-800/50"
                : totalAltos > 0
                  ? "border-amber-200 dark:border-amber-800/50"
                  : "border-gray-200 dark:border-gray-700"
            }`}>
              <div className="flex items-start justify-between gap-3">
                <span className={`rounded-full p-1.5 ${
                  totalCriticos > 0
                    ? "bg-red-50 text-red-500 dark:bg-red-900/20 dark:text-red-400"
                    : "bg-orange-50 text-orange-500 dark:bg-orange-900/20 dark:text-orange-400"
                }`}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                    <path d="M12 17h.01" /><path d="M12 11v3" />
                  </svg>
                </span>
                {semDados ? (
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">Sem dados</span>
                ) : totalCriticos > 0 ? (
                  <NivelBadge nivel="alto" />
                ) : totalAltos > 0 ? (
                  <NivelBadge nivel="medio" />
                ) : null}
              </div>
              <p className="mt-3 text-sm font-bold text-gray-900 dark:text-white">Remessas contábeis</p>
              {semDados ? (
                <p className="mt-1 text-xs font-medium text-gray-400 dark:text-gray-500">Aguardando carga de dados</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {totalCriticos > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600 dark:bg-red-900/30 dark:text-red-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                      {totalCriticos} Crítico{totalCriticos !== 1 ? "s" : ""}
                    </span>
                  )}
                  {totalAltos > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                      {totalAltos} Alto{totalAltos !== 1 ? "s" : ""}
                    </span>
                  )}
                  {totalAlertas === 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-600 dark:bg-green-900/30 dark:text-green-400">
                      Tudo em dia
                    </span>
                  )}
                </div>
              )}
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Prestação de contas</p>
              <Link
                href="/remessas/calendario"
                className="mt-3 inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                Ver Painel
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                </svg>
              </Link>
            </div>
          );
        })()}


        {/* Card Saúde Pública — consolidado SIOPS + CNES/UBS + SISAGUA */}
        {carregandoSaude ? (
          <CardSkeleton />
        ) : (() => {
          const semDados = !resumoSaude;
          const criticos = resumoSaude?.total_criticos ?? 0;
          const altos = resumoSaude?.total_altos ?? 0;
          const munCritico = resumoSaude?.municipios_risco_critico ?? 0;
          const munAfetados = resumoSaude?.total_municipios_afetados ?? 0;
          return (
            <div className={`rounded-xl border bg-white p-4 dark:bg-gray-800 ${
              criticos > 0
                ? "border-red-200 dark:border-red-800/50"
                : altos > 0
                  ? "border-amber-200 dark:border-amber-800/50"
                  : "border-gray-200 dark:border-gray-700"
            }`}>
              <div className="flex items-start justify-between gap-3">
                <span className={`rounded-full p-1.5 ${
                  criticos > 0
                    ? "bg-red-50 text-red-500 dark:bg-red-900/20 dark:text-red-400"
                    : "bg-teal-50 text-teal-500 dark:bg-teal-900/20 dark:text-teal-400"
                }`}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2a5 5 0 1 0 0 10A5 5 0 0 0 12 2z" />
                    <path d="M12 12c-5.33 0-8 2.67-8 4v2h16v-2c0-1.33-2.67-4-8-4z" />
                    <path d="M12 7v5" /><path d="M9.5 9.5h5" />
                  </svg>
                </span>
                {semDados ? (
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">Sem dados</span>
                ) : criticos > 0 ? (
                  <NivelBadge nivel="alto" />
                ) : altos > 0 ? (
                  <NivelBadge nivel="medio" />
                ) : null}
              </div>
              <p className="mt-3 text-sm font-bold text-gray-900 dark:text-white">Saúde Pública</p>
              {semDados ? (
                <p className="mt-1 text-xs font-medium text-gray-400 dark:text-gray-500">Dados de saúde ainda não carregados.</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {criticos > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600 dark:bg-red-900/30 dark:text-red-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                      {criticos} Crítico{criticos !== 1 ? "s" : ""}
                    </span>
                  )}
                  {altos > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                      {altos} Alto{altos !== 1 ? "s" : ""}
                    </span>
                  )}
                  {criticos === 0 && altos === 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-600 dark:bg-green-900/30 dark:text-green-400">
                      Tudo em dia
                    </span>
                  )}
                </div>
              )}
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Alertas de aplicação, estrutura da rede, qualidade da água e vigilância epidemiológica.
              </p>
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">SIOPS · CNES/UBS · SISAGUA · InfoDengue</p>
              <Link
                href="/painel-saude"
                className="mt-3 inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                Ver painel
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                </svg>
              </Link>
            </div>
          );
        })()}

        {/* Card Vulnerabilidade Social — dados MIS/MDS */}
        {carregandoSocial ? (
          <CardSkeleton />
        ) : (() => {
          const semDados = alertasSocial.length === 0;
          const totalCriticos = alertasSocial.filter((a) => a.nivel_alerta === "ALTO").length;
          const totalAltos    = alertasSocial.filter((a) => a.nivel_alerta === "MEDIO").length;
          const nivelMax = totalCriticos > 0 ? "alto" : totalAltos > 0 ? "medio" : null;
          const munCritico = alertasSocial.find((a) => a.nivel_alerta === "ALTO")?.nome_municipio ?? null;
          return (
            <div className={`rounded-xl border bg-white p-4 dark:bg-gray-800 ${
              totalCriticos > 0
                ? "border-red-200 dark:border-red-800/50"
                : totalAltos > 0
                  ? "border-amber-200 dark:border-amber-800/50"
                  : "border-gray-200 dark:border-gray-700"
            }`}>
              <div className="flex items-start justify-between gap-3">
                <span className={`rounded-full p-1.5 ${
                  totalCriticos > 0
                    ? "bg-red-50 text-red-500 dark:bg-red-900/20 dark:text-red-400"
                    : "bg-purple-50 text-purple-500 dark:bg-purple-900/20 dark:text-purple-400"
                }`}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </span>
                {semDados ? (
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">Sem dados</span>
                ) : nivelMax ? (
                  <NivelBadge nivel={nivelMax} />
                ) : null}
              </div>
              <p className="mt-3 text-sm font-bold text-gray-900 dark:text-white">Vulnerabilidade Social</p>
              {semDados ? (
                <p className="mt-1 text-xs font-medium text-gray-400 dark:text-gray-500">Aguardando carga de dados</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {totalCriticos > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600 dark:bg-red-900/30 dark:text-red-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                      {totalCriticos} Crítico{totalCriticos !== 1 ? "s" : ""}
                    </span>
                  )}
                  {totalAltos > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                      {totalAltos} Alto{totalAltos !== 1 ? "s" : ""}
                    </span>
                  )}
                  {totalCriticos === 0 && totalAltos === 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-600 dark:bg-green-900/30 dark:text-green-400">
                      Sem alertas ativos
                    </span>
                  )}
                </div>
              )}
              {munCritico && (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Destaque: <span className="font-medium text-gray-700 dark:text-gray-300">{munCritico}</span>
                </p>
              )}
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">MIS · MDS</p>
              <Link
                href="/painel-social"
                className="mt-3 inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                Ver Painel
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                </svg>
              </Link>
            </div>
          );
        })()}

        {ALERTAS_SUGERIDOS.map((alerta) => (
          <div
            key={alerta.titulo}
            className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="rounded-full bg-gray-50 p-1.5 text-gray-500 dark:bg-gray-900/40 dark:text-gray-300">
                {alerta.icone}
              </span>
              <ImplantacaoBadge />
            </div>
            <p className="mt-3 text-sm font-bold text-gray-900 dark:text-white">
              {alerta.titulo}
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {alerta.descricao}
            </p>
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {alerta.prioridade}
            </p>
          </div>
        ))}
      </div>

      {modalProcessual ? (
        <ModalProcessual
          tipo={modalProcessual}
          registros={registrosModalProcessual}
          onClose={() => setModalProcessual(null)}
        />
      ) : null}


    </div>
  );
}
