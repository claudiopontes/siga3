import "dotenv/config";
import sql from "mssql/msnodesqlv8";

async function main() {
  const pool = new sql.ConnectionPool({
    server: process.env.SQLSERVER_HOST!,
    database: "SICAP",
    port: 1433,
    options: { trustedConnection: true, trustServerCertificate: true, encrypt: false },
  } as sql.config);
  await pool.connect();
  const tabelas: Array<[string, string]> = [
    ["dbo", "vw_folha_contracheque_base"],
    ["dbo", "vw_folha_verbas_detalhada"],
  ];
  for (const [s, t] of tabelas) {
    const r = await pool.request().query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='${t}' AND TABLE_SCHEMA='${s}' ORDER BY ORDINAL_POSITION`,
    );
    const cols = r.recordset.map((x: { COLUMN_NAME: string }) => x.COLUMN_NAME).join(", ");
    process.stdout.write(`-- ${s}.${t}: ${cols}\n`);
  }
  await pool.close();
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
