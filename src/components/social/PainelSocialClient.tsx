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
// Helpers visuais
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
// Modal de alertas
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
    <div className="fixed inset-0 z-[99999] flex items-start justify-center overflow-y-auto pt-10 pb-10">
      <div
        className="fixed inset-0 bg-gray-400/50 backdrop-blur-[32px]"
        onClick={onClose}
      />
      <div className="relative w-full max-w-3xl rounded-2xl bg-white shadow-xl dark:bg-gray-900 mx-4">
        {/* Cabeçalho */}
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

        {/* Aviso de cautela */}
        <div className="mx-6 mt-4 rounded-lg bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          <strong>Nota de controle externo:</strong> Os alertas abaixo são indicadores de ponto de atenção,
          não afirmações de irregularidade. Destinam-se à priorização de análise pelo gabinete do conselheiro.
        </div>

        {/* Lista */}
        <div className="divide-y divide-gray-100 dark:divide-gray-700/60 max-h-[60vh] overflow-y-auto">
          {itens.length === 0 ? (
            <p className="p-6 text-sm text-gray-400 dark:text-gray-500">
              Nenhum município com este tipo de alerta na competência mais recente.
            </p>
          ) : (
            itens.map((a) => (
              <div key={`${a.codigo_ibge_municipio}-${a.tipo_alerta}`} className="px-6 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium text-sm text-gray-800 dark:text-white">{a.nome_municipio}</span>
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
// Card de alerta
// ---------------------------------------------------------------------------

interface CardAlertaProps {
  titulo: string;
  descricao: string;
  icone: React.ReactNode;
  tipo: string;
  alertas: AlertaRow[];
  corIcone?: string;
  corBorda?: string;
  onVerDetalhes: (tipo: string, titulo: string) => void;
}

function CardAlerta({
  titulo, descricao, icone, tipo, alertas,
  corIcone = "text-gray-400 dark:text-gray-500",
  corBorda = "border-gray-200 dark:border-gray-700",
  onVerDetalhes,
}: CardAlertaProps) {
  const itens    = alertas.filter((a) => a.tipo_alerta === tipo);
  const criticos = itens.filter((a) => a.nivel_alerta === "CRITICO").length;
  const altos    = itens.filter((a) => a.nivel_alerta === "ALTO").length;
  const temAlerta = itens.length > 0;

  return (
    <button
      type="button"
      onClick={() => onVerDetalhes(tipo, titulo)}
      className={`group flex h-full w-full flex-col rounded-xl border ${corBorda} bg-white p-5 text-left transition-all hover:shadow-md hover:shadow-gray-100 dark:bg-gray-800 dark:hover:shadow-none`}
    >
      <div className="mb-4">
        <div className="inline-flex rounded-lg bg-gray-50 p-2 dark:bg-gray-700/50">
          <div className={`h-5 w-5 ${corIcone}`}>{icone}</div>
        </div>
      </div>

      <h3 className="mb-1 text-sm font-semibold text-gray-800 dark:text-white">{titulo}</h3>
      <p className="mb-4 flex-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{descricao}</p>

      <div className="space-y-3">
        {temAlerta && (
          <div className="flex flex-wrap items-center gap-2">
            {criticos > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600 dark:bg-red-900/30 dark:text-red-400">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                {criticos} crítico{criticos !== 1 ? "s" : ""}
              </span>
            )}
            {altos > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                {altos} alto{altos !== 1 ? "s" : ""}
              </span>
            )}
            {itens.length - criticos - altos > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-yellow-50 px-2 py-0.5 text-xs font-semibold text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
                {itens.length - criticos - altos} médio{itens.length - criticos - altos !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}

        {!temAlerta && itens.length === 0 && (
          <span className="text-xs text-gray-400 dark:text-gray-500">Sem alertas na competência atual</span>
        )}

        <div className="flex items-center justify-between border-t border-gray-100 pt-2 dark:border-gray-700/60">
          <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
            CadÚnico / MDS
          </span>
          <span className="flex items-center gap-1 text-xs font-medium text-blue-600 group-hover:gap-2 dark:text-blue-400 transition-all">
            Ver detalhes <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function PainelSocialClient() {
  const [alertas, setAlertas]       = useState<AlertaRow[]>([]);
  const [status,  setStatus]        = useState<StatusCarga | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [modal, setModal]           = useState<{ tipo: string; titulo: string } | null>(null);

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

  const abrirModal = useCallback((tipo: string, titulo: string) => {
    setModal({ tipo, titulo });
  }, []);

  const fecharModal = useCallback(() => setModal(null), []);

  const ultimaCompetencia = status?.ultima_competencia?.ano_mes ?? null;
  const dataCarga = status?.ultima_competencia?.data_carga ?? null;
  const sucesso30d = status?.execucoes_30d?.find((e) => e.status === "SUCESSO")?.total ?? 0;
  const erro30d    = status?.execucoes_30d?.find((e) => e.status === "ERRO")?.total ?? 0;

  return (
    <>
      {/* Modal */}
      {modal && (
        <ModalAlertas
          titulo={modal.titulo}
          tipo={modal.tipo}
          alertas={alertas}
          onClose={fecharModal}
        />
      )}

      <div className="space-y-6 p-1">
        {/* Cabeçalho */}
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Cadastro Único e Vulnerabilidade Social
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Indicadores municipais agregados para apoiar a identificação de risco social,
            fragilidade cadastral e necessidade de atuação do controle externo.
          </p>
        </div>

        {/* Status de carga */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-5 py-4 dark:border-gray-700 dark:bg-gray-800">
          <Database className="h-4 w-4 text-gray-400 dark:text-gray-500 shrink-0" />
          <div className="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
            <span>
              <span className="font-medium text-gray-700 dark:text-gray-300">Competência mais recente: </span>
              {carregando ? "..." : ultimaCompetencia ?? "Sem dados"}
            </span>
            {dataCarga && (
              <span>
                <span className="font-medium text-gray-700 dark:text-gray-300">Última carga: </span>
                {formatarData(dataCarga)}
              </span>
            )}
            <span>
              <span className="font-medium text-gray-700 dark:text-gray-300">Cargas (30 dias): </span>
              {sucesso30d} com sucesso
              {erro30d > 0 && (
                <span className="ml-1 text-red-600 dark:text-red-400">{erro30d} com erro</span>
              )}
            </span>
          </div>
          {!ultimaCompetencia && !carregando && (
            <span className="ml-auto rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              Aguardando carga inicial
            </span>
          )}
        </div>

        {/* Aviso sem dados */}
        {!carregando && !ultimaCompetencia && (
          <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-6 dark:border-amber-700 dark:bg-amber-900/10">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              Dados do Cadastro Único ainda não carregados
            </p>
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              Para carregar os dados, exporte o arquivo CSV do VIS DATA / CECAD / dados abertos MDS,
              defina a variável <code className="font-mono">CADUNICO_CSV_PATH</code> no ambiente ETL
              e execute <code className="font-mono">npm run cadunico:incremental</code> na pasta <code className="font-mono">etl/</code>.
            </p>
          </div>
        )}

        {/* Grid de cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <CardAlerta
            titulo="Atualização cadastral deficiente"
            descricao="Municípios com menor taxa de atualização do Cadastro Único na competência mais recente disponível."
            icone={<RefreshCw className="h-5 w-5" />}
            tipo="baixa_atualizacao_cadastral"
            alertas={alertas}
            corIcone="text-orange-500 dark:text-orange-400"
            corBorda="border-orange-200 dark:border-orange-800/50"
            onVerDetalhes={abrirModal}
          />

          <CardAlerta
            titulo="Alta vulnerabilidade social"
            descricao="Municípios com maior concentração de famílias em situação de pobreza no Cadastro Único."
            icone={<AlertTriangle className="h-5 w-5" />}
            tipo="alta_vulnerabilidade_social"
            alertas={alertas}
            corIcone="text-red-500 dark:text-red-400"
            corBorda="border-red-200 dark:border-red-800/50"
            onVerDetalhes={abrirModal}
          />

          <CardAlerta
            titulo="Crescimento de famílias unipessoais"
            descricao="Municípios com crescimento expressivo de famílias unipessoais nos últimos 12 meses."
            icone={<TrendingUp className="h-5 w-5" />}
            tipo="crescimento_familias_unipessoais"
            alertas={alertas}
            corIcone="text-purple-500 dark:text-purple-400"
            corBorda="border-purple-200 dark:border-purple-800/50"
            onVerDetalhes={abrirModal}
          />

          <CardAlerta
            titulo="Queda brusca de cadastros"
            descricao="Municípios com queda expressiva no total de famílias cadastradas em relação ao mesmo período do ano anterior."
            icone={<TrendingDown className="h-5 w-5" />}
            tipo="queda_brusca_familias_cadastradas"
            alertas={alertas}
            corIcone="text-yellow-600 dark:text-yellow-400"
            corBorda="border-yellow-200 dark:border-yellow-800/50"
            onVerDetalhes={abrirModal}
          />

          <CardAlerta
            titulo="Baixo IGD-M"
            descricao="Municípios com Índice de Gestão Descentralizada Municipal abaixo do referencial mínimo recomendado."
            icone={<Activity className="h-5 w-5" />}
            tipo="baixo_igdm"
            alertas={alertas}
            corIcone="text-blue-500 dark:text-blue-400"
            corBorda="border-blue-200 dark:border-blue-800/50"
            onVerDetalhes={abrirModal}
          />

          {/* Card informativo: dependência Bolsa Família — TODO */}
          <div className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-5 opacity-60 dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-4">
              <div className="inline-flex rounded-lg bg-gray-50 p-2 dark:bg-gray-700/50">
                <Heart className="h-5 w-5 text-gray-400 dark:text-gray-500" />
              </div>
            </div>
            <h3 className="mb-1 text-sm font-semibold text-gray-800 dark:text-white">
              Dependência do Bolsa Família
            </h3>
            <p className="mb-4 flex-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              Municípios com maior proporção de famílias beneficiárias do Bolsa Família em relação ao total cadastrado.
            </p>
            <div className="border-t border-gray-100 pt-2 dark:border-gray-700/60">
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {/* TODO: implementar quando dados de cobertura BF estiverem disponíveis */}
                Em breve — requer dados de cobertura BF
              </span>
            </div>
          </div>

          {/* Card informativo: famílias por município — TODO */}
          <div className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-5 opacity-60 dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-4">
              <div className="inline-flex rounded-lg bg-gray-50 p-2 dark:bg-gray-700/50">
                <Users className="h-5 w-5 text-gray-400 dark:text-gray-500" />
              </div>
            </div>
            <h3 className="mb-1 text-sm font-semibold text-gray-800 dark:text-white">
              Famílias por município
            </h3>
            <p className="mb-4 flex-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              Visão consolidada de famílias cadastradas, em pobreza e beneficiárias por município do Acre.
            </p>
            <div className="border-t border-gray-100 pt-2 dark:border-gray-700/60">
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {/* TODO: implementar tabela detalhada por município */}
                Em breve — tabela detalhada
              </span>
            </div>
          </div>
        </div>

        {/* Rodapé informativo */}
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Dados agregados por município. Nenhuma informação pessoal, CPF, NIS ou dado individualizado é exibido.
          Fontes: MDS / CadÚnico / VIS DATA / dados abertos. Os alertas indicam pontos de atenção para análise
          do gabinete — não afirmam irregularidade.
        </p>
      </div>
    </>
  );
}
