import { dbQuery } from "@/lib/db";
import { sha256 } from "@/lib/ia/hash";
import {
  renderizarRelatorioResumoPautaHtml,
  VERSAO_TEMPLATE_RELATORIO_RESUMO_PAUTA,
  type LinhaRelatorioResumoPauta,
  type RelatorioResumoPautaInput,
} from "./renderizarRelatorioResumoPautaHtml";
import {
  renderizarLinhaRelatorioSucintoHtml,
  VERSAO_FORMATO_HTML_ANALISE_PROCESSO,
  type ContextoLinhaPauta,
} from "./renderizarAnaliseProcessoHtml";
import type { AnaliseProcessoPautaOutput } from "@/lib/ia/tipos";

interface SessaoRow {
  id: number;
  numero: string | null;
  dt_realizacao: string | null;
  tipo: string | null;
  local_sessao: string | null;
  situacao: string | null;
  orgao_julgador: string | null;
}

interface ItemComAnalise {
  item_id: number;
  processo_id: number | null;
  sequencia: number | null;
  numero_processo_fmt: string | null;
  nome_orgao: string | null;
  nome_relator: string | null;
  nome_1_parte: string | null;
  objeto_processo: string | null;
  analise_id: number | null;
  hash_contexto_analise: string | null;
  html_linha_sucinta: string | null;
  formato_html_versao: string | null;
  resultado_json: AnaliseProcessoPautaOutput | null;
}

interface CacheRelatorio {
  id: number;
  html_relatorio: string;
  resumo_json: ResumoJson;
  total_processos: number;
  total_analisados: number;
  total_pendentes: number;
}

interface ResumoJson {
  linhas: LinhaRelatorioResumoPauta[];
  pendentes: LinhaRelatorioResumoPauta[];
}

export type RelatorioResumoPautaResult = {
  sessao: SessaoRow;
  total_processos: number;
  total_analisados: number;
  total_pendentes: number;
  linhas: LinhaRelatorioResumoPauta[];
  pendentes: LinhaRelatorioResumoPauta[];
  html_relatorio: string;
  relatorio_id: number | null;
  hash_contexto: string;
  origem_cache: boolean;
};

export async function montarRelatorioResumoPauta(params: {
  sessaoId: string | number;
}): Promise<RelatorioResumoPautaResult> {
  const sessaoId = Number(params.sessaoId);

  // 1. Buscar sessão
  const sessaoRows = await dbQuery<SessaoRow>(
    `SELECT id, numero, dt_realizacao, tipo, local_sessao, situacao, orgao_julgador
     FROM public.pauta_julgamento_sessao
     WHERE id = $1`,
    [sessaoId],
  );

  if (!sessaoRows.length) {
    throw Object.assign(new Error(`Sessão ${sessaoId} não encontrada.`), { status: 404 });
  }

  const sessao = sessaoRows[0];

  // 2. Buscar itens da pauta com análise IA mais recente não descartada — LATERAL JOIN, sem N+1
  //    Inclui nome_1_parte da tabela processo para preencher coluna Responsável no relatório.
  const itens = await dbQuery<ItemComAnalise>(
    `SELECT
       pji.id              AS item_id,
       pji.processo_id,
       pji.sequencia,
       pji.numero_processo_fmt,
       pji.nome_orgao,
       pji.nome_relator,
       p.nome_1_parte,
       p.objeto            AS objeto_processo,
       iap.id              AS analise_id,
       iap.hash_contexto   AS hash_contexto_analise,
       iap.html_linha_sucinta,
       iap.formato_html_versao,
       iap.resultado_json
     FROM public.pauta_julgamento_item pji
     LEFT JOIN public.processo p ON p.processo_id = pji.processo_id
     LEFT JOIN LATERAL (
       SELECT id, hash_contexto, html_linha_sucinta, formato_html_versao, resultado_json
       FROM public.ia_analise_processo_pauta
       WHERE processo_id = pji.processo_id
         AND descartado = false
       ORDER BY id DESC
       LIMIT 1
     ) iap ON pji.processo_id IS NOT NULL
     WHERE pji.sessao_id = $1
     ORDER BY pji.sequencia NULLS LAST, pji.id`,
    [sessaoId],
  );

  // 3. Calcular hash do contexto do relatório
  //    Inclui: sessao_id, processo_ids em ordem, analise_ids e hash_contextos usados, versão do template
  const hashPartes: string[] = [
    `sessao:${sessaoId}`,
    `template:${VERSAO_TEMPLATE_RELATORIO_RESUMO_PAUTA}`,
  ];
  for (const item of itens) {
    hashPartes.push(
      `proc:${item.processo_id ?? "null"}` +
      `:analise:${item.analise_id ?? "null"}` +
      `:hash:${item.hash_contexto_analise ?? "null"}`,
    );
  }
  const hashContexto = sha256(hashPartes.join("|"));

  // 4. Verificar cache de relatório consolidado — mesma sessão, hash e template, não descartado
  const cacheRows = await dbQuery<CacheRelatorio>(
    `SELECT id, html_relatorio, resumo_json, total_processos, total_analisados, total_pendentes
     FROM public.ia_relatorio_resumo_pauta
     WHERE sessao_id = $1
       AND hash_contexto = $2
       AND versao_template = $3
       AND descartado = false
     ORDER BY id DESC
     LIMIT 1`,
    [sessaoId, hashContexto, VERSAO_TEMPLATE_RELATORIO_RESUMO_PAUTA],
  );

  if (cacheRows.length > 0) {
    const cache = cacheRows[0];
    const resumo = cache.resumo_json;
    return {
      sessao,
      total_processos: cache.total_processos,
      total_analisados: cache.total_analisados,
      total_pendentes: cache.total_pendentes,
      linhas: resumo.linhas,
      pendentes: resumo.pendentes,
      html_relatorio: cache.html_relatorio,
      relatorio_id: cache.id,
      hash_contexto: hashContexto,
      origem_cache: true,
    };
  }

  // 5. Montar linhas e pendentes
  const linhas: LinhaRelatorioResumoPauta[] = [];
  const pendentes: LinhaRelatorioResumoPauta[] = [];
  const atualizarHtml: { id: number; html: string }[] = [];

  for (const item of itens) {
    const numeroProceso = item.numero_processo_fmt ?? String(item.processo_id ?? "—");

    if (!item.analise_id) {
      pendentes.push({
        processo_id: item.processo_id ?? 0,
        numero_processo: numeroProceso,
        sequencia: item.sequencia,
        analisado: false,
        motivo_pendente: "Sem análise IA registrada",
      });
      continue;
    }

    let htmlLinha = item.html_linha_sucinta;

    // Regenerar se html_linha_sucinta estiver ausente OU se a versão do formato estiver desatualizada
    const versaoDesatualizada = item.formato_html_versao !== VERSAO_FORMATO_HTML_ANALISE_PROCESSO;
    if ((!htmlLinha || versaoDesatualizada) && item.resultado_json) {
      const analise: AnaliseProcessoPautaOutput = {
        ...item.resultado_json,
        processo_id: item.processo_id ?? 0,
        numero_fmt: item.numero_processo_fmt ?? null,
      };
      const contexto: ContextoLinhaPauta = {
        entidade:         item.nome_orgao ?? null,
        responsavel:      item.nome_1_parte ?? null,
        relator:          item.nome_relator ?? null,
        objeto_processo:  item.objeto_processo ?? null,
      };
      htmlLinha = renderizarLinhaRelatorioSucintoHtml(analise, item.sequencia, contexto);
      atualizarHtml.push({ id: item.analise_id, html: htmlLinha });
    }

    if (htmlLinha) {
      linhas.push({
        processo_id: item.processo_id ?? 0,
        numero_processo: numeroProceso,
        sequencia: item.sequencia,
        analisado: true,
        html_linha_sucinta: htmlLinha,
      });
    } else {
      pendentes.push({
        processo_id: item.processo_id ?? 0,
        numero_processo: numeroProceso,
        sequencia: item.sequencia,
        analisado: false,
        motivo_pendente: "Análise registrada mas linha HTML não pôde ser gerada",
      });
    }
  }

  // 6. Persistir html_linha_sucinta regenerados (melhor esforço, não bloqueia)
  for (const { id, html } of atualizarHtml) {
    await dbQuery(
      `UPDATE public.ia_analise_processo_pauta
       SET html_linha_sucinta = $1, formato_html_versao = $2
       WHERE id = $3`,
      [html, VERSAO_FORMATO_HTML_ANALISE_PROCESSO, id],
    ).catch((e: unknown) => {
      console.warn("[montarRelatorioResumoPauta] Falha ao atualizar html_linha_sucinta:", e);
    });
  }

  // 7. Renderizar HTML consolidado
  const relatorioInput: RelatorioResumoPautaInput = { sessao, linhas, pendentes };
  const html_relatorio = renderizarRelatorioResumoPautaHtml(relatorioInput);

  const totalProcessos = linhas.length + pendentes.length;
  const resumoJson: ResumoJson = { linhas, pendentes };

  // 8. Salvar relatório consolidado no banco
  interface InsertRelatorio { id: number }
  let relatorioId: number | null = null;
  try {
    const insertRows = await dbQuery<InsertRelatorio>(
      `INSERT INTO public.ia_relatorio_resumo_pauta
         (sessao_id, hash_contexto, versao_template, html_relatorio, resumo_json,
          total_processos, total_analisados, total_pendentes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (sessao_id, hash_contexto, versao_template) DO UPDATE
         SET atualizado_em = now()
       RETURNING id`,
      [
        sessaoId,
        hashContexto,
        VERSAO_TEMPLATE_RELATORIO_RESUMO_PAUTA,
        html_relatorio,
        JSON.stringify(resumoJson),
        totalProcessos,
        linhas.length,
        pendentes.length,
      ],
    );
    if (insertRows.length > 0) relatorioId = insertRows[0].id;
  } catch (e) {
    console.warn("[montarRelatorioResumoPauta] Falha ao salvar relatório consolidado:", e);
  }

  return {
    sessao,
    total_processos: totalProcessos,
    total_analisados: linhas.length,
    total_pendentes: pendentes.length,
    linhas,
    pendentes,
    html_relatorio,
    relatorio_id: relatorioId,
    hash_contexto: hashContexto,
    origem_cache: false,
  };
}
