/**
 * credor-enriquecer-interno.ts
 *
 * Enriquece credores pendentes consultando uma tabela interna do SQL Server.
 * Configurar via variáveis de ambiente (ver .env.example).
 *
 * Se CREDOR_INTERNO_TABLE não estiver configurada, encerra sem erro fatal.
 *
 * Uso: cd etl && npm run credor:enriquecer:interno
 */

import "dotenv/config";
import { queryInDatabase } from "../connectors/sqlserver";
import { pgQuery, withPgTransaction, closePgPool } from "../connectors/postgres";

// -------------------------------------------------------
// Configuração
// -------------------------------------------------------

const DB        = process.env.CREDOR_INTERNO_DATABASE         || "APC";
const TABELA    = process.env.CREDOR_INTERNO_TABLE            || "";
const COL_DOC   = process.env.CREDOR_INTERNO_DOCUMENTO_COLUMN || "";
const COL_NOME  = process.env.CREDOR_INTERNO_NOME_COLUMN      || "";
const COL_TIPO  = process.env.CREDOR_INTERNO_TIPO_DOCUMENTO_COLUMN || "";
const COL_CIDADE= process.env.CREDOR_INTERNO_CIDADE_COLUMN    || "";
const COL_UF    = process.env.CREDOR_INTERNO_UF_COLUMN        || "";
const COL_EMAIL = process.env.CREDOR_INTERNO_EMAIL_COLUMN     || "";
const COL_TEL   = process.env.CREDOR_INTERNO_TELEFONE_COLUMN  || "";

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

// -------------------------------------------------------
// Main
// -------------------------------------------------------

async function main() {
  if (!TABELA || !COL_DOC || !COL_NOME) {
    console.log("[credor:enriquecer:interno] CREDOR_INTERNO_TABLE, CREDOR_INTERNO_DOCUMENTO_COLUMN");
    console.log("  e CREDOR_INTERNO_NOME_COLUMN não estão configurados no .env.");
    console.log("  Execute primeiro: npm run credor:fontes:inspecionar");
    console.log("  Encerrando sem erro.");
    return;
  }

  const inicio = Date.now();
  console.log(`[credor:enriquecer:interno] Fonte: [${DB}].[${TABELA}]`);
  console.log(`[credor:enriquecer:interno] Colunas: doc=${COL_DOC}, nome=${COL_NOME}`);

  // 1. Busca credores pendentes no Postgres
  const pendentes = await pgQuery<{ cpf_cnpj: string; tipo_documento: string }>(`
    SELECT cpf_cnpj, tipo_documento
    FROM dw.dim_credor_enriquecido
    WHERE status_consulta IN ('PENDENTE_CNPJ', 'PENDENTE_CPF_INTERNO')
    ORDER BY cpf_cnpj
  `);
  console.log(`[credor:enriquecer:interno] ${pendentes.length} credores pendentes.`);
  if (pendentes.length === 0) { return; }

  // 2. Conjunto de pendentes para match em memória
  const pendentesSet = new Set(pendentes.map(p => p.cpf_cnpj));

  // 3. Monta SELECT dinâmico com colunas opcionais
  const colsSelect = [
    `CAST([${COL_DOC}] AS varchar(20)) AS doc_raw`,
    `CAST([${COL_NOME}] AS varchar(300)) AS nome`,
    COL_TIPO   ? `CAST([${COL_TIPO}]   AS varchar(50))  AS tipo_doc` : "NULL AS tipo_doc",
    COL_CIDADE ? `CAST([${COL_CIDADE}] AS varchar(100)) AS municipio` : "NULL AS municipio",
    COL_UF     ? `CAST([${COL_UF}]     AS varchar(10))  AS uf`        : "NULL AS uf",
    COL_EMAIL  ? `CAST([${COL_EMAIL}]  AS varchar(200)) AS email`     : "NULL AS email",
    COL_TEL    ? `CAST([${COL_TEL}]    AS varchar(50))  AS telefone`  : "NULL AS telefone",
  ].join(",\n    ");

  // Monta referência da tabela com colchetes corretos: [schema].[tabela] ou [tabela]
  const tableRef = TABELA.includes(".")
    ? TABELA.split(".").map((p) => `[${p.replace(/[\[\]]/g, "")}]`).join(".")
    : `[${TABELA}]`;

  // Carrega a tabela inteira de uma vez e faz o match em memória
  // (mais rápido do que lotes com REPLACE na cláusula WHERE sem índice)
  console.log(`[credor:enriquecer:interno] Carregando fonte ${tableRef} do banco ${DB}...`);

  interface FonteRow {
    doc_raw: string;
    nome: string;
    tipo_doc: string | null;
    municipio: string | null;
    uf: string | null;
    email: string | null;
    telefone: string | null;
  }
  const fonteMap = new Map<string, FonteRow>();

  try {
    const rows = await queryInDatabase<FonteRow>(DB, `
      SELECT ${colsSelect}
      FROM ${tableRef}
      WHERE [${COL_NOME}] IS NOT NULL
        AND LEN(TRIM(CAST([${COL_NOME}] AS varchar(300)))) > 0
        AND [${COL_DOC}] IS NOT NULL
    `);
    console.log(`[credor:enriquecer:interno] ${rows.length} registros carregados da fonte. Fazendo match...`);
    for (const r of rows) {
      const digits = normalizar(r.doc_raw);
      if (!digits || !pendentesSet.has(digits)) continue;
      const nomeLimpo = r.nome?.trim() ?? "";
      // Filtra nomes placeholder (todos iguais, ex: XXXXXXX)
      if (!nomeLimpo || nomeLimpo.length < 3) continue;
      if (new Set(nomeLimpo.replace(/\s/g, "")).size === 1) continue;
      // Prioriza nome mais longo quando há duplicatas
      const existente = fonteMap.get(digits);
      if (!existente || nomeLimpo.length > (existente.nome?.length ?? 0)) {
        fonteMap.set(digits, { ...r, nome: nomeLimpo });
      }
    }
  } catch (err) {
    console.error(`[credor:enriquecer:interno] Erro ao carregar fonte: ${(err as Error).message}`);
    throw err;
  }

  console.log(`[credor:enriquecer:interno] ${fonteMap.size} correspondências encontradas na fonte interna.`);

  // 4. Aplica enriquecimento
  let enriquecidos = 0;
  let semMatch = 0;

  await withPgTransaction(async (client) => {
    for (const p of pendentes) {
      const fonte = fonteMap.get(p.cpf_cnpj);
      if (!fonte || !fonte.nome?.trim()) {
        semMatch++;
        continue;
      }

      const nomeEnriquecido = fonte.nome.trim();
      const tipo = tipoDocumento(p.cpf_cnpj);

      await client.query(`
        UPDATE dw.dim_credor_enriquecido SET
          nome_enriquecido     = $1,
          nome_exibicao        = $1,
          fonte_enriquecimento = 'BASE_INTERNA',
          municipio            = COALESCE($2, municipio),
          uf                   = COALESCE($3, uf),
          email                = COALESCE($4, email),
          telefone             = COALESCE($5, telefone),
          data_consulta        = now(),
          status_consulta      = 'ENRIQUECIDO',
          erro_consulta        = NULL,
          atualizado_em        = now()
        WHERE cpf_cnpj = $6
      `, [
        nomeEnriquecido,
        fonte.municipio?.trim() || null,
        fonte.uf?.trim() || null,
        fonte.email?.trim() || null,
        fonte.telefone?.trim() || null,
        p.cpf_cnpj,
      ]);

      await client.query(`
        INSERT INTO audit.credor_enriquecimento_log
          (cpf_cnpj, tipo_documento, fonte, status, mensagem)
        VALUES ($1, $2, 'BASE_INTERNA', 'ENRIQUECIDO', $3)
      `, [p.cpf_cnpj, tipo, `nome: ${nomeEnriquecido.slice(0, 40)}`]);

      enriquecidos++;
    }
  });

  const duracao = Date.now() - inicio;
  console.log(`[credor:enriquecer:interno] Concluído em ${duracao}ms — enriquecidos: ${enriquecidos}, sem match: ${semMatch}.`);

  await pgQuery(`
    INSERT INTO audit.etl_log (modulo, status, mensagem, registros, duracao_ms)
    VALUES ('credor:enriquecer:interno', 'OK', 'Enriquecimento interno concluído', $1, $2)
  `, [enriquecidos, duracao]);
}

main()
  .then(() => closePgPool())
  .catch((err) => {
    console.error("[credor:enriquecer:interno] Erro:", (err as Error).message);
    closePgPool().catch(() => void 0);
    process.exit(1);
  });
