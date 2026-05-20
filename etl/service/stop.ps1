$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ServiceName = 'VaradouroEtlScheduler'

if (-not (Get-ScheduledTask -TaskName $ServiceName -ErrorAction SilentlyContinue)) {
  Write-Host ('Tarefa ' + $ServiceName + ' nao esta instalada.') -ForegroundColor Yellow
  exit 0
}

Stop-ScheduledTask -TaskName $ServiceName
Write-Host ('Tarefa ' + $ServiceName + ' parada.') -ForegroundColor Green
