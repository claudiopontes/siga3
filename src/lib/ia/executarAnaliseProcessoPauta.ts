import { dbQuery } from "@/lib/db";
import { chamarAzureOpenAI } from "./azureOpenAI";
import {
  montarSystemPromptAnalise,
  montarUserPromptAnalise,
  AVISO_REVISAO_PROCESSO,
  modeloAnaliseProcessoPauta,
} from "./modelos/analiseProcessoPauta";
import { sha256 } from "./hash";
import { executarResumoDocumentoProcesso, type ResumoDocumentoResultado } from "./executarResumoDocumentoProcesso";
import { selecionarDocumentosPrincipaisProcesso } from "./documentos/selecionarDocumentosPrincipaisProcesso";
import {
  renderizarLinhaRelatorioSucintoHtml,
  renderizarAnaliseProcessoCompletaHtml,
  VERSAO_FORMATO_HTML_ANALISE_PROCESSO,
} from "./relatorios/renderizarAnaliseProcessoHtml";
import type { AnaliseProcessoPautaInput, AnaliseProcessoPautaOutput } from "./tipos";

interface ArquivoRow {
  id_proc_arqv: number;
  nm_proc_arqv: string | null;
  nm_tipo_docm: string | null;
  nr_pagn: number | null;
  dt_criac: string | null;
  en_dir: string | null;
}

interface CacheRow {
  id: number;
  resultado_json: AnaliseProcessoPautaOutput;
  html_linha_sucinta: string | null;
  html_relatorio: string | null;
  formato_html_versao: string | null;
  descartado: boolean;
}

function gerarHtml(analise: AnaliseProcessoPautaOutput): {
  html_linha_sucinta: string;
  html_relatorio: string;
} {
  return {
    html_linha_sucinta: renderizarLinhaRelatorioSucintoHtml(analise),
    html_relatorio: renderizarAnaliseProcessoCompletaHtml(analise),
  };
}

export async function executarAnaliseProcessoPauta(
  processoId: number,
): Promise<AnaliseProcessoPautaOutput> {
  // 1. Busca dados do processo
  const processoRows = await dbQuery<AnaliseProcessoPautaInput>(
    `SELECT
       p.processo_id, p.numero_fmt, p.nome_classe, p.assunto, p.objeto,
       p.nome_relator, p.nome_orgao, p.nome_1_parte, p.situacao,
       (
         SELECT m.grupo_desc
         FROM public.pauta_julgamento_movimentacao m
         WHERE m.processo_id = p.processo_id
           AND m.dt_saida IS NULL
           AND m.grupo_desc IS NOT NULL
         ORDER BY m.dt_mov DESC NULLS LAST, m.id DESC
         LIMIT 1
       ) AS setor_atual
     FROM public.processo p
     WHERE p.processo_id = $1`,
    [processoId],
  );

  if (!processoRows.length) {
    throw new Error(`Processo ${processoId} não encontrado.`);
  }

  const processo = processoRows[0];

  // 2. Busca arquivos assinados e não desentranhados
  const arquivosRows = await dbQuery<ArquivoRow>(
    `SELECT id_proc_arqv, nm_proc_arqv, nm_tipo_docm, nr_pagn, dt_criac, en_dir
     FROM public.pauta_julgamento_arquivo
     WHERE processo_id = $1
       AND (desentranhado IS NOT TRUE)
       AND ic_documento_assinado = 'true'
     ORDER BY nr_ordem ASC NULLS LAST, dt_criac ASC`,
    [processoId],
  );

  // 3. Seleciona documentos prioritários para análise prévia de pauta:
  //    apenas relatorio_tecnico e parecer_mpc — o voto do relator normalmente
  //    não está disponível antes do julgamento e não deve ser exigido.
  const arquivosSelecionados = selecionarDocumentosPrincipaisProcesso(
    arquivosRows,
    { modo: "pauta_pre_julgamento" },
  );

  // 4. Gera resumos (com cache por documento)
  const resumos: AnaliseProcessoPautaOutput["documentos_analisados"] = [];
  const resumosParaHash: string[] = [];
  const falhasExtracao: NonNullable<AnaliseProcessoPautaOutput["documentos_com_falha_extracao"]> = [];

  for (const arq of arquivosSelecionados) {
    const resultado: ResumoDocumentoResultado = await executarResumoDocumentoProcesso(processoId, arq);
    if (resultado.falha_extracao) {
      falhasExtracao.push({
        nome: resultado.nm_proc_arqv,
        tipo: resultado.tipo_documento,
        motivo: resultado.resumo,
      });
      // Inclui nos documentos para a IA saber que houve tentativa mas falhou
      resumos.push({
        tipo: resultado.tipo_documento,
        nome: resultado.nm_proc_arqv,
        resumo: `[FALHA NA EXTRAÇÃO — ${resultado.falha_extracao}] ${resultado.resumo}`,
      });
    } else {
      resumos.push({
        tipo: resultado.tipo_documento,
        nome: resultado.nm_proc_arqv,
        resumo: resultado.resumo,
      });
    }
    resumosParaHash.push(`${resultado.tipo_documento}:${resultado.nm_proc_arqv}:${resultado.resumo}`);
  }

  // 4b. Se todos os documentos falharam na extração, retorna erro técnico imediato
  if (arquivosSelecionados.length > 0 && falhasExtracao.length === arquivosSelecionados.length) {
    const detalhes = falhasExtracao
      .map((f) => `• ${f.tipo.replace(/_/g, " ")}: ${f.nome} — ${f.motivo}`)
      .join("\n");
    throw new Error(
      `Os documentos principais foram encontrados, mas não foi possível extrair texto dos PDFs.\n` +
      `Verifique a configuração de leitura dos arquivos (URL, en_dir, pdf-parse).\n\n${detalhes}`,
    );
  }

  // 5. Monta hash de contexto para cache da análise final
  const contextoParaHash = [
    `processo:${processoId}`,
    `numero:${processo.numero_fmt ?? ""}`,
    `classe:${processo.nome_classe ?? ""}`,
    `assunto:${processo.assunto ?? ""}`,
    `relator:${processo.nome_relator ?? ""}`,
    `setor:${processo.setor_atual ?? ""}`,
    ...resumosParaHash,
  ].join("|");

  const hashContexto = sha256(contextoParaHash);

  // 6. Verifica cache da análise final — ignora registros descartados
  const cachedRows = await dbQuery<CacheRow>(
    `SELECT id, resultado_json, html_linha_sucinta, html_relatorio, formato_html_versao, descartado
     FROM public.ia_analise_processo_pauta
     WHERE hash_contexto = $1 AND modelo_versao = $2 AND descartado = false LIMIT 1`,
    [hashContexto, modeloAnaliseProcessoPauta.versao],
  );

  if (cachedRows.length > 0) {
    const cached = cachedRows[0];
    const analise: AnaliseProcessoPautaOutput = {
      ...cached.resultado_json,
      processo_id: processoId,
      numero_fmt: processo.numero_fmt ?? null,
      do_cache: true,
      analise_id: cached.id,
      // Garante que documentos_analisados usa sempre nossos tipos corretos
      documentos_analisados: resumos,
    };

    // Regenera HTML se estiver ausente (compatibilidade com análises antigas)
    if (!cached.html_relatorio || !cached.html_linha_sucinta) {
      const { html_linha_sucinta, html_relatorio } = gerarHtml(analise);
      await dbQuery(
        `UPDATE public.ia_analise_processo_pauta
         SET html_linha_sucinta = $1, html_relatorio = $2, formato_html_versao = $3
         WHERE id = $4`,
        [html_linha_sucinta, html_relatorio, VERSAO_FORMATO_HTML_ANALISE_PROCESSO, cached.id],
      );
      analise.html_linha_sucinta = html_linha_sucinta;
      analise.html_relatorio = html_relatorio;
    } else {
      analise.html_linha_sucinta = cached.html_linha_sucinta ?? undefined;
      analise.html_relatorio = cached.html_relatorio ?? undefined;
    }

    analise.formato_html_versao = VERSAO_FORMATO_HTML_ANALISE_PROCESSO;
    return analise;
  }

  // 7. Detecta se o processo é um recurso/embargos para avisar a IA
  const TERMOS_RECURSO = /recurso|embargos|reconsideração|reconsideracao|agravo/i;
  const ehRecurso = TERMOS_RECURSO.test(processo.nome_classe ?? "") ||
                    TERMOS_RECURSO.test(processo.assunto ?? "");

  // TODO: Se for recurso, buscar processo originário/recorrido (número e decisão recorrida)
  //       na base do EPROCESS quando o relacionamento estiver mapeado na estrutura de dados.
  //       Por ora, apenas avisa a IA sobre a ausência desses dados.

  // TODO: Futuramente, consultar banco de jurisprudência do TCE por assunto/classe/teses
  //       para comparar decisões semelhantes antes do julgamento.

  // 8. Chama Azure OpenAI para análise final
  const systemPrompt = montarSystemPromptAnalise();
  const userPrompt = montarUserPromptAnalise({
    numero_fmt: processo.numero_fmt ?? null,
    nome_classe: processo.nome_classe ?? null,
    assunto: processo.assunto ?? null,
    objeto: processo.objeto ?? null,
    nome_relator: processo.nome_relator ?? null,
    nome_orgao: processo.nome_orgao ?? null,
    nome_1_parte: processo.nome_1_parte ?? null,
    situacao: processo.situacao ?? null,
    setor_atual: processo.setor_atual ?? null,
    resumos,
    eh_recurso: ehRecurso,
  });

  const conteudoBruto = await chamarAzureOpenAI({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
    maxCompletionTokens: 6000,
    jsonMode: true,
  });

  let parsed: Omit<AnaliseProcessoPautaOutput, "processo_id" | "numero_fmt" | "gerado_em" | "do_cache" | "ha_divergencia" | "tipo_divergencia" | "html_linha_sucinta" | "html_relatorio" | "formato_html_versao">;
  try {
    parsed = JSON.parse(conteudoBruto);
  } catch {
    throw new Error(`Resposta da IA não é JSON válido. Raw: ${conteudoBruto.slice(0, 500)}`);
  }

  parsed.aviso_revisao = AVISO_REVISAO_PROCESSO;

  const resultado: AnaliseProcessoPautaOutput = {
    ...parsed,
    processo_id: processoId,
    numero_fmt: processo.numero_fmt ?? null,
    gerado_em: new Date().toISOString(),
    do_cache: false,
    // Sempre usa nossos resumos como documentos_analisados — garante tipo correto para lookup no renderer
    documentos_analisados: resumos,
    ...(falhasExtracao.length > 0 && { documentos_com_falha_extracao: falhasExtracao }),
  };

  // 9. Gera HTML localmente a partir do JSON
  const { html_linha_sucinta, html_relatorio } = gerarHtml(resultado);
  resultado.html_linha_sucinta = html_linha_sucinta;
  resultado.html_relatorio = html_relatorio;
  resultado.formato_html_versao = VERSAO_FORMATO_HTML_ANALISE_PROCESSO;

  // 10. Persiste cache com JSON + HTML — RETURNING id para popular analise_id
  // ON CONFLICT reseta descartado=false para o caso em que a análise foi descartada mas o
  // conteúdo do processo não mudou (hash idêntico). Sem esse reset, a linha ficaria descartada
  // e o relatório continuaria mostrando o processo como pendente.
  interface InsertRow { id: number }
  const insertRows = await dbQuery<InsertRow>(
    `INSERT INTO public.ia_analise_processo_pauta
       (processo_id, hash_contexto, numero_fmt, resultado_json, modelo_versao,
        html_linha_sucinta, html_relatorio, formato_html_versao)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (hash_contexto) DO UPDATE
       SET processo_id         = EXCLUDED.processo_id,
           resultado_json      = EXCLUDED.resultado_json,
           html_linha_sucinta  = EXCLUDED.html_linha_sucinta,
           html_relatorio      = EXCLUDED.html_relatorio,
           formato_html_versao = EXCLUDED.formato_html_versao,
           numero_fmt          = EXCLUDED.numero_fmt,
           descartado          = false,
           descartado_por      = NULL,
           descartado_em       = NULL,
           motivo_descarte     = NULL
     RETURNING id`,
    [
      processoId,
      hashContexto,
      processo.numero_fmt ?? null,
      JSON.stringify(resultado),
      modeloAnaliseProcessoPauta.versao,
      html_linha_sucinta,
      html_relatorio,
      VERSAO_FORMATO_HTML_ANALISE_PROCESSO,
    ],
  );

  if (insertRows.length > 0) {
    resultado.analise_id = insertRows[0].id;
  }

  return resultado;
}
