/**
 * ETL scheduler - Varadouro Digital
 * Run with: ts-node schedule.ts
 */

import "dotenv/config";
import cron from "node-cron";
import { executarETLCombustivel } from "./jobs/combustivel";
import { executarCargaDimensoesCsv } from "./jobs/dimensoes-csv";
import { executarCargaApcCombustivelPolanco } from "./jobs/apc-combustivel-polanco";
import { executarSyncApcPolancoSupabase } from "./jobs/apc-polanco-sync-supabase";
import { executarETLReceitaPublica } from "./jobs/receita-publica";
import { executarCargaDimensoesReceitaSqlServer } from "./jobs/dimensoes-receita-sqlserver";
import { executarCargaDimensoesEnteEntidadeSqlServer } from "./jobs/dimensoes-ente-entidade-sqlserver";
import { executarCargaDimensoesEmpenhoSqlServer } from "./jobs/dimensoes-empenho-sqlserver";
import { executarETLFatoEmpenho } from "./jobs/fato-empenho";
import { executarCargaCauc } from "./jobs/cauc";
import { executarCargaProcessosGabinete } from "./jobs/processos-gabinete";
import { executarCargaPautaJulgamento } from "./jobs/pauta-julgamento";
import { executarCargaProcessosCe } from "./jobs/processos-ce";
import { executarCargaProcessos } from "./jobs/processos";
import { executarCredorEnriquecimentoPreparar } from "./jobs/credor-enriquecimento-preparar";
import { executarCredorEnriquecerInterno } from "./jobs/credor-enriquecer-interno";
import { executarCredorEnriquecerCnpj } from "./jobs/credor-enriquecer-cnpj";
import { executarMartCredorDespesa } from "./jobs/refresh-mart-credor-despesa";

const TIMEZONE = process.env.ETL_TIMEZONE || "America/Rio_Branco";
const FACT_ETL_CRON = process.env.FACT_ETL_CRON || "0 1 * * *"; // 01:00 daily
const RUN_DIMENSOES_NIGHTLY = (process.env.RUN_DIMENSOES_NIGHTLY ?? "true").toLowerCase() !== "false";
const RUN_APC_POLANCO_NIGHTLY = (process.env.RUN_APC_POLANCO_NIGHTLY ?? "true").toLowerCase() !== "false";
const RUN_APC_POLANCO_SUPABASE_SYNC_NIGHTLY =
  (process.env.RUN_APC_POLANCO_SUPABASE_SYNC_NIGHTLY ?? "true").toLowerCase() !== "false";
const RUN_RECEITA_PUBLICA_NIGHTLY = (process.env.RUN_RECEITA_PUBLICA_NIGHTLY ?? "true").toLowerCase() !== "false";
const RUN_DIM_RECEITA_SQLSERVER_NIGHTLY =
  (process.env.RUN_DIM_RECEITA_SQLSERVER_NIGHTLY ?? "true").toLowerCase() !== "false";
const RUN_DIM_ENTE_ENTIDADE_SQLSERVER_NIGHTLY =
  (process.env.RUN_DIM_ENTE_ENTIDADE_SQLSERVER_NIGHTLY ?? "true").toLowerCase() !== "false";
const RUN_DIM_EMPENHO_SQLSERVER_NIGHTLY =
  (process.env.RUN_DIM_EMPENHO_SQLSERVER_NIGHTLY ?? "true").toLowerCase() !== "false";
const RUN_FATO_EMPENHO_NIGHTLY = (process.env.RUN_FATO_EMPENHO_NIGHTLY ?? "true").toLowerCase() !== "false";
const RUN_CAUC_NIGHTLY = (process.env.RUN_CAUC_NIGHTLY ?? "true").toLowerCase() !== "false";
const RUN_PROCESSOS_GABINETE_NIGHTLY =
  (process.env.RUN_PROCESSOS_GABINETE_NIGHTLY ?? "true").toLowerCase() !== "false";
const RUN_PAUTA_JULGAMENTO_NIGHTLY =
  (process.env.RUN_PAUTA_JULGAMENTO_NIGHTLY ?? "true").toLowerCase() !== "false";
const RUN_PROCESSOS_CE_NIGHTLY =
  (process.env.RUN_PROCESSOS_CE_NIGHTLY ?? "true").toLowerCase() !== "false";
const RUN_PROCESSOS_EPROCESS_NIGHTLY =
  (process.env.RUN_PROCESSOS_EPROCESS_NIGHTLY ?? "true").toLowerCase() !== "false";
const RUN_CREDOR_ENRIQUECIMENTO_NIGHTLY =
  (process.env.RUN_CREDOR_ENRIQUECIMENTO_NIGHTLY ?? "true").toLowerCase() !== "false";

console.log("ETL scheduler started - Varadouro Digital");
console.log(`Nightly pipeline: cron="${FACT_ETL_CRON}" timezone="${TIMEZONE}"`);
console.log(`Nightly dimensoes: ${RUN_DIMENSOES_NIGHTLY ? "enabled" : "disabled"}\n`);
console.log(`Nightly APC Polanco: ${RUN_APC_POLANCO_NIGHTLY ? "enabled" : "disabled"}\n`);
console.log(`Nightly APC->Supabase sync: ${RUN_APC_POLANCO_SUPABASE_SYNC_NIGHTLY ? "enabled" : "disabled"}\n`);
console.log(`Nightly Receita Publica: ${RUN_RECEITA_PUBLICA_NIGHTLY ? "enabled" : "disabled"}\n`);
console.log(`Nightly Dimensoes Receita SQL: ${RUN_DIM_RECEITA_SQLSERVER_NIGHTLY ? "enabled" : "disabled"}\n`);
console.log(`Nightly Dimensoes Ente/Entidade SQL: ${RUN_DIM_ENTE_ENTIDADE_SQLSERVER_NIGHTLY ? "enabled" : "disabled"}\n`);
console.log(`Nightly Fato Empenho: ${RUN_FATO_EMPENHO_NIGHTLY ? "enabled" : "disabled"}\n`);
console.log(`Nightly CAUC: ${RUN_CAUC_NIGHTLY ? "enabled" : "disabled"}\n`);
console.log(`Nightly Processos Gabinete: ${RUN_PROCESSOS_GABINETE_NIGHTLY ? "enabled" : "disabled"}\n`);

// Full nightly pipeline: once per day
cron.schedule(
  FACT_ETL_CRON,
  async () => {
    console.log("\n[CRON] Starting nightly pipeline...");

    if (RUN_CAUC_NIGHTLY) {
      console.log("[CRON] Step 1/11: CAUC (Tesouro Transparente -> Supabase)");
      await executarCargaCauc().catch((error) => {
        console.error("[CRON] cauc failed:", error);
      });
    } else {
      console.log("[CRON] Step 1/11: CAUC skipped by RUN_CAUC_NIGHTLY=false");
    }

    if (RUN_PROCESSOS_GABINETE_NIGHTLY) {
      console.log("[CRON] Step 2/12: processos gabinete (SQL Server -> PostgreSQL)");
      await executarCargaProcessosGabinete().catch((error) => {
        console.error("[CRON] processos gabinete failed:", error);
      });
    } else {
      console.log("[CRON] Step 2/12: processos gabinete skipped by RUN_PROCESSOS_GABINETE_NIGHTLY=false");
    }

    if (RUN_PAUTA_JULGAMENTO_NIGHTLY) {
      console.log("[CRON] Step 3/14: pauta julgamento (EJURIS/SQL Server -> PostgreSQL)");
      await executarCargaPautaJulgamento().catch((error) => {
        console.error("[CRON] pauta julgamento failed:", error);
      });
    } else {
      console.log("[CRON] Step 3/14: pauta julgamento skipped by RUN_PAUTA_JULGAMENTO_NIGHTLY=false");
    }

    if (RUN_PROCESSOS_CE_NIGHTLY) {
      console.log("[CRON] Step 4/14: processos CE (EPROCESS -> public.processo)");
      await executarCargaProcessosCe().catch((error) => {
        console.error("[CRON] processos-ce failed:", error);
      });
    } else {
      console.log("[CRON] Step 4/14: processos CE skipped by RUN_PROCESSOS_CE_NIGHTLY=false");
    }

    if (RUN_PROCESSOS_EPROCESS_NIGHTLY) {
      console.log("[CRON] Step 5/14: processos arquivos/movimentações (EPROCESS -> PostgreSQL)");
      await executarCargaProcessos().catch((error) => {
        console.error("[CRON] processos-eprocess failed:", error);
      });
    } else {
      console.log("[CRON] Step 5/14: processos eprocess skipped by RUN_PROCESSOS_EPROCESS_NIGHTLY=false");
    }

    if (RUN_APC_POLANCO_NIGHTLY) {
      console.log("[CRON] Step 3/11: APC Polanco (SQL Server)");
      await executarCargaApcCombustivelPolanco().catch((error) => {
        console.error("[CRON] apc polanco failed:", error);
      });
    } else {
      console.log("[CRON] Step 3/11: APC Polanco skipped by RUN_APC_POLANCO_NIGHTLY=false");
    }

    if (RUN_APC_POLANCO_SUPABASE_SYNC_NIGHTLY) {
      console.log("[CRON] Step 4/11: APC Polanco -> Supabase sync");
      await executarSyncApcPolancoSupabase().catch((error) => {
        console.error("[CRON] apc polanco sync supabase failed:", error);
      });
    } else {
      console.log("[CRON] Step 4/11: APC Polanco -> Supabase sync skipped by RUN_APC_POLANCO_SUPABASE_SYNC_NIGHTLY=false");
    }

    if (RUN_DIMENSOES_NIGHTLY) {
      console.log("[CRON] Step 5/11: dimensoes (CSV)");
      await executarCargaDimensoesCsv().catch((error) => {
        console.error("[CRON] dimensoes failed:", error);
      });
    } else {
      console.log("[CRON] Step 5/11: dimensoes skipped by RUN_DIMENSOES_NIGHTLY=false");
    }

    if (RUN_RECEITA_PUBLICA_NIGHTLY) {
      console.log("[CRON] Step 6/11: receita publica (SQL Server -> Supabase)");
      await executarETLReceitaPublica().catch((error) => {
        console.error("[CRON] receita publica failed:", error);
      });
    } else {
      console.log("[CRON] Step 6/11: receita publica skipped by RUN_RECEITA_PUBLICA_NIGHTLY=false");
    }

    if (RUN_DIM_RECEITA_SQLSERVER_NIGHTLY) {
      console.log("[CRON] Step 7/11: dimensoes receita (SQL Server)");
      await executarCargaDimensoesReceitaSqlServer().catch((error) => {
        console.error("[CRON] dimensoes receita sqlserver failed:", error);
      });
    } else {
      console.log("[CRON] Step 7/11: dimensoes receita skipped by RUN_DIM_RECEITA_SQLSERVER_NIGHTLY=false");
    }

    if (RUN_DIM_ENTE_ENTIDADE_SQLSERVER_NIGHTLY) {
      console.log("[CRON] Step 8/11: dimensoes ente/entidade (SQL Server)");
      await executarCargaDimensoesEnteEntidadeSqlServer().catch((error) => {
        console.error("[CRON] dimensoes ente/entidade sqlserver failed:", error);
      });
    } else {
      console.log("[CRON] Step 8/11: dimensoes ente/entidade skipped by RUN_DIM_ENTE_ENTIDADE_SQLSERVER_NIGHTLY=false");
    }

    if (RUN_DIM_EMPENHO_SQLSERVER_NIGHTLY) {
      console.log("[CRON] Step 9/11: dimensoes empenho (SQL Server -> Supabase)");
      await executarCargaDimensoesEmpenhoSqlServer().catch((error) => {
        console.error("[CRON] dimensoes empenho sqlserver failed:", error);
      });
    } else {
      console.log("[CRON] Step 9/11: dimensoes empenho skipped by RUN_DIM_EMPENHO_SQLSERVER_NIGHTLY=false");
    }

    if (RUN_FATO_EMPENHO_NIGHTLY) {
      console.log("[CRON] Step 10/11: fato empenho (SQL Server -> Supabase)");
      await executarETLFatoEmpenho().catch((error) => {
        console.error("[CRON] fato empenho failed:", error);
      });
    } else {
      console.log("[CRON] Step 10/11: fato empenho skipped by RUN_FATO_EMPENHO_NIGHTLY=false");
    }

    console.log("[CRON] Step 11/15: combustivel (NFE/SQL Server)");
    await executarETLCombustivel().catch((error) => {
      console.error("[CRON] combustivel failed:", error);
    });

    if (RUN_CREDOR_ENRIQUECIMENTO_NIGHTLY) {
      console.log("[CRON] Step 12/15: credor preparar (novos credores -> dim_credor_enriquecido)");
      await executarCredorEnriquecimentoPreparar().catch((error) => {
        console.error("[CRON] credor preparar failed:", error);
      });

      console.log("[CRON] Step 13/15: credor enriquecer interno (SQL Server -> nomes CPF/CNPJ)");
      await executarCredorEnriquecerInterno().catch((error) => {
        console.error("[CRON] credor enriquecer interno failed:", error);
      });

      console.log("[CRON] Step 14/15: credor enriquecer CNPJ (BrasilAPI — somente PENDENTE_CNPJ)");
      await executarCredorEnriquecerCnpj().catch((error) => {
        console.error("[CRON] credor enriquecer cnpj failed:", error);
      });

      console.log("[CRON] Step 15/15: mart credor despesa (reconstrução das mart tables)");
      await executarMartCredorDespesa().catch((error) => {
        console.error("[CRON] mart credor despesa failed:", error);
      });
    } else {
      console.log("[CRON] Steps 12-15: credor enriquecimento skipped by RUN_CREDOR_ENRIQUECIMENTO_NIGHTLY=false");
    }

    console.log("[CRON] Nightly pipeline finished.");
  },
  { timezone: TIMEZONE },
);

process.on("SIGINT", () => {
  console.log("\nScheduler stopped.");
  process.exit(0);
});
