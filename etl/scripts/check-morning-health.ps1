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

Write-Host "== Check 3/4: Contagens no Supabase ==" -ForegroundColor Cyan
$nodeCheckCount = @'
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  for (const table of ["tb_despesa_combustivel_polanco", "receita_publica_categoria_mensal"]) {
    const { count, error } = await sb.from(table).select("*", { count: "exact", head: true });
    if (error) {
      console.log(`${table} = ERRO: ${error.message}`);
      continue;
    }
    console.log(`${table} = ${count ?? 0}`);
  }
})();
'@
$nodeCheckCount | node -
Write-Host ""

Write-Host "== Check 4/4: Modulos recentes no etl_log ==" -ForegroundColor Cyan
$nodeCheckEtlLog = @'
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data, error } = await sb
    .from("etl_log")
    .select("modulo,status,registros,executado_em")
    .in("modulo", ["apc_polanco_sync_supabase","dimensoes_csv","receita_publica","combustivel"])
    .order("executado_em", { ascending: false })
    .limit(15);
  if (error) {
    console.log("ERRO:", error.message);
    process.exit(1);
  }
  console.table(data);
})();
'@
$nodeCheckEtlLog | node -
Write-Host ""

Write-Host "Check concluido." -ForegroundColor Green
