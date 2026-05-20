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
  for (const t of ["Beneficiario", "ContraCheque", "VerbasContraCheque"]) {
    const r = await pool.request().query(
      `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='${t}' AND TABLE_SCHEMA='dbo' ORDER BY ORDINAL_POSITION`,
    );
    process.stdout.write(`-- dbo.${t}:\n`);
    for (const c of r.recordset as Array<{ COLUMN_NAME: string; DATA_TYPE: string }>) {
      process.stdout.write(`     ${c.COLUMN_NAME} (${c.DATA_TYPE})\n`);
    }
  }
  // Verifica chave primária / índices de ContraCheque (qual coluna está indexada para ano/mes)
  const idx = await pool.request().query(`
    SELECT i.name AS index_name, COL_NAME(ic.object_id, ic.column_id) AS column_name, ic.key_ordinal, i.is_primary_key, i.is_unique
    FROM sys.indexes i
    INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
    WHERE i.object_id = OBJECT_ID('dbo.ContraCheque')
    ORDER BY i.name, ic.key_ordinal
  `);
  process.stdout.write(`-- indexes dbo.ContraCheque:\n`);
  for (const r of idx.recordset as Array<{ index_name: string; column_name: string; key_ordinal: number; is_primary_key: boolean; is_unique: boolean }>) {
    process.stdout.write(`     ${r.index_name} [${r.key_ordinal}] ${r.column_name}${r.is_primary_key ? " PK" : ""}${r.is_unique ? " UQ" : ""}\n`);
  }
  await pool.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
