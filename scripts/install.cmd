@echo off
setlocal

cd /d "%~dp0\.."

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18+ is required. Install Node.js first: https://nodejs.org/
  exit /b 1
)

node src\scripts\setup.js %*
