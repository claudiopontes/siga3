"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type AlertaRow = {
  codigo_ibge: string;
  nome_ente: string;
  total_pendencias: number;
  nivel_alerta: "alto" | "medio" | "baixo";
};

const NIVEL_ORDER: Record<AlertaRow["nivel_alerta"], number> = {
  alto: 0,
  medio: 1,
  baixo: 2,
};

const ALERTAS_SUGERIDOS = [
  {
    titulo: "Processos sensíveis",
    descricao: "Cautelares, denúncias, representações, petições e pedidos de vista que exigem atenção do gabinete.",
    prioridade: "Processual",
    tom: "red",
    icone: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M12 17h.01" />
        <path d="M12 11v3" />
      </svg>
    ),
  },
  {
    titulo: "Processos há mais de 15 dias",
    descricao: "Processos sem movimentação recente, pendentes de análise ou aguardando providência do gabinete.",
    prioridade: "Prazo processual",
    tom: "indigo",
    icone: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l3 2" />
        <path d="M7 3.5 5 2" />
        <path d="m17 3.5 2-1.5" />
      </svg>
    ),
  },
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

function NivelBadge({ nivel }: { nivel: AlertaRow["nivel_alerta"] }) {
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

export default function AlertasGabineteClient() {
  const supabaseDisponivel = Boolean(isSupabaseConfigured && supabase);
  const [alertas, setAlertas] = useState<AlertaRow[]>([]);
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
        const resAlertas = await clienteSupabase
          .from("vw_alertas_cauc_ac")
          .select("codigo_ibge,nome_ente,total_pendencias,nivel_alerta")
          .order("total_pendencias", { ascending: false });

        if (cancelado) return;

        if (resAlertas.error) {
          setErro(resAlertas.error.message);
          return;
        }

        setAlertas((resAlertas.data ?? []) as AlertaRow[]);
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
    </div>
  );
}
