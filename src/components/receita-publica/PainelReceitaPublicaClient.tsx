"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import MapaReceitaPerCapita, { type ReceitaPerCapitaItem } from "@/components/receita-publica/MapaReceitaPerCapita";
import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";
import { Eye, SlidersHorizontal, Printer } from "lucide-react";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

// â”€â”€â”€ Tipos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type NodoReceita = {
  nome: string;
  isDeducao: boolean;
  valorTotal: number;
  nivel: number;
  rubricaPrefix: string;
  filhos: NodoReceita[];
};

type ReceitaRow = {
  id_entidade: number;
  ano: number;
  mes: number;
  codigo: string;
  tipo_receita: string;
  previsao_inicial: number | string | null;
  previsao_atualizada: number | string | null;
  receita_realizada: number | string | null;
};
type DimEnteRow = {
  id_ente: number;
  cod_ibgce: number | null;
  cod_municipio?: string | null;
  populacao: number | null;
  nome: string;
};
type DimEntidadeRow = { id_entidade: number; id_entidade_cjur: number | null; id_ente: number };
type AuxMunicipioRow = { codigo: string; nome: string; uf_codigo?: string | null };
type NaturezaRow = { codigo: string; nivel: number; nome: string; rubrica?: string | null };
type NaturezaNivel = number;
type RankingVariacao = {
  ref: string | null;
  high: Array<[string, number, number]>;
  low: Array<[string, number, number]>;
  emptyMessage: string;
};


// â”€â”€â”€ Constantes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Nomes fixos para os primeiros níveis conhecidos; acima disso gera label genérico
const NIVEL_LABELS: Record<number, string> = {
  1: "Categoria Econômica",
  2: "Origem",
  3: "Espécie",
  4: "Rubrica",
  5: "Alínea",
  6: "Subalínea",
};
function naturezaNivelLabel(nivel: number): string {
  return NIVEL_LABELS[nivel] ?? `Nível ${nivel}`;
}
function buildNaturezaNivelOptions(niveis: number[]): Array<{ value: number; label: string }> {
  return niveis.map((n) => ({ value: n, label: `Nível ${n} - ${naturezaNivelLabel(n)}` }));
}

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function toNum(v: number | string | null | undefined): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const p = parseFloat(v.replace(",", "."));
    return Number.isFinite(p) ? p : 0;
  }
  return 0;
}

function fmtMoeda(v: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL",
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(v);
}

function fmtCompacto(v: number): string {
  const s = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (a >= 1e9) return `${s}R$ ${(a / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} bi`;
  if (a >= 1e6) return `${s}R$ ${(a / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi`;
  if (a >= 1e3) return `${s}R$ ${(a / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return fmtMoeda(v);
}

function fmtPct(v: number): string {
  return `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function fmtNum(v: number): string {
  return v.toLocaleString("pt-BR");
}

function orcadaRow(row: ReceitaRow): number {
  return toNum(row.previsao_inicial) + toNum(row.previsao_atualizada);
}

function arrecadadaRow(row: ReceitaRow): number {
  return toNum(row.receita_realizada);
}

function normalizeIbgeCode(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const digits = String(value).replace(/\D/g, "");
  return digits ? digits.padStart(7, "0") : "";
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\b(prefeitura|municipal|municipio|de|do|da|estado|governo)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveMunicipioCode(ente: DimEnteRow, nomeToCodigo: Map<string, string>): string {
  const byIbge = normalizeIbgeCode(ente.cod_ibgce);
  if (byIbge.startsWith("12")) return byIbge;

  const byMunicipio = normalizeIbgeCode(ente.cod_municipio ?? "");
  if (byMunicipio.startsWith("12")) return byMunicipio;

  const byName = nomeToCodigo.get(normalizeName(ente.nome));
  return byName ?? "";
}

function composicaoCategoria(row: ReceitaRow): string {
  const codigo = String(row.codigo ?? "").replace(/\D/g, "");
  const tipo = String(row.tipo_receita ?? "").toLocaleUpperCase("pt-BR");

  if (tipo.includes("DEDU")) return "Deduções da receita";
  if (codigo.startsWith("171")) return "Transferências da União";
  if (codigo.startsWith("172")) return "Transferências dos Estados";
  if (codigo.startsWith("211") || codigo.startsWith("212")) return "Operações de Crédito do Município";
  if (codigo.startsWith("221") || codigo.startsWith("222")) return "Alienação de Bens do Município";
  if (codigo.startsWith("121") || codigo.startsWith("141")) return "Receita do RPPS";
  if (codigo.startsWith("17")) return "Demais Transferências do Município";
  if (codigo.startsWith("1")) return "Receita do Município";
  return "Demais Receitas do Município";
}

function normalizeReceitaCode(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

function naturezaCategoriaPorNivel(row: ReceitaRow, naturezaRows: NaturezaRow[], level: NaturezaNivel): string {
  const codigo = normalizeReceitaCode(row.codigo);
  const prefix = codigo.slice(0, level);
  const naturezaByPrefix = new Map<string, string>();

  naturezaRows
    .filter((n) => n.nivel === level)
    .forEach((n) => {
      const naturezaPrefix = normalizeReceitaCode(n.rubrica || n.codigo).slice(0, level);
      if (naturezaPrefix && !naturezaByPrefix.has(naturezaPrefix)) {
        naturezaByPrefix.set(naturezaPrefix, n.nome);
      }
    });

  return naturezaByPrefix.get(prefix) ?? composicaoCategoria(row);
}

function formatSupabaseError(error: unknown): string {
  if (!error) return "Erro desconhecido.";
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    const e = error as { message?: string; details?: string; hint?: string; code?: string };
    return [e.message, e.details, e.hint, e.code].filter(Boolean).join(" | ") || JSON.stringify(error);
  }
  return String(error);
}



// â”€â”€â”€ Componente principal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function PainelReceitaPublicaClient() {
  "use no memo";

  const searchParams    = useSearchParams();
  const paramAnoInicio  = searchParams.get("anoInicio");
  const paramAnoFim     = searchParams.get("anoFim");
  const paramMunicipio  = searchParams.get("municipio");
  const paramEntidade   = searchParams.get("entidade");

  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [rows, setRows]       = useState<ReceitaRow[]>([]);
  const [mapaPerCapita, setMapaPerCapita] = useState<Record<string, ReceitaPerCapitaItem>>({});
  const [naturezaRows, setNaturezaRows] = useState<NaturezaRow[]>([]);
  const [naturezaNivelView, setNaturezaNivelView] = useState<NaturezaNivel>(2);

  // Opções de nível calculadas dinamicamente a partir dos dados carregados
  const naturezaNivelOptions = useMemo(() => {
    const niveis = [...new Set(naturezaRows.map((r) => r.nivel))].filter(Boolean).sort((a, b) => a - b);
    return niveis.length > 0 ? buildNaturezaNivelOptions(niveis) : buildNaturezaNivelOptions([1, 2, 3, 4, 5]);
  }, [naturezaRows]);

  const naturezaNivelLabelAtual =
    naturezaNivelLabel(naturezaNivelView);
  const anosDisponiveis = useMemo(() => {
    const anoInicio = Number(paramAnoInicio);
    const anoFim = Number(paramAnoFim);
    if (Number.isFinite(anoInicio) && Number.isFinite(anoFim) && anoInicio > 0 && anoFim >= anoInicio) {
      return Array.from({ length: anoFim - anoInicio + 1 }, (_, index) => anoInicio + index);
    }
    return [...new Set(rows.map((r) => Number(r.ano)).filter(Boolean))].sort((a, b) => a - b);
  }, [paramAnoInicio, paramAnoFim, rows]);
  const [anoComparacaoAtual, setAnoComparacaoAtual] = useState<number | null>(null);
  const [anoComparacaoAnterior, setAnoComparacaoAnterior] = useState<number | null>(null);
  const anoAtualPadrao = anosDisponiveis.length > 0 ? anosDisponiveis[anosDisponiveis.length - 1]! : null;
  const anoAnteriorPadrao = anoAtualPadrao ? anoAtualPadrao - 1 : null;
  const anoAtualSelecionado =
    anoComparacaoAtual && anosDisponiveis.includes(anoComparacaoAtual) ? anoComparacaoAtual : anoAtualPadrao;
  const anoAnteriorSelecionado =
    anoComparacaoAnterior && anosDisponiveis.includes(anoComparacaoAnterior) && anoComparacaoAnterior !== anoAtualSelecionado
      ? anoComparacaoAnterior
      : anoAnteriorPadrao;
  const composicaoRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
      const client = supabase!;

      let anoInicio: number;
      let anoFim: number;
      const [entesRes, entidadesRes, municipiosRes, naturezaRes] = await Promise.all([
        client.from("dim_ente").select("id_ente,cod_ibgce,cod_municipio,populacao,nome").range(0, 9999),
        client.from("dim_entidade").select("id_entidade,id_entidade_cjur,id_ente").range(0, 9999),
        client.from("aux_dim_municipio").select("codigo,nome,uf_codigo").eq("uf_codigo", "12").range(0, 9999),
        client.from("aux_dim_natureza_receita_orcamentaria").select("codigo,nivel,nome,rubrica").range(0, 9999),
      ]);
      if (entesRes.error) throw entesRes.error;
      if (entidadesRes.error) throw entidadesRes.error;
      if (municipiosRes.error) throw municipiosRes.error;
      if (naturezaRes.error) throw naturezaRes.error;
      const entes = (entesRes.data ?? []) as DimEnteRow[];
      const entidades = (entidadesRes.data ?? []) as DimEntidadeRow[];
      const municipios = (municipiosRes.data ?? []) as AuxMunicipioRow[];
      const natureza = (naturezaRes.data ?? []) as NaturezaRow[];
      const nomeToCodigo = new Map<string, string>();
      municipios.forEach((m) => {
        const code = normalizeIbgeCode(m.codigo);
        if (!code.startsWith("12")) return;
        const key = normalizeName(m.nome);
        if (key && !nomeToCodigo.has(key)) nomeToCodigo.set(key, code);
      });

      if (paramAnoInicio && paramAnoFim) {
        anoInicio = Number(paramAnoInicio);
        anoFim    = Number(paramAnoFim);
      } else {
        // Fallback: descobre os 2 anos mais recentes
        const { data: anosData } = await client
          .from("vw_receita_publica_kpis")
          .select("ano")
          .order("ano", { ascending: false })
          .limit(5000);

        const anos = [...new Set((anosData ?? []).map((r: { ano: number }) => Number(r.ano)))]
          .filter(Boolean)
          .sort((a, b) => b - a);

        if (anos.length === 0) {
          if (active) setLoading(false);
          return;
        }

        anoFim    = anos[0]!;
        anoInicio = anos.length >= 2 ? anos[1]! : anoFim;
      }

      const idEnteFiltro =
        paramMunicipio && paramMunicipio !== "all" ? Number(paramMunicipio) : null;
      const idEntidadeFiltro =
        paramEntidade && paramEntidade !== "all" ? Number(paramEntidade) : null;

      const pageSize = 1000;
      let offset = 0;
      const allRows: ReceitaRow[] = [];

      while (true) {
        const { data: rowsData, error: rowsError } = await client
          .rpc("fn_receita_publica_entidade_mensal", {
            p_ano_inicio: anoInicio,
            p_ano_fim: anoFim,
            p_id_ente: idEnteFiltro,
            p_id_entidade: idEntidadeFiltro,
          })
          .range(offset, offset + pageSize - 1);

        if (rowsError) {
          throw new Error(formatSupabaseError(rowsError));
        }

        const batch = (rowsData ?? []) as ReceitaRow[];
        allRows.push(...batch);
        if (batch.length < pageSize) break;
        offset += pageSize;
      }

      if (!active) return;
      setRows(allRows);
      setNaturezaRows(natureza);
      const entidadeToEnte = new Map<number, number>();
      entidades.forEach((e) => {
        entidadeToEnte.set(e.id_entidade, e.id_ente);
        if (e.id_entidade_cjur != null) entidadeToEnte.set(e.id_entidade_cjur, e.id_ente);
      });
      const enteById = new Map<number, DimEnteRow>();
      entes.forEach((e) => enteById.set(e.id_ente, e));
      const receitaPorCod = new Map<string, number>();
      allRows.forEach((row) => {
        const enteId = entidadeToEnte.get(row.id_entidade);
        if (!enteId) return;
        const ente = enteById.get(enteId);
        if (!ente?.populacao || ente.populacao <= 0) return;
        if (ente.nome?.toLocaleLowerCase("pt-BR").includes("teste")) return;
        const key = resolveMunicipioCode(ente, nomeToCodigo);
        if (!key) return;
        receitaPorCod.set(key, (receitaPorCod.get(key) ?? 0) + toNum(row.receita_realizada));
      });
      const out: Record<string, ReceitaPerCapitaItem> = {};
      entes.forEach((ente) => {
        if (!ente.populacao || ente.populacao <= 0) return;
        if (ente.nome?.toLocaleLowerCase("pt-BR").includes("teste")) return;
        const codIbge = resolveMunicipioCode(ente, nomeToCodigo);
        if (!codIbge) return;
        const receitaTotal = receitaPorCod.get(codIbge) ?? 0;
        out[codIbge] = { codIbge, nome: ente.nome, populacao: ente.populacao, receitaTotal, perCapita: receitaTotal / ente.populacao };
      });
      setMapaPerCapita(out);
      setLoading(false);
    }

    load().catch((err) => {
      if (!active) return;
      setError(formatSupabaseError(err));
      setLoading(false);
    });

    return () => { active = false; };
  }, [paramAnoInicio, paramAnoFim, paramMunicipio, paramEntidade]);

  // â”€â”€ KPIs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const kpi = useMemo(() => {
    let orcada = 0, arrecadada = 0;
    const entidades = new Set<number>();

    rows.forEach((row) => {
      orcada     += orcadaRow(row);
      arrecadada += arrecadadaRow(row);
      entidades.add(row.id_entidade);
    });

    const saldo      = orcada - arrecadada;
    const realizacao = orcada !== 0 ? (arrecadada / orcada) * 100 : 0;
    return { orcada, arrecadada, saldo, realizacao, qtdEntidades: entidades.size };
  }, [rows]);

  const composicaoArrecadada = useMemo(() => {
    const groupLevel = naturezaNivelView;
    const acc = new Map<string, number>();
    rows.forEach((row) => {
      const categoria = naturezaCategoriaPorNivel(row, naturezaRows, groupLevel);
      acc.set(categoria, (acc.get(categoria) ?? 0) + arrecadadaRow(row));
    });
    return [...acc.entries()]
      .filter(([, valor]) => valor > 0)
      .sort((a, b) => b[1] - a[1]);
  }, [rows, naturezaRows, naturezaNivelView]);

  const composicaoTop = useMemo(() => composicaoArrecadada.slice(0, 12), [composicaoArrecadada]);
  const composicaoTotal = useMemo(
    () => composicaoArrecadada.reduce((acc, [, valor]) => acc + valor, 0),
    [composicaoArrecadada],
  );

  // Tabela "Receita Orçamentária Arrecadada"
  // Duas árvores paralelas: receitas e deduções.
  // Deduções são detectadas por tipo_receita="DEDU" e roteadas para a árvore de dedução,
  // nunca contaminando a árvore de receitas (mesmo que compartilhem prefixos de código).
  const composicaoNaturezaTabela = useMemo(() => {
    const nivelDetalhe = naturezaNivelView;

    function construirMapas(filtroDeducao: boolean): Map<string, NodoReceita>[] {
      return Array.from({ length: nivelDetalhe }, (_, i) => {
        const n = i + 1;
        const mapa = new Map<string, NodoReceita>();
        naturezaRows
          .filter((r) => r.nivel === n)
          .filter((r) => {
            const ehDeducao = r.nome.toLocaleLowerCase("pt-BR").includes("dedu");
            return filtroDeducao ? ehDeducao : !ehDeducao;
          })
          .forEach((r) => {
            const prefix = normalizeReceitaCode(r.rubrica || r.codigo).slice(0, n);
            if (!prefix || mapa.has(prefix)) return;
            mapa.set(prefix, {
              nome: r.nome,
              isDeducao: filtroDeducao,
              valorTotal: 0,
              nivel: n,
              rubricaPrefix: prefix,
              filhos: [],
            });
          });
        return mapa;
      });
    }

    const mapasReceita  = construirMapas(false);
    const mapasDeducao  = construirMapas(true);

    // Fallbacks por 1º dígito: garantem que nenhum valor se perca mesmo que a dimensão
    // não tenha entrada para aquele grupo (ex: "2" = Capital, "7"/"8" = Intraorçamentárias)
    const fallbackReceita = new Map<string, NodoReceita>();
    const fallbackDeducao = new Map<string, NodoReceita>();

    function obterFallback(map: Map<string, NodoReceita>, digito: string, ehDeducao: boolean): NodoReceita {
      if (!map.has(digito)) {
        map.set(digito, {
          nome: ehDeducao ? "Deduções da Receita" : `Grupo ${digito}`,
          isDeducao: ehDeducao,
          valorTotal: 0, nivel: 1,
          rubricaPrefix: digito,
          filhos: [],
        });
      }
      return map.get(digito)!;
    }

    // Acumula cada linha bruta na árvore correta pelo tipo_receita.
    // Se não encontrar match em nenhum nível da dimensão, cria nodo fallback pelo 1º dígito.
    rows.forEach((row) => {
      const codigo = normalizeReceitaCode(row.codigo);
      const valor  = arrecadadaRow(row);
      const isTipoDeducao = String(row.tipo_receita ?? "").toLocaleUpperCase("pt-BR").includes("DEDU");
      const mapas = isTipoDeducao ? mapasDeducao : mapasReceita;

      for (let n = nivelDetalhe; n >= 1; n--) {
        const nodo = mapas[n - 1]?.get(codigo.slice(0, n));
        if (nodo) { nodo.valorTotal += valor; return; }
      }
      // Sem match na dimensão: acumula no fallback pelo 1º dígito
      const digito = codigo.slice(0, 1) || "?";
      obterFallback(isTipoDeducao ? fallbackDeducao : fallbackReceita, digito, isTipoDeducao).valorTotal += valor;
    });

    // Roll-up: conecta cada nodo ao seu pai (nível N → nível N-1)
    function rollUp(mapas: Map<string, NodoReceita>[]) {
      for (let n = nivelDetalhe; n >= 2; n--) {
        const mapaFilhos = mapas[n - 1]!;
        const mapaPais   = mapas[n - 2]!;
        mapaFilhos.forEach((filho) => {
          if (filho.valorTotal === 0) return;
          const pai = mapaPais.get(filho.rubricaPrefix.slice(0, n - 1));
          if (pai) {
            pai.filhos.push(filho);
            pai.valorTotal += filho.valorTotal;
          }
        });
      }
    }

    rollUp(mapasReceita);
    rollUp(mapasDeducao);

    const ordenar = (nodos: NodoReceita[]) => {
      nodos.sort((a, b) => a.rubricaPrefix.localeCompare(b.rubricaPrefix));
      nodos.forEach((n) => ordenar(n.filhos));
    };

    // Mescla raízes da dimensão com fallbacks: se o 1º dígito já existe na dimensão,
    // soma o fallback nele; senão adiciona o fallback como nodo raiz independente.
    function mesclarFallbacks(
      raizes: NodoReceita[],
      fallbacks: Map<string, NodoReceita>,
    ): NodoReceita[] {
      const porDigito = new Map(raizes.map((r) => [r.rubricaPrefix, r]));
      fallbacks.forEach((fb, digito) => {
        if (fb.valorTotal === 0) return;
        const existente = porDigito.get(digito);
        if (existente) {
          existente.valorTotal += fb.valorTotal;
        } else {
          raizes.push(fb);
          porDigito.set(digito, fb);
        }
      });
      return raizes;
    }

    const raizesReceita = mesclarFallbacks(
      [...(mapasReceita[0]?.values() ?? [])].filter((n) => n.valorTotal !== 0),
      fallbackReceita,
    );
    const raizesDeducao = mesclarFallbacks(
      [...(mapasDeducao[0]?.values() ?? [])].filter((n) => n.valorTotal !== 0),
      fallbackDeducao,
    );

    ordenar(raizesReceita);
    ordenar(raizesDeducao);

    const raizes = [...raizesReceita, ...raizesDeducao];
    const totalLiquido = raizes.reduce((acc, n) => acc + n.valorTotal, 0);

    return { raizes, totalLiquido };
  }, [rows, naturezaRows, naturezaNivelView]);

  const composicaoBarOptions = useMemo<ApexOptions>(() => ({
    chart: { type: "bar", toolbar: { show: false }, fontFamily: "inherit" },
    plotOptions: { bar: { horizontal: true, borderRadius: 4 } },
    colors: ["#0f766e"],
    dataLabels: {
      enabled: true,
      formatter: (value: number) => fmtCompacto(value),
      style: { fontSize: "10px" },
    },
    xaxis: {
      labels: {
        formatter: (value: string) => fmtCompacto(Number(value)),
      },
    },
    yaxis: {
      labels: { style: { fontSize: "11px" }, maxWidth: 280 },
    },
    tooltip: {
      y: { formatter: (value: number) => fmtMoeda(Number(value)) },
    },
    grid: { borderColor: "#e2e8f0", strokeDashArray: 3 },
  }), []);

  const composicaoBarSeries = useMemo(
    () => [{ name: "Arrecadação", data: composicaoTop.map(([name, value]) => ({ x: name, y: Number(value.toFixed(2)) })) }],
    [composicaoTop],
  );

  
  const serieMensalEmpilhada = useMemo(() => {
    const groupLevel = naturezaNivelView;
    const monthSet = new Set<string>();
    const groupMap = new Map<string, Map<string, number>>();
    rows.forEach((row) => {
      const month = `${row.ano}-${String(row.mes).padStart(2, "0")}`;
      monthSet.add(month);
      const categoria = naturezaCategoriaPorNivel(row, naturezaRows, groupLevel);
      if (!groupMap.has(categoria)) groupMap.set(categoria, new Map<string, number>());
      const byMonth = groupMap.get(categoria)!;
      byMonth.set(month, (byMonth.get(month) ?? 0) + arrecadadaRow(row));
    });

    const months = [...monthSet].sort((a, b) => a.localeCompare(b));
    const labels = months.map((m) => {
      const [ano, mes] = m.split("-");
      return `${mes}/${ano}`;
    });

    const topCats = [...groupMap.entries()]
      .map(([cat, byMonth]) => ({ cat, total: [...byMonth.values()].reduce((acc, v) => acc + v, 0) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    const series = topCats.map(({ cat }) => {
      const byMonth = groupMap.get(cat)!;
      return { name: cat, data: months.map((m) => Number((byMonth.get(m) ?? 0).toFixed(2))) };
    });
    return { labels, series };
  }, [rows, naturezaRows, naturezaNivelView]);

  const serieEmpilhadaOptions = useMemo<ApexOptions>(() => ({
    chart: { type: "bar", stacked: true, toolbar: { show: true }, fontFamily: "inherit" },
    plotOptions: { bar: { borderRadius: 3, columnWidth: "62%" } },
    dataLabels: { enabled: false },
    xaxis: { categories: serieMensalEmpilhada.labels, labels: { rotate: -30 } },
    yaxis: { labels: { formatter: (v: number) => fmtCompacto(Number(v)) } },
    tooltip: { y: { formatter: (v: number) => fmtMoeda(Number(v)) } },
    legend: { position: "bottom", fontSize: "11px" },
    grid: { borderColor: "#e2e8f0", strokeDashArray: 3 },
  }), [serieMensalEmpilhada.labels]);

  const rankingYoY = useMemo<RankingVariacao>(() => {
    const groupLevel = naturezaNivelView;
    const yearMonthMap = new Map<number, Map<number, Map<string, number>>>();
    rows.forEach((row) => {
      const categoria = naturezaCategoriaPorNivel(row, naturezaRows, groupLevel);
      if (!yearMonthMap.has(row.ano)) yearMonthMap.set(row.ano, new Map<number, Map<string, number>>());
      const byMonth = yearMonthMap.get(row.ano)!;
      if (!byMonth.has(row.mes)) byMonth.set(row.mes, new Map<string, number>());
      const byCat = byMonth.get(row.mes)!;
      byCat.set(categoria, (byCat.get(categoria) ?? 0) + arrecadadaRow(row));
    });
    const years = [...yearMonthMap.keys()].sort((a, b) => a - b);
    const empty = (message: string): RankingVariacao => ({ ref: null, high: [], low: [], emptyMessage: message });

    const atual = anoAtualSelecionado;
    const anterior = anoAnteriorSelecionado;
    if (!atual || !anterior || atual === anterior) {
      return empty("Selecione dois exercícios diferentes para comparação.");
    }
    if (!years.includes(atual)) {
      return empty(`Sem dados de ${atual} no filtro atual.`);
    }
    if (!years.includes(anterior)) {
      return empty(`Sem dados de ${anterior} no filtro atual.`);
    }

    const findUltimoMesComum = (anoA: number, anoB: number): number | null => {
      const mesesA = [...(yearMonthMap.get(anoA)?.keys() ?? [])].sort((a, b) => a - b);
      const mesesB = new Set([...(yearMonthMap.get(anoB)?.keys() ?? [])]);
      return [...mesesA].reverse().find((m) => mesesB.has(m)) ?? null;
    };

    const ultimoMesComum = findUltimoMesComum(atual, anterior);
    if (!ultimoMesComum) {
      return empty(`Sem meses equivalentes entre ${anterior} e ${atual} no filtro atual.`);
    }

    const agregaAteMes = (ano: number, mesLimite: number): Map<string, number> => {
      const out = new Map<string, number>();
      const byMonth = yearMonthMap.get(ano);
      if (!byMonth) return out;
      [...byMonth.entries()]
        .filter(([mes]) => mes <= mesLimite)
        .forEach(([, byCat]) => {
          byCat.forEach((valor, cat) => out.set(cat, (out.get(cat) ?? 0) + valor));
        });
      return out;
    };

    const mapaAtual = agregaAteMes(atual, ultimoMesComum);
    const mapaAnterior = agregaAteMes(anterior, ultimoMesComum);
    const cats = new Set<string>([...mapaAtual.keys(), ...mapaAnterior.keys()]);
    const variacoes: Array<[string, number, number]> = [];
    cats.forEach((cat) => {
      const vAtual = mapaAtual.get(cat) ?? 0;
      const vAnterior = mapaAnterior.get(cat) ?? 0;
      const pct = vAnterior > 0 ? ((vAtual - vAnterior) / vAnterior) * 100 : (vAtual > 0 ? 100 : 0);
      variacoes.push([cat, vAtual - vAnterior, pct]);
    });
    const mesRef = String(ultimoMesComum).padStart(2, "0");
    const high = [...variacoes].filter(([, delta]) => delta > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const low = [...variacoes].filter(([, delta]) => delta < 0).sort((a, b) => a[1] - b[1]).slice(0, 8);
    return {
      ref: `jan-${mesRef}: ${anterior} x ${atual}`,
      high,
      low,
      emptyMessage: "",
    };
  }, [rows, naturezaRows, naturezaNivelView, anoAtualSelecionado, anoAnteriorSelecionado]);

  const makeRankingBarOptions = (color: string, pctByCategoria: Map<string, number>): ApexOptions => ({
    chart: { type: "bar", toolbar: { show: false }, fontFamily: "inherit" },
    plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: "62%" } },
    colors: [color],
    dataLabels: {
      enabled: true,
      formatter: (value: number) => fmtCompacto(Number(value)),
      style: { fontSize: "10px" },
    },
    xaxis: {
      labels: { show: false },
      axisTicks: { show: false },
      axisBorder: { show: false },
    },
    yaxis: { labels: { style: { fontSize: "11px" }, maxWidth: 210 } },
    tooltip: {
      y: {
        formatter: (value: number, opts) => {
          const categoria = String(opts.w.globals.labels[opts.dataPointIndex] ?? "");
          const pct = pctByCategoria.get(categoria) ?? 0;
          return `${fmtMoeda(Number(value))} (${pct.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)`;
        },
      },
    },
    legend: { show: false },
    grid: { borderColor: "#e2e8f0", strokeDashArray: 3, xaxis: { lines: { show: false } } },
  });

  const rankingAltaData = useMemo(
    () => rankingYoY.high.map(([cat, delta, pct]) => ({ x: cat, y: Number(delta.toFixed(2)), pct })),
    [rankingYoY.high],
  );
  const rankingQuedaData = useMemo(
    () => rankingYoY.low.map(([cat, delta, pct]) => ({ x: cat, y: Number(Math.abs(delta).toFixed(2)), pct })),
    [rankingYoY.low],
  );
  const rankingAltaPct = useMemo(() => new Map(rankingAltaData.map((item) => [item.x, item.pct])), [rankingAltaData]);
  const rankingQuedaPct = useMemo(() => new Map(rankingQuedaData.map((item) => [item.x, item.pct])), [rankingQuedaData]);
  const rankingAltaSeries = useMemo(() => [{ name: "Crescimento", data: rankingAltaData }], [rankingAltaData]);
  const rankingQuedaSeries = useMemo(() => [{ name: "Queda", data: rankingQuedaData }], [rankingQuedaData]);
  const rankingAltaOptions = useMemo(() => makeRankingBarOptions("#059669", rankingAltaPct), [rankingAltaPct]);
  const rankingQuedaOptions = useMemo(() => makeRankingBarOptions("#dc2626", rankingQuedaPct), [rankingQuedaPct]);
  const chartSeries = useMemo(
    () => composicaoArrecadada.map(([, valor]) => Number(valor.toFixed(2))),
    [composicaoArrecadada],
  );

  const chartLabels = useMemo(
    () => composicaoArrecadada.map(([label]) => label),
    [composicaoArrecadada],
  );

  const chartOptions = useMemo<ApexOptions>(() => ({
    chart: { type: "donut", toolbar: { show: true }, fontFamily: "inherit" },
    labels: chartLabels,
    colors: ["#15803d", "#7cc2eb", "#45ad9f", "#cc667d", "#a09a2e", "#b548aa", "#8a2260", "#d4c56a"],
    legend: { position: "bottom", fontSize: "13px" },
    dataLabels: {
      enabled: true,
      formatter: (value: number) => `${value.toFixed(1)}%`,
    },
    tooltip: {
      y: { formatter: (v: number) => fmtMoeda(v) },
    },
    plotOptions: {
      pie: {
        donut: {
          size: "58%",
          labels: {
            show: true,
            value: {
              show: true,
              formatter: (v: string) => `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`,
            },
            total: {
              show: true,
              label: "Arrecadada",
              formatter: () => fmtCompacto(kpi.arrecadada),
            },
          },
        },
      },
    },
  }), [chartLabels, kpi.arrecadada]);

  const onPrintComposicao = () => window.print();
  const onFullscreenElement = async (el: HTMLDivElement | null) => {
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await el.requestFullscreen();
  };
  const onFullscreenComposicao = () => onFullscreenElement(composicaoRef.current);
  const closeActionsMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    const details = event.currentTarget.closest("details");
    details?.removeAttribute("open");
  };
  const naturezaRef = useRef<HTMLDivElement | null>(null);
  const serieMensalRef = useRef<HTMLDivElement | null>(null);
  const variacaoRef = useRef<HTMLDivElement | null>(null);
  const onPrintNatureza = () => window.print();
  const onFullscreenNatureza = () => onFullscreenElement(naturezaRef.current);
  const onPrintSerieMensal = () => window.print();
  const onFullscreenSerieMensal = () => onFullscreenElement(serieMensalRef.current);
  const onPrintVariacao = () => window.print();
  const onFullscreenVariacao = () => onFullscreenElement(variacaoRef.current);

  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          <span className="text-sm">Carregando receitas públicas...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
        Falha ao carregar dados: {error}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="m-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
        Nenhum dado encontrado. Execute o ETL de receita pública.
      </div>
    );
  }

  return (
    <div className="min-h-screen space-y-5 bg-slate-50 p-4 pb-10 dark:bg-slate-900 sm:p-6">

      {/* â”€â”€ Cards KPI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <KpiCard
          titulo="Receita Prevista Atualizada"
          valor={fmtCompacto(kpi.orcada)}
          valorCompleto={fmtMoeda(kpi.orcada)}
          cor="slate"
        />
        <KpiCard
          titulo="Receita Arrecadada"
          valor={fmtCompacto(kpi.arrecadada)}
          valorCompleto={fmtMoeda(kpi.arrecadada)}
          cor="green"
        />
        <KpiCardDestaque
          titulo="% Realização"
          valor={fmtPct(kpi.realizacao)}
          descricao="Arrecadada / Orçada"
          realizacao={kpi.realizacao}
        />
        <KpiCard
          titulo="Saldo a Arrecadar"
          valor={fmtCompacto(kpi.saldo)}
          valorCompleto={fmtMoeda(kpi.saldo)}
          cor={kpi.saldo < 0 ? "red" : "amber"}
        />
        <KpiCard
          titulo="Entidades"
          valor={fmtNum(kpi.qtdEntidades)}
          valorCompleto={`${fmtNum(kpi.qtdEntidades)} entidades no período`}
          cor="blue"
        />
      </div>

      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Detalhamento da natureza da receita</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500">Aplicado à composição, série mensal e variação acumulada</p>
        </div>
        <select
          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          value={naturezaNivelView}
          onChange={(event) => setNaturezaNivelView(Number(event.target.value))}
        >
          {naturezaNivelOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <MapaReceitaPerCapita dados={mapaPerCapita} />
        <div ref={composicaoRef} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Composição da Receita Arrecadada por {naturezaNivelLabelAtual} {paramAnoFim || ""}
              </h3>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Distribuição da arrecadação no período selecionado
              </p>
            </div>
            <details className="relative">
              <ActionSummary />
              <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                  onClick={(event) => {
                    closeActionsMenu(event);
                    onFullscreenComposicao();
                  }}
                >
                  <Eye className="h-3.5 w-3.5" />
                  Visualizar
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                  onClick={(event) => {
                    closeActionsMenu(event);
                    onPrintComposicao();
                  }}
                >
                  <Printer className="h-3.5 w-3.5" />
                  Imprimir
                </button>
              </div>
            </details>
          </div>
          {chartSeries.length > 0 ? (
            <Chart options={chartOptions} series={chartSeries} type="donut" height={360} />
          ) : (
            <div className="flex h-[360px] items-center justify-center text-sm text-slate-500">
              Sem dados para composição no período selecionado.
            </div>
          )}
        </div>
      </div>

      <div ref={naturezaRef} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Receita Orçamentária Arrecadada</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500">Agrupamento por {naturezaNivelLabelAtual}</p>
          </div>
          <div className="flex items-center gap-2">
            <details className="relative">
              <ActionSummary />
              <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                  onClick={(event) => {
                    closeActionsMenu(event);
                    onFullscreenNatureza();
                  }}
                >
                  <Eye className="h-3.5 w-3.5" />
                  Visualizar
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                  onClick={(event) => {
                    closeActionsMenu(event);
                    onPrintNatureza();
                  }}
                >
                  <Printer className="h-3.5 w-3.5" />
                  Imprimir
                </button>
              </div>
            </details>
          </div>
        </div>

        <div className="max-h-[480px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
              <tr>
                <th className="px-3 py-2 text-left">Código</th>
                <th className="px-3 py-2 text-left">Natureza</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2 text-right">Part. %</th>
              </tr>
            </thead>
            <tbody>
              <LinhasNodoReceita
                nodos={composicaoNaturezaTabela.raizes}
                base={composicaoNaturezaTabela.totalLiquido}
                profundidade={0}
              />
            </tbody>
            <tfoot className="sticky bottom-0 border-t-2 border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
              <tr>
                <td className="px-3 py-2 font-semibold" colSpan={2}>Total Líquido</td>
                <td className="px-3 py-2 text-right font-semibold">{fmtMoeda(composicaoNaturezaTabela.totalLiquido)}</td>
                <td className="px-3 py-2 text-right font-semibold">100,0%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div ref={serieMensalRef} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Série mensal empilhada por {naturezaNivelLabelAtual}</h3>
              <p className="text-xs text-slate-400 dark:text-slate-500">Principais categorias por arrecadação no período filtrado</p>
            </div>
            <details className="relative">
              <ActionSummary />
              <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                <button type="button" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700" onClick={(event) => { closeActionsMenu(event); onFullscreenSerieMensal(); }}><Eye className="h-3.5 w-3.5" />Visualizar</button>
                <button type="button" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700" onClick={(event) => { closeActionsMenu(event); onPrintSerieMensal(); }}><Printer className="h-3.5 w-3.5" />Imprimir</button>
              </div>
            </details>
          </div>
          {serieMensalEmpilhada.series.length > 0 ? (
            <Chart options={serieEmpilhadaOptions} series={serieMensalEmpilhada.series} type="bar" height={360} />
          ) : (
            <div className="flex h-[360px] items-center justify-center text-sm text-slate-500">Sem dados suficientes para série mensal.</div>
          )}
        </div>

        <div ref={variacaoRef} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Variação acumulada por {naturezaNivelLabelAtual}</h3>
            <div className="flex items-center gap-2">
              <select
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                value={anoAnteriorSelecionado ?? ""}
                onChange={(e) => setAnoComparacaoAnterior(Number(e.target.value))}
              >
                {anosDisponiveis.filter((ano) => ano !== anoAtualSelecionado).map((ano) => (
                  <option key={`ano-anterior-${ano}`} value={ano}>{ano}</option>
                ))}
              </select>
              <span className="text-xs text-slate-500">x</span>
              <select
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                value={anoAtualSelecionado ?? ""}
                onChange={(e) => setAnoComparacaoAtual(Number(e.target.value))}
              >
                {anosDisponiveis.filter((ano) => ano !== anoAnteriorSelecionado).map((ano) => (
                  <option key={`ano-atual-${ano}`} value={ano}>{ano}</option>
                ))}
              </select>
              <details className="relative">
                <ActionSummary />
                <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                  <button type="button" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700" onClick={(event) => { closeActionsMenu(event); onFullscreenVariacao(); }}><Eye className="h-3.5 w-3.5" />Visualizar</button>
                  <button type="button" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700" onClick={(event) => { closeActionsMenu(event); onPrintVariacao(); }}><Printer className="h-3.5 w-3.5" />Imprimir</button>
                </div>
              </details>
            </div>
          </div>
          <p className="mb-2 text-xs text-slate-400 dark:text-slate-500">Comparação entre exercícios no mesmo intervalo de meses {rankingYoY.ref ? `(${rankingYoY.ref})` : ""}</p>
          {rankingYoY.ref && (rankingAltaData.length > 0 || rankingQuedaData.length > 0) ? (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/10">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Maiores crescimentos</p>
                {rankingAltaData.length > 0 ? (
                  <Chart options={rankingAltaOptions} series={rankingAltaSeries} type="bar" height={300} />
                ) : (
                  <div className="flex h-[300px] items-center justify-center text-center text-sm text-slate-500">Sem crescimentos no período.</div>
                )}
              </div>
              <div className="rounded-xl border border-red-100 bg-red-50/40 p-3 dark:border-red-900/60 dark:bg-red-950/10">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">Maiores quedas</p>
                {rankingQuedaData.length > 0 ? (
                  <Chart options={rankingQuedaOptions} series={rankingQuedaSeries} type="bar" height={300} />
                ) : (
                  <div className="flex h-[300px] items-center justify-center text-center text-sm text-slate-500">Sem quedas no período.</div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-[360px] items-center justify-center px-6 text-center text-sm text-slate-500">
              {rankingYoY.emptyMessage || "Sem anos suficientes para comparação anual."}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

// â”€â”€â”€ Sub-componentes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type CorKpi = "slate" | "green" | "blue" | "amber" | "red";

const corBorda: Record<CorKpi, string> = {
  slate: "border-l-slate-400",
  green: "border-l-green-500",
  blue:  "border-l-blue-500",
  amber: "border-l-amber-500",
  red:   "border-l-red-500",
};

const corValor: Record<CorKpi, string> = {
  slate: "text-slate-800 dark:text-slate-100",
  green: "text-green-700 dark:text-green-400",
  blue:  "text-blue-700 dark:text-blue-400",
  amber: "text-amber-700 dark:text-amber-400",
  red:   "text-red-600 dark:text-red-400",
};

// Recuo em px por nível de profundidade na hierarquia
const RECUO_POR_NIVEL = 16;

function LinhasNodoReceita({
  nodos, base, profundidade,
}: {
  nodos: NodoReceita[];
  base: number;
  profundidade: number;
}) {
  return (
    <>
      {nodos.map((nodo) => {
        const isRaiz   = profundidade === 0;
        const pct      = base !== 0 ? (Math.abs(nodo.valorTotal) / Math.abs(base)) * 100 : 0;
        const recuoPx  = profundidade * RECUO_POR_NIVEL + 12;
        const temFilhos = nodo.filhos.length > 0;

        const corTexto = nodo.isDeducao
          ? (isRaiz ? "text-red-700 dark:text-red-400" : "text-red-600 dark:text-red-400")
          : (isRaiz ? "text-slate-800 dark:text-slate-100" : profundidade === 1 ? "text-slate-700 dark:text-slate-200" : "text-slate-500 dark:text-slate-400");

        const bgLinha = nodo.isDeducao
          ? (isRaiz ? "bg-red-50 dark:bg-red-950/20" : "bg-red-50/30 dark:bg-red-950/10")
          : (isRaiz ? "bg-slate-50 dark:bg-slate-800/60" : "");

        const bordaTopo = isRaiz
          ? "border-t border-slate-300 dark:border-slate-600"
          : "border-t border-slate-100 dark:border-slate-700/50";

        return (
          <React.Fragment key={`${profundidade}-${nodo.rubricaPrefix}`}>
            <tr className={`${bordaTopo} ${bgLinha}`}>
              <td
                className={`py-1.5 pl-3 pr-2 font-mono text-xs ${nodo.isDeducao ? "text-red-400 dark:text-red-500" : "text-slate-400 dark:text-slate-500"} ${isRaiz || temFilhos ? "font-semibold" : ""} whitespace-nowrap`}
              >
                {nodo.rubricaPrefix}
              </td>
              <td
                className={`py-1.5 pr-3 ${corTexto} ${isRaiz || temFilhos ? "font-semibold" : ""}`}
                style={{ paddingLeft: `${recuoPx}px` }}
              >
                {nodo.isDeducao && isRaiz ? `(−) ${nodo.nome}` : nodo.nome}
              </td>
              <td className={`py-1.5 pr-3 text-right ${corTexto} ${isRaiz || temFilhos ? "font-semibold" : ""}`}>
                {fmtMoeda(nodo.valorTotal)}
              </td>
              <td className={`py-1.5 pr-3 text-right ${isRaiz ? corTexto : "text-slate-400 dark:text-slate-500"} ${isRaiz ? "font-semibold" : ""}`}>
                {pct.toFixed(1)}%
              </td>
            </tr>
            {temFilhos && (
              <LinhasNodoReceita
                nodos={nodo.filhos}
                base={base}
                profundidade={profundidade + 1}
              />
            )}
          </React.Fragment>
        );
      })}
    </>
  );
}

function ActionSummary() {
  return (
    <summary className="inline-flex list-none cursor-pointer select-none items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-xs font-semibold text-teal-700 shadow-sm transition hover:border-teal-300 hover:bg-teal-100 hover:text-teal-800 dark:border-teal-900/70 dark:bg-teal-950/30 dark:text-teal-300 dark:hover:bg-teal-900/40">
      <SlidersHorizontal className="h-3.5 w-3.5" />
      Ações
    </summary>
  );
}

function KpiCard({
  titulo, valor, valorCompleto, cor,
}: {
  titulo: string; valor: string; valorCompleto: string; cor: CorKpi;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 border-l-4 ${corBorda[cor]}`}
      title={valorCompleto}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {titulo}
      </p>
      <p className={`mt-2 text-xl font-bold leading-tight sm:text-2xl ${corValor[cor]}`}>
        {valor}
      </p>
    </div>
  );
}

function KpiCardDestaque({
  titulo, valor, descricao, realizacao,
}: {
  titulo: string; valor: string; descricao: string; realizacao: number;
}) {
  const bg =
    realizacao >= 90 ? "bg-green-600" :
    realizacao >= 70 ? "bg-blue-600"  :
    realizacao >= 50 ? "bg-amber-500" :
    "bg-red-500";

  return (
    <div className={`col-span-2 rounded-2xl p-5 shadow-sm xl:col-span-1 ${bg} text-white`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-white/80">{titulo}</p>
      <p className="mt-2 text-3xl font-bold leading-tight sm:text-4xl">{valor}</p>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/30">
        <div
          className="h-full rounded-full bg-white transition-all duration-700"
          style={{ width: `${Math.min(100, Math.max(0, realizacao))}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-white/70">{descricao}</p>
    </div>
  );
}






