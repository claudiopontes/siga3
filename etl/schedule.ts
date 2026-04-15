/**
 * ETL scheduler - Varadouro Digital
 * Run with: ts-node schedule.ts
 */

import "dotenv/config";
import cron from "node-cron";
import { executarETLCombustivel } from "./jobs/combustivel";

const TIMEZONE = process.env.ETL_TIMEZONE || "America/Rio_Branco";
const FACT_ETL_CRON = process.env.FACT_ETL_CRON || "0 1 * * *"; // 01:00 daily

console.log("ETL scheduler started - Varadouro Digital");
console.log(`Facts (combustivel/NFE): cron="${FACT_ETL_CRON}" timezone="${TIMEZONE}"\n`);

// Facts: nightly, once per day
cron.schedule(
  FACT_ETL_CRON,
  async () => {
    console.log("\n[CRON] Starting nightly job: combustivel (NFE)");
    await executarETLCombustivel().catch(console.error);
  },
  { timezone: TIMEZONE },
);

process.on("SIGINT", () => {
  console.log("\nScheduler stopped.");
  process.exit(0);
});
