/**
 * credor-enriquecimento-preparar.ts
 *
 * Prepara a lista de credores únicos de fato_empenho para enriquecimento:
 * - normaliza CPF/CNPJ;
 * - identifica tipo de documento;
 * - cruza com dim_credor para nome_original;
 * - insere/atualiza dw.dim_credor_enriquecido;
 * - registra em audit.credor_enriquecimento_log.
 *
 * Uso: cd etl && npm run credor:enriquecimento:preparar
 */

import "dotenv/config";
import { pgQuery, withPgTransaction, closePgPool } from "../connectors/postgres";

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

function normalizar(doc: string | null | undefined): string {
  if (!doc) return "";
  return doc.replace(/\D/g, "");
}

function tipoDocumento(digits: string): "CPF" | "CNPJ" | "DESCONHECIDO" {
  if (digits.length === 11) return "CPF";
  if (digits.length === 14) return "CNPJ";
  return "DESCONHECIDO";
}

function formatarCPF(d: string): string {
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatarCNPJ(d: string): string {
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function nomeExibicaoFallback(digits: string, tipo: string): string {
  if (tipo === "CPF")  return formatarCPF(digits);
  if (tipo === "CNPJ") return formatarCNPJ(digits);
  return digits;
}

function statusInicial(tipo: string, temNome: boolean): string {
  if (tipo === "DESCONHECIDO") return "DOCUMENTO_INVALIDO";
  if (temNome) return "JA_IDENTIFICADO";
  if (tipo === "CNPJ") return "PENDENTE_CNPJ";
  return "PENDENTE_CPF_INTERNO";
}

// -------------------------------------------------------
// Main
// -------------------------------------------------------

async function main() {
  const inicio = Date.now();
  console.log("[credor:preparar] Iniciando preparação de credores...");

  // 1. Busca documentos distintos de fato_empenho
  const docRows = await pgQuery<{ cpf_cnpj_credor: string }>(`
    SELECT DISTINCT cpf_cnpj_credor
    FROM public.fato_empenho
    WHERE cpf_cnpj_credor IS NOT NULL
      AND trim(cpf_cnpj_credor) <> ''
  `);
  console.log(`[credor:preparar] ${docRows.length} documentos distintos em fato_empenho.`);

  // 2. Busca nomes já existentes em dim_credor (cpf_cnpj -> nome)
  const credorRows = await pgQuery<{ cnpj_cpf: string; nome: string }>(`
    SELECT cnpj_cpf, nome FROM public.dim_credor WHERE cnpj_cpf IS NOT NULL
  `);
  const credorMap = new Map<string, string>();
  for (const r of credorRows) {
    const digits = normalizar(r.cnpj_cpf);
    if (digits && r.nome?.trim()) {
      credorMap.set(digits, r.nome.trim());
    }
  }
  console.log(`[credor:preparar] ${credorMap.size} credores com nome em dim_credor.`);

  // 3. Processa cada documento
  let inseridos = 0;
  let atualizados = 0;
  let invalidos = 0;
  const logEntries: Array<{ cpf_cnpj: string; tipo: string; status: string; mensagem: string }> = [];

  await withPgTransaction(async (client) => {
    for (const row of docRows) {
      const digits = normalizar(row.cpf_cnpj_credor);
      if (!digits) continue;

      const tipo = tipoDocumento(digits);
      const nomeOriginal = credorMap.get(digits) ?? null;
      const temNome = !!nomeOriginal;
      const nomeExibicao = nomeOriginal ?? nomeExibicaoFallback(digits, tipo);
      const status = statusInicial(tipo, temNome);

      if (tipo === "DESCONHECIDO") invalidos++;

      // Upsert em dw.dim_credor_enriquecido
      const res = await client.query<{ xmax: string }>(`
        INSERT INTO dw.dim_credor_enriquecido
          (cpf_cnpj, tipo_documento, nome_original, nome_exibicao, status_consulta, atualizado_em)
        VALUES ($1, $2, $3, $4, $5, now())
        ON CONFLICT (cpf_cnpj) DO UPDATE SET
          tipo_documento   = EXCLUDED.tipo_documento,
          nome_original    = COALESCE(EXCLUDED.nome_original, dw.dim_credor_enriquecido.nome_original),
          nome_exibicao    = CASE
            WHEN dw.dim_credor_enriquecido.nome_enriquecido IS NOT NULL THEN dw.dim_credor_enriquecido.nome_exibicao
            WHEN EXCLUDED.nome_original IS NOT NULL THEN EXCLUDED.nome_exibicao
            ELSE dw.dim_credor_enriquecido.nome_exibicao
          END,
          status_consulta  = CASE
            WHEN dw.dim_credor_enriquecido.nome_enriquecido IS NOT NULL THEN dw.dim_credor_enriquecido.status_consulta
            ELSE EXCLUDED.status_consulta
          END,
          atualizado_em    = now()
        RETURNING xmax
      `, [digits, tipo, nomeOriginal, nomeExibicao, status]);

      const wasInsert = res.rows[0]?.xmax === "0";
      if (wasInsert) inseridos++; else atualizados++;

      logEntries.push({ cpf_cnpj: digits, tipo, status, mensagem: nomeOriginal ? `nome: ${nomeOriginal.slice(0, 30)}` : "sem nome" });
    }

    // Grava log em lote
    for (const entry of logEntries) {
      await client.query(`
        INSERT INTO audit.credor_enriquecimento_log (cpf_cnpj, tipo_documento, fonte, status, mensagem)
        VALUES ($1, $2, 'PREPARACAO', $3, $4)
      `, [entry.cpf_cnpj, entry.tipo, entry.status, entry.mensagem]);
    }
  });

  const duracao = Date.now() - inicio;
  console.log(`[credor:preparar] Concluído em ${duracao}ms — inseridos: ${inseridos}, atualizados: ${atualizados}, inválidos: ${invalidos}.`);

  await pgQuery(`
    INSERT INTO audit.etl_log (modulo, status, mensagem, registros, duracao_ms)
    VALUES ('credor:preparar', 'OK', 'Preparação de credores concluída', $1, $2)
  `, [inseridos + atualizados, duracao]);
}

main()
  .then(() => closePgPool())
  .catch((err) => {
    console.error("[credor:preparar] Erro:", (err as Error).message);
    closePgPool().catch(() => void 0);
    process.exit(1);
  });
