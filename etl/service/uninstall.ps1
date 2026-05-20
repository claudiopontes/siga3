# uninstall.ps1 - Remove a tarefa do scheduler ETL.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ServiceName = 'VaradouroEtlScheduler'

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host 'Necessario privilegio de Administrador. Re-executando elevado...' -ForegroundColor Yellow
  Start-Process powershell.exe -Verb RunAs -ArgumentList @(
    '-NoProfile','-ExecutionPolicy','Bypass','-File',('"' + $PSCommandPath + '"')
  )
  exit
}

if (-not (Get-ScheduledTask -TaskName $ServiceName -ErrorAction SilentlyContinue)) {
  Write-Host ('Tarefa ' + $ServiceName + ' nao esta instalada.') -ForegroundColor Yellow
  exit 0
}

Write-Host ('Parando e removendo tarefa ' + $ServiceName + '...') -ForegroundColor Cyan
try { Stop-ScheduledTask -TaskName $ServiceName -ErrorAction SilentlyContinue } catch { }
Unregister-ScheduledTask -TaskName $ServiceName -Confirm:$false
Write-Host '[OK] Tarefa removida.' -ForegroundColor Green
