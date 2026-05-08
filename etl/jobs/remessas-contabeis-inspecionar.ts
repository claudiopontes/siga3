/**
 * ETL — Inspeção da tabela APC.dbo.REMESSA (SQL Server)
 *
 * Imprime distribuição de valores de domínio e metadados da tabela,
 * além de pesquisar tabelas auxiliares candidatas a dimensões.
 *
 * Uso:
 *   cd etl && npm run remessas:inspecionar
 */

import "dotenv/config";
import { queryInDatabase } from "../connectors/sqlserver";

const APC_DATABASE = process.env.SQLSERVER_APC_DATABASE || "APC";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function printTabela(titulo: string, rows: Record<string, unknown>[]): void {
  console.log(`\n=== ${titulo} ===`);
  if (rows.length === 0) {
    console.log("  (sem resultados)");
    return;
  }
  console.table(rows);
}

async function tryQuery(
  label: string,
  sql: string,
): Promise<Record<string, unknown>[]> {
  try {
    const rows = await queryInDatabase<Record<string, unknown>>(APC_DATABASE, sql);
    return rows;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`  [AVISO] ${label}: ${msg}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Inspeção principal
// ---------------------------------------------------------------------------

export async function executarInspecaoRemessas(): Promise<void> {
  console.log(`\n[${new Date().toISOString()}] Iniciando inspeção de ${APC_DATABASE}.dbo.REMESSA\n`);

  // 1. Total de registros
  const total = await tryQuery(
    "COUNT total",
    `SELECT COUNT(*) AS total FROM dbo.REMESSA`,
  );
  printTabela("1. Total de registros em dbo.REMESSA", total);

  // 2. Distribuição por SITUACAO
  const porSituacao = await tryQuery(
    "GROUP BY SITUACAO",
    `SELECT SITUACAO, COUNT(*) AS qtd FROM dbo.REMESSA GROUP BY SITUACAO ORDER BY qtd DESC`,
  );
  printTabela("2. Distribuição por SITUACAO", porSituacao);

  // 3. Distribuição por STATUS
  const porStatus = await tryQuery(
    "GROUP BY STATUS",
    `SELECT STATUS, COUNT(*) AS qtd FROM dbo.REMESSA GROUP BY STATUS ORDER BY qtd DESC`,
  );
  printTabela("3. Distribuição por STATUS", porStatus);

  // 4. Distribuição por STATUS_PUBLICACAO
  const porStatusPub = await tryQuery(
    "GROUP BY STATUS_PUBLICACAO",
    `SELECT STATUS_PUBLICACAO, COUNT(*) AS qtd FROM dbo.REMESSA GROUP BY STATUS_PUBLICACAO ORDER BY qtd DESC`,
  );
  printTabela("4. Distribuição por STATUS_PUBLICACAO", porStatusPub);

  // 5. Distribuição por TIPO_LIBERACAO
  const porTipoLib = await tryQuery(
    "GROUP BY TIPO_LIBERACAO",
    `SELECT TIPO_LIBERACAO, COUNT(*) AS qtd FROM dbo.REMESSA GROUP BY TIPO_LIBERACAO ORDER BY qtd DESC`,
  );
  printTabela("5. Distribuição por TIPO_LIBERACAO", porTipoLib);

  // 6. Distribuição por ANO
  const porAno = await tryQuery(
    "GROUP BY ANO",
    `SELECT ANO, COUNT(*) AS qtd FROM dbo.REMESSA GROUP BY ANO ORDER BY ANO DESC`,
  );
  printTabela("6. Distribuição por ANO", porAno);

  // 7. Contagem de entidades distintas
  const entidades = await tryQuery(
    "COUNT DISTINCT entidades",
    `SELECT COUNT(DISTINCT ID_ENTIDADE) AS total_entidades, COUNT(DISTINCT ID_ENTIDADE_CJUR) AS total_entidades_cjur FROM dbo.REMESSA`,
  );
  printTabela("7. Entidades distintas", entidades);

  // 8. Range de datas
  const rangeDatas = await tryQuery(
    "MIN/MAX datas",
    `SELECT
       MIN(PRAZO_ENVIO)  AS min_prazo,
       MAX(PRAZO_ENVIO)  AS max_prazo,
       MIN(DATA_ENVIO)   AS min_envio,
       MAX(DATA_ENVIO)   AS max_envio
     FROM dbo.REMESSA`,
  );
  printTabela("8. Range de datas", rangeDatas);

  // ---------------------------------------------------------------------------
  // Pesquisa de tabelas auxiliares
  // ---------------------------------------------------------------------------
  console.log("\n=== Pesquisa de tabelas auxiliares candidatas ===");

  const tabelasCandidatas = await tryQuery(
    "sys.tables/sys.columns",
    `SELECT t.name AS tabela, c.name AS coluna
     FROM sys.tables t
     JOIN sys.columns c ON c.object_id = t.object_id
     WHERE (
       c.name IN ('ID_ENTIDADE','ID_ENTIDADE_CJUR','NOME','NOME_ENTIDADE','NOME_ENTE','CNPJ','CPF_CNPJ','TIPO_ENTIDADE')
       OR t.name LIKE '%ENTIDADE%'
       OR t.name LIKE '%ENTE%'
       OR t.name LIKE '%REMESSA%'
       OR t.name LIKE '%JURISDICIONADO%'
       OR t.name LIKE '%CJUR%'
     )
     ORDER BY t.name, c.name`,
  );

  if (tabelasCandidatas.length > 0) {
    // Agrupar colunas por tabela e imprimir
    const porTabela: Record<string, string[]> = {};
    for (const row of tabelasCandidatas) {
      const tabela = String(row["tabela"]);
      const coluna = String(row["coluna"]);
      if (!porTabela[tabela]) porTabela[tabela] = [];
      porTabela[tabela].push(coluna);
    }

    console.log("\nTabelas candidatas encontradas:\n");
    for (const [tabela, colunas] of Object.entries(porTabela)) {
      console.log(`  Tabela: dbo.${tabela}`);
      console.log(`  Colunas: ${colunas.join(", ")}`);

      // Tentar contar registros nas tabelas mais relevantes
      const relevantes = ["ENTIDADE", "ENTE", "REMESSA", "JURISDICIONADO", "CJUR"];
      const ehRelevante = relevantes.some((r) => tabela.toUpperCase().includes(r));
      if (ehRelevante) {
        const cnt = await tryQuery(
          `COUNT ${tabela}`,
          `SELECT COUNT(*) AS total FROM dbo.[${tabela}]`,
        );
        if (cnt.length > 0) {
          console.log(`  Registros: ${cnt[0]["total"]}`);
        }
      }
      console.log();
    }
  } else {
    console.log("  Nenhuma tabela candidata encontrada.");
  }

  console.log(`\n[${new Date().toISOString()}] Inspeção concluída.`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

if (require.main === module) {
  executarInspecaoRemessas().catch((err) => {
    console.error("[remessas:inspecionar] Erro:", (err as Error).message);
    process.exit(1);
  });
}
