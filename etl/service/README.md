# Scheduler ETL como serviço Windows

Mantém o `etl/schedule.ts` (cron noturno + cron semanal de saúde) rodando
permanentemente como **tarefa do Windows Task Scheduler**, com restart
automático em caso de falha. Iniciado no boot do sistema.

## Pré-requisitos

- Windows 10/11 ou Server 2016+
- PowerShell 5.1+ (já vem no Windows)
- Node.js + npm instalados e visíveis no `PATH` da conta `SYSTEM`
  (tipicamente já é o caso quando você instala o Node.js com a opção
  default "Add to PATH for all users").

## Instalar

Abra o PowerShell **como Administrador** e:

```powershell
cd D:\projetos\frontend\etl
npm run service:install
```

O script vai pedir elevação de UAC se você não estiver elevado. Ele:

1. Cria a tarefa `VaradouroEtlScheduler` no Task Scheduler.
2. Trigger: **At system startup**.
3. Ação: `cmd /c npm run agendar >> etl\service\scheduler.log 2>&1`.
4. Restart: 3 tentativas com intervalo de 1 min em caso de falha.
5. Roda como `SYSTEM` (sem senha, sem sessão de usuário aberta).

## Iniciar / parar agora

```powershell
npm run service:start    # inicia já (sem precisar reiniciar o Windows)
npm run service:stop     # para imediatamente
npm run service:status   # mostra última execução + últimas 30 linhas do log
```

## Logs

Arquivo: `etl/service/scheduler.log` (append).

Acompanhar em tempo real:

```powershell
Get-Content etl\service\scheduler.log -Wait -Tail 30
```

## Desinstalar

```powershell
npm run service:uninstall
```

Remove a tarefa do Task Scheduler. O log fica preservado.

## Customizações

Antes de rodar `service:install`, defina:

| Variável | Default | Significado |
|---|---|---|
| `ETL_SERVICE_USER` | `SYSTEM` | Conta de execução. Use `"DOMINIO\\usuario"` se precisar de credencial de domínio (vai pedir senha). |

Exemplo:

```powershell
$env:ETL_SERVICE_USER = "tceac\svc_etl"
npm run service:install
```

## Verificar que está rodando

```powershell
Get-Process node -ErrorAction SilentlyContinue |
  Where-Object { $_.SessionId -eq 0 } |
  Select-Object Id, StartTime, CPU
```

Processos do `SYSTEM` ficam em SessionId=0. Se aparecer um `node.exe` ali iniciado próximo do boot/install, é o scheduler.

## Reaplicando após mudança no scheduler

Se você alterar `etl/schedule.ts` (ou as variáveis do `.env` do scheduler):

```powershell
npm run service:stop
npm run service:start
```

Não precisa reinstalar a tarefa — ela já aponta para `npm run agendar`,
que recarrega o `.env` e o `schedule.ts` a cada start.

## Por que Task Scheduler e não node-windows / NSSM / PM2?

- **Built-in**: nenhuma dependência adicional.
- **Resiliente**: restart automático, logs do próprio Windows em
  `Event Viewer → Task Scheduler` (além do nosso `scheduler.log`).
- **Sem service wrapping nativo**: não cria binário customizado,
  fácil debugar (`Get-ScheduledTask` mostra tudo).
- Custo: não tem "live stream" dos logs como o PM2 — usamos `Get-Content -Wait` no log file para suprir.
