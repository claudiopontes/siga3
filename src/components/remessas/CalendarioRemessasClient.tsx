"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type RemessaRow = {
  id_entidade: number;
  nome_entidade: string;
  nome_ente: string | null;
  mes: number;
  prazo_envio: string | null;
  data_envio: string | null;
  data_confirmacao: string | null;
  situacao: string;
  status_publicacao: string | null;
};

type CelulaStatus =
  | "confirmada_no_prazo"
  | "confirmada_com_atraso"
  | "pendente"       // prazo vencido, sem confirmação
  | "aguardando"     // prazo futuro, ainda não enviada
  | "vazia";         // sem remessa neste mês

type EntidadeCalendario = {
  id_entidade: number;
  nome_entidade: string;
  nome_ente: string | null;
  meses: Record<number, { status: CelulaStatus; prazo: string | null; confirmacao: string | null; dias: number | null }>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function calcStatus(row: RemessaRow, hoje: Date): CelulaStatus {
  const prazo = row.prazo_envio ? new Date(row.prazo_envio) : null;
  const confirmacao = row.data_confirmacao ? new Date(row.data_confirmacao) : null;

  if (confirmacao && prazo) {
    return confirmacao <= prazo ? "confirmada_no_prazo" : "confirmada_com_atraso";
  }
  if (!confirmacao && prazo) {
    return prazo < hoje ? "pendente" : "aguardando";
  }
  return "aguardando";
}

function diasAtraso(row: RemessaRow, hoje: Date): number | null {
  const prazo = row.prazo_envio ? new Date(row.prazo_envio) : null;
  const confirmacao = row.data_confirmacao ? new Date(row.data_confirmacao) : null;
  if (!prazo) return null;
  if (confirmacao && confirmacao > prazo) {
    return Math.round((confirmacao.getTime() - prazo.getTime()) / 86400000);
  }
  if (!confirmacao && prazo < hoje) {
    return Math.round((hoje.getTime() - prazo.getTime()) / 86400000);
  }
  return null;
}

function fmtData(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

// ---------------------------------------------------------------------------
// Célula do calendário
// ---------------------------------------------------------------------------

function Celula({
  status,
  prazo,
  confirmacao,
  dias,
}: {
  status: CelulaStatus;
  prazo: string | null;
  confirmacao: string | null;
  dias: number | null;
}) {
  const [tooltip, setTooltip] = useState(false);

  if (status === "vazia") return <td className="border border-gray-100 bg-gray-50 print:border-gray-200" />;

  const cfg: Record<CelulaStatus, { bg: string; icon: string; label: string }> = {
    confirmada_no_prazo:   { bg: "bg-green-500",  icon: "✓", label: "Confirmada no prazo" },
    confirmada_com_atraso: { bg: "bg-amber-500",  icon: "⚠", label: "Confirmada com atraso" },
    pendente:              { bg: "bg-red-500",    icon: "✕", label: "Pendente — prazo vencido" },
    aguardando:            { bg: "bg-blue-300",   icon: "○", label: "Aguardando envio" },
    vazia:                 { bg: "",              icon: "",  label: "" },
  };

  const { bg, icon, label } = cfg[status];

  return (
    <td className="border border-gray-100 text-center p-0.5 print:border-gray-200 relative">
      <button
        type="button"
        onMouseEnter={() => setTooltip(true)}
        onMouseLeave={() => setTooltip(false)}
        className={`${bg} text-white rounded-full w-7 h-7 text-xs font-bold flex items-center justify-center mx-auto print:w-5 print:h-5`}
        title={label}
      >
        {icon}
      </button>
      {tooltip && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1 w-44 bg-gray-900 text-white text-xs rounded p-2 text-left shadow-lg pointer-events-none print:hidden">
          <p className="font-semibold mb-1">{label}</p>
          <p>Prazo: {fmtData(prazo)}</p>
          {confirmacao && <p>Confirmação: {fmtData(confirmacao)}</p>}
          {dias !== null && <p>Dias de atraso: {dias}</p>}
        </div>
      )}
    </td>
  );
}

// ---------------------------------------------------------------------------
// Legenda
// ---------------------------------------------------------------------------

function Legenda() {
  const items = [
    { bg: "bg-green-500",  label: "Confirmada no prazo" },
    { bg: "bg-amber-500",  label: "Confirmada com atraso" },
    { bg: "bg-red-500",    label: "Pendente — prazo vencido" },
    { bg: "bg-blue-300",   label: "Aguardando envio" },
  ];
  return (
    <div className="flex flex-wrap gap-4 text-sm text-gray-600 print:hidden">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className={`${i.bg} w-4 h-4 rounded-full inline-block`} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function CalendarioRemessasClient() {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [filtroEntidade, setFiltroEntidade] = useState("");
  const [dados, setDados] = useState<RemessaRow[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const hoje = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCarregando(true);
    setErro(null);
    fetch(`/api/remessas/calendario?ano=${ano}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setDados(data);
      })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, [ano]);

  const entidades = useMemo<EntidadeCalendario[]>(() => {
    const map = new Map<number, EntidadeCalendario>();
    for (const row of dados) {
      if (!map.has(row.id_entidade)) {
        map.set(row.id_entidade, {
          id_entidade: row.id_entidade,
          nome_entidade: row.nome_entidade,
          nome_ente: row.nome_ente,
          meses: {},
        });
      }
      const status = calcStatus(row, hoje);
      const dias = diasAtraso(row, hoje);
      map.get(row.id_entidade)!.meses[row.mes] = {
        status,
        prazo: row.prazo_envio,
        confirmacao: row.data_confirmacao,
        dias,
      };
    }
    return Array.from(map.values());
  }, [dados, hoje]);

  const filtradas = useMemo(() => {
    const termo = filtroEntidade.toLowerCase();
    if (!termo) return entidades;
    return entidades.filter(
      (e) =>
        e.nome_entidade.toLowerCase().includes(termo) ||
        (e.nome_ente ?? "").toLowerCase().includes(termo),
    );
  }, [entidades, filtroEntidade]);

  const anos = Array.from({ length: 10 }, (_, i) => anoAtual - i);

  // Totais por status para o cabeçalho resumido
  const totais = useMemo(() => {
    let confirmadas = 0, atrasadas = 0, pendentes = 0, aguardando = 0;
    for (const e of filtradas) {
      for (const m of Object.values(e.meses)) {
        if (m.status === "confirmada_no_prazo") confirmadas++;
        else if (m.status === "confirmada_com_atraso") atrasadas++;
        else if (m.status === "pendente") pendentes++;
        else if (m.status === "aguardando") aguardando++;
      }
    }
    return { confirmadas, atrasadas, pendentes, aguardando };
  }, [filtradas]);

  return (
    <div className="p-4 md:p-6 space-y-4" ref={printRef}>
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-white">
            Calendário de Remessas Contábeis
          </h1>
          <p className="text-sm text-gray-500">Prestação de contas mensal — remessas ativas</p>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg border border-gray-300 transition-colors self-start sm:self-auto"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Imprimir
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 print:hidden">
        <select
          value={ano}
          onChange={(e) => setAno(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-white w-32"
        >
          {anos.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Filtrar por entidade..."
          value={filtroEntidade}
          onChange={(e) => setFiltroEntidade(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-white flex-1 max-w-sm"
        />
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:hidden">
        {[
          { label: "No prazo",      valor: totais.confirmadas, cor: "text-green-600 bg-green-50 border-green-200" },
          { label: "Com atraso",    valor: totais.atrasadas,   cor: "text-amber-600 bg-amber-50 border-amber-200" },
          { label: "Pendentes",     valor: totais.pendentes,   cor: "text-red-600 bg-red-50 border-red-200" },
          { label: "Aguardando",    valor: totais.aguardando,  cor: "text-blue-600 bg-blue-50 border-blue-200" },
        ].map((c) => (
          <div key={c.label} className={`rounded-lg border p-3 ${c.cor}`}>
            <p className="text-2xl font-bold">{c.valor}</p>
            <p className="text-xs font-medium">{c.label}</p>
          </div>
        ))}
      </div>

      <Legenda />

      {/* Cabeçalho de impressão */}
      <div className="hidden print:block mb-4">
        <h1 className="text-lg font-bold">Calendário de Remessas Contábeis — {ano}</h1>
        <p className="text-sm text-gray-500">Emitido em {new Date().toLocaleDateString("pt-BR")}</p>
      </div>

      {/* Tabela */}
      {carregando && (
        <div className="flex items-center justify-center h-40 text-gray-400">
          Carregando...
        </div>
      )}
      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          Erro ao carregar dados: {erro}
        </div>
      )}
      {!carregando && !erro && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 print:overflow-visible">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                <th className="border border-gray-200 dark:border-gray-700 text-left px-3 py-2 font-semibold sticky left-0 bg-gray-100 dark:bg-gray-800 z-10 min-w-[220px] print:static print:min-w-0">
                  Entidade
                  <div className="font-normal text-gray-400 text-[10px]">
                    {filtradas.length} entidade{filtradas.length !== 1 ? "s" : ""}
                  </div>
                </th>
                {MESES.map((m) => (
                  <th
                    key={m}
                    className="border border-gray-200 dark:border-gray-700 text-center py-2 px-1 font-semibold w-10 print:w-8"
                  >
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 && (
                <tr>
                  <td colSpan={13} className="text-center py-12 text-gray-400">
                    Nenhuma remessa encontrada para {ano}.
                  </td>
                </tr>
              )}
              {filtradas.map((ent, i) => (
                <tr
                  key={ent.id_entidade}
                  className={i % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-800/50"}
                >
                  <td className="border border-gray-100 dark:border-gray-700 px-3 py-1.5 sticky left-0 z-10 bg-inherit print:static">
                    <span className="font-medium text-gray-800 dark:text-gray-200 block leading-tight">
                      {ent.nome_entidade}
                    </span>
                    {ent.nome_ente && (
                      <span className="text-[10px] text-gray-400 block">{ent.nome_ente}</span>
                    )}
                  </td>
                  {Array.from({ length: 12 }, (_, idx) => idx + 1).map((mes) => {
                    const cel = ent.meses[mes];
                    if (!cel) return <td key={mes} className="border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30 w-10" />;
                    return (
                      <Celula
                        key={mes}
                        status={cel.status}
                        prazo={cel.prazo}
                        confirmacao={cel.confirmacao}
                        dias={cel.dias}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
