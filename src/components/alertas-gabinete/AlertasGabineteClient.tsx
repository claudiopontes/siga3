"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

// ─── Tipos ───────────────────────────────────────────────────────────────────

type AlertaRow = {
  codigo_ibge: string;
  nome_ente: string;
  uf: string;
  total_itens: number;
  total_pendencias: number;
  total_regulares: number;
  data_referencia: string;
  atualizado_em: string;
  nivel_alerta: "alto" | "medio" | "baixo";
  descricao_alerta: string;
};

type UltimaCarga = {
  carga_id: number;
  data_referencia: string;
  status: string;
  registros: number;
  finalizado_em: string;
  fonte: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const NIVEL_ORDER: Record<string, number> = { alto: 0, medio: 1, baixo: 2 };

function formatarData(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

function formatarDataHora(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function NivelBadge({ nivel }: { nivel: string }) {
  if (nivel === "alto")
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
        Alto
      </span>
    );
  if (nivel === "medio")
    return (
      <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
        Médio
      </span>
    );
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
    <div className="animate-pulse rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-3 h-3 w-28 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="h-8 w-16 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="mt-3 h-3 w-36 rounded bg-gray-200 dark:bg-gray-700" />
    </div>
  );
}

// ─── Cards futuros (em implantação) ──────────────────────────────────────────

const CARDS_IMPLANTACAO = [
  {
    titulo: "Dados Atrasados",
    descricao: "Monitoramento de cargas e bases desatualizadas.",
    icone: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
    ),
  },
  {
    titulo: "Pagamentos Relevantes",
    descricao: "Identificação de pagamentos de alta materialidade.",
    icone: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
    ),
  },
  {
    titulo: "Fornecedores Sensíveis",
    descricao: "Fornecedores com concentração, recorrência ou atuação em múltiplos entes.",
    icone: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    ),
  },
  {
    titulo: "Contratos com Risco",
    descricao: "Contratos vencidos, próximos do vencimento ou com execução atípica.",
    icone: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
    ),
  },
];

const CATEGORIAS = [
  { label: "CAUC", cor: "blue", real: true },
  { label: "Dados Atrasados", cor: "gray", real: false },
  { label: "Pagamentos Relevantes", cor: "gray", real: false },
  { label: "Fornecedores Sensíveis", cor: "gray", real: false },
  { label: "Contratos com Risco", cor: "gray", real: false },
];

// ─── Componente principal ────────────────────────────────────────────────────

export default function AlertasGabineteClient() {
  const [alertas, setAlertas] = useState<AlertaRow[]>([]);
  const [carga, setCarga] = useState<UltimaCarga | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 10;

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setErro("Supabase não configurado.");
      setCarregando(false);
      return;
    }
    Promise.all([
      supabase.from("vw_alertas_cauc_ac").select("*").order("total_pendencias", { ascending: false }),
      supabase.from("vw_cauc_ultima_carga").select("*").limit(1).single(),
    ])
      .then(([resAlertas, resCarga]) => {
        if (resAlertas.error) { setErro(resAlertas.error.message); return; }
        setAlertas((resAlertas.data ?? []) as AlertaRow[]);
        if (!resCarga.error && resCarga.data) setCarga(resCarga.data as UltimaCarga);
      })
      .catch((e) => setErro(String(e)))
      .finally(() => setCarregando(false));
  }, []);

  // ─── Derivações ─────────────────────────────────────────────────────────────

  const comPendencia = useMemo(
    () => alertas.filter((r) => r.total_pendencias > 0).sort((a, b) => {
      const nd = NIVEL_ORDER[a.nivel_alerta] - NIVEL_ORDER[b.nivel_alerta];
      if (nd !== 0) return nd;
      return b.total_pendencias - a.total_pendencias;
    }),
    [alertas]
  );

  const totalPendencias = useMemo(
    () => comPendencia.reduce((s, r) => s + r.total_pendencias, 0),
    [comPendencia]
  );

  const maiorNivel = comPendencia.length > 0 ? comPendencia[0].nivel_alerta : null;

  const rankingTop10 = useMemo(
    () => [...alertas].sort((a, b) => b.total_pendencias - a.total_pendencias).slice(0, 10),
    [alertas]
  );

  const paginaAtual = comPendencia.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const totalPaginas = Math.ceil(comPendencia.length / POR_PAGINA);

  if (erro) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
        Erro ao carregar dados: {erro}
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── 1. Cabeçalho ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">
              Alertas do Gabinete
            </h1>
            <p className="mt-0.5 max-w-xl text-sm text-gray-500 dark:text-gray-400">
              Identifique rapidamente os jurisdicionados, temas e ocorrências que exigem atenção prioritária do controle externo.
            </p>
          </div>
          {carga && (
            <div className="shrink-0 text-right text-xs text-gray-400 dark:text-gray-500">
              <p className="font-medium text-gray-600 dark:text-gray-300">
                Última carga CAUC
              </p>
              <p>{formatarDataHora(carga.finalizado_em)}</p>
              <p className="mt-0.5">Referência: {formatarData(carga.data_referencia)}</p>
              <p className="mt-0.5 capitalize">{carga.fonte.replace(/_/g, " ")}</p>
            </div>
          )}
        </div>
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-400">
          ⚠️ Dados CAUC utilizados como <strong>informação gerencial de alerta</strong>. A confirmação oficial deve ser feita no extrato CAUC.
        </div>
      </div>

      {/* ── 2. Cards de resumo ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">

        {/* Card CAUC — dados reais */}
        {carregando ? (
          <CardSkeleton />
        ) : (
          <div className="rounded-xl border border-blue-200 bg-white p-5 dark:border-blue-800/40 dark:bg-gray-800 sm:col-span-2 xl:col-span-1">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-500 dark:text-blue-400">
                Regularidade CAUC
              </p>
              <span className="rounded-full bg-blue-50 p-1.5 text-blue-500 dark:bg-blue-900/20">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </span>
            </div>
            <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
              {comPendencia.length}
              <span className="ml-1 text-sm font-normal text-gray-400">/ {alertas.length}</span>
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              municípios com pendência
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-sm font-bold text-red-600 dark:text-red-400">{totalPendencias}</span>
              <span className="text-xs text-gray-400">pendências totais</span>
              {maiorNivel && <NivelBadge nivel={maiorNivel} />}
            </div>
            <Link
              href="/painel-cauc"
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Ver análise CAUC
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </Link>
          </div>
        )}

        {/* Cards em implantação */}
        {CARDS_IMPLANTACAO.map((card) => (
          <div
            key={card.titulo}
            className="rounded-xl border border-gray-200 bg-white p-5 opacity-70 dark:border-gray-700 dark:bg-gray-800"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                {card.titulo}
              </p>
              <span className="rounded-full bg-gray-100 p-1.5 text-gray-400 dark:bg-gray-700">
                {card.icone}
              </span>
            </div>
            <div className="mt-3">
              <ImplantacaoBadge />
            </div>
            <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
              {card.descricao}
            </p>
          </div>
        ))}
      </div>

      {/* ── 3. Alertas prioritários ──────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-700">
          <div>
            <h2 className="text-sm font-bold text-gray-800 dark:text-white">
              Alertas prioritários
            </h2>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Municípios com pendências CAUC na última carga — ordenados por criticidade
            </p>
          </div>
          <Link
            href="/painel-cauc"
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Ver todos no CAUC →
          </Link>
        </div>

        {carregando ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700" />
            ))}
          </div>
        ) : comPendencia.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-medium text-green-600 dark:text-green-400">
              ✓ Nenhuma pendência CAUC identificada na última carga para os municípios do Acre.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Nível</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Jurisdicionado</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Tipo</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Descrição</th>
                    <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Pendências</th>
                    <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Referência</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                  {paginaAtual.map((row) => (
                    <tr
                      key={row.codigo_ibge}
                      className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 ${
                        row.nivel_alerta === "alto" ? "border-l-2 border-red-400" : ""
                      }`}
                    >
                      <td className="px-5 py-3">
                        <NivelBadge nivel={row.nivel_alerta} />
                      </td>
                      <td className="px-5 py-3 font-medium text-gray-900 dark:text-white">
                        {row.nome_ente}
                      </td>
                      <td className="px-5 py-3">
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                          CAUC
                        </span>
                      </td>
                      <td className="max-w-xs px-5 py-3 text-xs text-gray-500 dark:text-gray-400">
                        {row.descricao_alerta}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className="font-bold text-red-600 dark:text-red-400">
                          {row.total_pendencias}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-center text-xs text-gray-400">
                        {formatarData(row.data_referencia)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href="/painel-cauc"
                          className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                        >
                          Ver CAUC
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            {totalPaginas > 1 && (
              <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 dark:border-gray-700">
                <p className="text-xs text-gray-400">
                  {comPendencia.length} municípios com pendência · página {pagina} de {totalPaginas}
                </p>
                <div className="flex gap-1">
                  <button
                    disabled={pagina === 1}
                    onClick={() => setPagina((p) => p - 1)}
                    className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    ← Anterior
                  </button>
                  <button
                    disabled={pagina === totalPaginas}
                    onClick={() => setPagina((p) => p + 1)}
                    className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    Próxima →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── 4. Ranking de jurisdicionados ────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-700">
          <h2 className="text-sm font-bold text-gray-800 dark:text-white">
            Jurisdicionados com maior atenção
          </h2>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Ranking por total de pendências CAUC
          </p>
        </div>
        <div className="p-5">
          {carregando ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-9 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700" />
              ))}
            </div>
          ) : rankingTop10.filter((r) => r.total_pendencias > 0).length === 0 ? (
            <p className="text-center text-sm text-green-600 dark:text-green-400">
              ✓ Nenhum município com pendências CAUC.
            </p>
          ) : (
            <div className="space-y-2">
              {rankingTop10
                .filter((r) => r.total_pendencias > 0)
                .map((row, i) => (
                  <div key={row.codigo_ibge} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <span className="w-5 shrink-0 text-center text-xs font-bold text-gray-400">
                      #{i + 1}
                    </span>
                    <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200">
                      {row.nome_ente}
                    </span>
                    {/* barra proporcional */}
                    <div className="hidden w-32 sm:block">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width: `${(row.total_pendencias / (rankingTop10[0]?.total_pendencias || 1)) * 100}%`,
                            backgroundColor: row.nivel_alerta === "alto" ? "#ef4444" : row.nivel_alerta === "medio" ? "#eab308" : "#22c55e",
                          }}
                        />
                      </div>
                    </div>
                    <span className="w-6 text-right text-sm font-bold text-red-600 dark:text-red-400">
                      {row.total_pendencias}
                    </span>
                    <NivelBadge nivel={row.nivel_alerta} />
                    <span className="hidden text-xs text-gray-400 sm:block">
                      {formatarData(row.atualizado_em)}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* ── 5. Categorias de alerta ──────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-700">
          <h2 className="text-sm font-bold text-gray-800 dark:text-white">
            Categorias de alerta
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-5">
          {CATEGORIAS.map((cat) => (
            <div
              key={cat.label}
              className={`rounded-xl border p-4 text-center ${
                cat.real
                  ? "border-blue-200 bg-blue-50 dark:border-blue-800/40 dark:bg-blue-900/10"
                  : "border-gray-200 bg-gray-50 opacity-60 dark:border-gray-700 dark:bg-gray-800/50"
              }`}
            >
              <p className={`text-xs font-semibold ${cat.real ? "text-blue-700 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"}`}>
                {cat.label}
              </p>
              {cat.real ? (
                <p className="mt-1 text-lg font-bold text-blue-700 dark:text-blue-400">
                  {carregando ? "…" : comPendencia.length}
                </p>
              ) : (
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Em implantação</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── 6. O que mudou ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-sm font-bold text-gray-800 dark:text-white">
          O que mudou desde a última atualização
        </h2>
        {carga ? (
          <div className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
            <p>
              Última carga CAUC:{" "}
              <span className="font-medium text-gray-700 dark:text-gray-300">
                {formatarDataHora(carga.finalizado_em)}
              </span>
              {" · "}
              <span className="font-medium text-gray-700 dark:text-gray-300">
                {carga.registros} registros
              </span>
            </p>
            <p className="text-gray-400 dark:text-gray-500">
              Comparação histórica de alertas será habilitada após a consolidação das próximas cargas.
            </p>
          </div>
        ) : (
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            Comparação histórica de alertas será habilitada após a consolidação das próximas cargas.
          </p>
        )}
      </div>

    </div>
  );
}
