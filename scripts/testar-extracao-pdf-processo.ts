/**
 * Diagnóstico de extração de texto de PDFs do EPROCESS.
 *
 * Usa exatamente a mesma lógica de seleção de documentos que executarAnaliseProcessoPauta:
 *   1. Busca todos os arquivos assinados e não desentranhados no PostgreSQL
 *   2. Aplica selecionarDocumentosPrincipaisProcesso (1 por tipo prioritário)
 *   3. Tenta extrairTextoPdf para cada selecionado
 *
 * Uso:
 *   npx ts-node --project etl/tsconfig.json scripts/testar-extracao-pdf-processo.ts <processoId> [arquivoId]
 *
 * Exemplos:
 *   npx ts-node --project etl/tsconfig.json scripts/testar-extracao-pdf-processo.ts 141831
 *   npx ts-node --project etl/tsconfig.json scripts/testar-extracao-pdf-processo.ts 141831 98765
 */

import * as path from "path";
import * as fs from "fs";

// Carrega .env.local manualmente (não há dotenv no pacote principal)
const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
  console.log(`[env] Carregado: ${envPath}`);
} else {
  console.warn(`[env] Arquivo não encontrado: ${envPath} — usando variáveis de ambiente do sistema`);
}

import { Pool } from "pg";
import { extrairTextoPdf, ErroExtracaoPdf } from "../src/lib/processos/documentos/extrairTextoPdf";
import { selecionarDocumentosPrincipaisProcesso } from "../src/lib/ia/documentos/selecionarDocumentosPrincipaisProcesso";
import type { ArquivoParaSelecao } from "../src/lib/ia/documentos/selecionarDocumentosPrincipaisProcesso";

const pool = new Pool({
  host:     process.env.PGHOST     ?? "localhost",
  port:     Number(process.env.PGPORT ?? "5432"),
  database: process.env.PGDATABASE ?? "varadouro_digital",
  user:     process.env.PGUSER     ?? "varadouro",
  password: process.env.PGPASSWORD ?? "varadouro_dev",
});

async function query<T extends object>(sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool.query(sql, params);
  return res.rows as T[];
}

async function main() {
  const args = process.argv.slice(2);
  const processoId = Number(args[0]);
  const arquivoId  = args[1] ? Number(args[1]) : null;

  if (!processoId || isNaN(processoId)) {
    console.error("Uso: testar-extracao-pdf-processo.ts <processoId> [arquivoId]");
    process.exit(1);
  }

  const repoBase = process.env.REPOSITORIO_BASE_URL ?? "http://172.20.12.105:8090";
  console.log(`\n${"═".repeat(60)}`);
  console.log(` Diagnóstico de extração PDF — processo ${processoId}`);
  console.log(` Repositório: ${repoBase}`);
  console.log(`${"═".repeat(60)}\n`);

  // Busca documentos — mesma query de executarAnaliseProcessoPauta
  interface ArqRow extends ArquivoParaSelecao {
    id_proc_arqv: number;
    nm_tipo_docm: string | null;
    nm_proc_arqv: string | null;
    nr_pagn: number | null;
    dt_criac: string | null;
    en_dir: string | null;
  }

  let sql: string;
  const params: unknown[] = [processoId];

  if (arquivoId) {
    sql = `SELECT id_proc_arqv, nm_tipo_docm, nm_proc_arqv, nr_pagn, dt_criac, en_dir
           FROM public.pauta_julgamento_arquivo
           WHERE processo_id = $1 AND id_proc_arqv = $2
             AND (desentranhado IS NOT TRUE) AND ic_documento_assinado = 'true'`;
    params.push(arquivoId);
  } else {
    sql = `SELECT id_proc_arqv, nm_tipo_docm, nm_proc_arqv, nr_pagn, dt_criac, en_dir
           FROM public.pauta_julgamento_arquivo
           WHERE processo_id = $1
             AND (desentranhado IS NOT TRUE)
             AND ic_documento_assinado = 'true'
           ORDER BY nr_ordem ASC NULLS LAST, dt_criac ASC`;
  }

  const todos = await query<ArqRow>(sql, params);

  if (!todos.length) {
    console.log("Nenhum documento encontrado para os critérios informados.");
    process.exit(0);
  }

  console.log(`Total de documentos assinados no processo: ${todos.length}`);

  // Aplica mesma seleção de executarAnaliseProcessoPauta
  const selecionados = arquivoId ? todos : selecionarDocumentosPrincipaisProcesso(todos);

  console.log(`Documentos selecionados para análise: ${selecionados.length}\n`);

  for (const arq of selecionados) {
    const pasta = arq.en_dir?.trim() || String(processoId).padStart(5, "0");
    const urlExibicao = `[repositorio]/${pasta}/${arq.nm_proc_arqv ?? ""}`;

    console.log(`${"─".repeat(60)}`);
    console.log(` id_proc_arqv : ${arq.id_proc_arqv}`);
    console.log(` tipo         : ${"tipo_documento" in arq ? (arq as { tipo_documento: string }).tipo_documento : "(não classificado)"}`);
    console.log(` nm_tipo_docm : ${arq.nm_tipo_docm ?? "(sem tipo)"}`);
    console.log(` arquivo      : ${arq.nm_proc_arqv ?? "(sem nome)"}`);
    console.log(` en_dir       : ${arq.en_dir ?? "(null — usará fallback processoId)"}`);
    console.log(` pasta usada  : "${pasta}"`);
    console.log(` url esperada : ${urlExibicao}`);
    console.log(` páginas      : ${arq.nr_pagn ?? "?"}`);
    console.log(` dt_criac     : ${arq.dt_criac ? new Date(arq.dt_criac).toLocaleDateString("pt-BR") : "?"}`);

    if (!arq.nm_proc_arqv) {
      console.log(` RESULTADO    : ❌ nm_proc_arqv nulo — impossível buscar PDF\n`);
      continue;
    }

    try {
      const texto = await extrairTextoPdf(processoId, arq.nm_proc_arqv);
      const charsUteis = texto.replace(/\s+/g, "").length;
      console.log(` RESULTADO    : ✅ OK`);
      console.log(` chars totais : ${texto.length}`);
      console.log(` chars úteis  : ${charsUteis}`);
      console.log(`\n Primeiros 500 caracteres:`);
      console.log(`\n${texto.slice(0, 500).replace(/\n{3,}/g, "\n\n")}\n`);
    } catch (err) {
      if (err instanceof ErroExtracaoPdf) {
        console.log(` RESULTADO    : ❌ ${err.codigo}`);
        console.log(` mensagem     : ${err.message}\n`);
      } else {
        console.log(` RESULTADO    : ❌ ERRO INESPERADO`);
        console.log(` mensagem     : ${err instanceof Error ? err.message : String(err)}\n`);
      }
    }
  }

  console.log(`\n${"═".repeat(60)}\n`);
}

main()
  .catch((err) => { console.error("Erro fatal:", err); process.exit(1); })
  .finally(() => pool.end());
