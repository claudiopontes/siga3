/**
 * ETL - Classificacao APC (combustivel Polanco)
 * Executa procedure no SQL Server APC para carga incremental/full.
 */

import "dotenv/config";
import { queryInDatabase } from "../connectors/sqlserver";

type ModoCarga = "FULL" | "INCREMENTAL";

interface CountRow {
  total: number;
}

interface ControleRow {
  id_controle: number;
  modo_carga: string;
  dias_reprocessamento: number;
  data_corte_janela: string | null;
  qtd_staging: number | null;
  qtd_afetadas_final: number | null;
  status_execucao: string;
  dt_execucao_ini: string;
  dt_execucao_fim: string | null;
}

const APC_DATABASE = process.env.SQLSERVER_APC_DATABASE || "APC";
const APC_PROC = process.env.APC_POLANCO_PROC_NAME || "dbo.sp_carga_tb_despesa_combustivel_polanco";
const APC_MODO_CARGA = (process.env.APC_POLANCO_MODO_CARGA || "INCREMENTAL").toUpperCase();
const APC_DIAS_REPROCESSAMENTO = Number(process.env.APC_POLANCO_DIAS_REPROCESSAMENTO || "90");

function normalizarModo(value: string): ModoCarga {
  return value === "FULL" ? "FULL" : "INCREMENTAL";
}

function normalizarDias(value: number): number {
  if (!Number.isFinite(value) || value < 1) return 90;
  return Math.trunc(value);
}

export async function executarCargaApcCombustivelPolanco(): Promise<void> {
  const inicio = Date.now();
  const modo = normalizarModo(APC_MODO_CARGA);
  const dias = normalizarDias(APC_DIAS_REPROCESSAMENTO);

  console.log(`[${new Date().toISOString()}] Iniciando ETL: apc_combustivel_polanco`);
  console.log(`  -> Database=${APC_DATABASE} Proc=${APC_PROC} Modo=${modo} Dias=${dias}`);

  const execSql = `
EXEC ${APC_PROC}
  @modo_carga = '${modo}',
  @dias_reprocessamento = ${dias};
`;

  await queryInDatabase(APC_DATABASE, execSql);

  const [total] = await queryInDatabase<CountRow>(
    APC_DATABASE,
    "SELECT COUNT(1) AS total FROM dbo.tb_despesa_combustivel_polanco",
  );

  const [controle] = await queryInDatabase<ControleRow>(
    APC_DATABASE,
    `SELECT TOP 1
       id_controle, modo_carga, dias_reprocessamento, data_corte_janela,
       qtd_staging, qtd_afetadas_final, status_execucao, dt_execucao_ini, dt_execucao_fim
     FROM dbo.tb_controle_carga_despesa_combustivel_polanco
     ORDER BY id_controle DESC`,
  );

  const duracao = Date.now() - inicio;
  console.log(`  -> total_linhas=${total?.total ?? 0}`);
  if (controle) {
    console.log(
      `  -> controle=id:${controle.id_controle} status:${controle.status_execucao} qtd_staging:${controle.qtd_staging ?? 0} qtd_final:${controle.qtd_afetadas_final ?? 0}`,
    );
  }
  console.log(`  OK - APC Polanco concluido em ${duracao}ms`);
}

if (require.main === module) {
  executarCargaApcCombustivelPolanco().catch((error) => {
    console.error(`  ERRO - ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
