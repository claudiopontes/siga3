"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface HistoricoRow {
  an_exercicio: number;
  nr_periodo: number;
  no_municipio: string | null;
  situacao_envio: string | null;
  total_contas: number | null;
  alertas_criticos: number;
  alertas_altos: number;
  alertas_medios: number;
  alertas_baixos: number;
  atualizado_em: string | null;
}

interface AlertaRow {
  id_alerta: number | null;
  an_exercicio: number;
  nr_periodo: number;
  tipo_alerta: string;
  nivel: string;
  descricao: string;
  valor_observado: number | null;
  valor_referencia: number | null;
  atualizado_em: string | null;
}

interface MunicipioDetalheResponse {
  id_municipio: number;
  no_municipio: string | null;
  historico: HistoricoRow[];
  alertas: AlertaRow[];
}

// ---------------------------------------------------------------------------
// Helpers visuais
// ---------------------------------------------------------------------------

const NIVEL_BADGE: Record<string, string> = {
  CRITICO:  "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  ALTO:     "bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  MEDIO:    "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  BAIXO:    "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  SEM_DADO: "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400",
  OK:       "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
};

const NIVEL_DOT: Record<string, string> = {
  CRITICO: "bg-red-500", ALTO: "bg-orange-400", MEDIO: "bg-yellow-400",
  BAIXO: "bg-green-500", SEM_DADO: "bg-gray-400", OK: "bg-emerald-500",
};

const NIVEL_LABEL: Record<string, string> = {
  CRITICO: "Crítico", ALTO: "Alto", MEDIO: "Médio",
  BAIXO: "Baixo", SEM_DADO: "Sem entrega", OK: "Regular",
};

const BIMESTRES: Record<number, string> = {
  1: "1º Bim.", 2: "2º Bim.", 3: "3º Bim.",
  4: "4º Bim.", 5: "5º Bim.", 6: "6º Bim.",
};

function NivelBadge({ nivel }: { nivel: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${NIVEL_BADGE[nivel] ?? NIVEL_BADGE.OK}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${NIVEL_DOT[nivel] ?? NIVEL_DOT.OK}`} />
      {NIVEL_LABEL[nivel] ?? nivel}
    </span>
  );
}

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("pt-BR"); } catch { return "—"; }
}

function formatarValor(v: number | null): string {
  if (v === null) return "—";
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

// ---------------------------------------------------------------------------
// KPI card
// ---------------------------------------------------------------------------

function KpiCard({
  label, valor, sub, destaque,
}: {
  label: string;
  valor: string | number;
  sub?: string;
  destaque?: "critico" | "alto" | "ok";
}) {
  const cor = destaque === "critico" ? "text-red-600 dark:text-red-400"
    : destaque === "alto" ? "text-orange-500 dark:text-orange-400"
    : destaque === "ok"   ? "text-emerald-600 dark:text-emerald-400"
    : "text-gray-900 dark:text-white";
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${cor}`}>{valor}</p>
      {sub && <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metadados de tipo_alerta
// ---------------------------------------------------------------------------

const TIPO_ALERTA_META: Record<string, { label: string; categoria: string }> = {
  rreo_sem_dado_recente:                         { label: "Ausência de entrega",                       categoria: "Entrega"  },
  rreo_dado_incompleto:                          { label: "Dado incompleto",                           categoria: "Qualidade" },
  rreo_variacao_atipica:                         { label: "Variação atípica de despesas",              categoria: "Variação"  },
  siconfi_pessoal_consolidado_acima_referencia:    { label: "Pessoal consolidado acima da referência",    categoria: "Pessoal"  },
  siconfi_pessoal_consolidado_proximo_referencia:  { label: "Pessoal consolidado próximo da referência",  categoria: "Pessoal"  },
  siconfi_pessoal_executivo_acima_referencia:      { label: "Pessoal do Executivo acima da referência",   categoria: "Pessoal"  },
  siconfi_pessoal_executivo_proximo_referencia:    { label: "Pessoal do Executivo próximo da referência", categoria: "Pessoal"  },
  siconfi_pessoal_legislativo_acima_referencia:    { label: "Pessoal do Legislativo acima da referência",   categoria: "Pessoal"  },
  siconfi_pessoal_legislativo_proximo_referencia:  { label: "Pessoal do Legislativo próximo da referência", categoria: "Pessoal"  },
};

function tipoLabel(tipo: string): string {
  return TIPO_ALERTA_META[tipo]?.label ?? tipo.replace(/_/g, " ");
}

// ---------------------------------------------------------------------------
// "Motivos da atenção" — agrupamento de alertas por tipo
// ---------------------------------------------------------------------------

interface TipoContagem {
  tipo_alerta: string;
  criticos:    number;
  altos:       number;
  medios:      number;
  baixos:      number;
}

function MotivosAtencao({ alertas }: { alertas: AlertaRow[] }) {
  if (alertas.length === 0) return null;

  // Agrupa por tipo_alerta (todos os períodos)
  const porTipo = alertas.reduce<Record<string, TipoContagem>>((acc, a) => {
    if (!acc[a.tipo_alerta]) {
      acc[a.tipo_alerta] = { tipo_alerta: a.tipo_alerta, criticos: 0, altos: 0, medios: 0, baixos: 0 };
    }
    if (a.nivel === "CRITICO") acc[a.tipo_alerta].criticos++;
    else if (a.nivel === "ALTO")   acc[a.tipo_alerta].altos++;
    else if (a.nivel === "MEDIO")  acc[a.tipo_alerta].medios++;
    else if (a.nivel === "BAIXO")  acc[a.tipo_alerta].baixos++;
    return acc;
  }, {});

  const tipos = Object.values(porTipo).sort((a, b) => {
    // Ordenação: nível mais grave primeiro, depois total
    const pesoA = a.criticos * 1000 + a.altos * 100 + a.medios * 10 + a.baixos;
    const pesoB = b.criticos * 1000 + b.altos * 100 + b.medios * 10 + b.baixos;
    return pesoB - pesoA;
  });

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-white">Motivos da atenção</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Tipos de ocorrência registrados para este município em todos os períodos disponíveis
        </p>
      </div>

      <ul className="divide-y divide-gray-50 dark:divide-gray-700/50">
        {tipos.map((t) => {
          const total = t.criticos + t.altos + t.medios + t.baixos;
          return (
            <li key={t.tipo_alerta} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {tipoLabel(t.tipo_alerta)}
                </span>
                <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                  {total} ocorrência{total !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {t.criticos > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                    {t.criticos} crítico{t.criticos !== 1 ? "s" : ""}
                  </span>
                )}
                {t.altos > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                    {t.altos} alto{t.altos !== 1 ? "s" : ""}
                  </span>
                )}
                {t.medios > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-yellow-50 px-2 py-0.5 text-xs font-semibold text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
                    {t.medios} médio{t.medios !== 1 ? "s" : ""}
                  </span>
                )}
                {t.baixos > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    {t.baixos} baixo{t.baixos !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// "Onde olhar primeiro" — bloco diagnóstico
// ---------------------------------------------------------------------------

function OndeOlharPrimeiro({
  historico,
  alertas,
}: {
  historico: HistoricoRow[];
  alertas: AlertaRow[];
}) {
  const mais_recente = historico[0];
  if (!mais_recente) return null;

  const { alertas_criticos, alertas_altos, situacao_envio } = mais_recente;
  const criticos = alertas.filter((a) => a.nivel === "CRITICO");
  const altos    = alertas.filter((a) => a.nivel === "ALTO");

  let titulo = "";
  let texto  = "";
  let cor    = "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/40";

  if (situacao_envio === "SEM_DADO") {
    titulo = "Município sem entrega de RREO";
    texto  = "O SICONFI não registra entrega de RREO para o período mais recente. Verifique com o município a regularização da entrega junto ao Tesouro Nacional.";
    cor    = "border-red-200 bg-red-50 dark:border-red-800/40 dark:bg-red-900/10";
  } else if (alertas_criticos > 0) {
    titulo = "Situação crítica — verificar com prioridade máxima";
    const tipos = [...new Set(criticos.map((a) => a.descricao))].slice(0, 2).join("; ");
    texto  = `Há ${alertas_criticos} alerta${alertas_criticos > 1 ? "s" : ""} crítico${alertas_criticos > 1 ? "s" : ""} no período mais recente. Principais ocorrências: ${tipos || "ver tabela abaixo"}.`;
    cor    = "border-red-200 bg-red-50 dark:border-red-800/40 dark:bg-red-900/10";
  } else if (alertas_altos > 0) {
    titulo = "Situação de atenção — analisar alertas de nível alto";
    const tipos = [...new Set(altos.map((a) => a.descricao))].slice(0, 2).join("; ");
    texto  = `Há ${alertas_altos} alerta${alertas_altos > 1 ? "s" : ""} de nível alto. Principais ocorrências: ${tipos || "ver tabela abaixo"}.`;
    cor    = "border-orange-200 bg-orange-50 dark:border-orange-800/40 dark:bg-orange-900/10";
  } else {
    titulo = "Situação regular no período mais recente";
    texto  = "Nenhum alerta crítico ou alto identificado no período mais recente. Consulte a tabela abaixo para detalhes completos.";
    cor    = "border-emerald-200 bg-emerald-50 dark:border-emerald-800/40 dark:bg-emerald-900/10";
  }

  return (
    <div className={`rounded-xl border p-4 ${cor}`}>
      <p className="text-sm font-semibold text-gray-800 dark:text-white">{titulo}</p>
      <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-400">{texto}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function RreoMunicipioClient({ idMunicipio }: { idMunicipio: string }) {
  const [dados, setDados]           = useState<MunicipioDetalheResponse | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro]             = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/siconfi/rreo/municipio/${idMunicipio}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<MunicipioDetalheResponse>;
      })
      .then(setDados)
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : "Erro ao carregar dados."))
      .finally(() => setCarregando(false));
  }, [idMunicipio]);

  // ── Loading ──────────────────────────────────────────────────────────────

  if (carregando) {
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
          <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Carregando dados do município...</p>
        </div>
      </div>
    );
  }

  // ── Erro ─────────────────────────────────────────────────────────────────

  if (erro || !dados) {
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-800/40 dark:bg-amber-900/20">
          <p className="font-semibold text-amber-700 dark:text-amber-300">Não foi possível carregar os dados</p>
          <p className="mt-1 font-mono text-xs text-amber-600 dark:text-amber-400">{erro ?? "Dados não encontrados."}</p>
          <Link
            href="/painel-siconfi/rreo"
            className="mt-3 inline-flex items-center gap-1 text-xs text-amber-700 underline hover:no-underline dark:text-amber-300"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Voltar ao painel RREO
          </Link>
        </div>
      </div>
    );
  }

  // ── Dados disponíveis ─────────────────────────────────────────────────────

  const { historico, alertas, no_municipio, id_municipio } = dados;
  const maisRecente = historico[0];

  const nivelAtual = (() => {
    if (!maisRecente) return "OK";
    if (maisRecente.situacao_envio === "SEM_DADO") return "SEM_DADO";
    if (maisRecente.alertas_criticos > 0) return "CRITICO";
    if (maisRecente.alertas_altos    > 0) return "ALTO";
    if (maisRecente.alertas_medios   > 0) return "MEDIO";
    if (maisRecente.alertas_baixos   > 0) return "BAIXO";
    return "OK";
  })();

  const nomeMunicipio = no_municipio ?? `Município ${id_municipio}`;

  return (
    <div className="space-y-5">

      {/* ── KPI Cards do período mais recente ── */}
      {maisRecente && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard
            label="Período"
            valor={`${BIMESTRES[maisRecente.nr_periodo] ?? `${maisRecente.nr_periodo}º Bim.`}`}
            sub={String(maisRecente.an_exercicio)}
          />
          <KpiCard
            label="Situação"
            valor={NIVEL_LABEL[nivelAtual] ?? nivelAtual}
            destaque={
              nivelAtual === "CRITICO" ? "critico"
              : nivelAtual === "ALTO"  ? "alto"
              : nivelAtual === "OK"    ? "ok"
              : undefined
            }
          />
          <KpiCard
            label="Alertas críticos"
            valor={maisRecente.alertas_criticos}
            destaque={maisRecente.alertas_criticos > 0 ? "critico" : undefined}
          />
          <KpiCard
            label="Alertas altos"
            valor={maisRecente.alertas_altos}
            destaque={maisRecente.alertas_altos > 0 ? "alto" : undefined}
          />
          <KpiCard
            label="Alertas médios"
            valor={maisRecente.alertas_medios}
          />
          <KpiCard
            label="Registros RREO"
            valor={maisRecente.total_contas !== null ? maisRecente.total_contas : "—"}
            sub="contas no período"
          />
        </div>
      )}

      {/* ── Diagnóstico: Onde olhar primeiro ── */}
      <OndeOlharPrimeiro historico={historico} alertas={alertas} />

      {/* ── Motivos da atenção ── */}
      <MotivosAtencao alertas={alertas} />

      {/* ── Tabela de alertas individuais ── */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="border-b border-gray-100 px-5 py-3 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white">
            Alertas individuais
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Todos os períodos · ordenados por prioridade · máx. 200 registros
          </p>
        </div>

        {alertas.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Nenhum alerta registrado para este município.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40">
                  {[
                    "Nível", "Exercício", "Período", "Tipo", "Descrição",
                    "Valor observado", "Referência", "Atualizado em",
                  ].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {alertas.map((a, i) => (
                  <tr key={a.id_alerta ?? i} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                    <td className="px-4 py-3">
                      <NivelBadge nivel={a.nivel} />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-300">
                      {a.an_exercicio}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-300">
                      {BIMESTRES[a.nr_periodo] ?? `${a.nr_periodo}º Bim.`}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-gray-500 dark:text-gray-400">
                      {a.tipo_alerta}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
                      {a.descricao}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-700 dark:text-gray-300">
                      {formatarValor(a.valor_observado)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-500 dark:text-gray-400">
                      {formatarValor(a.valor_referencia)}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500">
                      {formatarData(a.atualizado_em)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Histórico bimestral ── */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="border-b border-gray-100 px-5 py-3 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white">
            Histórico bimestral
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Todos os períodos disponíveis nos marts — do mais recente ao mais antigo
          </p>
        </div>

        {historico.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Sem histórico disponível para este município.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40">
                  {[
                    "Exercício", "Período", "Situação", "Registros",
                    "Críticos", "Altos", "Médios", "Atualizado em",
                  ].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {historico.map((h, i) => {
                  const nivelH = (() => {
                    if (h.situacao_envio === "SEM_DADO") return "SEM_DADO";
                    if (h.alertas_criticos > 0) return "CRITICO";
                    if (h.alertas_altos    > 0) return "ALTO";
                    if (h.alertas_medios   > 0) return "MEDIO";
                    if (h.alertas_baixos   > 0) return "BAIXO";
                    return "OK";
                  })();
                  return (
                    <tr key={`${h.an_exercicio}-${h.nr_periodo}-${i}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                      <td className="px-4 py-3 text-xs font-medium text-gray-700 dark:text-gray-300">
                        {h.an_exercicio}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-300">
                        {BIMESTRES[h.nr_periodo] ?? `${h.nr_periodo}º Bim.`}
                      </td>
                      <td className="px-4 py-3">
                        <NivelBadge nivel={nivelH} />
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                        {h.total_contas !== null ? h.total_contas : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {h.alertas_criticos > 0 ? (
                          <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-xs font-bold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                            {h.alertas_criticos}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {h.alertas_altos > 0 ? (
                          <span className="rounded-full bg-orange-50 px-1.5 py-0.5 text-xs font-bold text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                            {h.alertas_altos}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {h.alertas_medios > 0 ? (
                          <span className="rounded-full bg-yellow-50 px-1.5 py-0.5 text-xs font-bold text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                            {h.alertas_medios}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500">
                        {formatarData(h.atualizado_em)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t border-gray-100 px-5 py-3 dark:border-gray-700">
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            Fonte: SICONFI / Tesouro Nacional · STN · Dados carregados via ETL do Varadouro Digital
          </p>
        </div>
      </div>

      {/* ── Voltar ── */}
      <div>
        <Link
          href="/painel-siconfi/rreo"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar ao painel RREO
        </Link>
      </div>

    </div>
  );
}
