@echo off
setlocal

set "ETL_DIR=D:\projetos\frontend\etl"
set "NPM_CMD=D:\nodejs\npm.cmd"
set "LOG_DIR=%ETL_DIR%\logs"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "STAMP=%%i"
set "LOG_FILE=%LOG_DIR%\nightly_etl_%STAMP%.log"

set "HAS_ERROR=0"

echo [%date% %time%] Inicio do ETL noturno > "%LOG_FILE%"
echo ETL_DIR=%ETL_DIR% >> "%LOG_FILE%"
echo NPM_CMD=%NPM_CMD% >> "%LOG_FILE%"

cd /d "%ETL_DIR%"
if errorlevel 1 (
  echo [%date% %time%] ERRO: nao foi possivel acessar %ETL_DIR% >> "%LOG_FILE%"
  exit /b 1
)

echo. >> "%LOG_FILE%"
echo [%date% %time%] STEP APC Polanco SQL - INICIO >> "%LOG_FILE%"
call "%NPM_CMD%" run apc-polanco >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
  set "HAS_ERROR=1"
  echo [%date% %time%] STEP APC Polanco SQL - ERRO >> "%LOG_FILE%"
) else (
  echo [%date% %time%] STEP APC Polanco SQL - OK >> "%LOG_FILE%"
)

echo. >> "%LOG_FILE%"
echo [%date% %time%] STEP APC para Supabase - INICIO >> "%LOG_FILE%"
call "%NPM_CMD%" run apc-polanco-sync-supabase >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
  set "HAS_ERROR=1"
  echo [%date% %time%] STEP APC para Supabase - ERRO >> "%LOG_FILE%"
) else (
  echo [%date% %time%] STEP APC para Supabase - OK >> "%LOG_FILE%"
)

echo. >> "%LOG_FILE%"
echo [%date% %time%] STEP Dimensoes CSV - INICIO >> "%LOG_FILE%"
call "%NPM_CMD%" run dimensoes >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
  set "HAS_ERROR=1"
  echo [%date% %time%] STEP Dimensoes CSV - ERRO >> "%LOG_FILE%"
) else (
  echo [%date% %time%] STEP Dimensoes CSV - OK >> "%LOG_FILE%"
)

echo. >> "%LOG_FILE%"
echo [%date% %time%] STEP Receita Publica - INICIO >> "%LOG_FILE%"
call "%NPM_CMD%" run receita-publica >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
  set "HAS_ERROR=1"
  echo [%date% %time%] STEP Receita Publica - ERRO >> "%LOG_FILE%"
) else (
  echo [%date% %time%] STEP Receita Publica - OK >> "%LOG_FILE%"
)

echo. >> "%LOG_FILE%"
echo [%date% %time%] STEP Combustivel NFe - INICIO >> "%LOG_FILE%"
call "%NPM_CMD%" run combustivel >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
  set "HAS_ERROR=1"
  echo [%date% %time%] STEP Combustivel NFe - ERRO >> "%LOG_FILE%"
) else (
  echo [%date% %time%] STEP Combustivel NFe - OK >> "%LOG_FILE%"
)

if "%HAS_ERROR%"=="1" (
  echo [%date% %time%] FIM COM ERROS >> "%LOG_FILE%"
  exit /b 1
)

echo [%date% %time%] FIM COM SUCESSO >> "%LOG_FILE%"
exit /b 0
