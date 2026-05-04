"use client";

import { useEffect, useMemo, useState } from "react";
import type React from "react";
import Link from "next/link";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

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

function NivelBadge({ nivel }: { nivel: string | null | undefined }) {
  if (nivel === "alto") {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
        Alto
      </span>
    );
  }

  if (nivel === "medio") {
    return (
      <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
        Médio
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
      Baixo
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
      destaque ? "border-red-200 dark:border-red-800/50" : "border-gray-200 dark:border-gray-700"
    }`}>
      <div className="flex items-start justify-between gap-3">
        <span className={`rounded-full p-1.5 ${
          destaque
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
        <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
          {formatarNumero(valor)}
        </p>
      )}
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
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
  );
}

export default function AlertasGabineteClient() {
  const supabaseDisponivel = Boolean(isSupabaseConfigured && supabase);
  const [alertas, setAlertas] = useState<AlertaRow[]>([]);
  const [resumoProcessos, setResumoProcessos] = useState<ProcessoResumoRow | null>(null);
  const [alertasProcessos, setAlertasProcessos] = useState<ProcessoAlertaRow[]>([]);
  const [modalProcessual, setModalProcessual] = useState<TipoModalProcessual | null>(null);
  const [carregando, setCarregando] = useState(supabaseDisponivel);
  const [erro, setErro] = useState<string | null>(
    supabaseDisponivel ? null : "Supabase não configurado."
  );

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      return;
    }

    const clienteSupabase = supabase;
    let cancelado = false;

    async function carregarAlertas() {
      try {
        const [resAlertas, resResumoProcessos, resAlertasProcessos] = await Promise.all([
          clienteSupabase
            .from("vw_alertas_cauc_ac")
            .select("codigo_ibge,nome_ente,total_pendencias,nivel_alerta")
            .order("total_pendencias", { ascending: false }),
          clienteSupabase
            .from("vw_processos_gabinete_por_gabinete")
            .select("id_grupo,grupo_atual,total_processos,processos_mais_15_dias,processos_sensiveis,processos_prazo_regulamentar_vencido,maior_duracao_setor,media_dias_setor,atualizado_em")
            .eq("id_grupo", GABINETE_ATUAL_ID)
            .limit(1)
            .maybeSingle(),
          clienteSupabase
            .from("vw_alertas_processos_gabinete")
            .select("tipo_alerta,titulo_alerta,nivel_alerta,processo,grupo_atual,id_grupo,relator,classe,assunto,orgao,atividade_atual,duracao_setor_dias,dias_em_atraso,data_chegada_setor_atual,atualizado_em")
            .eq("id_grupo", GABINETE_ATUAL_ID),
        ]);

        if (cancelado) return;

        if (resAlertas.error) {
          setErro(resAlertas.error.message);
          return;
        }

        setAlertas((resAlertas.data ?? []) as AlertaRow[]);
        if (!resResumoProcessos.error && resResumoProcessos.data) {
          setResumoProcessos(resResumoProcessos.data as ProcessoResumoRow);
        } else {
          setResumoProcessos(null);
          if (resResumoProcessos.error) console.error("Erro ao carregar resumo processual:", resResumoProcessos.error.message);
        }

        if (!resAlertasProcessos.error) {
          setAlertasProcessos((resAlertasProcessos.data ?? []) as ProcessoAlertaRow[]);
        } else {
          setAlertasProcessos([]);
          console.error("Erro ao carregar alertas processuais:", resAlertasProcessos.error.message);
        }
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
    () => comPendencia.reduce((soma, row) => soma + row.total_pendencias, 0),
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
          <div className="rounded-xl border border-blue-200 bg-white p-4 dark:border-blue-800/40 dark:bg-gray-800">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-500 dark:text-blue-400">
                  Regularidade CAUC
                </p>
                <p className="mt-1.5 text-2xl font-bold text-gray-900 dark:text-white">
                  {comPendencia.length}
                  <span className="ml-1 text-sm font-normal text-gray-400">
                    de {alertas.length} municípios com pendência CAUC
                  </span>
                </p>
              </div>
              <span className="rounded-full bg-blue-50 p-1.5 text-blue-500 dark:bg-blue-900/20">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-red-600 dark:text-red-400">{totalPendencias}</span>
              <span className="text-xs text-gray-400">pendências totais</span>
              {maiorNivel && <NivelBadge nivel={maiorNivel} />}
            </div>

            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              O detalhamento por município e item fica no painel próprio do CAUC.
            </p>

            <Link
              href="/painel-cauc"
              className="mt-3 inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              Ver detalhes
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
              prioridade="Processual"
              valor={resumoProcessos?.processos_sensiveis ?? null}
              icone={<DocumentoAlertaIcon />}
              semDados={semDadosProcessuais}
              onDetalhes={() => setModalProcessual("processo_sensivel")}
            />
            <ProcessoCard
              titulo="Processos há mais de 15 dias"
              descricao="Processos aguardando movimentação há mais de 15 dias no gabinete atual."
              prioridade="Prazo processual"
              valor={resumoProcessos?.processos_mais_15_dias ?? null}
              icone={<RelogioProcessualIcon />}
              semDados={semDadosProcessuais}
              onDetalhes={() => setModalProcessual("mais_15_dias")}
            />
            <ProcessoCard
              titulo="Prazo regulamentar vencido"
              descricao="Processos cujo tempo de registro ultrapassou o prazo regulamentar da classe."
              prioridade="Alerta processual"
              valor={resumoProcessos?.processos_prazo_regulamentar_vencido ?? null}
              icone={<PrazoVencidoIcon />}
              destaque
              semDados={semDadosProcessuais}
              onDetalhes={() => setModalProcessual("prazo_regulamentar_vencido")}
            />
          </>
        )}

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
