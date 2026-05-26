@echo off
title WB Proxy — Unit Economics
echo.
echo ================================================
echo   WB Proxy — Unit Economics
echo   Не закрывайте это окно во время работы!
echo ================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ОШИБКА] Node.js не найден на компьютере.
    echo.
    echo Скачайте и установите Node.js с сайта:
    echo https://nodejs.org
    echo.
    echo После установки запустите этот файл снова.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODEVERSION=%%i
echo Node.js версия: %NODEVERSION%
echo.

set SCRIPT=%~dp0local-wb-proxy.mjs
if not exist "%SCRIPT%" (
    echo [ОШИБКА] Файл local-wb-proxy.mjs не найден.
    echo Убедитесь, что оба файла лежат в одной папке.
    pause
    exit /b 1
)

echo Запускаю прокси...
echo После запуска вернитесь в приложение — статус изменится на зелёный.
echo.
node "%SCRIPT%"
echo.
echo Прокси остановлен.
pause
