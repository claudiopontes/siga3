import type { TipoDocumentoProcesso } from "../tipos";
import { classificarDocumentoProcesso } from "./classificarDocumentoProcesso";

// Limite de caracteres de texto extraído por tipo antes de enviar à IA.
// Reduz consumo de tokens sem perder os trechos mais relevantes.
export const LIMITE_CHARS_POR_TIPO: Record<TipoDocumentoProcesso, number> = {
  voto_relator:          8000,
  relatorio_tecnico:     6000,
  parecer_mpc:           5000,
  defesa_manifestacao:   4000,
  decisao_acordao:       3000,
  outro:                 2000,
};

// Prioridade de seleção — apenas 1 documento por tipo prioritário.
const TIPOS_PRIORITARIOS: TipoDocumentoProcesso[] = [
  "voto_relator",
  "relatorio_tecnico",
  "parecer_mpc",
  "defesa_manifestacao",
  "decisao_acordao",
];

export interface ArquivoParaSelecao {
  id_proc_arqv: number;
  nm_proc_arqv: string | null;
  nm_tipo_docm: string | null;
  nr_pagn: number | null;
  dt_criac: string | null;
  en_dir: string | null;
}

export interface ArquivoSelecionado extends ArquivoParaSelecao {
  tipo_documento: TipoDocumentoProcesso;
}

export function selecionarDocumentosPrincipaisProcesso(
  arquivos: ArquivoParaSelecao[],
): ArquivoSelecionado[] {
  // Classifica todos
  const classificados = arquivos.map((a) => ({
    ...a,
    tipo_documento: classificarDocumentoProcesso(a.nm_tipo_docm, a.nm_proc_arqv),
  }));

  const selecionados: ArquivoSelecionado[] = [];
  const tiposUsados = new Set<TipoDocumentoProcesso>();

  // 1. Um de cada tipo prioritário (mais recente por dt_criac)
  for (const tipo of TIPOS_PRIORITARIOS) {
    const candidatos = classificados
      .filter((a) => a.tipo_documento === tipo)
      .sort((a, b) => {
        if (!a.dt_criac && !b.dt_criac) return 0;
        if (!a.dt_criac) return 1;
        if (!b.dt_criac) return -1;
        const ta = new Date(a.dt_criac).getTime();
        const tb = new Date(b.dt_criac).getTime();
        return isNaN(ta) || isNaN(tb) ? 0 : tb - ta;
      });

    if (candidatos.length > 0) {
      selecionados.push(candidatos[0]);
      tiposUsados.add(tipo);
    }
  }

  return selecionados;
}
