@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==========================================
echo          JARVIS DESKTOP - ЗАПУСК
echo ==========================================
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js не найден. Установи Node.js 22 или 24: https://nodejs.org/
  pause
  exit /b 1
)
if not exist node_modules (
  echo Устанавливаю зависимости. Нужен интернет...
  call npm install
  if errorlevel 1 (echo Ошибка установки зависимостей.& pause & exit /b 1)
)
call npm start
if errorlevel 1 pause
