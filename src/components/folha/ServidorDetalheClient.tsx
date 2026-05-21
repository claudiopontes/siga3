"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fmtCompetencia, fmtMoeda, fmtNum, toNum } from "./folhaUtils";

type Servidor = {
  id_cadastro_unico_sicap: number;
  nome_servidor: string | null;
  cpf_mascarado: string | null;
  data_nascimento: string | null;
  sexo: string | null;
  nit_pis_pasep: string | null;
};

type Contracheque = {
  competencia: string;
  ano: number;
  mes: number;
  id_contracheque_sicap: string;
  id_entidade_cjur: number;
  entidade_nome: string;
  ente_nome: string | null;
  entidade_poder: string | null;
  id_cargo_sicap: number | null;
  cargo_nome: string | null;
  cargo_codigo: string | null;
  id_unidade_lotacao_sicap: number | null;
  unidade_lotacao_nome: string | null;
  municipio_lotacao_nome: string | null;
  id_tipo_folha_sicap: number | null;
  tipo_folha_descricao: string | null;
  matricula: string | null;
  total_vencimentos: string;
  total_descontos: string;
  total_liquido: string;
  alerta_vencimento_negativo: boolean;
  alerta_desconto_negativo: boolean;
  alerta_desconto_maior_vencimento: boolean;
  alerta_sem_desconto: boolean;
  alerta_cpf_invalido: boolean;
  alerta_cargo_ausente: boolean;
  alerta_lotacao_ausente: boolean;
  situacao_atual_servidor: string | null;
};

type Verba = {
  competencia: string;
  entidade_nome: string;
  id_verba_sicap: number;
  verba_codigo: string | null;
  verba_descricao: string | null;
  verba_natureza: string | null;
  verba_grupo_natureza_despesa: string | null;
  verba_subgrupo_classificacao: string | null;
  verba_compoe_vencimento_padrao: boolean | null;
  verba_base_fgts: boolean | null;
  verba_base_irpf: boolean | null;
  verba_base_previdencia: boolean | null;
  verba_referencia: string | null;
  verba_valor: string;
  alerta_verba_valor_negativo: boolean;
  alerta_verba_sem_codigo: boolean;
  alerta_verba_sem_descricao: boolean;
  alerta_verba_sem_subgrupo_classificacao: boolean;
  alerta_verba_sem_natureza: boolean;
};

function ChipBase({ label, ativa, cor }: { label: string; ativa: boolean; cor: string }) {
  if (!ativa) return null;
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${cor}`}>
      {label}
    </span>
  );
}

type Resposta = {
  servidor: Servidor;
  contracheques: Contracheque[];
  competencia_verbas: string | null;
  verbas: Verba[];
};

export default function ServidorDetalheClient({ idCadastroUnico }: { idCadastroUnico: string }) {
  const sp = useSearchParams();
  const competenciaInicial = sp.get("competencia");

  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [competenciaVerbas, setCompetenciaVerbas] = useState<string | null>(competenciaInicial);

  useEffect(() => {
    const url = `/api/folha/servidor/${encodeURIComponent(idCadastroUnico)}${competenciaVerbas ? `?competencia=${competenciaVerbas}` : ""}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (d?.error) setErro(String(d.error));
        else { setDados(d); setErro(null); if (!competenciaVerbas) setCompetenciaVerbas(d.competencia_verbas ?? null); }
      })
      .catch((e) => setErro(String(e)));
  }, [idCadastroUnico, competenciaVerbas]);

  const competenciasDisponiveis = useMemo(() => {
    if (!dados) return [];
    const set = new Set<string>();
    for (const c of dados.contracheques) set.add(c.competencia);
    return Array.from(set).sort().reverse();
  }, [dados]);

  if (erro) return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      Erro ao carregar servidor: {erro}
    </div>
  );
  if (!dados) return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800">
      Carregando…
    </div>
  );

  const s = dados.servidor;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-l-4 border-l-blue-500 border-gray-200 bg-linear-to-br from-blue-50/50 to-white p-5 shadow-sm dark:border-gray-700 dark:to-gray-800">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          {s.nome_servidor ?? "(sem nome)"}
        </h1>
        <div className="mt-2 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">CPF</div>
            <div className="font-mono text-sm text-gray-800 dark:text-gray-100">{s.cpf_mascarado ?? "—"}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Nascimento</div>
            <div className="text-sm text-gray-800 dark:text-gray-100">{s.data_nascimento ?? "—"}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Sexo</div>
            <div className="text-sm text-gray-800 dark:text-gray-100">{s.sexo ?? "—"}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">NIT/PIS</div>
            <div className="font-mono text-sm text-gray-800 dark:text-gray-100">{s.nit_pis_pasep ?? "—"}</div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 overflow-x-auto">
        <div className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
          Histórico de contracheques ({dados.contracheques.length})
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="pb-2 pr-3">Competência</th>
              <th className="pb-2 pr-3">Entidade</th>
              <th className="pb-2 pr-3">Cargo / Lotação</th>
              <th className="pb-2 pr-3">Tipo folha</th>
              <th className="pb-2 pr-3 text-right">Vencimentos</th>
              <th className="pb-2 pr-3 text-right">Descontos</th>
              <th className="pb-2 pr-3 text-right">Líquido</th>
              <th className="pb-2">Alertas</th>
            </tr>
          </thead>
          <tbody>
            {dados.contracheques.map((c) => {
              const ativo = competenciaVerbas === c.competencia;
              const alertas = [
                c.alerta_vencimento_negativo && "venc.neg.",
                c.alerta_desconto_negativo && "desc.neg.",
                c.alerta_desconto_maior_vencimento && "desc>venc",
                c.alerta_sem_desconto && "s/desc.",
                c.alerta_cpf_invalido && "CPF inv.",
                c.alerta_cargo_ausente && "s/cargo",
                c.alerta_lotacao_ausente && "s/lotação",
              ].filter(Boolean) as string[];
              return (
                <tr
                  key={`${c.competencia}-${c.id_contracheque_sicap}`}
                  className={[
                    "border-t cursor-pointer transition-colors",
                    ativo
                      ? "border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-900/30"
                      : "border-gray-100 hover:bg-blue-50/40 dark:border-gray-800 dark:hover:bg-blue-950/30",
                  ].join(" ")}
                  onClick={() => setCompetenciaVerbas(c.competencia)}
                >
                  <td className="py-2 pr-3 font-semibold text-gray-800 dark:text-gray-100">
                    {ativo && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-blue-500" />}
                    {fmtCompetencia(c.competencia)}
                  </td>
                  <td className="py-2 pr-3">
                    <div className="text-gray-800 dark:text-gray-100">{c.entidade_nome}</div>
                    <div className="text-[10px] text-gray-500">{c.entidade_poder}</div>
                  </td>
                  <td className="py-2 pr-3">
                    <div className="text-gray-700 dark:text-gray-300">{c.cargo_nome ?? "—"}</div>
                    <div className="text-[10px] text-gray-500">{c.unidade_lotacao_nome ?? "—"}</div>
                  </td>
                  <td className="py-2 pr-3 text-gray-700 dark:text-gray-300">{c.tipo_folha_descricao ?? "—"}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-emerald-700 dark:text-emerald-300 whitespace-nowrap">{fmtMoeda(toNum(c.total_vencimentos))}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-red-600 dark:text-red-300 whitespace-nowrap">{fmtMoeda(toNum(c.total_descontos))}</td>
                  <td className="py-2 pr-3 text-right tabular-nums font-semibold text-blue-700 dark:text-blue-300 whitespace-nowrap">{fmtMoeda(toNum(c.total_liquido))}</td>
                  <td className="py-2">
                    {alertas.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {alertas.map((a) => (
                          <span key={a} className="inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                            {a}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {dados.contracheques.length === 0 && (
              <tr><td colSpan={8} className="py-3 text-xs text-gray-500">Sem contracheques.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 overflow-x-auto">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Verbas detalhadas</span>
          <select
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            value={competenciaVerbas ?? ""}
            onChange={(e) => setCompetenciaVerbas(e.target.value || null)}
          >
            <option value="">— selecione competência —</option>
            {competenciasDisponiveis.map((c) => (
              <option key={c} value={c}>{fmtCompetencia(c)}</option>
            ))}
          </select>
          <span className="text-xs text-gray-500">{fmtNum(dados.verbas.length)} verbas</span>
          <span className="ml-auto text-[10px] text-gray-400">
            <span className="mr-2"><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-400" />provento</span>
            <span className="mr-2"><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-red-400" />desconto</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-gray-400" />informativa/base</span>
          </span>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            <tr>
              <th className="pb-2 pr-3">Código</th>
              <th className="pb-2 pr-3">Descrição</th>
              <th className="pb-2 pr-3">Tipo</th>
              <th className="pb-2 pr-3">Bases</th>
              <th className="pb-2 pr-3 text-right">Ref.</th>
              <th className="pb-2 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {dados.verbas.map((v, i) => {
              const valor = toNum(v.verba_valor);
              const compoe = v.verba_compoe_vencimento_padrao === true;
              const ehBase = !compoe && (v.verba_base_irpf || v.verba_base_previdencia || v.verba_base_fgts);
              const ehDesconto = !compoe && !ehBase && valor !== 0;
              return (
                <tr key={`${v.id_verba_sicap}-${i}`} className="border-t border-gray-100 dark:border-gray-700">
                  <td className="py-2 pr-3 font-mono text-xs">{v.verba_codigo ?? "—"}</td>
                  <td className="py-2 pr-3 text-gray-800 dark:text-gray-100">
                    {v.verba_descricao ?? "—"}
                  </td>
                  <td className="py-2 pr-3">
                    {compoe ? (
                      <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">provento</span>
                    ) : ehBase ? (
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">informativa</span>
                    ) : ehDesconto ? (
                      <span className="rounded bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">desconto</span>
                    ) : (
                      <span className="text-[10px] text-gray-400">—</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex flex-wrap gap-1">
                      <ChipBase label="V"    ativa={compoe}                            cor="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" />
                      <ChipBase label="IRRF" ativa={!!v.verba_base_irpf}                cor="bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" />
                      <ChipBase label="INSS" ativa={!!v.verba_base_previdencia}         cor="bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" />
                      <ChipBase label="FGTS" ativa={!!v.verba_base_fgts}                cor="bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" />
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-right text-xs text-gray-500 tabular-nums">{v.verba_referencia ?? "—"}</td>
                  <td className={[
                    "py-2 text-right whitespace-nowrap font-medium tabular-nums",
                    ehBase ? "text-gray-500" : ehDesconto ? "text-red-600 dark:text-red-300" : "text-gray-800 dark:text-gray-100",
                  ].join(" ")}>{fmtMoeda(valor)}</td>
                </tr>
              );
            })}
            {dados.verbas.length === 0 && (
              <tr><td colSpan={6} className="py-3 text-xs text-gray-500">Selecione uma competência acima para ver as verbas.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
