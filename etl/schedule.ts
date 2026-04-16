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

const TIMEZONE = process.env.ETL_TIMEZONE || "America/Rio_Branco";
const FACT_ETL_CRON = process.env.FACT_ETL_CRON || "0 1 * * *"; // 01:00 daily
const RUN_DIMENSOES_NIGHTLY = (process.env.RUN_DIMENSOES_NIGHTLY ?? "true").toLowerCase() !== "false";
const RUN_APC_POLANCO_NIGHTLY = (process.env.RUN_APC_POLANCO_NIGHTLY ?? "true").toLowerCase() !== "false";
const RUN_APC_POLANCO_SUPABASE_SYNC_NIGHTLY =
  (process.env.RUN_APC_POLANCO_SUPABASE_SYNC_NIGHTLY ?? "true").toLowerCase() !== "false";

console.log("ETL scheduler started - Varadouro Digital");
console.log(`Nightly pipeline: cron="${FACT_ETL_CRON}" timezone="${TIMEZONE}"`);
console.log(`Nightly dimensoes: ${RUN_DIMENSOES_NIGHTLY ? "enabled" : "disabled"}\n`);
console.log(`Nightly APC Polanco: ${RUN_APC_POLANCO_NIGHTLY ? "enabled" : "disabled"}\n`);
console.log(`Nightly APC->Supabase sync: ${RUN_APC_POLANCO_SUPABASE_SYNC_NIGHTLY ? "enabled" : "disabled"}\n`);

// Full nightly pipeline: once per day
cron.schedule(
  FACT_ETL_CRON,
  async () => {
    console.log("\n[CRON] Starting nightly pipeline...");
    if (RUN_APC_POLANCO_NIGHTLY) {
      console.log("[CRON] Step 1/4: APC Polanco (SQL Server)");
      await executarCargaApcCombustivelPolanco().catch((error) => {
        console.error("[CRON] apc polanco failed:", error);
      });
    } else {
      console.log("[CRON] Step 1/4: APC Polanco skipped by RUN_APC_POLANCO_NIGHTLY=false");
    }

    if (RUN_APC_POLANCO_SUPABASE_SYNC_NIGHTLY) {
      console.log("[CRON] Step 2/4: APC Polanco -> Supabase sync");
      await executarSyncApcPolancoSupabase().catch((error) => {
        console.error("[CRON] apc polanco sync supabase failed:", error);
      });
    } else {
      console.log("[CRON] Step 2/4: APC Polanco -> Supabase sync skipped by RUN_APC_POLANCO_SUPABASE_SYNC_NIGHTLY=false");
    }

    if (RUN_DIMENSOES_NIGHTLY) {
      console.log("[CRON] Step 3/4: dimensoes (CSV)");
      await executarCargaDimensoesCsv().catch((error) => {
        console.error("[CRON] dimensoes failed:", error);
      });
    } else {
      console.log("[CRON] Step 3/4: dimensoes skipped by RUN_DIMENSOES_NIGHTLY=false");
    }

    console.log("[CRON] Step 4/4: combustivel (NFE/SQL Server)");
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
