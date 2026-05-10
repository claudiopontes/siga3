/**
 * credor-fontes-internas-inspecionar.ts
 *
 * Inspeciona o SQL Server (APC e demais bancos configurados) em busca de
 * tabelas que possam conter vínculo CPF/CNPJ -> nome.
 * Apenas leitura — não altera dados.
 *
 * Uso: cd etl && npm run credor:fontes:inspecionar
 */

import "dotenv/config";
import { queryInDatabase } from "../connectors/sqlserver";

// -------------------------------------------------------
// Configuração
// -------------------------------------------------------

const BANCOS = [
  process.env.SQLSERVER_APC_DATABASE || "APC",
  process.env.SQLSERVER_DATABASE     || "DFE",
].filter((v, i, a) => v && a.indexOf(v) === i); // deduplica

// Termos que sugerem documento ou pessoa em colunas
const TERMOS_COLUNA = [
  "CPF", "CNPJ", "CPF_CNPJ", "CPFCNPJ", "DOCUMENTO", "DOC",
  "PESSOA", "CREDOR", "FORNECEDOR", "SERVIDOR", "RESPONSAVEL",
  "BENEFICIARIO", "FOLHA", "NOME", "RAZAO", "RAZAO_SOCIAL",
];

// Termos que sugerem documento em nome de tabela
const TERMOS_TABELA = [
  "CREDOR", "FORNECEDOR", "PESSOA", "SERVIDOR", "BENEFICIARIO",
  "FOLHA", "PAGAMENTO", "EMPENHO", "CONTRATO",
];

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

function mascararDoc(doc: string): string {
  const d = doc.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}.***.***-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.***.***/****-${d.slice(12)}`;
  return doc.slice(0, 3) + "***";
}

// -------------------------------------------------------
// Inspeção por banco
// -------------------------------------------------------

interface ColunaInfo {
  TABLE_SCHEMA: string;
  TABLE_NAME: string;
  COLUMN_NAME: string;
  DATA_TYPE: string;
  CHARACTER_MAXIMUM_LENGTH: number | null;
}

interface TabelaResult {
  database: string;
  schema: string;
  tabela: string;
  colunas: string[];
  sugestaoChave: string;
  totalAproximado: number;
  amostra: string[];
}

async function inspecionarBanco(db: string): Promise<TabelaResult[]> {
  console.log(`\n[inspecionar] Banco: ${db}`);
  const resultados: TabelaResult[] = [];

  // 1. Busca colunas com termos relevantes
  let colunas: ColunaInfo[] = [];
  try {
    colunas = await queryInDatabase<ColunaInfo>(db, `
      SELECT
        c.TABLE_SCHEMA,
        c.TABLE_NAME,
        c.COLUMN_NAME,
        c.DATA_TYPE,
        c.CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS c
      INNER JOIN INFORMATION_SCHEMA.TABLES t
        ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
      WHERE t.TABLE_TYPE = 'BASE TABLE'
        AND (
          ${TERMOS_COLUNA.map(t => `c.COLUMN_NAME LIKE '%${t}%'`).join(" OR ")}
          OR ${TERMOS_TABELA.map(t => `c.TABLE_NAME LIKE '%${t}%'`).join(" OR ")}
        )
      ORDER BY c.TABLE_SCHEMA, c.TABLE_NAME, c.COLUMN_NAME
    `);
  } catch (err) {
    console.warn(`  [AVISO] Falha ao consultar INFORMATION_SCHEMA em ${db}: ${(err as Error).message}`);
    return resultados;
  }

  // 2. Agrupa por tabela
  const tabelaMap = new Map<string, { schema: string; colunas: ColunaInfo[] }>();
  for (const col of colunas) {
    const key = `${col.TABLE_SCHEMA}.${col.TABLE_NAME}`;
    if (!tabelaMap.has(key)) tabelaMap.set(key, { schema: col.TABLE_SCHEMA, colunas: [] });
    tabelaMap.get(key)!.colunas.push(col);
  }

  console.log(`  → ${tabelaMap.size} tabelas com colunas relevantes.`);

  // 3. Para cada tabela, tenta contar e amostrar
  for (const [key, info] of tabelaMap) {
    const { schema, colunas: cols } = info;
    const tabela = key.split(".")[1];
    const colNames = cols.map(c => c.COLUMN_NAME);

    // Detecta coluna de documento e nome
    const colDoc  = colNames.find(c => /CPF|CNPJ|DOC|DOCUMENTO/i.test(c)) ?? colNames[0];
    const colNome = colNames.find(c => /NOME|RAZAO/i.test(c)) ?? null;
    const sugestaoChave = colDoc + (colNome ? ` -> ${colNome}` : "");

    let totalAproximado = 0;
    let amostra: string[] = [];

    try {
      const countRes = await queryInDatabase<{ total: number }>(db, `
        SELECT COUNT(1) AS total FROM [${schema}].[${tabela}]
      `);
      totalAproximado = Number(countRes[0]?.total ?? 0);

      if (colNome) {
        const sampleRes = await queryInDatabase<Record<string, string>>(db, `
          SELECT TOP 5 [${colDoc}], [${colNome}]
          FROM [${schema}].[${tabela}]
          WHERE [${colDoc}] IS NOT NULL AND [${colNome}] IS NOT NULL
          ORDER BY NEWID()
        `);
        amostra = sampleRes.map(r => {
          const docVal = String(r[colDoc] ?? "");
          const nomVal = String(r[colNome] ?? "").slice(0, 30);
          return `  ${mascararDoc(docVal)} | ${nomVal}`;
        });
      }
    } catch {
      // tabela inacessível ou sem permissão — ignora
    }

    resultados.push({ database: db, schema, tabela, colunas: colNames, sugestaoChave, totalAproximado, amostra });
  }

  return resultados;
}

// -------------------------------------------------------
// Main
// -------------------------------------------------------

async function main() {
  console.log("[credor:fontes:inspecionar] Iniciando inspeção de fontes internas...");
  console.log(`[credor:fontes:inspecionar] Bancos a inspecionar: ${BANCOS.join(", ")}`);

  const todos: TabelaResult[] = [];

  for (const db of BANCOS) {
    const res = await inspecionarBanco(db);
    todos.push(...res);
  }

  // 4. Relatório consolidado
  console.log("\n" + "=".repeat(70));
  console.log("RELATÓRIO — Fontes internas candidatas a enriquecimento de credores");
  console.log("=".repeat(70));

  if (todos.length === 0) {
    console.log("Nenhuma tabela candidata encontrada nos bancos inspecionados.");
  }

  for (const r of todos) {
    console.log(`\n📋 [${r.database}] ${r.schema}.${r.tabela}`);
    console.log(`   Colunas relevantes : ${r.colunas.join(", ")}`);
    console.log(`   Sugestão de chave  : ${r.sugestaoChave}`);
    console.log(`   Qtd. aproximada    : ${r.totalAproximado.toLocaleString("pt-BR")}`);
    if (r.amostra.length > 0) {
      console.log("   Amostra (mascarada):");
      r.amostra.forEach(a => console.log(a));
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("SUGESTÃO DE CONFIGURAÇÃO (.env):");
  console.log("  CREDOR_INTERNO_DATABASE=APC");
  console.log("  CREDOR_INTERNO_TABLE=<tabela escolhida acima>");
  console.log("  CREDOR_INTERNO_DOCUMENTO_COLUMN=<coluna CPF/CNPJ>");
  console.log("  CREDOR_INTERNO_NOME_COLUMN=<coluna nome/razão>");
  console.log("=".repeat(70) + "\n");
}

main()
  .catch((err) => {
    console.error("[credor:fontes:inspecionar] Erro:", (err as Error).message);
    process.exit(1);
  });
