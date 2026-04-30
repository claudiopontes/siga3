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

// Full nightly pipeline: once per day
cron.schedule(
  FACT_ETL_CRON,
  async () => {
    console.log("\n[CRON] Starting nightly pipeline...");

    if (RUN_CAUC_NIGHTLY) {
      console.log("[CRON] Step 1/10: CAUC (Tesouro Transparente -> Supabase)");
      await executarCargaCauc().catch((error) => {
        console.error("[CRON] cauc failed:", error);
      });
    } else {
      console.log("[CRON] Step 1/10: CAUC skipped by RUN_CAUC_NIGHTLY=false");
    }

    if (RUN_APC_POLANCO_NIGHTLY) {
      console.log("[CRON] Step 2/10: APC Polanco (SQL Server)");
      await executarCargaApcCombustivelPolanco().catch((error) => {
        console.error("[CRON] apc polanco failed:", error);
      });
    } else {
      console.log("[CRON] Step 2/10: APC Polanco skipped by RUN_APC_POLANCO_NIGHTLY=false");
    }

    if (RUN_APC_POLANCO_SUPABASE_SYNC_NIGHTLY) {
      console.log("[CRON] Step 3/10: APC Polanco -> Supabase sync");
      await executarSyncApcPolancoSupabase().catch((error) => {
        console.error("[CRON] apc polanco sync supabase failed:", error);
      });
    } else {
      console.log("[CRON] Step 3/10: APC Polanco -> Supabase sync skipped by RUN_APC_POLANCO_SUPABASE_SYNC_NIGHTLY=false");
    }

    if (RUN_DIMENSOES_NIGHTLY) {
      console.log("[CRON] Step 4/10: dimensoes (CSV)");
      await executarCargaDimensoesCsv().catch((error) => {
        console.error("[CRON] dimensoes failed:", error);
      });
    } else {
      console.log("[CRON] Step 4/10: dimensoes skipped by RUN_DIMENSOES_NIGHTLY=false");
    }

    if (RUN_RECEITA_PUBLICA_NIGHTLY) {
      console.log("[CRON] Step 5/10: receita publica (SQL Server -> Supabase)");
      await executarETLReceitaPublica().catch((error) => {
        console.error("[CRON] receita publica failed:", error);
      });
    } else {
      console.log("[CRON] Step 5/10: receita publica skipped by RUN_RECEITA_PUBLICA_NIGHTLY=false");
    }

    if (RUN_DIM_RECEITA_SQLSERVER_NIGHTLY) {
      console.log("[CRON] Step 6/10: dimensoes receita (SQL Server)");
      await executarCargaDimensoesReceitaSqlServer().catch((error) => {
        console.error("[CRON] dimensoes receita sqlserver failed:", error);
      });
    } else {
      console.log("[CRON] Step 6/10: dimensoes receita skipped by RUN_DIM_RECEITA_SQLSERVER_NIGHTLY=false");
    }

    if (RUN_DIM_ENTE_ENTIDADE_SQLSERVER_NIGHTLY) {
      console.log("[CRON] Step 7/10: dimensoes ente/entidade (SQL Server)");
      await executarCargaDimensoesEnteEntidadeSqlServer().catch((error) => {
        console.error("[CRON] dimensoes ente/entidade sqlserver failed:", error);
      });
    } else {
      console.log("[CRON] Step 7/10: dimensoes ente/entidade skipped by RUN_DIM_ENTE_ENTIDADE_SQLSERVER_NIGHTLY=false");
    }

    if (RUN_DIM_EMPENHO_SQLSERVER_NIGHTLY) {
      console.log("[CRON] Step 8/10: dimensoes empenho (SQL Server -> Supabase)");
      await executarCargaDimensoesEmpenhoSqlServer().catch((error) => {
        console.error("[CRON] dimensoes empenho sqlserver failed:", error);
      });
    } else {
      console.log("[CRON] Step 8/10: dimensoes empenho skipped by RUN_DIM_EMPENHO_SQLSERVER_NIGHTLY=false");
    }

    if (RUN_FATO_EMPENHO_NIGHTLY) {
      console.log("[CRON] Step 9/10: fato empenho (SQL Server -> Supabase)");
      await executarETLFatoEmpenho().catch((error) => {
        console.error("[CRON] fato empenho failed:", error);
      });
    } else {
      console.log("[CRON] Step 9/10: fato empenho skipped by RUN_FATO_EMPENHO_NIGHTLY=false");
    }

    console.log("[CRON] Step 10/10: combustivel (NFE/SQL Server)");
    await executarETLCombustivel().catch((error) => {
      console.error("[CRON] combustivel failed:", error);
    });

    console.log("[CRON] Nightly pipeline finished.");
  },
  { timezone: TIMEZONE },
);

process.on("SIGINT", () => {
  console.log("\nScheduler stopped.");
  process.exit(0);
});
