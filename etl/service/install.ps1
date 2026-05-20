# install.ps1 — Registra o scheduler ETL como tarefa do Windows Task Scheduler.
#
# Comportamento:
#   - Roda no startup do sistema (sem precisar de logon).
#   - Reinicia até 3 vezes em caso de falha (intervalo 60s).
#   - Loga em etl/service/scheduler.log (stdout + stderr).
#   - Nome da tarefa: VaradouroEtlScheduler
#
# Uso (PowerShell como Administrador):
#   cd etl
#   npm run service:install
#
# Para personalizar o usuário da tarefa, defina $env:ETL_SERVICE_USER.
# Default: SYSTEM (não exige senha, mas roda como conta de sistema).

$ErrorActionPreference = "Stop"

$ServiceName = "VaradouroEtlScheduler"
$EtlPath     = (Resolve-Path "$PSScriptRoot\..").Path
$LogPath     = Join-Path $EtlPath "service\scheduler.log"
$User        = if ($env:ETL_SERVICE_USER) { $env:ETL_SERVICE_USER } else { "SYSTEM" }

# Self-elevate se não estiver como admin
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host "Necessário privilégio de Administrador. Re-executando elevado..." -ForegroundColor Yellow
  Start-Process powershell.exe -Verb RunAs -ArgumentList @(
    "-NoProfile","-ExecutionPolicy","Bypass","-File","`"$PSCommandPath`""
  )
  exit
}

Write-Host "=== Varadouro ETL Scheduler — instalando tarefa ===" -ForegroundColor Cyan
Write-Host "ETL path : $EtlPath"
Write-Host "Log file : $LogPath"
Write-Host "Run as   : $User"

# Comando: cmd /c "cd /d <ETL_PATH> && npm run agendar > <LOG> 2>&1"
$cmdArg = "cd /d `"$EtlPath`" && npm run agendar >> `"$LogPath`" 2>&1"

$action  = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c $cmdArg"
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit (New-TimeSpan -Days 0) # 0 = ilimitado

# Remove a tarefa antiga se existir (idempotente)
if (Get-ScheduledTask -TaskName $ServiceName -ErrorAction SilentlyContinue) {
  Write-Host "Tarefa $ServiceName já existe — removendo para recriar..." -ForegroundColor Yellow
  Unregister-ScheduledTask -TaskName $ServiceName -Confirm:$false
}

$principal2 = New-ScheduledTaskPrincipal -UserId $User -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask `
  -TaskName $ServiceName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal2 | Out-Null

Write-Host "" -ForegroundColor Green
Write-Host "✓ Tarefa $ServiceName registrada." -ForegroundColor Green
Write-Host ""
Write-Host "Para iniciar agora:"   -ForegroundColor Cyan
Write-Host "  Start-ScheduledTask -TaskName $ServiceName"
Write-Host "  (ou: npm run service:start)"
Write-Host ""
Write-Host "Para ver status:"
Write-Host "  Get-ScheduledTask -TaskName $ServiceName | Get-ScheduledTaskInfo"
Write-Host "  (ou: npm run service:status)"
Write-Host ""
Write-Host "Logs em tempo real:"
Write-Host "  Get-Content '$LogPath' -Wait -Tail 30"
