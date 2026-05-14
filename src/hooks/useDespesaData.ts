"use client";

import { useEffect, useState } from "react";

// --- Tipos das tabelas mart ---

export type ResumoRow = {
  ano_remessa: number;
  id_entidade: number;
  id_ente: number;
  nome_ente: string;
  nome_entidade: string;
  valor_empenhado_liquido: number;
  valor_liquidado: number;
  valor_pago: number;
  valor_a_liquidar: number;
  valor_a_pagar: number;
  qtd_empenhos: number;
  qtd_credores: number;
  percentual_pago: number;
};

export type EvolucaoRow = {
  ano_remessa: number;
  mes_empenho: string;
  id_entidade: number;
  id_ente: number;
  valor_empenhado_liquido: number;
  valor_liquidado: number;
  valor_pago: number;
};

export type RankingEnteRow = {
  ano_remessa: number;
  id_ente: number;
  nome_ente: string;
  valor_empenhado_liquido: number;
  valor_liquidado: number;
  valor_pago: number;
  valor_a_pagar: number;
  qtd_empenhos: number;
};

export type RankingCredorRow = {
  ano_remessa: number;
  id_ente: number;
  cpf_cnpj_credor: string;
  nome_credor: string;
  valor_empenhado_liquido: number;
  valor_pago: number;
  qtd_empenhos: number;
};

export type ComposicaoRow = {
  ano_remessa: number;
  id_entidade: number;
  id_ente: number;
  tipo_composicao: string;
  codigo: string;
  rotulo: string;
  valor_empenhado_liquido: number;
  valor_liquidado: number;
  valor_pago: number;
};

export type AlertaRow = {
  ano_remessa: number;
  id_ente: number;
  id_entidade: number;
  tipo_alerta: string;
  descricao: string;
  detalhe_json: Record<string, unknown> | null;
  valor_principal: number;
};

// --- Helper para montar query string ---

function buildQS(
  base: { anoInicio: string; anoFim: string; ente: string | null; entidade: string | null },
  extra?: Record<string, string>
): string {
  const p = new URLSearchParams();
  p.set("anoInicio", base.anoInicio);
  p.set("anoFim", base.anoFim);
  if (base.ente && base.ente !== "all") p.set("ente", base.ente);
  if (base.entidade && base.entidade !== "all") p.set("entidade", base.entidade);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
  }
  return p.toString();
}

async function fetchJson<T>(url: string): Promise<T[]> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}: ${url}`);
  }
  return res.json() as Promise<T[]>;
}

// --- Hook principal ---

export function useDespesaData(params: {
  anoInicio: string | null;
  anoFim: string | null;
  ente: string | null;
  entidade: string | null;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewsMissing, setViewsMissing] = useState(false);

  const [resumo, setResumo] = useState<ResumoRow[]>([]);
  const [evolucao, setEvolucao] = useState<EvolucaoRow[]>([]);
  const [rankEntes, setRankEntes] = useState<RankingEnteRow[]>([]);
  const [rankCredores, setRankCredores] = useState<RankingCredorRow[]>([]);
  const [composicao, setComposicao] = useState<ComposicaoRow[]>([]);
  const [alertas, setAlertas] = useState<AlertaRow[]>([]);

  const { anoInicio, anoFim, ente, entidade } = params;

  useEffect(() => {
    if (!anoInicio || !anoFim) return;

    let active = true;

    const baseParams = { anoInicio, anoFim, ente, entidade };
    const qs = buildQS(baseParams);
    const qsEntesAlerta = buildQS(baseParams, { tipo: "ente_maior_a_pagar" });
    const qsCredoresAlerta = buildQS(baseParams, { tipo: "credor_concentrado" });

    async function load() {
      setLoading(true);
      setError(null);
      setViewsMissing(false);

      const [
        resumoResult,
        evolucaoResult,
        entesResult,
        credoresResult,
        composicaoResult,
        alertasEntesResult,
        alertasCredoresResult,
      ] = await Promise.allSettled([
        fetchJson<ResumoRow>(`/api/despesa/resumo?${qs}`),
        fetchJson<EvolucaoRow>(`/api/despesa/evolucao?${qs}`),
        fetchJson<RankingEnteRow>(`/api/despesa/ranking-entes?${qs}`),
        fetchJson<RankingCredorRow>(`/api/despesa/ranking-credores?${qs}`),
        fetchJson<ComposicaoRow>(`/api/despesa/composicao?${qs}`),
        fetchJson<AlertaRow>(`/api/despesa/alertas?${qsEntesAlerta}`),
        fetchJson<AlertaRow>(`/api/despesa/alertas?${qsCredoresAlerta}`),
      ]);

      if (!active) return;

      if (resumoResult.status === "rejected") {
        const msg = (resumoResult.reason as Error).message ?? "Erro desconhecido";
        // Verifica se é erro de tabela não encontrada
        if (
          msg.includes("does not exist") ||
          msg.includes("relation") ||
          msg.includes("HTTP 500")
        ) {
          setViewsMissing(true);
        } else {
          setError(msg);
        }
        setLoading(false);
        return;
      }

      setResumo(resumoResult.value);
      setEvolucao(evolucaoResult.status === "fulfilled" ? evolucaoResult.value : []);
      setRankEntes(entesResult.status === "fulfilled" ? entesResult.value : []);
      setRankCredores(credoresResult.status === "fulfilled" ? credoresResult.value : []);
      setComposicao(composicaoResult.status === "fulfilled" ? composicaoResult.value : []);

      const alertasEntes = alertasEntesResult.status === "fulfilled" ? alertasEntesResult.value : [];
      const alertasCredores = alertasCredoresResult.status === "fulfilled" ? alertasCredoresResult.value : [];
      setAlertas([...alertasEntes, ...alertasCredores]);

      setLoading(false);
    }

    load().catch((err: Error) => {
      if (!active) return;
      setError(err.message ?? "Erro inesperado");
      setLoading(false);
    });

    return () => { active = false; };
  }, [anoInicio, anoFim, ente, entidade]);

  return { loading, error, viewsMissing, resumo, evolucao, rankEntes, rankCredores, composicao, alertas };
}
