param(
  [string]$TaskName = "Varadouro ETL Nightly",
  [string]$EtlRoot = "D:\projetos\frontend\etl"
)

$ErrorActionPreference = "Stop"

Write-Host "== Check 1/4: Task Scheduler ==" -ForegroundColor Cyan
schtasks /Query /TN $TaskName /V /FO LIST
Write-Host ""

Write-Host "== Check 2/4: Ultimo log do ETL ==" -ForegroundColor Cyan
$logDir = Join-Path $EtlRoot "logs"
if (-not (Test-Path $logDir)) {
  Write-Host "Pasta de logs nao encontrada: $logDir" -ForegroundColor Yellow
} else {
  $latestLog = Get-ChildItem $logDir -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($null -eq $latestLog) {
    Write-Host "Nenhum arquivo de log encontrado em $logDir" -ForegroundColor Yellow
  } else {
    Write-Host ("Arquivo: " + $latestLog.FullName)
    Write-Host ("Atualizado em: " + $latestLog.LastWriteTime)
    Write-Host "-- Ultimas linhas --"
    Get-Content $latestLog.FullName -Tail 20
  }
}
Write-Host ""

Write-Host "== Check 3/4: Contagens no PostgreSQL ==" -ForegroundColor Cyan
$nodeCheckCount = @'
require("dotenv").config();
const { Client } = require("pg");
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});
(async () => {
  await client.connect();
  try {
    for (const table of ["public.tb_despesa_combustivel_polanco", "public.receita_publica_categoria_mensal", "public.cauc_situacao_raw"]) {
      try {
        const r = await client.query(`SELECT count(*)::bigint AS total FROM ${table}`);
        console.log(`${table} = ${r.rows[0].total}`);
      } catch (err) {
        console.log(`${table} = ERRO: ${err.message}`);
      }
    }
  } finally {
    await client.end();
  }
})();
'@
$nodeCheckCount | node -
Write-Host ""

Write-Host "== Check 4/4: Modulos recentes no audit.etl_log ==" -ForegroundColor Cyan
$nodeCheckEtlLog = @'
require("dotenv").config();
const { Client } = require("pg");
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});
(async () => {
  await client.connect();
  try {
    const sql = `
      SELECT modulo, status, registros, executado_em
      FROM audit.etl_log
      WHERE modulo IN ('cauc','combustivel_empenho_apc','dimensoes_csv','receita_publica','combustivel','dimensoes_ente_entidade_postgres')
      ORDER BY executado_em DESC
      LIMIT 15
    `;
    const r = await client.query(sql);
    console.table(r.rows);
  } finally {
    await client.end();
  }
})();
'@
$nodeCheckEtlLog | node -
Write-Host ""

Write-Host "Check concluido." -ForegroundColor Green
