$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ServiceName = 'VaradouroEtlScheduler'
$LogPath     = Join-Path $PSScriptRoot 'scheduler.log'

if (-not (Get-ScheduledTask -TaskName $ServiceName -ErrorAction SilentlyContinue)) {
  Write-Host ('Tarefa ' + $ServiceName + ' nao esta instalada.') -ForegroundColor Yellow
  exit 0
}

Write-Host ('=== ' + $ServiceName + ' ===') -ForegroundColor Cyan
Get-ScheduledTask -TaskName $ServiceName | Get-ScheduledTaskInfo |
  Format-List TaskName, LastRunTime, LastTaskResult, NextRunTime, NumberOfMissedRuns

if (Test-Path $LogPath) {
  Write-Host 'Ultimas 30 linhas do log:' -ForegroundColor Cyan
  Get-Content $LogPath -Tail 30
} else {
  Write-Host ('Sem log ainda em: ' + $LogPath) -ForegroundColor Yellow
}
