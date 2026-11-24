@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==========================================
echo       JARVIS DESKTOP - СБОРКА EXE
echo ==========================================
where node >nul 2>nul
if errorlevel 1 (echo Установи Node.js 22 или 24: https://nodejs.org/ & pause & exit /b 1)
call npm install
if errorlevel 1 (echo Не удалось установить зависимости.& pause & exit /b 1)
call npm run dist:win
if errorlevel 1 (echo Сборка завершилась с ошибкой.& pause & exit /b 1)
echo Готово! Установщик находится в папке dist.
pause
