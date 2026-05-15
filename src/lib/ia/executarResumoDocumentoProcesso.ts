import { dbQuery } from "@/lib/db";
import { chamarAzureOpenAI } from "./azureOpenAI";
import { instrucaoResumoDocumento, modeloResumoDocumento } from "./modelos/resumoDocumentoProcesso";
import { sha256 } from "./hash";
import { extrairTextoPdf, ErroExtracaoPdf } from "@/lib/processos/documentos/extrairTextoPdf";
import { LIMITE_CHARS_POR_TIPO } from "./documentos/selecionarDocumentosPrincipaisProcesso";
import type { ArquivoSelecionado } from "./documentos/selecionarDocumentosPrincipaisProcesso";
import type { ResumoDocumentoOutput } from "./tipos";

const PREFIXO_RESUMO_FALHA = "[FALHA NA EXTRAÇÃO";

// Resultado intermediário que pode indicar falha sem cachear
export interface ResumoDocumentoResultado extends ResumoDocumentoOutput {
  falha_extracao?: string;  // código ErroExtracaoPdf se houve falha
}

export async function executarResumoDocumentoProcesso(
  processoId: number,
  arquivo: ArquivoSelecionado,
): Promise<ResumoDocumentoResultado> {
  const nmArqv = arquivo.nm_proc_arqv ?? "";
  if (!nmArqv) {
    return {
      id_proc_arqv: arquivo.id_proc_arqv,
      tipo_documento: arquivo.tipo_documento,
      nm_proc_arqv: nmArqv,
      resumo: "Nome do arquivo não disponível.",
      do_cache: false,
      falha_extracao: "SEM_NOME",
    };
  }

  // Extrai texto — passa en_dir para URL correta no servidor
  let textoCompleto: string;
  try {
    textoCompleto = await extrairTextoPdf(processoId, nmArqv);
  } catch (err) {
    const codigo = err instanceof ErroExtracaoPdf ? err.codigo : "PARSE_ERRO";
    const mensagem = err instanceof Error ? err.message : String(err);
    console.warn(`[executarResumoDocumento] Falha na extração: ${codigo} | ${mensagem}`);
    // Não salva no cache — falha não deve ser persistida
    return {
      id_proc_arqv: arquivo.id_proc_arqv,
      tipo_documento: arquivo.tipo_documento,
      nm_proc_arqv: nmArqv,
      resumo: `Falha na extração do documento (${codigo}): ${mensagem}`,
      do_cache: false,
      falha_extracao: codigo,
    };
  }

  const limite = LIMITE_CHARS_POR_TIPO[arquivo.tipo_documento];
  const texto = textoCompleto.slice(0, limite);
  const hash = sha256(texto);

  // Verifica cache — ignora entradas antigas que indicam falha de extração
  const cached = await dbQuery<{ resumo: string }>(
    `SELECT resumo FROM public.ia_resumo_documento_processo
     WHERE hash_conteudo = $1 LIMIT 1`,
    [hash],
  );

  if (cached.length > 0 && !cached[0].resumo.startsWith(PREFIXO_RESUMO_FALHA)) {
    return {
      id_proc_arqv: arquivo.id_proc_arqv,
      tipo_documento: arquivo.tipo_documento,
      nm_proc_arqv: nmArqv,
      resumo: cached[0].resumo,
      do_cache: true,
    };
  }

  // Se havia cache com falha, limpa para permitir reprocessamento
  if (cached.length > 0) {
    await dbQuery(
      `DELETE FROM public.ia_resumo_documento_processo WHERE hash_conteudo = $1`,
      [hash],
    );
    console.log(`[executarResumoDocumento] Cache inválido removido para hash=${hash.slice(0, 12)}...`);
  }

  // Chama Azure OpenAI para resumo do documento
  const systemPrompt = instrucaoResumoDocumento(arquivo.tipo_documento);
  const userPrompt = `Arquivo: ${nmArqv}\n\nTrecho do documento:\n\n${texto}`;

  const resumo = await chamarAzureOpenAI({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.15,
    maxCompletionTokens: 2500,
    jsonMode: false,
  });

  // Persiste no cache apenas quando houve extração e resumo com conteúdo real
  await dbQuery(
    `INSERT INTO public.ia_resumo_documento_processo
       (id_proc_arqv, processo_id, hash_conteudo, tipo_documento, nm_proc_arqv, resumo, modelo_versao)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (hash_conteudo) DO NOTHING`,
    [
      arquivo.id_proc_arqv,
      processoId,
      hash,
      arquivo.tipo_documento,
      nmArqv,
      resumo,
      modeloResumoDocumento.versao,
    ],
  );

  return {
    id_proc_arqv: arquivo.id_proc_arqv,
    tipo_documento: arquivo.tipo_documento,
    nm_proc_arqv: nmArqv,
    resumo,
    do_cache: false,
  };
}
