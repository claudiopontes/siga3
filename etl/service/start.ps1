$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ServiceName = 'VaradouroEtlScheduler'

if (-not (Get-ScheduledTask -TaskName $ServiceName -ErrorAction SilentlyContinue)) {
  Write-Host ('Tarefa ' + $ServiceName + ' nao esta instalada. Rode "npm run service:install" primeiro.') -ForegroundColor Red
  exit 1
}

Start-ScheduledTask -TaskName $ServiceName
Start-Sleep -Milliseconds 800
Get-ScheduledTask -TaskName $ServiceName | Get-ScheduledTaskInfo |
  Format-List TaskName, LastRunTime, LastTaskResult, NextRunTime, NumberOfMissedRuns
